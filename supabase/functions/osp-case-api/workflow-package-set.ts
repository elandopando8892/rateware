import type { SqlPort } from "../_shared/osp/database-context.ts";
import { canonicalPackageSetJson } from "../_shared/osp/package-set-json.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export type WorkflowPackageSet = {
  setId: string;
  version: number;
  manifestSha256: string;
  files: {
    requirementId: string;
    sourceVersionId: string;
    outputSha256: string;
    contentType: typeof TYPES[number];
    objectId: string;
    downloadUrl: string | null;
  }[];
};
const fail = (): never => {
  throw new Error("WORKFLOW_PACKAGE_SET_INVALID");
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : fail();
const text = (value: unknown, pattern: RegExp) =>
  typeof value === "string" && pattern.test(value) ? value : fail();

/** Validate the exact immutable manifest before minting any download URL. */
export async function parseWorkflowPackageSet(
  value: unknown,
  scope: { organizationId: string; caseId: string; snapshotSha256: string },
): Promise<WorkflowPackageSet> {
  const receipt = record(value);
  const setId = text(receipt.setId, UUID);
  const snapshotId = text(receipt.snapshotId, UUID);
  const manifestSha256 = text(receipt.manifestSha256, SHA);
  if (
    receipt.schemaVersion !== 1 ||
    receipt.organizationId !== scope.organizationId ||
    receipt.caseId !== scope.caseId ||
    receipt.snapshotSha256 !== scope.snapshotSha256 ||
    !Number.isSafeInteger(receipt.version) || Number(receipt.version) < 1 ||
    Number(receipt.version) > 2_147_483_647 ||
    !Array.isArray(receipt.members) ||
    receipt.members.length < 1 || receipt.members.length > 20
  ) fail();
  text(receipt.planSha256, SHA);
  const { manifestSha256: _hash, ...manifest } = receipt;
  if (
    await sha256Hex(
      new TextEncoder().encode(canonicalPackageSetJson(manifest)),
    ) !== manifestSha256
  ) fail();
  const requirements = new Set<string>(), sources = new Set<string>();
  const files = (receipt.members as unknown[]).map((value) => {
    const member = record(value), artifact = record(member.artifact);
    const sourceVersionId = text(artifact.sourceVersionId, UUID);
    const requirementId = text(
      member.requirementId,
      /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,255}$/,
    );
    text(artifact.sourceSha256, SHA);
    if (
      sources.has(sourceVersionId) || requirements.has(requirementId) ||
      artifact.packageSnapshotId !== snapshotId ||
      artifact.packageSnapshotSha256 !== scope.snapshotSha256 ||
      artifact.version !== receipt.version ||
      !TYPES.includes(artifact.contentType as typeof TYPES[number]) ||
      member.objectId !==
        `${scope.organizationId}:${scope.caseId}:${setId}:${sourceVersionId}`
    ) fail();
    sources.add(sourceVersionId);
    requirements.add(requirementId);
    return {
      requirementId,
      sourceVersionId,
      outputSha256: text(artifact.outputSha256, SHA),
      contentType: artifact.contentType as typeof TYPES[number],
      objectId: member.objectId as string,
      downloadUrl: null,
    };
  });
  return { setId, version: Number(receipt.version), manifestSha256, files };
}

/** Called inside the existing tenant-scoped read transaction. An absent additive
 * migration preserves the legacy view; a malformed stored set never falls back.
 */
export async function loadWorkflowPackageSet(
  tx: SqlPort,
  scope: { organizationId: string; caseId: string; snapshotSha256: string },
): Promise<WorkflowPackageSet | null> {
  const available =
    await tx`select to_regclass('osp_private.supplier_package_sets') is not null as package_sets_available`;
  if (available[0]?.package_sets_available !== true) return null;
  const rows = await tx`
    select package.receipt_json,
      (select count(*)::integer
       from jsonb_array_elements(package.receipt_json->'members') member(value)
       join osp_private.document_versions source
         on source.organization_id = package.organization_id
         and source.id::text = member.value->'artifact'->>'sourceVersionId'
         and source.source_sha256 = member.value->'artifact'->>'sourceSha256'
         and source.id = any(snapshot.document_version_ids)
         and source.status = 'approved' and source.document_type = 'supplier_requirement'
      ) as verified_sources
    from osp_private.supplier_package_sets package
    join osp_private.case_package_input_snapshots snapshot
      on snapshot.organization_id = package.organization_id and snapshot.case_id = package.case_id
      and snapshot.id = package.input_snapshot_id and snapshot.canonical_sha256 = package.input_snapshot_sha256
    where package.organization_id = ${scope.organizationId}::uuid
      and package.case_id = ${scope.caseId}::uuid and package.status = 'current'
      and package.input_snapshot_sha256 = ${scope.snapshotSha256}
      and snapshot.id = (select latest.id from osp_private.case_package_input_snapshots latest
        where latest.organization_id = package.organization_id and latest.case_id = package.case_id
        order by latest.created_at desc, latest.id desc limit 1)`;
  if (!rows.length) return null;
  if (rows.length !== 1) fail();
  const result = await parseWorkflowPackageSet(rows[0].receipt_json, scope);
  if (Number(rows[0].verified_sources) !== result.files.length) fail();
  return result;
}
