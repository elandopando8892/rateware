import postgres from "postgres";

import {
  type SqlPort,
  type SqlRow,
  withOrganizationTransaction,
} from "../_shared/osp/database-context.ts";
import type {
  AttachmentPromotionStore,
  GmailAttachmentSource,
  RegisteredRequirementDocument,
} from "./attachment-promotion.ts";

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;

function databaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      value.trim() !== value ||
      !["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname ||
      url.search || url.hash
    ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
    return value;
  } catch {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
}

function attachment(row: SqlRow): GmailAttachmentSource {
  if (
    typeof row.id !== "string" || !UUID.test(row.id) ||
    typeof row.organization_id !== "string" ||
    !UUID.test(row.organization_id) ||
    typeof row.case_id !== "string" || !UUID.test(row.case_id) ||
    typeof row.opaque_object_key !== "string" ||
    typeof row.source_sha256 !== "string" || !SHA.test(row.source_sha256) ||
    typeof row.content_type !== "string"
  ) throw new Error("DATABASE_TEMPORARY");
  return Object.freeze({
    id: row.id,
    organizationId: row.organization_id,
    caseId: row.case_id,
    sourceObjectKey: row.opaque_object_key,
    sourceSha256: row.source_sha256,
    contentType: row.content_type,
  });
}

function registered(row: SqlRow): RegisteredRequirementDocument {
  if (
    typeof row.document_version_id !== "string" ||
    !UUID.test(row.document_version_id) ||
    !(row.template_version_id === null ||
      typeof row.template_version_id === "string" &&
        UUID.test(row.template_version_id))
  ) throw new Error("DATABASE_TEMPORARY");
  return Object.freeze({
    documentVersionId: row.document_version_id,
    templateVersionId: row.template_version_id as string | null,
  });
}

export function createPostgresAttachmentPromotionStore(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
}): AttachmentPromotionStore {
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
          application_name: "osp-attachment-promotion",
          statement_timeout: "5000",
        },
      },
    );
  if (typeof created !== "function") {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  const sql = created as SqlPort;
  const store: AttachmentPromotionStore = {
    async listCaseAttachments(input) {
      return await withOrganizationTransaction(
        sql,
        input.organizationId,
        async (tx) => {
          const rows =
            await tx`select attachment.id, attachment.organization_id, message.case_id, attachment.opaque_object_key, attachment.source_sha256, attachment.content_type from osp_private.gmail_attachments attachment join osp_private.gmail_messages message on message.organization_id = attachment.organization_id and message.id = attachment.gmail_message_id join osp_private.customer_registration_cases case_record on case_record.organization_id = message.organization_id and case_record.id = message.case_id where attachment.organization_id = ${input.organizationId} and message.case_id = ${input.caseId} and case_record.blocked_by_duplicate_review = false and attachment.content_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') order by attachment.id`;
          return Object.freeze(rows.map(attachment));
        },
      );
    },
    async register(input) {
      return await withOrganizationTransaction(
        sql,
        input.organizationId,
        async (tx) => {
          const sourceRows =
            await tx`select attachment.id, attachment.organization_id, message.case_id, attachment.opaque_object_key, attachment.source_sha256, attachment.content_type from osp_private.gmail_attachments attachment join osp_private.gmail_messages message on message.organization_id = attachment.organization_id and message.id = attachment.gmail_message_id join osp_private.customer_registration_cases case_record on case_record.organization_id = message.organization_id and case_record.id = message.case_id where attachment.organization_id = ${input.organizationId} and attachment.id = ${input.id} and message.case_id = ${input.caseId} and case_record.blocked_by_duplicate_review = false for share of attachment, message, case_record`;
          if (sourceRows.length !== 1) {
            throw new Error("INVALID_ATTACHMENT_SOURCE");
          }
          const persistedSource = attachment(sourceRows[0]);
          if (
            persistedSource.sourceObjectKey !== input.sourceObjectKey ||
            persistedSource.sourceSha256 !== input.sourceSha256 ||
            persistedSource.contentType !== input.contentType ||
            input.corporateObjectKey !== `${input.organizationId}/${input.id}`
          ) throw new Error("SOURCE_HASH_MISMATCH");

          const templateRows =
            await tx`select version.id from osp_private.form_template_versions version join osp_private.form_templates template on template.organization_id = version.organization_id and template.id = version.template_id where version.organization_id = ${input.organizationId} and version.status = 'published' order by version.published_at desc nulls last, template.name, version.version desc, version.id limit 1`;
          const templateVersionId = templateRows.length === 0
            ? null
            : templateRows.length === 1 &&
                typeof templateRows[0].id === "string" &&
                UUID.test(templateRows[0].id)
            ? templateRows[0].id
            : (() => {
              throw new Error("DATABASE_TEMPORARY");
            })();
          const lockKey = JSON.stringify([
            input.organizationId,
            "attachment_promotion",
            input.id,
          ]);
          await tx`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
          const existing =
            await tx`select version.id as document_version_id, document.case_id, version.source_sha256, version.opaque_object_key, version.content_type from osp_private.document_versions version join osp_private.documents document on document.organization_id = version.organization_id and document.id = version.document_id where version.organization_id = ${input.organizationId} and version.id = ${input.id}`;
          if (existing.length === 1) {
            const row = existing[0];
            if (
              row.case_id !== input.caseId ||
              row.source_sha256 !== input.sourceSha256 ||
              row.opaque_object_key !== input.corporateObjectKey ||
              row.content_type !== input.contentType
            ) throw new Error("IDEMPOTENCY_CONFLICT");
            return registered({
              document_version_id: row.document_version_id,
              template_version_id: templateVersionId,
            });
          }
          if (existing.length > 1) throw new Error("DATABASE_TEMPORARY");

          const documentId = crypto.randomUUID();
          await tx`insert into osp_private.documents (id, organization_id, case_id, version) values (${documentId}, ${input.organizationId}, ${input.caseId}, 0)`;
          await tx`insert into osp_private.document_versions (id, organization_id, document_id, version, document_type, status, source_sha256, bucket_id, opaque_object_key, content_type, valid_from, expires_at, uploaded_by_subject, review_before_sha256, review_after_sha256) values (${input.id}, ${input.organizationId}, ${documentId}, 1, 'supplier_requirement', 'uploaded', ${input.sourceSha256}, 'osp-corporate-documents', ${input.corporateObjectKey}, ${input.contentType}, null, null, 'osp-worker', ${input.sourceSha256}, ${input.sourceSha256})`;
          await tx`insert into osp_private.source_safety_assessments (id, organization_id, document_version_id, version, status, content_sha256, reason_code, assessed_at) values (${crypto.randomUUID()}, ${input.organizationId}, ${input.id}, 1, 'safe', ${input.sourceSha256}, ${input.sourceSafetyReason}, statement_timestamp())`;
          const reviewRows =
            await tx`select id, status from osp_private.mark_document_review_required_command(${input.organizationId}, ${input.id})`;
          if (
            reviewRows.length !== 1 ||
            reviewRows[0].status !== "review_required"
          ) {
            throw new Error("DATABASE_TEMPORARY");
          }
          const advanced =
            await tx`update osp_private.documents set version = 1, updated_at = statement_timestamp() where organization_id = ${input.organizationId} and id = ${documentId} and version = 0 returning version`;
          if (advanced.length !== 1) throw new Error("VERSION_CONFLICT");
          return Object.freeze({
            documentVersionId: input.id,
            templateVersionId,
          });
        },
      );
    },
  };
  return Object.freeze(store);
}
