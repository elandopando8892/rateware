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

const VAULT_REF = /^[A-Za-z0-9:_-]{1,256}$/;
const STANDARD_BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAX_SIGNATURE_BYTES = 1024 * 1024;
const MAX_SIGNATURE_INPUT_BYTES = 25 * 1024 * 1024;

type SignedStorageDownload = {
  data: { signedUrl: string } | null;
  error: unknown;
};

async function collectStorageStream(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error("SIGNATURE_ABORTED");
      const result = await reader.read();
      if (result.done) break;
      if (!(result.value instanceof Uint8Array)) {
        throw new Error("SIGNATURE_INPUT_INVALID");
      }
      total += result.value.byteLength;
      if (total < 1 || total > MAX_SIGNATURE_INPUT_BYTES) {
        throw new Error("SIGNATURE_INPUT_INVALID");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total < 1) throw new Error("SIGNATURE_INPUT_INVALID");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function decodeSignatureSecret(value: unknown): Uint8Array {
  if (
    typeof value !== "string" || value.length < 4 ||
    value.length > Math.ceil(MAX_SIGNATURE_BYTES / 3) * 4 ||
    !STANDARD_BASE64.test(value)
  ) throw new Error("SIGNATURE_VAULT_INVALID");
  try {
    const binary = atob(value);
    if (
      btoa(binary) !== value || binary.length < 1 ||
      binary.length > MAX_SIGNATURE_BYTES
    ) {
      throw new Error("SIGNATURE_VAULT_INVALID");
    }
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error("SIGNATURE_VAULT_INVALID");
  }
}

export function createPostgresSignatureVaultReader(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
}): SignatureVaultReader {
  const factory = options.postgresFactory ??
    (postgres as unknown as PostgresFactory);
  const created = factory(options.databaseUrl, {
    ssl: "verify-full",
    fetch_types: false,
    prepare: false,
    max: 1,
    connect_timeout: 5,
    connection: {
      application_name: "osp-signature-vault",
      statement_timeout: "3000",
    },
  });
  if (typeof created !== "function") {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  const sql = created as SqlPort;
  return Object.freeze({
    read: async (vaultRef: string, signal: AbortSignal) => {
      if (!VAULT_REF.test(vaultRef) || signal.aborted) {
        throw new Error("SIGNATURE_VAULT_INVALID");
      }
      const rows =
        await sql`select decrypted_secret from vault.decrypted_secrets where name = ${vaultRef}`;
      if (signal.aborted || rows.length !== 1) {
        throw new Error("SIGNATURE_VAULT_INVALID");
      }
      return decodeSignatureSecret(rows[0].decrypted_secret);
    },
  });
}

function simple(
  client: StorageClient,
): client is Exclude<StorageClient, Pick<SupabaseClient, "storage">> {
  return "upload" in client && "download" in client;
}

export function createSignatureObjectPort(
  client: StorageClient,
  bucket = "osp-derived-documents",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): SignatureObjectPort {
  return Object.freeze({
    read: async (
      { objectId }: { organizationId: string; objectId: string },
      signal: AbortSignal,
    ) => {
      let bytes: Uint8Array | null;
      try {
        bytes = simple(client)
          ? await client.download(objectId)
          : await (async () => {
            const storage = client.storage as unknown as { url?: string };
            if (typeof storage.url !== "string") return null;
            const storageUrl = new URL(storage.url);
            const signed = await client.storage.from(bucket).createSignedUrl(
              objectId,
              60,
            ) as SignedStorageDownload;
            if (signed.error || !signed.data) return null;
            const signedUrl = new URL(signed.data.signedUrl);
            const expectedPath = `${storageUrl.pathname}/object/sign/${bucket}/`;
            if (
              signedUrl.protocol !== "https:" ||
              signedUrl.origin !== storageUrl.origin ||
              !signedUrl.pathname.startsWith(expectedPath) ||
              signedUrl.username || signedUrl.password || signedUrl.hash ||
              !signedUrl.searchParams.has("token")
            ) return null;
            const response = await fetchImpl(signedUrl, {
              method: "GET",
              redirect: "error",
              signal,
            });
            return !response.ok || !response.body
              ? null
              : await collectStorageStream(response.body, signal);
          })();
      } catch (error) {
        if (
          error instanceof Error &&
          ["SIGNATURE_ABORTED", "SIGNATURE_INPUT_INVALID"].includes(
            error.message,
          )
        ) throw error;
        throw new Error("SIGNATURE_INPUT_INVALID");
      }
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
    ) => {
      const policy = await withWorkerTransaction(sql, async (tx) => {
        const rows =
          await tx`select * from osp_private.resolve_signature_application_policy(${input.organizationId}, ${input.approvalId}, ${input.jobId}, ${input.leaseToken}, ${input.positionVersion})`;
        if (
          rows.length !== 1 || typeof rows[0].vault_ref !== "string" ||
          (rows[0].content_type !== "image/png" &&
            rows[0].content_type !== "image/jpeg")
        ) throw new Error("SIGNATURE_POLICY_INVALID");
        const common = Object.freeze({
          vaultRef: rows[0].vault_ref,
          contentType: rows[0].content_type as "image/png" | "image/jpeg",
        });
        if (rows[0].target_kind === "pdf") {
          return Object.freeze({
            ...common,
            targetKind: "pdf" as const,
            page: Number(rows[0].page),
            x: Number(rows[0].x),
            y: Number(rows[0].y),
            width: Number(rows[0].width),
            height: Number(rows[0].height),
          });
        }
        if (
          rows[0].target_kind !== "xlsx" ||
          typeof rows[0].worksheet_name !== "string" ||
          typeof rows[0].cell_range !== "string"
        ) throw new Error("SIGNATURE_POLICY_INVALID");
        return Object.freeze({
          ...common,
          targetKind: "xlsx" as const,
          worksheetName: rows[0].worksheet_name,
          cellRange: rows[0].cell_range,
        });
      });
      // The Vault adapter owns a separate privileged connection. Read the
      // private asset only after the worker-role transaction has committed so
      // Edge isolates never need two concurrent Postgres connections here.
      const signatureBytes = await options.vault.read(policy.vaultRef, signal);
      const { vaultRef: _vaultRef, ...publicPolicy } = policy;
      return Object.freeze({ ...publicPolicy, signatureBytes });
    },
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
