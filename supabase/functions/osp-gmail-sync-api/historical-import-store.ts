import postgres from "npm:postgres@3.4.7";

import {
  type SqlPort,
  withOrganizationTransaction,
} from "../_shared/osp/database-context.ts";

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;

export type HistoricalImportClaim = Readonly<{
  claimId: string;
  status: "imported" | "replayed";
  ospEnqueued: number;
  attachmentMetadataRows: number;
}>;

export type HistoricalImportClaimInput = Readonly<{
  organizationId: string;
  mailboxEmail: string;
  gmailMessageId: string;
  gmailThreadId: string;
  subjectSha256: string;
  senderDomain: string;
  receivedAt: string;
  actorSubject: string;
  idempotencyKey: string;
  requestSha256: string;
  providerMessageInserted: boolean;
  attachmentMetadataRows: number;
}>;

function databaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      value.trim() !== value ||
      !["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname ||
      url.hash || (url.search && !/^\?sslmode=(?:require|prefer)$/.test(url.search))
    ) throw new Error();
    return value.replace(/\?sslmode=(?:require|prefer)$/, "");
  } catch {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
}

function exactRow(rows: Record<string, unknown>[]): HistoricalImportClaim {
  const row = rows[0];
  const ospEnqueued = Number(row?.osp_enqueued);
  const attachmentMetadataRows = Number(row?.attachment_metadata_rows);
  if (
    rows.length !== 1 || typeof row?.claim_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.claim_id) ||
    !["imported", "replayed"].includes(String(row.import_status)) ||
    !Number.isSafeInteger(ospEnqueued) || ospEnqueued < 0 || ospEnqueued > 1 ||
    !Number.isSafeInteger(attachmentMetadataRows) || attachmentMetadataRows < 0 || attachmentMetadataRows > 100
  ) throw new Error("DATABASE_TEMPORARY");
  return Object.freeze({
    claimId: row.claim_id,
    status: row.import_status as HistoricalImportClaim["status"],
    ospEnqueued,
    attachmentMetadataRows,
  });
}

export function createPostgresHistoricalImportStore(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
}) {
  const created = (options.postgresFactory ?? postgres as unknown as PostgresFactory)(
    databaseUrl(options.databaseUrl),
    {
      ssl: "verify-full",
      fetch_types: false,
      prepare: false,
      max: 1,
      connect_timeout: 5,
      connection: {
        application_name: "osp-gmail-historical-import",
        statement_timeout: "3000",
      },
    },
  );
  if (typeof created !== "function") throw new Error("INVALID_RUNTIME_CONFIGURATION");
  const sql = created as SqlPort;
  return Object.freeze({
    async record(input: HistoricalImportClaimInput): Promise<HistoricalImportClaim> {
      return await withOrganizationTransaction(
        sql,
        input.organizationId,
        async (tx) => exactRow(
          await tx`select * from osp_private.record_historical_gmail_import(
            ${input.organizationId},
            ${input.mailboxEmail},
            ${input.gmailMessageId},
            ${input.gmailThreadId},
            ${input.subjectSha256},
            ${input.senderDomain},
            ${input.receivedAt},
            ${input.actorSubject},
            ${input.idempotencyKey},
            ${input.requestSha256},
            ${input.providerMessageInserted},
            ${input.attachmentMetadataRows}
          )`,
        ),
      );
    },
  });
}
