import postgres from "postgres";

import {
  type SqlPort,
  type SqlRow,
  withOrganizationTransaction,
} from "../_shared/osp/database-context.ts";
import type { RequestManifestDocument } from "./request-manifest-draft.ts";

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;
type SupportedContentType = RequestManifestDocument["contentType"];

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const OBJECT_KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}$/i;
const SUPPORTED = new Set<SupportedContentType>([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type RequestManifestSourceReference = Readonly<{
  organizationId: string;
  caseId: string;
  message: Readonly<{
    id: string;
    sourceSha256: string;
    subject: string;
    safeBody: string;
  }>;
  documents: readonly Readonly<{
    versionId: string;
    sourceName: string;
    sourceSha256: string;
    sourceSafety: "safe";
    bucketId: "osp-corporate-documents";
    objectKey: string;
    contentType: SupportedContentType;
  }>[];
}>;

function databaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      value.trim() !== value ||
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname || url.search || url.hash
    ) throw new Error();
    return value;
  } catch {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
}

function bounded(value: unknown, maximum: number, allowEmpty = false): string {
  if (
    typeof value !== "string" || value.length > maximum ||
    (!allowEmpty && value.length < 1)
  ) {
    throw new Error("DATABASE_TEMPORARY");
  }
  return value;
}

function extension(contentType: SupportedContentType): string {
  if (contentType === "application/pdf") return "pdf";
  if (contentType.endsWith("spreadsheetml.sheet")) return "xlsx";
  if (contentType === "application/vnd.ms-excel.sheet.macroEnabled.12") return "xlsm";
  if (contentType.endsWith("wordprocessingml.document")) return "docx";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  return "webp";
}

function manifestSource(
  organizationId: string,
  caseId: string,
  messages: SqlRow[],
  documents: SqlRow[],
): RequestManifestSourceReference {
  if (messages.length !== 1 || documents.length > 20) {
    throw new Error("REQUEST_MANIFEST_SOURCE_MISMATCH");
  }
  const message = messages[0];
  if (
    !UUID.test(String(message.id)) ||
    !SHA256.test(String(message.source_sha256))
  ) {
    throw new Error("REQUEST_MANIFEST_SOURCE_MISMATCH");
  }
  const seen = new Set<string>();
  const documentRefs = documents.map((row) => {
    const versionId = String(row.id);
    const contentType = String(row.content_type) as SupportedContentType;
    if (
      !UUID.test(versionId) || seen.has(versionId) ||
      !SHA256.test(String(row.source_sha256)) ||
      row.bucket_id !== "osp-corporate-documents" ||
      !OBJECT_KEY.test(String(row.opaque_object_key)) ||
      row.source_safety !== "safe" || !SUPPORTED.has(contentType)
    ) {
      throw new Error("REQUEST_MANIFEST_CONTENT_TYPE_UNSUPPORTED");
    }
    seen.add(versionId);
    return Object.freeze({
      versionId,
      sourceName: `supplier-requirement-${versionId}.${extension(contentType)}`,
      sourceSha256: String(row.source_sha256),
      sourceSafety: "safe" as const,
      bucketId: "osp-corporate-documents" as const,
      objectKey: String(row.opaque_object_key),
      contentType,
    });
  });
  return Object.freeze({
    organizationId,
    caseId,
    message: Object.freeze({
      id: String(message.id),
      sourceSha256: String(message.source_sha256),
      subject: bounded(message.subject, 998),
      safeBody: bounded(message.safe_body, 40_000, true),
    }),
    documents: Object.freeze(documentRefs),
  });
}

export function createPostgresRequestManifestSource(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
}) {
  const created =
    (options.postgresFactory ?? postgres as unknown as PostgresFactory)(
      databaseUrl(options.databaseUrl),
      {
        ssl: "verify-full",
        fetch_types: false,
        prepare: false,
        max: 1,
        connect_timeout: 5,
        connection: {
          application_name: "osp-request-manifest-source",
          statement_timeout: "5000",
          default_transaction_read_only: "on",
        },
      },
    );
  if (typeof created !== "function") {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  const sql = created as SqlPort;
  return Object.freeze({
    async load(
      input: { organizationId: string; caseId: string },
    ): Promise<RequestManifestSourceReference> {
      if (!UUID.test(input.organizationId) || !UUID.test(input.caseId)) {
        throw new Error("INVALID_INPUT");
      }
      return await withOrganizationTransaction(
        sql,
        input.organizationId,
        async (tx) => {
          const cases =
            await tx`select id from osp_private.customer_registration_cases where organization_id = ${input.organizationId} and id = ${input.caseId} and blocked_by_duplicate_review = false`;
          if (
            cases.length !== 1 || cases[0].id !== input.caseId
          ) throw new Error("REQUEST_MANIFEST_SOURCE_MISMATCH");
          const messages =
            await tx`select id, source_sha256, subject, safe_body from osp_private.gmail_messages where organization_id = ${input.organizationId} and case_id = ${input.caseId} order by received_at desc, id desc limit 1`;
          const documents =
            await tx`select version.id, version.source_sha256, version.bucket_id, version.opaque_object_key, version.content_type, safety.status as source_safety from osp_private.document_versions version join osp_private.documents document on document.organization_id = version.organization_id and document.id = version.document_id join lateral (select assessment.status from osp_private.source_safety_assessments assessment where assessment.organization_id = version.organization_id and assessment.document_version_id = version.id order by assessment.version desc limit 1) safety on true where version.organization_id = ${input.organizationId} and document.case_id = ${input.caseId} and version.document_type = 'supplier_requirement' and version.status in ('review_required', 'approved') and not exists (select 1 from osp_private.document_versions later where later.organization_id = version.organization_id and later.document_id = version.document_id and later.version > version.version) order by version.id limit 21`;
          return manifestSource(
            input.organizationId,
            input.caseId,
            messages,
            documents,
          );
        },
      );
    },
  });
}
