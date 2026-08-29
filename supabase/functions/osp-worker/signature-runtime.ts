import postgres from "postgres";
import type { SupabaseClient } from "supabase";

import {
  type SqlPort,
  withWorkerTransaction,
} from "../_shared/osp/database-context.ts";
import {
  createPdfSignatureApplier,
  type PrivateSignaturePolicyPort,
  type SignatureObjectPort,
} from "../_shared/osp/pdf-signature-applier.ts";
import { applySignatureJob } from "./signature-job.ts";
import { createPostgresSignatureJobStore } from "./postgres-signature-job-store.ts";

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;
type StorageClient = Pick<SupabaseClient, "storage"> | {
  upload(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  download(key: string): Promise<Uint8Array | null>;
};
export interface SignatureVaultReader {
  read(vaultRef: string, signal: AbortSignal): Promise<Uint8Array>;
}

function simple(
  client: StorageClient,
): client is Exclude<StorageClient, Pick<SupabaseClient, "storage">> {
  return "upload" in client && "download" in client;
}

export function createSignatureObjectPort(
  client: StorageClient,
  bucket = "osp-derived-documents",
): SignatureObjectPort {
  return Object.freeze({
    read: async (
      { objectId }: { organizationId: string; objectId: string },
      _signal: AbortSignal,
    ) => {
      const bytes = simple(client)
        ? await client.download(objectId)
        : await (async () => {
          const result = await client.storage.from(bucket).download(objectId);
          return result.error || !result.data
            ? null
            : new Uint8Array(await result.data.arrayBuffer());
        })();
      if (!bytes) throw new Error("SIGNATURE_INPUT_INVALID");
      return bytes;
    },
    writeExclusive: async (
      { objectId, bytes, contentType }: {
        organizationId: string;
        objectId: string;
        bytes: Uint8Array;
        contentType:
          | "application/pdf"
          | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      },
      _signal: AbortSignal,
    ) => {
      if (simple(client)) await client.upload(objectId, bytes, contentType);
      else {
        const result = await client.storage.from(bucket).upload(
          objectId,
          bytes,
          { contentType, upsert: false },
        );
        if (result.error) throw new Error("SIGNATURE_WRITE_OUTCOME_UNKNOWN");
      }
    },
  });
}

export function createPostgresSignaturePolicyPort(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
  vault: SignatureVaultReader;
}): PrivateSignaturePolicyPort {
  const factory = options.postgresFactory ??
    (postgres as unknown as PostgresFactory);
  const created = factory(options.databaseUrl, {
    ssl: "verify-full",
    fetch_types: false,
    prepare: false,
    max: 1,
    connect_timeout: 5,
    connection: {
      application_name: "osp-signature-policy",
      statement_timeout: "3000",
    },
  });
  if (typeof created !== "function") {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  const sql = created as SqlPort;
  return Object.freeze({
    resolve: async (
      input: {
        organizationId: string;
        caseId: string;
        approvalId: string;
        jobId: string;
        leaseToken: string;
        positionVersion: number;
      },
      signal: AbortSignal,
    ) =>
      await withWorkerTransaction(sql, async (tx) => {
        const rows =
          await tx`select * from osp_private.resolve_signature_application_policy(${input.organizationId}, ${input.approvalId}, ${input.jobId}, ${input.leaseToken}, ${input.positionVersion})`;
        if (
          rows.length !== 1 || typeof rows[0].vault_ref !== "string" ||
          (rows[0].content_type !== "image/png" &&
            rows[0].content_type !== "image/jpeg")
        ) throw new Error("SIGNATURE_POLICY_INVALID");
        const common = {
          signatureBytes: await options.vault.read(rows[0].vault_ref, signal),
          contentType: rows[0].content_type as "image/png" | "image/jpeg",
        };
        if (rows[0].target_kind === "pdf") {
          return {
            ...common,
            targetKind: "pdf" as const,
            page: Number(rows[0].page),
            x: Number(rows[0].x),
            y: Number(rows[0].y),
            width: Number(rows[0].width),
            height: Number(rows[0].height),
          };
        }
        if (
          rows[0].target_kind !== "xlsx" ||
          typeof rows[0].worksheet_name !== "string" ||
          typeof rows[0].cell_range !== "string"
        ) throw new Error("SIGNATURE_POLICY_INVALID");
        return {
          ...common,
          targetKind: "xlsx" as const,
          worksheetName: rows[0].worksheet_name,
          cellRange: rows[0].cell_range,
        };
      }),
  });
}

export function createSignatureJobService(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
  storageClient: StorageClient;
  vault: SignatureVaultReader;
}) {
  const records = createPostgresSignatureJobStore(options);
  const signatures = createPdfSignatureApplier({
    objects: createSignatureObjectPort(options.storageClient),
    policies: createPostgresSignaturePolicyPort(options),
  });
  return Object.freeze({
    apply: async (
      input: {
        organizationId: string;
        approvalId: string;
        jobId: string;
        leaseToken: string;
      },
    ) => await applySignatureJob(input, { records, signatures }),
  });
}
