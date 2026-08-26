import postgres from "postgres";

import {
  type SqlPort,
  withWorkerTransaction,
} from "../_shared/osp/database-context.ts";

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;

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

export function createRatewareGmailBridge(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
}): { enqueue(limit: number): Promise<number> } {
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
          application_name: "osp-rateware-gmail-bridge",
          statement_timeout: "3000",
        },
      },
    );
  if (typeof created !== "function") {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  const sql = created as SqlPort;
  return Object.freeze({
    async enqueue(limit: number): Promise<number> {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("INVALID_BRIDGE_LIMIT");
      }
      return await withWorkerTransaction(sql, async (tx) => {
        const rows =
          await tx`select osp_private.enqueue_rateware_gmail_messages(${limit}) as inserted_count`;
        const inserted = Number(rows[0]?.inserted_count);
        if (
          rows.length !== 1 || !Number.isSafeInteger(inserted) || inserted < 0
        ) {
          throw new Error("DATABASE_TEMPORARY");
        }
        return inserted;
      });
    },
  });
}
