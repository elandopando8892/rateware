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
const MAPPING_KINDS = [
  "acroform",
  "pdf_overlay",
  "pdf_appendix",
  "xlsx_cell",
  "docx_content_control",
  "docx_appendix",
] as const;
export type PackageSetMappingKind = typeof MAPPING_KINDS[number];
/** Names are derived from verified source identity/MIME, never provider paths. */
export function packageSetDownloadName(
  file: { sourceVersionId: string; contentType: string },
): string {
  const extensions: Record<string, string> = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel.sheet.macroEnabled.12": "xlsm",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
  };
  const extension = extensions[file.contentType];
  if (
    !UUID.test(file.sourceVersionId) ||
    !TYPES.includes(file.contentType as typeof TYPES[number]) || !extension
  ) {
    throw new Error("WORKFLOW_PACKAGE_SET_INVALID");
  }
  return `XBF-OSP-Form-${file.sourceVersionId}.${extension}`;
}
export type WorkflowPackageSet = {
  setId: string;
  version: number;
  manifestSha256: string;
  files: {
    requirementId: string;
    sourceVersionId: string;
    sourceSha256: string;
    outputSha256: string;
    contentType: typeof TYPES[number];
    mappingKinds: readonly PackageSetMappingKind[];
    objectId: string;
    downloadUrl: string | null;
    latestReview?: {
      reviewId: string;
      reviewVersion: number;
      requestManifestSha256: string;
      status: "approved" | "rejected";
      fullOutputInspected: boolean;
      completionPercent: number | null;
      pageCount: number | null;
      signatureRequirement: "none" | "image" | "autograph";
      signaturePolicyVersion: number | null;
    } | null;
  }[];
};

export async function loadPackageMemberInspections(
  tx: SqlPort,
  organizationId: string,
  caseId: string,
  set: WorkflowPackageSet,
): Promise<WorkflowPackageSet> {
  const available =
    await tx`select to_regclass('osp_private.package_set_member_reviews') is not null as available`;
  if (available[0]?.available !== true) return set;
  const rows =
    await tx`select distinct on (source_version_id) id,source_version_id,review_version,set_manifest_sha256,output_sha256,request_manifest_sha256,status,full_output_inspected,completion_percent,page_count,signature_requirement,signature_policy_version
    from osp_private.package_set_member_reviews where organization_id=${organizationId}::uuid and case_id=${caseId}::uuid and package_set_id=${set.setId}::uuid order by source_version_id,review_version desc`;
  return {
    ...set,
    files: set.files.map((file) => {
      const row = rows.find((row) =>
        row.source_version_id === file.sourceVersionId
      );
      if (
        !row || row.set_manifest_sha256 !== set.manifestSha256 ||
        row.output_sha256 !== file.outputSha256
      ) return { ...file, latestReview: null };
      if (
        !UUID.test(String(row.id)) ||
        !SHA.test(String(row.request_manifest_sha256)) ||
        !["approved", "rejected"].includes(String(row.status)) ||
        !["none", "image", "autograph"].includes(
          String(row.signature_requirement),
        )
      ) fail();
      return {
        ...file,
        latestReview: {
          reviewId: String(row.id),
          reviewVersion: Number(row.review_version),
          requestManifestSha256: String(row.request_manifest_sha256),
          status: row.status as "approved" | "rejected",
          fullOutputInspected: row.full_output_inspected === true,
          completionPercent: row.completion_percent === null
            ? null
            : Number(row.completion_percent),
          pageCount: row.page_count === null ? null : Number(row.page_count),
          signatureRequirement: row.signature_requirement as
            | "none"
            | "image"
            | "autograph",
          signaturePolicyVersion: row.signature_policy_version === null
            ? null
            : Number(row.signature_policy_version),
        },
      };
    }),
  };
}
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
    const sourceSha256 = text(artifact.sourceSha256, SHA);
    if (
      !Array.isArray(artifact.mappings) || artifact.mappings.length < 1 ||
      artifact.mappings.length > 500
    ) fail();
    const mappingKinds = [
      ...new Set(
        (artifact.mappings as unknown[]).map((mapping) => {
          const kind = record(mapping).kind;
          if (!MAPPING_KINDS.includes(kind as PackageSetMappingKind)) fail();
          return kind as PackageSetMappingKind;
        }),
      ),
    ].sort();
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
      sourceSha256,
      outputSha256: text(artifact.outputSha256, SHA),
      contentType: artifact.contentType as typeof TYPES[number],
      mappingKinds: Object.freeze(mappingKinds),
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
