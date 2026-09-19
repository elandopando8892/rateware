import postgres from "postgres";

import {
  buildRequestContract,
  evaluateRequestFulfillment,
  type FulfillmentEvidence,
  type RequestContractRequirement,
  type RequestFulfillmentMatrix,
  type RequestOutboundAttachment,
  type RequestSemanticGate,
} from "../_shared/osp/request-contract.ts";
import {
  type SqlPort,
  type SqlRow,
  withOrganizationTransaction,
} from "../_shared/osp/database-context.ts";
import { canonicalPackageSetJson } from "../_shared/osp/package-set-json.ts";
import {
  type PackageMemberReview,
  preparePackageSetReview,
} from "./package-set-review.ts";
import { parseWorkflowPackageSet } from "./workflow-package-set.ts";

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;

const SHA = /^[0-9a-f]{64}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DECISION_ID =
  /^(?:clarification|contradiction|missing):(?:0|[1-9][0-9]{0,2})$/;
const FIELD_ID = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;
const EVIDENCE_ID = /^[A-Za-z0-9:_-]{1,256}$/;

type EvidenceRecord = Readonly<{
  evidence: FulfillmentEvidence;
  attachment: RequestOutboundAttachment;
}>;

type AssessmentBundle = Readonly<{
  matrix: RequestFulfillmentMatrix;
  requiredAttachments: readonly RequestOutboundAttachment[];
}>;

type ReviewedSetBundle = Readonly<{
  records: readonly EvidenceRecord[];
  identity: RequestFulfillmentMatrix["packageReviewIdentity"] | null;
  operationsReviewCurrent: boolean;
}>;

const DOCUMENT_KEYS: Readonly<Record<string, string>> = Object.freeze({
  articles_of_incorporation: "legal.articles_of_incorporation",
  legal_representative_id: "identity.legal_representative",
  power_of_attorney: "legal.power_of_attorney",
  sat_compliance_opinion: "fiscal.sat_compliance_opinion",
  tax_status_certificate: "fiscal.tax_status_certificate",
  bank_statement: "banking.account_evidence",
  proof_of_address: "legal.proof_of_address",
  w9: "fiscal.w9",
  broker_authority: "operations.broker_authority",
  surety_bond: "insurance.surety_bond",
});

function parsedJson(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error("REQUEST_FULFILLMENT_SOURCE_INVALID");
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("REQUEST_FULFILLMENT_SOURCE_INVALID");
  }
  return value as Record<string, unknown>;
}

function nullableDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("REQUEST_FULFILLMENT_SOURCE_INVALID");
  }
  return value;
}

function nonNegative(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) {
    throw new Error("REQUEST_FULFILLMENT_SOURCE_INVALID");
  }
  return parsed;
}

function parsedArray(value: unknown): readonly Record<string, unknown>[] {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error("REQUEST_FULFILLMENT_SOURCE_INVALID");
    }
  }
  if (
    !Array.isArray(value) || value.length > 100 ||
    value.some((item) =>
      !item || typeof item !== "object" || Array.isArray(item)
    )
  ) throw new Error("REQUEST_FULFILLMENT_SOURCE_INVALID");
  return value as Record<string, unknown>[];
}

export function manifestScopeExceptions(
  value: unknown,
): NonNullable<RequestFulfillmentMatrix["scopeExceptions"]> {
  const deferred = parsedArray(value).filter((item) =>
    item.outcome === "deferred_mvp"
  );
  const seen = new Set<string>();
  return Object.freeze(deferred.map((item) => {
    if (
      typeof item.decisionId !== "string" ||
      !DECISION_ID.test(item.decisionId) || seen.has(item.decisionId) ||
      (item.fieldId !== null &&
        (typeof item.fieldId !== "string" || !FIELD_ID.test(item.fieldId))) ||
      typeof item.resolution !== "string" ||
      item.resolution.trim() !== item.resolution ||
      item.resolution.length < 3 || item.resolution.length > 2_000 ||
      !Array.isArray(item.evidenceIds) || item.evidenceIds.length < 1 ||
      item.evidenceIds.length > 20 ||
      item.evidenceIds.some((id) =>
        typeof id !== "string" || !EVIDENCE_ID.test(id)
      ) || new Set(item.evidenceIds).size !== item.evidenceIds.length
    ) throw new Error("REQUEST_FULFILLMENT_SOURCE_INVALID");
    seen.add(item.decisionId);
    return Object.freeze({
      decisionId: item.decisionId,
      fieldId: item.fieldId as string | null,
      reason: item.resolution,
      evidenceIds: Object.freeze([...(item.evidenceIds as string[])]),
    });
  }));
}

