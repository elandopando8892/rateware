import postgres from "postgres";

import type { SqlPort, SqlRow } from "../_shared/osp/database-context.ts";
import type { RequestManifestTelemetry } from "./openai-request-manifest.ts";
import type {
  RequestManifestDraftStore,
  RequestManifestReadDraft,
} from "./request-manifest-draft.ts";

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;

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

function exactlyOne(rows: SqlRow[]): SqlRow {
  if (rows.length !== 1) throw new Error("DATABASE_TEMPORARY");
  return rows[0];
}

function receipt(
  row: SqlRow,
  expectedSha256: string | undefined,
  replayed: boolean,
) {
  const manifestSha256 = String(row.manifest_sha256);
  if (
    !UUID.test(String(row.id)) || !Number.isSafeInteger(Number(row.version)) ||
    Number(row.version) < 1 ||
    !SHA256.test(manifestSha256) ||
    (expectedSha256 !== undefined && manifestSha256 !== expectedSha256)
  ) throw new Error("DATABASE_TEMPORARY");
  return Object.freeze({
    id: String(row.id),
    version: Number(row.version),
    manifestSha256,
    replayed,
  });
}

function safeMetric(value: unknown): number | null {
  if (value === null) return null;
  const metric = Number(value);
  if (!Number.isSafeInteger(metric) || metric < 0) {
    throw new Error("DATABASE_TEMPORARY");
  }
  return metric;
}

function replay(row: SqlRow) {
  let manifest = row.manifest_json;
  if (typeof manifest === "string") {
    try {
      manifest = JSON.parse(manifest);
    } catch {
      throw new Error("DATABASE_TEMPORARY");
    }
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("DATABASE_TEMPORARY");
  }
  const draft = manifest as Record<string, unknown>;
  if (
    draft.schemaVersion !== 1 || draft.status !== "review_required" ||
    draft.aiGenerated !== true || draft.externalEffects !== false ||
    typeof row.model_version !== "string" || row.model_version.length < 1 ||
    !Number.isSafeInteger(Number(row.duration_ms)) ||
    Number(row.duration_ms) < 0 ||
    !(row.provider_response_id === null ||
      typeof row.provider_response_id === "string")
  ) {
    throw new Error("DATABASE_TEMPORARY");
  }
  const telemetry: RequestManifestTelemetry = Object.freeze({
    responseId: row.provider_response_id as string | null,
    model: row.model_version,
    inputTokens: safeMetric(row.input_tokens),
    outputTokens: safeMetric(row.output_tokens),
    totalTokens: safeMetric(row.total_tokens),
    durationMs: Number(row.duration_ms),
  });
  return Object.freeze({
    manifest: manifest as RequestManifestReadDraft,
    telemetry,
    receipt: receipt(row, undefined, true) as ReturnType<typeof receipt> & {
      replayed: true;
    },
  });
}

export function createPostgresRequestManifestDraftStore(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
}): RequestManifestDraftStore {
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
          application_name: "osp-request-manifest-draft",
          statement_timeout: "5000",
        },
      },
    );
  if (typeof created !== "function") {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  const sql = created as SqlPort;
  if (!sql.begin) throw new Error("INVALID_RUNTIME_CONFIGURATION");
  return Object.freeze({
    async findByEvidence(
      input: Parameters<RequestManifestDraftStore["findByEvidence"]>[0],
    ) {
      if (
        !UUID.test(input.organizationId) || !UUID.test(input.caseId) ||
        !SHA256.test(input.evidenceSha256)
      ) {
        throw new Error("REQUEST_MANIFEST_DRAFT_INVALID");
      }
      return await sql.begin!(async (tx) => {
        await tx`set local role osp_worker`;
        await tx`select set_config('osp.organization_id', ${input.organizationId}, true)`;
        const rows =
          await tx`select id, version, manifest_json, manifest_sha256, model_version, provider_response_id, input_tokens, output_tokens, total_tokens, duration_ms from osp_private.request_manifest_drafts where organization_id = ${input.organizationId} and case_id = ${input.caseId} and evidence_sha256 = ${input.evidenceSha256} limit 2`;
        if (rows.length === 0) return null;
        return replay(exactlyOne(rows));
      });
    },
    async record(input: Parameters<RequestManifestDraftStore["record"]>[0]) {
      if (
        !UUID.test(input.organizationId) || !UUID.test(input.caseId) ||
        !SHA256.test(input.manifestSha256) ||
        !SHA256.test(input.evidenceSha256) ||
        input.manifest.externalEffects !== false ||
        input.manifest.status !== "review_required"
      ) {
        throw new Error("REQUEST_MANIFEST_DRAFT_INVALID");
      }
      const manifestJson = JSON.stringify(input.manifest);
      return await sql.begin!(async (tx) => {
        await tx`set local role osp_worker`;
        await tx`select set_config('osp.organization_id', ${input.organizationId}, true)`;
        await tx`select pg_advisory_xact_lock(pg_catalog.hashtextextended(pg_catalog.json_build_array(${input.organizationId}::text, 'request_manifest_draft', ${input.caseId}::text)::text, 0))`;
        const existing =
          await tx`select id, version, manifest_sha256 from osp_private.request_manifest_drafts where organization_id = ${input.organizationId} and case_id = ${input.caseId} and evidence_sha256 = ${input.evidenceSha256}`;
        if (existing.length > 0) {
          return receipt(exactlyOne(existing), undefined, true);
        }
        const versions =
          await tx`select coalesce(max(version), 0)::integer + 1 as next_version from osp_private.request_manifest_drafts where organization_id = ${input.organizationId} and case_id = ${input.caseId}`;
        const version = Number(exactlyOne(versions).next_version);
        if (
          !Number.isSafeInteger(version) || version < 1 ||
          version > 2_147_483_647
        ) throw new Error("DATABASE_TEMPORARY");
        const id = crypto.randomUUID();
        const inserted =
          await tx`insert into osp_private.request_manifest_drafts (id, organization_id, case_id, version, manifest_json, manifest_sha256, evidence_sha256, model_version, provider_response_id, input_tokens, output_tokens, total_tokens, duration_ms, generated_at) values (${id}, ${input.organizationId}, ${input.caseId}, ${version}, ${manifestJson}::text::jsonb, ${input.manifestSha256}, ${input.evidenceSha256}, ${input.telemetry.model}, ${input.telemetry.responseId}, ${input.telemetry.inputTokens}, ${input.telemetry.outputTokens}, ${input.telemetry.totalTokens}, ${input.telemetry.durationMs}, ${input.manifest.generatedAt}) returning id, version, manifest_sha256`;
        return receipt(exactlyOne(inserted), input.manifestSha256, false);
      });
    },
  });
}
