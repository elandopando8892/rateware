import { sha256Hex } from "../_shared/osp/source-hash.ts";
import { completeXlsxArtifact } from "../_shared/osp/xlsx-form-completer.ts";
import { completePdfArtifact } from "../_shared/osp/pdf-form-completer.ts";
import { completeDocxArtifact } from "../_shared/osp/docx-form-completer.ts";
import type { SupplierArtifactReceipt } from "../_shared/osp/supplier-artifact-port.ts";
import type {
  SupplierPackageJobPreparation,
  SupplierPackageObjectStore,
} from "./supplier-package-job.ts";

type SupplierArtifactInput = Extract<
  SupplierPackageJobPreparation,
  { kind: "ready" }
>["input"];

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const MAX_MEMBERS = 20;
const MAX_SET_BYTES = 50 * 1024 * 1024;

import { canonicalPackageSetJson } from "../_shared/osp/package-set-json.ts";
export { canonicalPackageSetJson } from "../_shared/osp/package-set-json.ts";

/** Trusted reservation from a snapshot, never a list supplied by a browser. */
export type SupplierPackageSetInput = Readonly<{
  organizationId: string;
  caseId: string;
  setId: string;
  snapshotId: string;
  snapshotSha256: string;
  version: number;
  members: readonly Readonly<{
    requirementId: string;
    artifact: SupplierArtifactInput;
  }>[];
}>;

export type SupplierPackageSetMember = Readonly<{
  requirementId: string;
  objectId: string;
  artifact: SupplierArtifactReceipt;
}>;

export type SupplierPackageSetReceipt = Readonly<{
  schemaVersion: 1;
  organizationId: string;
  caseId: string;
  setId: string;
  snapshotId: string;
  snapshotSha256: string;
  version: number;
  planSha256: string;
  members: readonly SupplierPackageSetMember[];
  manifestSha256: string;
}>;

export async function supplierPackageSetPlan(input: SupplierPackageSetInput) {
  validate(input);
  const members = await Promise.all(
    [...input.members].sort((a, b) =>
      a.artifact.sourceVersionId < b.artifact.sourceVersionId ? -1 : 1
    ).map(async ({ requirementId, artifact }) => ({
      requirementId,
      sourceVersionId: artifact.sourceVersionId,
      sourceSha256: artifact.sourceSha256,
      kind: artifact.kind,
      sourceContentType: artifact.sourceContentType ?? null,
      approvedMappingDecisionIds: [...artifact.approvedMappingDecisionIds]
        .sort(),
      mappingSha256: await sha256Hex(
        new TextEncoder().encode(canonicalPackageSetJson({
          mappings: artifact.mappings,
          flatten: artifact.kind === "pdf" ? artifact.flatten : null,
        })),
      ),
    })),
  );
  return {
    members,
    sha256: await sha256Hex(new TextEncoder().encode(canonicalPackageSetJson({
      organizationId: input.organizationId,
      caseId: input.caseId,
      setId: input.setId,
      snapshotId: input.snapshotId,
      snapshotSha256: input.snapshotSha256,
      version: input.version,
      members,
    }))),
  };
}

export interface SupplierPackageSetPublisher {
  /** Compare reservation/snapshot and publish ALL members in one DB transaction.
   * Never retire a prior set until that transaction commits. The reservation
   * must prohibit reusing a setId with a different input or manifest.
   */
  publish(receipt: SupplierPackageSetReceipt): Promise<void>;
  /** Read authoritative state after an uncertain write; do not retry publish. */
  load(setId: string): Promise<SupplierPackageSetReceipt | null>;
  hold(setId: string): Promise<void>;
}