export function lockConsequentialGatesForScopeExceptions(
  matrix: RequestFulfillmentMatrix,
  scopeExceptions: NonNullable<RequestFulfillmentMatrix["scopeExceptions"]>,
): RequestFulfillmentMatrix {
  if (scopeExceptions.length === 0) return matrix;
  return Object.freeze({
    ...matrix,
    scopeExceptions,
    gates: Object.freeze({
      ...matrix.gates,
      operationsReview: true,
      signatureApproval: false,
      outboundDraft: false,
      outboundFreeze: false,
      salesAuthorization: false,
      send: false,
    }),
  });
}

function attachmentKey(input: {
  bucketId: unknown;
  objectId: unknown;
  contentType: unknown;
  sha256: unknown;
}): string | null {
  if (
    (input.bucketId !== "osp-corporate-documents" &&
      input.bucketId !== "osp-derived-documents") ||
    typeof input.objectId !== "string" || !UUID.test(input.objectId) ||
    typeof input.contentType !== "string" ||
    typeof input.sha256 !== "string" || !SHA.test(input.sha256)
  ) return null;
  return [input.bucketId, input.objectId, input.contentType, input.sha256].join(
    ":",
  );
}

function includedAttachmentKeys(rows: SqlRow[]): ReadonlySet<string> {
  if (rows.length === 0) return new Set();
  if (rows.length !== 1) {
    throw new Error("REQUEST_FULFILLMENT_SOURCE_INVALID");
  }
  const keys = parsedArray(rows[0].attachments_json).map((row) =>
    attachmentKey({
      bucketId: row.bucketId,
      objectId: row.objectId,
      contentType: row.contentType,
      sha256: row.sha256,
    })
  );
  if (keys.some((key) => key === null)) {
    throw new Error("REQUEST_FULFILLMENT_SOURCE_INVALID");
  }
  return new Set(keys as string[]);
}

function extension(contentType: string): string {
  if (contentType === "application/pdf") return "pdf";
  if (
    contentType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) return "xlsx";
  if (contentType === "application/vnd.ms-excel.sheet.macroEnabled.12") {
    return "xlsm";
  }
  if (
    contentType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) return "docx";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/tiff") return "tiff";
  throw new Error("REQUEST_FULFILLMENT_SOURCE_INVALID");
}

function attachment(
  input: {
    bucketId: unknown;
    objectId: unknown;
    contentType: unknown;
    sha256: unknown;
    baseName: string;
  },
): RequestOutboundAttachment {
  const key = attachmentKey(input);
  if (!key || typeof input.contentType !== "string") {
    throw new Error("REQUEST_FULFILLMENT_SOURCE_INVALID");
  }
  const name = `${
    input.baseName.replace(/[^A-Za-z0-9._ -]+/g, "-").slice(0, 110)
  }.${extension(input.contentType)}`;
  return Object.freeze({
    bucketId: input.bucketId as RequestOutboundAttachment["bucketId"],
    objectId: input.objectId as string,
    name,
    contentType: input.contentType as RequestOutboundAttachment["contentType"],
    sha256: input.sha256 as string,
  });
}

