import postgres from "postgres";

import {
  type SqlPort,
  type SqlRow,
  withOrganizationTransaction,
} from "../_shared/osp/database-context.ts";
import type { RequestManifestShadowConfiguration } from "./request-manifest-shadow-config.ts";

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;

export type RequestManifestShadowSource = Readonly<{
  organizationId: string;
  caseId: string;
  message: Readonly<{
    id: string;
    sourceSha256: string;
    subject: string;
    safeBody: string;
  }>;
  document: Readonly<{
    versionId: string;
    sourceSha256: string;
    bucketId: "osp-corporate-documents";
    objectKey: string;
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }>;
}>;

function databaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      value.trim() !== value ||
      !["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname ||
      url.search || url.hash
    ) throw new Error();
    return value;
  } catch {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
}

function bounded(value: unknown, maximum: number): string {
  if (
    typeof value !== "string" || value.trim() !== value || value.length < 1 ||
    value.length > maximum
  ) throw new Error("DATABASE_TEMPORARY");
  return value;
}

function source(
  configuration: RequestManifestShadowConfiguration,
  messageRows: SqlRow[],
  documentRows: SqlRow[],
): RequestManifestShadowSource {
  if (messageRows.length !== 1 || documentRows.length !== 1) {
    throw new Error("SHADOW_SOURCE_MISMATCH");
  }
  const message = messageRows[0];
  const document = documentRows[0];
  if (
    message.id !== configuration.gmailMessageId ||
    message.source_sha256 !== configuration.gmailSourceSha256 ||
    document.id !== configuration.documentVersionId ||
    document.source_sha256 !== configuration.documentSourceSha256 ||
    document.bucket_id !== "osp-corporate-documents" ||
    document.content_type !==
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    document.source_safety !== "safe"
  ) throw new Error("SHADOW_SOURCE_MISMATCH");
  return Object.freeze({
    organizationId: configuration.organizationId,
    caseId: configuration.caseId,
    message: Object.freeze({
      id: configuration.gmailMessageId,
      sourceSha256: configuration.gmailSourceSha256,
      subject: bounded(message.subject, 1_000),
      safeBody: bounded(message.safe_body, 40_000),
    }),
    document: Object.freeze({
      versionId: configuration.documentVersionId,
      sourceSha256: configuration.documentSourceSha256,
      bucketId: "osp-corporate-documents",
      objectKey: bounded(document.opaque_object_key, 1_024),
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  });
}

export function createPostgresRequestManifestShadowSource(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
}) {
  const created = (options.postgresFactory ??
    postgres as unknown as PostgresFactory)(databaseUrl(options.databaseUrl), {
      ssl: "verify-full",
      fetch_types: false,
      prepare: false,
      max: 1,
      connect_timeout: 5,
      connection: {
        application_name: "osp-request-manifest-shadow",
        statement_timeout: "5000",
        default_transaction_read_only: "on",
      },
    });
  if (typeof created !== "function") {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  const sql = created as SqlPort;
  return Object.freeze({
    async load(
      configuration: RequestManifestShadowConfiguration,
    ): Promise<RequestManifestShadowSource> {
      return await withOrganizationTransaction(
        sql,
        configuration.organizationId,
        async (tx) => {
          const cases =
            await tx`select id from osp_private.customer_registration_cases where organization_id = ${configuration.organizationId} and id = ${configuration.caseId}`;
          if (cases.length !== 1 || cases[0].id !== configuration.caseId) {
            throw new Error("SHADOW_SOURCE_MISMATCH");
          }
          const messages =
            await tx`select id, source_sha256, subject, safe_body from osp_private.gmail_messages where organization_id = ${configuration.organizationId} and case_id = ${configuration.caseId} and id = ${configuration.gmailMessageId} and source_sha256 = ${configuration.gmailSourceSha256}`;
          const documents =
            await tx`select version.id, version.source_sha256, version.bucket_id, version.opaque_object_key, version.content_type, safety.status as source_safety from osp_private.document_versions version join osp_private.documents document on document.organization_id = version.organization_id and document.id = version.document_id join lateral (select assessment.status from osp_private.source_safety_assessments assessment where assessment.organization_id = version.organization_id and assessment.document_version_id = version.id order by assessment.version desc limit 1) safety on true where version.organization_id = ${configuration.organizationId} and document.case_id = ${configuration.caseId} and version.id = ${configuration.documentVersionId} and version.source_sha256 = ${configuration.documentSourceSha256} and version.document_type = 'supplier_requirement' and version.status in ('review_required', 'approved')`;
          return source(configuration, messages, documents);
        },
      );
    },
  });
}
