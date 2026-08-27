import postgres from "postgres";

import {
  type SqlPort,
  type SqlRow,
  withOrganizationTransaction,
} from "../_shared/osp/database-context.ts";
import { assertExtractionSnapshot } from "../_shared/osp/extraction-contracts.ts";
import type {
  ManagedExtractionSource,
  ManagedExtractionStore,
} from "./managed-extraction.ts";

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

function source(row: SqlRow): ManagedExtractionSource {
  const values = [
    row.organization_id,
    row.case_id,
    row.document_version_id,
  ];
  if (
    values.some((value) => typeof value !== "string" || !UUID.test(value)) ||
    row.bucket_id !== "osp-corporate-documents" ||
    typeof row.opaque_object_key !== "string" ||
    typeof row.content_type !== "string" ||
    typeof row.source_sha256 !== "string" || !SHA.test(row.source_sha256) ||
    row.source_safety !== "safe" ||
    !(row.template_version_id === null ||
      typeof row.template_version_id === "string" &&
        UUID.test(row.template_version_id)) ||
    !(row.existing_extraction_id === null ||
      typeof row.existing_extraction_id === "string" &&
        UUID.test(row.existing_extraction_id))
  ) throw new Error("DATABASE_TEMPORARY");
  return Object.freeze({
    organizationId: row.organization_id as string,
    caseId: row.case_id as string,
    documentVersionId: row.document_version_id as string,
    bucketId: "osp-corporate-documents",
    objectKey: row.opaque_object_key,
    contentType: row.content_type,
    sourceSha256: row.source_sha256,
    sourceSafety: "safe",
    templateVersionId: row.template_version_id as string | null,
    existingExtractionId: row.existing_extraction_id as string | null,
  });
}

export function createPostgresManagedExtractionStore(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
}): ManagedExtractionStore {
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
          application_name: "osp-managed-extraction",
          statement_timeout: "5000",
        },
      },
    );
  if (typeof created !== "function") {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  const sql = created as SqlPort;
  const store: ManagedExtractionStore = {
    async load(input) {
      return await withOrganizationTransaction(
        sql,
        input.organizationId,
        async (tx) => {
          const rows =
            await tx`select version.organization_id, document.case_id, version.id as document_version_id, version.bucket_id, version.opaque_object_key, version.content_type, version.source_sha256, safety.status as source_safety, (select template_version.id from osp_private.form_template_versions template_version join osp_private.form_templates template on template.organization_id = template_version.organization_id and template.id = template_version.template_id where template_version.organization_id = version.organization_id and template_version.status = 'published' order by template_version.published_at desc nulls last, template.name, template_version.version desc, template_version.id limit 1) as template_version_id, (select extraction.id from osp_private.document_extractions extraction where extraction.organization_id = version.organization_id and extraction.source_version_id = version.id and extraction.status in ('review_required', 'reviewed') order by extraction.created_at, extraction.id limit 1) as existing_extraction_id from osp_private.document_versions version join osp_private.documents document on document.organization_id = version.organization_id and document.id = version.document_id join lateral (select assessment.status from osp_private.source_safety_assessments assessment where assessment.organization_id = version.organization_id and assessment.document_version_id = version.id order by assessment.version desc limit 1) safety on true where version.organization_id = ${input.organizationId} and version.id = ${input.documentVersionId} and document.case_id is not null and version.document_type = 'supplier_requirement' and version.status in ('review_required', 'approved')`;
          if (rows.length !== 1) throw new Error("INVALID_INPUT");
          return source(rows[0]);
        },
      );
    },
    async persist(input) {
      assertExtractionSnapshot(input.snapshot);
      return await withOrganizationTransaction(
        sql,
        input.source.organizationId,
        async (tx) => {
          const locked =
            await tx`select version.source_sha256, document.case_id, safety.status as source_safety from osp_private.document_versions version join osp_private.documents document on document.organization_id = version.organization_id and document.id = version.document_id join lateral (select assessment.status from osp_private.source_safety_assessments assessment where assessment.organization_id = version.organization_id and assessment.document_version_id = version.id order by assessment.version desc limit 1) safety on true where version.organization_id = ${input.source.organizationId} and version.id = ${input.source.documentVersionId} for share of version, document`;
          if (
            locked.length !== 1 ||
            locked[0].source_sha256 !== input.source.sourceSha256 ||
            locked[0].case_id !== input.source.caseId ||
            locked[0].source_safety !== "safe"
          ) throw new Error("SOURCE_HASH_MISMATCH");
          const existing =
            await tx`select id, input_sha256, prompt_sha256, schema_sha256 from osp_private.document_extractions where organization_id = ${input.source.organizationId} and source_version_id = ${input.source.documentVersionId} and status in ('review_required', 'reviewed') order by created_at, id limit 2 for share`;
          if (existing.length === 1) {
            const row = existing[0];
            if (
              typeof row.id !== "string" ||
              row.input_sha256 !== input.snapshot.inputSha256 ||
              row.prompt_sha256 !== input.snapshot.promptSha256 ||
              row.schema_sha256 !== input.snapshot.schemaSha256
            ) throw new Error("IDEMPOTENCY_CONFLICT");
            return row.id;
          }
          if (existing.length > 1) throw new Error("DATABASE_TEMPORARY");
          await tx`insert into osp_private.document_extractions (id, organization_id, case_id, source_version_id, input_sha256, prompt_sha256, schema_sha256, status) values (${input.snapshot.id}, ${input.snapshot.organizationId}, ${input.snapshot.caseId}, ${input.snapshot.sourceVersionId}, ${input.snapshot.inputSha256}, ${input.snapshot.promptSha256}, ${input.snapshot.schemaSha256}, ${input.snapshot.status})`;
          for (const field of input.snapshot.fields) {
            const valueJson = field.value === null
              ? null
              : JSON.stringify(field.value);
            await tx`insert into osp_private.extraction_fields (id, organization_id, extraction_id, field_key, presence, value_json, confidence, evidence_json, before_sha256, after_sha256, provider, model_version, schema_version, validation) values (${field.id}, ${field.organizationId}, ${field.extractionId}, ${field.fieldKey}, ${field.presence}, ${valueJson}::text::jsonb, ${field.confidence}, ${
              JSON.stringify(field.evidence)
            }::text::jsonb, ${field.beforeSha256}, ${field.afterSha256}, ${field.provider}, ${field.modelVersion}, ${field.schemaVersion}, ${field.validation})`;
          }
          return input.snapshot.id;
        },
      );
    },
  };
  return Object.freeze(store);
}