export function documentEvidence(
  rows: SqlRow[],
  included: ReadonlySet<string>,
): EvidenceRecord[] {
  return rows.flatMap((row) => {
    const canonicalKey = DOCUMENT_KEYS[String(row.document_type)];
    if (!canonicalKey) return [];
    if (
      typeof row.id !== "string" || typeof row.content_type !== "string" ||
      (row.status !== "approved" && row.status !== "review_required" &&
        row.status !== "rejected")
    ) throw new Error("REQUEST_FULFILLMENT_SOURCE_INVALID");
    const outboundAttachment = attachment({
      bucketId: row.bucket_id,
      objectId: row.id,
      contentType: row.content_type,
      sha256: row.source_sha256,
      baseName: `XBF-${String(row.document_type).replaceAll("_", "-")}`,
    });
    return [Object.freeze({
      evidence: Object.freeze({
        evidenceId: `document:${row.id}`,
        canonicalKey,
        label: String(row.document_type),
        contentType: row.content_type,
        status: row.status,
        validFrom: nullableDate(row.valid_from),
        expiresAt: nullableDate(row.expires_at),
        pageCount: nonNegative(row.page_count),
        completionPercent: null,
        signatureMethod: "none" as const,
        includedForOutbound: included.has(attachmentKey(outboundAttachment)!),
      }),
      attachment: outboundAttachment,
    })];
  });
}

function formEvidence(
  rows: SqlRow[],
  forms: readonly RequestContractRequirement[],
  included: ReadonlySet<string>,
): EvidenceRecord[] {
  if (forms.length === 0) return [];
  return rows.flatMap((row) => {
    if (
      typeof row.id !== "string" || typeof row.content_type !== "string" ||
      (row.package_kind !== "supplier_completed" &&
        row.package_kind !== "signed")
    ) throw new Error("REQUEST_FULFILLMENT_SOURCE_INVALID");
    const receipt = row.artifact_receipt_json === null
      ? null
      : parsedJson(row.artifact_receipt_json);
    // Legacy single-form behavior is preserved. Multiple forms require a
    // database-verified source/snapshot chain and exactly one source citation.
    // This establishes identity only, never semantic completion or signature.
    let canonicalKey = forms.length === 1 ? forms[0].canonicalKey : null;
    if (forms.length > 1) {
      if (
        row.source_binding_verified !== true || !receipt ||
        typeof receipt.sourceVersionId !== "string" ||
        !UUID.test(receipt.sourceVersionId) ||
        receipt.outputSha256 !== row.output_sha256 ||
        receipt.contentType !== row.content_type
      ) return [];
      const sourceId = receipt.sourceVersionId;
      const candidates = forms.filter((form) =>
        form.evidenceIds.some((id) =>
          id === `file:${sourceId}` || id.startsWith(`xlsx:${sourceId}:`)
        )
      );
      if (candidates.length !== 1) return [];
      canonicalKey = candidates[0].canonicalKey;
    }
    // XLSX occupancy is neither rendered PDF pagination nor semantic completion.
    // Never inherit structure from the unsigned/source package after bytes change.
    const structure = receipt && receipt.outputSha256 === row.output_sha256 &&
        receipt.contentType === "application/pdf" &&
        row.content_type === "application/pdf" &&
        receipt.pdfStructure && typeof receipt.pdfStructure === "object" &&
        !Array.isArray(receipt.pdfStructure)
      ? receipt.pdfStructure as Record<string, unknown>
      : null;
    const pageCount = structure?.schemaVersion === 1 &&
        structure.outputSha256 === row.output_sha256 &&
        typeof structure.pageCount === "number" &&
        Number.isSafeInteger(structure.pageCount) &&
        structure.pageCount > 0 && structure.pageCount <= 1000
      ? structure.pageCount
      : null;
    const signature =
      row.package_kind === "signed" && row.signature_verified === true
        // An applied image proves an electronic application, not a wet-ink act.
        ? "digital" as const
        : "none" as const;
    const outboundAttachment = attachment({
      bucketId: "osp-derived-documents",
      objectId: row.id,
      contentType: row.content_type,
      sha256: row.output_sha256,
      baseName: row.package_kind === "signed"
        ? "XBF-signed-supplier-package"
        : "XBF-completed-supplier-package",
    });
    return [Object.freeze({
      evidence: Object.freeze({
        evidenceId: `package:${row.id}`,
        canonicalKey: canonicalKey!,
        label: String(row.package_kind),
        contentType: row.content_type,
        status: "approved" as const,
        validFrom: null,
        expiresAt: null,
        pageCount,
        // No producer currently certifies reviewed carrier-field coverage on exact bytes.
        // Keep unknown until that evidence exists; do not turn occupied cells into 100%.
        completionPercent: null,
        signatureMethod: signature,
        includedForOutbound: included.has(attachmentKey(outboundAttachment)!),
      }),
      attachment: outboundAttachment,
    })];
  });
}