function validate(input: SupplierPackageSetInput): void {
  if (
    ![input.organizationId, input.caseId, input.setId, input.snapshotId].every(
      (id) => UUID.test(id),
    ) || !SHA.test(input.snapshotSha256) ||
    !Number.isSafeInteger(input.version) || input.version < 1 ||
    input.version > 2_147_483_647 || !Array.isArray(input.members) ||
    input.members.length < 1 || input.members.length > MAX_MEMBERS
  ) throw new Error("SUPPLIER_PACKAGE_SET_INPUT_INVALID");
  const requirements = new Set<string>();
  const sources = new Set<string>();
  let bytes = 0;
  for (const member of input.members) {
    const artifact = member.artifact;
    if (
      !/^[A-Za-z0-9][A-Za-z0-9:_.-]{0,255}$/.test(member.requirementId) ||
      requirements.has(member.requirementId) ||
      !UUID.test(artifact.sourceVersionId) ||
      !SHA.test(artifact.sourceSha256) ||
      sources.has(artifact.sourceVersionId) ||
      artifact.packageSnapshotId !== input.snapshotId ||
      artifact.packageSnapshotSha256 !== input.snapshotSha256 ||
      artifact.version !== input.version ||
      !(artifact.sourceBytes instanceof Uint8Array) ||
      !Array.isArray(artifact.approvedMappingDecisionIds) ||
      artifact.approvedMappingDecisionIds.length < 1 ||
      artifact.approvedMappingDecisionIds.some((id: string) =>
        !UUID.test(id)
      ) ||
      new Set(artifact.approvedMappingDecisionIds).size !==
        artifact.approvedMappingDecisionIds.length ||
      !["xlsx", "pdf", "docx"].includes(artifact.kind)
    ) throw new Error("SUPPLIER_PACKAGE_SET_INPUT_INVALID");
    requirements.add(member.requirementId);
    sources.add(artifact.sourceVersionId);
    bytes += artifact.sourceBytes.byteLength;
  }
  if (bytes > MAX_SET_BYTES) throw new Error("SUPPLIER_PACKAGE_SET_TOO_LARGE");
}

/** Generate all files before the first storage write; publish only the full set.
 * Completion of this operation proves file generation, NOT semantic completeness,
 * approval, signature, or permission to send. Original bytes are never modified.
 */
export async function generateSupplierPackageSet(
  input: SupplierPackageSetInput,
  deps: {
    objects: SupplierPackageObjectStore;
    publisher: SupplierPackageSetPublisher;
  },
): Promise<SupplierPackageSetReceipt> {
  validate(input);
  const plan = await supplierPackageSetPlan(input);
  const completed: {
    member: SupplierPackageSetMember;
    bytes: Uint8Array;
  }[] = [];
  let totalBytes = 0;
  // Sorting makes source order immaterial to object identities and the manifest.
  const ordered = [...input.members].sort((a, b) =>
    a.artifact.sourceVersionId < b.artifact.sourceVersionId ? -1 : 1
  );
  for (const member of ordered) {
    const artifact = member.artifact;
    const generated = artifact.kind === "xlsx"
      ? await completeXlsxArtifact(artifact)
      : artifact.kind === "pdf"
      ? await completePdfArtifact(artifact)
      : await completeDocxArtifact(artifact);
    totalBytes += generated.bytes.byteLength;
    if (totalBytes > MAX_SET_BYTES) {
      throw new Error("SUPPLIER_PACKAGE_SET_TOO_LARGE");
    }
    completed.push({
      member: Object.freeze({
        requirementId: member.requirementId,
        objectId:
          `${input.organizationId}:${input.caseId}:${input.setId}:${artifact.sourceVersionId}`,
        artifact: generated.receipt,
      }),
      bytes: generated.bytes,
    });
  }
  const manifest = {
    schemaVersion: 1 as const,
    organizationId: input.organizationId,
    caseId: input.caseId,
    setId: input.setId,
    snapshotId: input.snapshotId,
    snapshotSha256: input.snapshotSha256,
    version: input.version,
    planSha256: plan.sha256,
    members: Object.freeze(completed.map((entry) => entry.member)),
  };
  const receipt = Object.freeze({
    ...manifest,
    manifestSha256: await sha256Hex(
      new TextEncoder().encode(canonicalPackageSetJson(manifest)),
    ),
  });
  // Any error after attempting storage may have left immutable objects. Preserve
  // them and reconcile rather than regenerate/publish a partial set automatically.
  try {
    for (const entry of completed) {
      await deps.objects.writeExclusive({
        organizationId: input.organizationId,
        objectId: entry.member.objectId,
        bytes: entry.bytes,
        contentType: entry.member.artifact.contentType,
      });
    }
    await deps.publisher.publish(receipt);
    return receipt;
  } catch {
    try {
      const authoritative = await deps.publisher.load(input.setId);
      if (
        authoritative &&
        canonicalPackageSetJson(authoritative) ===
          canonicalPackageSetJson(receipt)
      ) {
        return authoritative;
      }
    } catch {
      // Read failure is uncertainty, never evidence that publication failed.
    }
    try {
      await deps.publisher.hold(input.setId);
    } catch {
      // Do not obscure the uncertain outcome when reconciliation is unavailable.
    }
    throw new Error("SUPPLIER_PACKAGE_SET_RECONCILIATION_REQUIRED");
  }
}
