import postgres from "postgres";

import {
  buildRequestContract,
  evaluateRequestFulfillment,
  type FulfillmentEvidence,
  type RequestFulfillmentMatrix,
  type RequestOutboundAttachment,
  type RequestSemanticGate,
} from "../_shared/osp/request-contract.ts";
import {
  type SqlPort,
  type SqlRow,
  withOrganizationTransaction,
} from "../_shared/osp/database-context.ts";

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;

const SHA = /^[0-9a-f]{64}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type EvidenceRecord = Readonly<{
  evidence: FulfillmentEvidence;
  attachment: RequestOutboundAttachment;
}>;

type AssessmentBundle = Readonly<{
  matrix: RequestFulfillmentMatrix;
  requiredAttachments: readonly RequestOutboundAttachment[];
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

function documentEvidence(
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
  formKeys: readonly string[],
  included: ReadonlySet<string>,
): EvidenceRecord[] {
  // The current package model binds one generated artifact to one requested form.
  // Multiple requested forms must remain fail-closed until each package carries
  // an explicit form requirement id; positional guessing could satisfy the wrong form.
  if (formKeys.length !== 1) return [];
  return rows.flatMap((row) => {
    if (
      typeof row.id !== "string" || typeof row.content_type !== "string" ||
      (row.package_kind !== "supplier_completed" &&
        row.package_kind !== "signed")
    ) throw new Error("REQUEST_FULFILLMENT_SOURCE_INVALID");
    const receipt = row.artifact_receipt_json === null
      ? null
      : parsedJson(row.artifact_receipt_json);
    const coverage = receipt && receipt.formCoverage &&
        typeof receipt.formCoverage === "object" &&
        !Array.isArray(receipt.formCoverage)
      ? receipt.formCoverage as Record<string, unknown>
      : null;
    const signature =
      row.package_kind === "signed" && row.signature_verified === true
        ? "wet" as const
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
        canonicalKey: formKeys[0],
        label: String(row.package_kind),
        contentType: row.content_type,
        status: "approved" as const,
        validFrom: null,
        expiresAt: null,
        pageCount: nonNegative(coverage?.visiblePageCount),
        completionPercent: nonNegative(coverage?.completionPercent),
        signatureMethod: signature,
        includedForOutbound: included.has(attachmentKey(outboundAttachment)!),
      }),
      attachment: outboundAttachment,
    })];
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
        select manifest.manifest_json, manifest.manifest_sha256
        from osp_private.request_manifest_decision_reviews review
        join osp_private.request_manifest_drafts manifest
          on manifest.organization_id = review.organization_id
         and manifest.id = review.manifest_draft_id
         and manifest.case_id = review.case_id
         and manifest.version = review.manifest_version
         and manifest.manifest_sha256 = review.manifest_sha256
        where review.organization_id = ${input.organizationId}
          and review.case_id = ${input.caseId}
          and review.status = 'resolved'
          and not exists (
            select 1 from osp_private.request_manifest_decision_reviews later
            where later.organization_id = review.organization_id
              and later.case_id = review.case_id
              and later.manifest_draft_id = review.manifest_draft_id
              and later.review_version > review.review_version
          )
        order by manifest.version desc, review.review_version desc
        limit 2`;
        if (
          sources.length !== 1 ||
          typeof sources[0].manifest_sha256 !== "string" ||
          !SHA.test(sources[0].manifest_sha256)
        ) throw new Error("REQUEST_FULFILLMENT_BLOCKED");
        const contract = buildRequestContract({
          manifestSha256: sources[0].manifest_sha256,
          manifest: parsedJson(sources[0].manifest_json),
        });
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
        const packages = await tx`
        select value.id::text, value.package_kind, value.content_type,
               value.output_sha256,
               coalesce(value.artifact_receipt_json, source.artifact_receipt_json)
                 as artifact_receipt_json,
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
        left join osp_private.generated_packages source
          on source.organization_id = value.organization_id
         and source.case_id = value.case_id
         and source.id = value.supersedes_package_id
        where value.organization_id = ${input.organizationId}
          and value.case_id = ${input.caseId}
          and value.package_kind in ('supplier_completed', 'signed')
          and value.status = 'current'
        order by case when value.package_kind = 'supplier_completed' then 0 else 1 end,
                 value.version desc`;
        const formKeys = contract.requirements.filter((item) =>
          item.kind === "form"
        ).map((item) => item.canonicalKey);
        const records = Object.freeze([
          ...documentEvidence(documents, included),
          ...formEvidence(packages, formKeys, included),
        ]);
        const matrix = evaluateRequestFulfillment({
          contract,
          evidence: records.map((record) => record.evidence),
          entity: {
            legalEntityKind: contract.targetXbfEntity === "unknown"
              ? "unknown"
              : "company",
          },
          now: options.now?.() ?? new Date(),
        });
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
