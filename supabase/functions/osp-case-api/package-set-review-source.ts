import type { SqlPort } from "../_shared/osp/database-context.ts";
import {
  buildRequestContract,
  evaluateRequestFulfillment,
  type FulfillmentEvidence,
} from "../_shared/osp/request-contract.ts";
import { parseWorkflowPackageSet } from "./workflow-package-set.ts";
import { documentEvidence } from "./request-semantic-gate.ts";
import type { PackageSetReviewCommand } from "./package-set-review-store.ts";
import type { PackageMemberReview } from "./package-set-review.ts";

function fail(): never {
  throw new Error("PACKAGE_SET_REVIEW_BLOCKED");
}
/** Only persisted final-output decisions count. Mapping approvals are not queried.
 * All reads/locks run in the caller's tenant transaction; no second connection.
 */
export async function loadLockedPackageSetReview(
  tx: SqlPort,
  command: Pick<PackageSetReviewCommand, "organizationId" | "caseId" | "expectedCaseVersion" | "expectedSnapshotSha256">,
) {
  await tx`select osp_private.lock_package_set_operations_context(${command.organizationId}::uuid, ${command.caseId}::uuid, ${command.expectedCaseVersion}::bigint, ${command.expectedSnapshotSha256})`;
  const sets =
    await tx`select package.id, package.receipt_json, package.manifest_sha256
    from osp_private.supplier_package_sets package
    join osp_private.case_package_input_snapshots snapshot on snapshot.organization_id = package.organization_id
      and snapshot.case_id = package.case_id and snapshot.id = package.input_snapshot_id
      and snapshot.canonical_sha256 = package.input_snapshot_sha256
    where package.organization_id = ${command.organizationId}::uuid and package.case_id = ${command.caseId}::uuid
      and package.status = 'current' and snapshot.case_version = ${command.expectedCaseVersion}
      and package.input_snapshot_sha256 = ${command.expectedSnapshotSha256}
      and snapshot.id = (select latest.id from osp_private.case_package_input_snapshots latest
        where latest.organization_id = package.organization_id and latest.case_id = package.case_id order by latest.created_at desc,latest.id desc limit 1)`;
  if (sets.length !== 1) fail();
  const set = await parseWorkflowPackageSet(sets[0].receipt_json, {
    organizationId: command.organizationId,
    caseId: command.caseId,
    snapshotSha256: command.expectedSnapshotSha256,
  });
  if (
    set.setId !== sets[0].id || set.manifestSha256 !== sets[0].manifest_sha256
  ) fail();
  const manifests =
    await tx`select manifest.manifest_json, manifest.manifest_sha256,
      (review.status = 'resolved' and review.manifest_version = manifest.version and review.manifest_sha256 = manifest.manifest_sha256) as resolved
    from osp_private.request_manifest_drafts manifest
    left join lateral (select candidate.status,candidate.manifest_version,candidate.manifest_sha256
      from osp_private.request_manifest_decision_reviews candidate where candidate.organization_id = manifest.organization_id
      and candidate.case_id = manifest.case_id and candidate.manifest_draft_id = manifest.id order by candidate.review_version desc limit 1) review on true
    where manifest.organization_id = ${command.organizationId}::uuid and manifest.case_id = ${command.caseId}::uuid order by manifest.version desc limit 1`;
  if (
    manifests.length !== 1 || manifests[0].resolved !== true ||
    typeof manifests[0].manifest_sha256 !== "string"
  ) fail();
  const contract = buildRequestContract({
    manifestSha256: manifests[0].manifest_sha256,
    manifest: manifests[0].manifest_json as Parameters<
      typeof buildRequestContract
    >[0]["manifest"],
  });
  const rows = await tx`select distinct on (review.source_version_id) review.*,
      original.status as source_status, original.source_sha256
    from osp_private.package_set_member_reviews review
    join osp_private.document_versions original on original.organization_id = review.organization_id and original.id = review.source_version_id
      and original.document_type = 'supplier_requirement' and exists (
        select 1 from osp_private.supplier_package_sets package join osp_private.case_package_input_snapshots snapshot
          on snapshot.organization_id = package.organization_id and snapshot.id = package.input_snapshot_id
          and snapshot.case_id = package.case_id where package.organization_id = review.organization_id
          and package.id = review.package_set_id and original.id = any(snapshot.document_version_ids))
    where review.organization_id = ${command.organizationId}::uuid and review.case_id = ${command.caseId}::uuid and review.package_set_id = ${set.setId}::uuid
    order by review.source_version_id, review.review_version desc`;
  if (rows.length !== set.files.length) fail();
  const forms = contract.requirements.filter((r) => r.kind === "form");
  const reviews: PackageMemberReview[] = [];
  const evidence: FulfillmentEvidence[] = [];
  const usedRequirements = new Set<string>();
  const receipt = sets[0].receipt_json as {
    members: { artifact: { sourceVersionId: string; sourceSha256: string } }[];
  };
  for (const file of set.files) {
    const row = rows.find((r) => r.source_version_id === file.sourceVersionId);
    const source = receipt.members.find((m) =>
      m.artifact.sourceVersionId === file.sourceVersionId
    );
    const matching = forms.filter((r) =>
      r.evidenceIds.some((id) =>
        id === `file:${file.sourceVersionId}` ||
        id.startsWith(`xlsx:${file.sourceVersionId}:`)
      )
    );
    if (
      !row || !source || row.source_status !== "approved" ||
      row.source_sha256 !== source.artifact.sourceSha256 ||
      row.status !== "approved" || row.full_output_inspected !== true ||
      row.output_sha256 !== file.outputSha256 ||
      row.set_manifest_sha256 !== set.manifestSha256 ||
      row.request_manifest_sha256 !== contract.manifestSha256 ||
      matching.length !== 1 || usedRequirements.has(matching[0].id)
    ) fail();
    const requirement = matching[0];
    usedRequirements.add(requirement.id);
    const signature = row.signature_requirement;
    if (
      (requirement.signatureMethod === "wet" && signature !== "autograph") ||
      (requirement.signatureMethod === "digital" && signature !== "image") ||
      (requirement.signatureMethod === "none" && signature !== "none") ||
      (requirement.signatureMethod === "either" && signature !== "image" &&
        signature !== "autograph")
    ) fail();
    if (
      typeof row.completion_percent !== "number" ||
      !Number.isInteger(row.completion_percent) || row.completion_percent < 0 ||
      row.completion_percent > 100
    ) fail();
    evidence.push({
      evidenceId: `review:${String(row.id)}`,
      canonicalKey: requirement.canonicalKey,
      label: requirement.label,
      contentType: file.contentType,
      status: "approved",
      validFrom: null,
      expiresAt: null,
      pageCount: row.page_count === null ? null : Number(row.page_count),
      completionPercent: row.completion_percent,
      signatureMethod: "none",
      includedForOutbound: false,
    });
    reviews.push({
      sourceVersionId: file.sourceVersionId,
      requirementId: file.requirementId,
      outputSha256: file.outputSha256,
      reviewDecisionId: String(row.id),
      status: "approved",
      completenessVerified: true,
      signatureRequirement:
        signature as PackageMemberReview["signatureRequirement"],
      signaturePolicyVersion: row.signature_policy_version === null
        ? null
        : Number(row.signature_policy_version),
    });
  }
  const documents =
    await tx`select version.id::text, version.document_type, version.status, version.bucket_id,
      version.source_sha256, version.content_type, version.valid_from::text, version.expires_at::text, null::integer as page_count
    from osp_private.document_versions version join osp_private.documents document on document.organization_id = version.organization_id and document.id = version.document_id
    where version.organization_id = ${command.organizationId}::uuid and (document.case_id = ${command.caseId}::uuid or document.case_id is null)
      and version.status in ('approved','review_required','rejected') and not exists (
        select 1 from osp_private.document_versions later where later.organization_id = version.organization_id and later.document_id = version.document_id and later.version > version.version)`;
  evidence.push(
    ...documentEvidence(documents, new Set()).map((r) => r.evidence),
  );
  const matrix = evaluateRequestFulfillment({
    contract,
    evidence,
    entity: {
      legalEntityKind: contract.targetXbfEntity === "unknown"
        ? "unknown"
        : "company",
    },
  });
  if (!matrix.gates.operationsReview) fail();
  return {
    receipt: sets[0].receipt_json,
    organizationId: command.organizationId,
    caseId: command.caseId,
    caseVersion: command.expectedCaseVersion,
    snapshotSha256: command.expectedSnapshotSha256,
    requestManifestSha256: contract.manifestSha256,
    expectedSetManifestSha256: set.manifestSha256,
    reviews,
    fulfillment: matrix,
  };
}