function nativeCompletion(
  contentType: string,
  mappingKinds: readonly string[],
): boolean {
  if (mappingKinds.length < 1) return false;
  if (
    contentType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    contentType === "application/vnd.ms-excel.sheet.macroEnabled.12"
  ) return mappingKinds.every((kind) => kind === "xlsx_cell");
  if (contentType === "application/pdf") {
    return mappingKinds.every((kind) =>
      kind === "acroform" || kind === "pdf_overlay"
    );
  }
  if (
    contentType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) return mappingKinds.every((kind) => kind === "docx_content_control");
  return false;
}

async function reviewedSetEvidence(input: {
  organizationId: string;
  caseId: string;
  requestManifestSha256: string;
  forms: readonly RequestContractRequirement[];
  included: ReadonlySet<string>;
  sets: SqlRow[];
  reviews: SqlRow[];
  operationsReviews: SqlRow[];
}): Promise<ReviewedSetBundle | null> {
  if (input.sets.length === 0) return null;
  if (input.sets.length !== 1) {
    throw new Error("REQUEST_FULFILLMENT_SOURCE_INVALID");
  }
  const row = input.sets[0];
  if (
    typeof row.id !== "string" || !UUID.test(row.id) ||
    typeof row.input_snapshot_sha256 !== "string" ||
    !SHA.test(row.input_snapshot_sha256) ||
    typeof row.manifest_sha256 !== "string" || !SHA.test(row.manifest_sha256)
  ) throw new Error("REQUEST_FULFILLMENT_SOURCE_INVALID");
  const caseVersion = Number(row.snapshot_case_version);
  if (!Number.isSafeInteger(caseVersion) || caseVersion < 0) {
    throw new Error("REQUEST_FULFILLMENT_SOURCE_INVALID");
  }
  const set = await parseWorkflowPackageSet(row.receipt_json, {
    organizationId: input.organizationId,
    caseId: input.caseId,
    snapshotSha256: row.input_snapshot_sha256,
  });
  if (set.setId !== row.id || set.manifestSha256 !== row.manifest_sha256) {
    throw new Error("REQUEST_FULFILLMENT_SOURCE_INVALID");
  }
  const records: EvidenceRecord[] = [];
  const basisReviews: PackageMemberReview[] = [];
  const usedRequirements = new Set<string>();
  for (const file of set.files) {
    const review = input.reviews.find((candidate) =>
      candidate.source_version_id === file.sourceVersionId
    );
    const matching = input.forms.filter((form) =>
      form.evidenceIds.some((id) =>
        id === `file:${file.sourceVersionId}` ||
        id.startsWith(`xlsx:${file.sourceVersionId}:`)
      )
    );
    if (
      !review || matching.length !== 1 ||
      usedRequirements.has(matching[0].id) ||
      review.source_status !== "approved" ||
      review.source_sha256 !== file.sourceSha256 ||
      review.set_manifest_sha256 !== set.manifestSha256 ||
      review.request_manifest_sha256 !== input.requestManifestSha256 ||
      review.output_sha256 !== file.outputSha256 ||
      typeof review.id !== "string" || !UUID.test(review.id) ||
      !nativeCompletion(file.contentType, file.mappingKinds)
    ) continue;
    if (
      (review.status !== "approved" && review.status !== "rejected") ||
      typeof review.completion_percent !== "number" ||
      !Number.isSafeInteger(review.completion_percent) ||
      review.completion_percent < 0 || review.completion_percent > 100 ||
      (review.page_count !== null &&
        (!Number.isSafeInteger(Number(review.page_count)) ||
          Number(review.page_count) < 1 || Number(review.page_count) > 1000)) ||
      !["none", "image", "autograph"].includes(
        String(review.signature_requirement),
      ) ||
      (review.signature_requirement === "none"
        ? review.signature_policy_version !== null
        : !Number.isSafeInteger(Number(review.signature_policy_version)) ||
          Number(review.signature_policy_version) < 1)
    ) throw new Error("REQUEST_FULFILLMENT_SOURCE_INVALID");
    const requirement = matching[0];
    const signatureRequirement = String(review.signature_requirement);
    if (
      (requirement.signatureMethod === "wet" &&
        signatureRequirement !== "autograph") ||
      (requirement.signatureMethod === "digital" &&
        signatureRequirement !== "image") ||
      (requirement.signatureMethod === "none" &&
        signatureRequirement !== "none") ||
      (requirement.signatureMethod === "either" &&
        signatureRequirement !== "image" &&
        signatureRequirement !== "autograph")
    ) continue;
    usedRequirements.add(requirement.id);
    const outboundAttachment = attachment({
      bucketId: "osp-derived-documents",
      // Source version IDs are immutable UUID handles. The object reader
      // resolves the exact member object through the current set receipt.
      objectId: file.sourceVersionId,
      contentType: file.contentType,
      sha256: file.outputSha256,
      baseName: `XBF-completed-original-${file.sourceVersionId}`,
    });
    records.push(Object.freeze({
      evidence: Object.freeze({
        evidenceId: `review:${review.id}`,
        canonicalKey: requirement.canonicalKey,
        label: requirement.label,
        contentType: file.contentType,
        status: review.status as "approved" | "rejected",
        validFrom: null,
        expiresAt: null,
        pageCount: review.page_count === null
          ? null
          : Number(review.page_count),
        completionPercent: Number(review.completion_percent),
        // The persisted requirement/policy is part of the immutable review
        // identity; it is not evidence that a signature has been applied.
        signatureMethod: "none",
        includedForOutbound: input.included.has(
          attachmentKey(outboundAttachment)!,
        ),
      }),
      attachment: outboundAttachment,
    }));
    if (review.status === "approved" && review.full_output_inspected === true) {
      basisReviews.push({
        sourceVersionId: file.sourceVersionId,
        sourceSha256: file.sourceSha256,
        outputSha256: file.outputSha256,
        requirementId: file.requirementId,
        reviewDecisionId: review.id,
        status: "approved",
        completenessVerified: true,
        completionPercent: Number(review.completion_percent),
        pageCount: review.page_count === null
          ? null
          : Number(review.page_count),
        signatureRequirement: review
          .signature_requirement as PackageMemberReview["signatureRequirement"],
        signaturePolicyVersion: review.signature_policy_version === null
          ? null
          : Number(review.signature_policy_version),
      });
    }
  }
  let identity: RequestFulfillmentMatrix["packageReviewIdentity"] | null = null;
  let operationsReviewCurrent = false;
  if (basisReviews.length === set.files.length) {
    try {
      const basis = await preparePackageSetReview({
        receipt: row.receipt_json,
        organizationId: input.organizationId,
        caseId: input.caseId,
        caseVersion,
        snapshotSha256: row.input_snapshot_sha256,
        requestManifestSha256: input.requestManifestSha256,
        expectedSetManifestSha256: set.manifestSha256,
        reviews: basisReviews,
      });
      identity = Object.freeze({
        setId: basis.setId,
        setManifestSha256: basis.setManifestSha256,
        reviewSha256: basis.reviewSha256,
        requestManifestSha256: basis.requestManifestSha256,
        snapshotSha256: basis.snapshotSha256,
        members: Object.freeze(basis.members.map((member) =>
          Object.freeze({
            requirementId: member.requirementId,
            sourceVersionId: member.sourceVersionId,
            sourceSha256: member.sourceSha256,
            outputSha256: member.outputSha256,
            artifactRole: member.artifactRole,
            completionMethod: member.completionMethod,
            signatureRequirement: member.signatureRequirement,
            signaturePolicyVersion: member.signaturePolicyVersion,
          })
        )),
      });
      const operation = input.operationsReviews[0];
      operationsReviewCurrent = input.operationsReviews.length === 1 &&
        operation.package_set_id === basis.setId &&
        operation.review_sha256 === basis.reviewSha256 &&
        canonicalPackageSetJson(parsedJson(operation.basis_json)) ===
          canonicalPackageSetJson(basis);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "PACKAGE_SET_REVIEW_BLOCKED"
      ) throw error;
    }
  }
  return Object.freeze({
    records: Object.freeze(records),
    identity,
    operationsReviewCurrent,
  });
}

