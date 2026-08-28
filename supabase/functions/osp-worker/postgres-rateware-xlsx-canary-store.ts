import postgres from "postgres";

import {
  type SqlPort,
  type SqlRow,
  withWorkerTransaction,
} from "../_shared/osp/database-context.ts";
import type {
  RatewareXlsxCanaryReceipt,
  RatewareXlsxCanaryStore,
} from "./rateware-xlsx-canary.ts";

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function requireDatabaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      value.trim() !== value ||
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname || url.hash
    ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
    if (url.search && !/^\?sslmode=(?:require|prefer)$/.test(url.search)) {
      throw new Error("INVALID_RUNTIME_CONFIGURATION");
    }
    return value.replace(/\?sslmode=(?:require|prefer)$/, "");
  } catch {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
}

function receipt(row: SqlRow): RatewareXlsxCanaryReceipt {
  if (
    typeof row.raw_upload_id !== "string" || !UUID.test(row.raw_upload_id) ||
    typeof row.interpretation_job_id !== "string" ||
    !UUID.test(row.interpretation_job_id) ||
    typeof row.rate_staging_id !== "string" ||
    !UUID.test(row.rate_staging_id) ||
    typeof row.inserted !== "boolean"
  ) throw new Error("DATABASE_TEMPORARY");
  return Object.freeze({
    rawUploadId: row.raw_upload_id,
    interpretationJobId: row.interpretation_job_id,
    rateStagingId: row.rate_staging_id,
    inserted: row.inserted,
  });
}

export function createPostgresRatewareXlsxCanaryStore(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
}): RatewareXlsxCanaryStore {
  const created =
    (options.postgresFactory ?? postgres as unknown as PostgresFactory)(
      requireDatabaseUrl(options.databaseUrl),
      {
        ssl: "verify-full",
        fetch_types: false,
        prepare: false,
        max: 1,
        connect_timeout: 5,
        connection: {
          application_name: "osp-rateware-xlsx-canary",
          statement_timeout: "5000",
        },
      },
    );
  if (typeof created !== "function") {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  const sql = created as SqlPort;
  const store: RatewareXlsxCanaryStore = {
    async stage(input) {
      return await withWorkerTransaction(sql, async (tx) => {
        const rows =
          await tx`select raw_upload_id, interpretation_job_id, rate_staging_id, inserted from osp_private.stage_rateware_xlsx_quote(${input.organizationId}, ${input.caseId}, ${input.jobId}, ${input.documentVersionId}, ${input.sourceSha256}, ${
            JSON.stringify(input.quote)
          }::text::jsonb)`;
        if (rows.length !== 1) throw new Error("DATABASE_TEMPORARY");
        return receipt(rows[0]);
      });
    },
  };
  return Object.freeze(store);
}