export function createPostgresRequestSemanticGate(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
  now?: () => Date;
}): RequestSemanticGate {
  const created =
    (options.postgresFactory ?? postgres as unknown as PostgresFactory)(
      options.databaseUrl,
      {
        ssl: "verify-full",
        fetch_types: false,
        prepare: false,
        max: 1,
        connect_timeout: 5,
        connection: {
          application_name: "osp-request-semantic-gate",
          statement_timeout: "3000",
        },
      },
    );
  if (typeof created !== "function") {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  const sql = created as SqlPort;
  const loadBundle = async (
    input: { organizationId: string; caseId: string },
  ): Promise<AssessmentBundle> =>
    await withOrganizationTransaction(
      sql,
      input.organizationId,
      async (tx) => {
        await tx`set local statement_timeout = '3000ms'`;
        const sources = await tx`
        select manifest.manifest_json, manifest.manifest_sha256,
               review.decisions_json,
               (review.status = 'resolved'
                and review.manifest_version = manifest.version
                and review.manifest_sha256 = manifest.manifest_sha256)
                 as current_review_resolved
        from osp_private.request_manifest_drafts manifest
        left join lateral (
          select candidate.status, candidate.manifest_version, candidate.manifest_sha256,
                 candidate.decisions_json
          from osp_private.request_manifest_decision_reviews candidate
          where candidate.organization_id = manifest.organization_id
            and candidate.case_id = manifest.case_id
            and candidate.manifest_draft_id = manifest.id
          order by candidate.review_version desc
          limit 1
        ) review on true
        where manifest.organization_id = ${input.organizationId}
          and manifest.case_id = ${input.caseId}
        order by manifest.version desc
        limit 1`;
        if (
          sources.length !== 1 || sources[0].current_review_resolved !== true ||
          typeof sources[0].manifest_sha256 !== "string" ||
          !SHA.test(sources[0].manifest_sha256)
        ) throw new Error("REQUEST_FULFILLMENT_BLOCKED");
        const contract = buildRequestContract({
          manifestSha256: sources[0].manifest_sha256,
          manifest: parsedJson(sources[0].manifest_json),
        });
        const scopeExceptions = manifestScopeExceptions(
          sources[0].decisions_json,
        );
        const outboundDrafts = await tx`
        select draft.attachments_json
        from osp_private.outbound_drafts draft
        where draft.organization_id = ${input.organizationId}
          and draft.case_id = ${input.caseId}
          and draft.payload_kind = 'final_response'
        order by draft.version desc, draft.created_at desc
        limit 1`;
        const included = includedAttachmentKeys(outboundDrafts);
        const documents = await tx`
        select version.id::text, version.document_type, version.status,
               version.bucket_id, version.source_sha256,
               version.content_type, version.valid_from::text,
               version.expires_at::text, null::integer as page_count
        from osp_private.document_versions version
        join osp_private.documents document
          on document.organization_id = version.organization_id
         and document.id = version.document_id
        where version.organization_id = ${input.organizationId}
          and (document.case_id = ${input.caseId} or document.case_id is null)
          and version.status in ('approved', 'review_required', 'rejected')
          and not exists (
            select 1 from osp_private.document_versions later
            where later.organization_id = version.organization_id
              and later.document_id = version.document_id
              and later.version > version.version
          )
        order by version.document_type, version.version desc`;
        const forms = contract.requirements.filter((item) =>
          item.kind === "form"
        );
        const sets = await tx`
        select package.id::text, package.receipt_json, package.manifest_sha256,
               package.input_snapshot_sha256,
               snapshot.case_version as snapshot_case_version
        from osp_private.supplier_package_sets package
        join osp_private.case_package_input_snapshots snapshot
          on snapshot.organization_id = package.organization_id
         and snapshot.case_id = package.case_id
         and snapshot.id = package.input_snapshot_id
         and snapshot.canonical_sha256 = package.input_snapshot_sha256
        where package.organization_id = ${input.organizationId}
          and package.case_id = ${input.caseId}
          and package.status = 'current'
          and snapshot.id = (select latest.id
            from osp_private.case_package_input_snapshots latest
            where latest.organization_id = package.organization_id
              and latest.case_id = package.case_id
            order by latest.created_at desc, latest.id desc limit 1)`;
        let reviewedSet: ReviewedSetBundle | null = null;
        if (sets.length > 0) {
          const reviews = await tx`
          select distinct on (review.source_version_id)
                 review.id::text, review.source_version_id::text,
                 review.set_manifest_sha256, review.request_manifest_sha256,
                 review.output_sha256, review.status,
                 review.full_output_inspected, review.completion_percent,
                 review.page_count, review.signature_requirement,
                 review.signature_policy_version,
                 source.status as source_status, source.source_sha256
          from osp_private.package_set_member_reviews review
          join osp_private.document_versions source
            on source.organization_id = review.organization_id
           and source.id = review.source_version_id
           and source.document_type = 'supplier_requirement'
          where review.organization_id = ${input.organizationId}
            and review.case_id = ${input.caseId}
            and review.package_set_id = ${String(sets[0]?.id)}::uuid
          order by review.source_version_id, review.review_version desc`;
          const operationsReviews = await tx`
          select review.package_set_id::text, review.review_sha256,
                 review.basis_json
          from osp_private.package_set_operations_reviews review
          where review.organization_id = ${input.organizationId}
            and review.case_id = ${input.caseId}
            and review.package_set_id = ${String(sets[0]?.id)}::uuid
          order by review.created_at desc, review.id desc
          limit 1`;
          reviewedSet = await reviewedSetEvidence({
            organizationId: input.organizationId,
            caseId: input.caseId,
            requestManifestSha256: contract.manifestSha256,
            forms,
            included,
            sets,
            reviews,
            operationsReviews,
          });
        }
        const packages = reviewedSet ? [] : await tx`
        select value.id::text, value.package_kind, value.content_type,
               value.output_sha256,
               value.artifact_receipt_json,
               exists (
                 select 1 from osp_private.document_versions original
                 join osp_private.case_package_input_snapshots snapshot
                   on snapshot.organization_id = original.organization_id
                  and snapshot.case_id = value.case_id
                  and snapshot.id = value.input_snapshot_id
                  and snapshot.canonical_sha256 = value.input_snapshot_sha256
                  and original.id = any(snapshot.document_version_ids)
                 where original.organization_id = value.organization_id
                   and original.id::text = value.artifact_receipt_json->>'sourceVersionId'
                   and original.source_sha256 = value.artifact_receipt_json->>'sourceSha256'
                   and original.document_type = 'supplier_requirement'
                   and original.status = 'approved'
                   and snapshot.id::text = value.artifact_receipt_json->>'packageSnapshotId'
                   and snapshot.canonical_sha256 = value.artifact_receipt_json->>'packageSnapshotSha256'
               ) as source_binding_verified,
               case when value.package_kind = 'signed' then exists (
                 select 1 from osp_private.signature_application_receipts receipt
                 where receipt.organization_id = value.organization_id
                   and receipt.case_id = value.case_id
                   and receipt.approval_id = value.signature_approval_id
                   and receipt.outcome = 'applied'
                   and receipt.output_object_id = value.object_id
                   and receipt.output_sha256 = value.output_sha256
               ) else false end as signature_verified
        from osp_private.generated_packages value
        where value.organization_id = ${input.organizationId}
          and value.case_id = ${input.caseId}
          and value.package_kind in ('supplier_completed', 'signed')
          and value.status = 'current'
        order by case when value.package_kind = 'supplier_completed' then 0 else 1 end,
                 value.version desc`;
        const records = Object.freeze([
          ...documentEvidence(documents, included),
          ...(reviewedSet?.records ?? formEvidence(packages, forms, included)),
        ]);
        const assessed = lockConsequentialGatesForScopeExceptions(
          evaluateRequestFulfillment({
            contract,
            evidence: records.map((record) => record.evidence),
            entity: {
              legalEntityKind: contract.targetXbfEntity === "unknown"
                ? "unknown"
                : "company",
            },
            now: options.now?.() ?? new Date(),
          }),
          scopeExceptions,
        );
        const matrix: RequestFulfillmentMatrix = reviewedSet
          ? Object.freeze({
            ...assessed,
            ...(reviewedSet.identity
              ? { packageReviewIdentity: reviewedSet.identity }
              : {}),
            gates: Object.freeze({
              ...assessed.gates,
              operationsReview: assessed.gates.operationsReview &&
                reviewedSet.identity !== null,
              signatureApproval: assessed.gates.signatureApproval &&
                reviewedSet.operationsReviewCurrent,
              outboundDraft: assessed.gates.outboundDraft &&
                reviewedSet.operationsReviewCurrent,
              outboundFreeze: assessed.gates.outboundFreeze &&
                reviewedSet.operationsReviewCurrent,
              salesAuthorization: assessed.gates.salesAuthorization &&
                reviewedSet.operationsReviewCurrent,
              send: assessed.gates.send &&
                reviewedSet.operationsReviewCurrent,
            }),
          })
          : assessed;
        const evidenceById = new Map(records.map((record) => [
          record.evidence.evidenceId,
          record.attachment,
        ]));
        const requiredIds = new Set(
          contract.requirements.filter((item) => item.required).map((item) =>
            item.id
          ),
        );
        const selected = matrix.items.flatMap((item) => {
          if (
            !requiredIds.has(item.requirementId) || item.evidenceIds.length < 1
          ) {
            return [];
          }
          const value = evidenceById.get(item.evidenceIds[0]);
          return value ? [value] : [];
        });
        const seen = new Set<string>();
        const requiredAttachments = selected.filter((item) => {
          const key = attachmentKey(item);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        }).sort((left, right) =>
          left.bucketId === right.bucketId
            ? left.name.localeCompare(right.name)
            : left.bucketId === "osp-derived-documents"
            ? -1
            : 1
        );
        return Object.freeze({
          matrix,
          requiredAttachments: Object.freeze(requiredAttachments),
        });
      },
    );
  return Object.freeze({
    load: async (input: { organizationId: string; caseId: string }) =>
      (await loadBundle(input)).matrix,
    requiredOutboundAttachments: async (
      input: { organizationId: string; caseId: string },
    ) => {
      const bundle = await loadBundle(input);
      if (!bundle.matrix.gates.outboundDraft) {
        throw new Error("REQUEST_FULFILLMENT_BLOCKED");
      }
      return bundle.requiredAttachments;
    },
  });
}
