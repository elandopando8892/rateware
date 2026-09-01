import postgres from "postgres";

import {
  type SqlPort,
  withOrganizationTransaction,
  withWorkerTransaction,
} from "./database-context.ts";

export type JobKind =
  | "gmail_ingest"
  | "duplicate_review_refresh"
  | "request_manifest"
  | "document_extract"
  | "quarterly_document_check"
  | "form_ai_mapping"
  | "generate_supplier_package"
  | "apply_signature"
  | "send_authorized_payload";
export type JobErrorCode =
  | "GMAIL_TEMPORARY"
  | "STORAGE_TEMPORARY"
  | "STORAGE_UPLOAD_TEMPORARY"
  | "STORAGE_DOWNLOAD_TEMPORARY"
  | "DATABASE_TEMPORARY"
  | "AZURE_TEMPORARY"
  | "OPENAI_TEMPORARY"
  | "INVALID_INPUT"
  | "GMAIL_FETCH_FAILURE"
  | "RECEIPT_CAPTURE_FAILURE"
  | "MIME_PARSE_FAILURE"
  | "RAW_STORE_FAILURE"
  | "ATTACHMENT_STORE_FAILURE"
  | "DUPLICATE_LOOKUP_FAILURE"
  | "CASE_PERSIST_FAILURE"
  | "DUPLICATE_REFRESH_FAILURE"
  | "SOURCE_HASH_MISMATCH"
  | "MALWARE_SCAN_REJECTED"
  | "PERMANENT_FAILURE";
export type LeasedJob = {
  id: string;
  organizationId: string;
  kind: JobKind;
  opaquePayload: Record<string, string>;
  attempt: number;
  leaseToken: string;
  leasedUntil: string;
};

export type ShadowDocumentExtractClaim = {
  organizationId: string;
  caseId: string;
  jobId: string;
  documentVersionId: string;
  sourceSha256: string;
  leaseMs: number;
};

export type SupplierPackageCanaryClaim = {
  organizationId: string;
  caseId: string;
  jobId: string;
  snapshotId: string;
  snapshotSha256: string;
  leaseMs: number;
};

export type SignatureApplicationCanaryClaim = {
  organizationId: string;
  caseId: string;
  jobId: string;
  approvalId: string;
  expectedCaseVersion: number;
  inputSnapshotSha256: string;
  inputPackageSha256: string;
  signaturePositionVersion: number;
  leaseMs: number;
};

export interface BackgroundJobStore {
  enqueue(
    input: {
      organizationId: string;
      kind: JobKind;
      opaquePayload: Record<string, string>;
      idempotencyKey: string;
    },
  ): Promise<string>;
  claim(
    input: { workerId: string; now: Date; leaseMs: number; limit: number },
  ): Promise<LeasedJob[]>;
  complete(
    input: { jobId: string; leaseToken: string; completedAt: Date },
  ): Promise<void>;
  fail(
    input: {
      jobId: string;
      leaseToken: string;
      errorCode: JobErrorCode;
      retryAt: Date | null;
    },
  ): Promise<void>;
}

export interface CanaryBackgroundJobStore extends BackgroundJobStore {
  claimShadowDocumentExtract(
    input: ShadowDocumentExtractClaim,
  ): Promise<LeasedJob[]>;
  claimSupplierPackageCanary(
    input: SupplierPackageCanaryClaim,
  ): Promise<LeasedJob[]>;
  claimSignatureApplicationCanary(
    input: SignatureApplicationCanaryClaim,
  ): Promise<LeasedJob[]>;
}

type MemoryJob = LeasedJob & {
  idempotencyKey: string;
  completedAt: Date | null;
  retryAt: Date | null;
  lastErrorCode: JobErrorCode | null;
};
type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;
const LEASE_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const JOB_KINDS: readonly JobKind[] = [
  "gmail_ingest",
  "duplicate_review_refresh",
  "request_manifest",
  "document_extract",
  "quarterly_document_check",
  "form_ai_mapping",
  "generate_supplier_package",
  "apply_signature",
  "send_authorized_payload",
];

function requireLeaseToken(value: string): string {
  if (!LEASE_TOKEN_PATTERN.test(value)) throw new Error("LEASE_CONFLICT");
  return value;
}

function canonicalPayload(payload: Record<string, string>): string {
  const pairs = Object.entries(payload).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  if (
    pairs.length === 0 ||
    pairs.some(([key, value]) =>
      (!/^[A-Za-z][A-Za-z0-9]*Id$/.test(key) &&
        key !== "deliveryIdempotencyKey") ||
      typeof value !== "string" ||
      !/^[A-Za-z0-9:_-]{1,256}$/.test(value)
    )
  ) {
    throw new Error("OPAQUE_PAYLOAD");
  }
  return JSON.stringify(Object.fromEntries(pairs));
}

export function createInMemoryBackgroundJobStore(): BackgroundJobStore {
  const jobs = new Map<string, MemoryJob>();
  const idempotency = new Map<string, { id: string; payload: string }>();
  return Object.freeze({
    async enqueue(
      input: {
        organizationId: string;
        kind: JobKind;
        opaquePayload: Record<string, string>;
        idempotencyKey: string;
      },
    ) {
      const payload = canonicalPayload(input.opaquePayload);
      const key =
        `${input.organizationId}\u0000${input.kind}\u0000${input.idempotencyKey}`;
      const existing = idempotency.get(key);
      if (existing) {
        if (existing.payload !== payload) {
          throw new Error("IDEMPOTENCY_CONFLICT");
        }
        return existing.id;
      }
      const id = crypto.randomUUID();
      jobs.set(id, {
        id,
        organizationId: input.organizationId,
        kind: input.kind,
        opaquePayload: JSON.parse(payload),
        idempotencyKey: input.idempotencyKey,
        attempt: 0,
        leaseToken: "",
        leasedUntil: "",
        completedAt: null,
        retryAt: null,
        lastErrorCode: null,
      });
      idempotency.set(key, { id, payload });
      return id;
    },
    async claim(
      input: { workerId: string; now: Date; leaseMs: number; limit: number },
    ) {
      const until = new Date(input.now.getTime() + input.leaseMs);
      const claimed: LeasedJob[] = [];
      for (const job of jobs.values()) {
        if (
          claimed.length >= input.limit || job.completedAt ||
          (job.retryAt && job.retryAt > input.now) ||
          (job.leasedUntil && new Date(job.leasedUntil) > input.now)
        ) continue;
        job.attempt += 1;
        job.leaseToken = crypto.randomUUID();
        job.leasedUntil = until.toISOString();
        claimed.push({
          id: job.id,
          organizationId: job.organizationId,
          kind: job.kind,
          opaquePayload: { ...job.opaquePayload },
          attempt: job.attempt,
          leaseToken: job.leaseToken,
          leasedUntil: job.leasedUntil,
        });
      }
      return claimed;
    },
    async complete(
      input: { jobId: string; leaseToken: string; completedAt: Date },
    ) {
      const job = jobs.get(input.jobId);
      if (!job || job.leaseToken !== input.leaseToken || job.completedAt) {
        throw new Error("LEASE_CONFLICT");
      }
      job.completedAt = input.completedAt;
    },
    async fail(
      input: {
        jobId: string;
        leaseToken: string;
        errorCode: JobErrorCode;
        retryAt: Date | null;
      },
    ) {
      const job = jobs.get(input.jobId);
      if (!job || job.leaseToken !== input.leaseToken || job.completedAt) {
        throw new Error("LEASE_CONFLICT");
      }
      job.lastErrorCode = input.errorCode;
      job.retryAt = input.retryAt;
      if (input.retryAt === null) job.completedAt = new Date();
      job.leaseToken = "";
      job.leasedUntil = "";
    },
  });
}

function requireDatabaseUrl(value: string): string {
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

function requireOpaquePayload(value: unknown): Record<string, string> {
  let decoded = value;
  if (typeof decoded === "string") {
    try {
      decoded = JSON.parse(decoded);
    } catch {
      throw new Error("OPAQUE_PAYLOAD");
    }
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error("OPAQUE_PAYLOAD");
  }
  const payload = decoded as Record<string, unknown>;
  canonicalPayload(payload as Record<string, string>);
  return payload as Record<string, string>;
}

function requireTimestamp(value: unknown): string {
  const parsed = value instanceof Date
    ? value
    : typeof value === "string"
    ? new Date(value)
    : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    throw new Error("LEASE_CONFLICT");
  }
  return parsed.toISOString();
}

function leasedJob(row: Record<string, unknown>): LeasedJob {
  if (
    typeof row.id !== "string" ||
    typeof row.organization_id !== "string" ||
    !JOB_KINDS.includes(row.kind as JobKind) ||
    typeof row.lease_token !== "string"
  ) throw new Error("LEASE_CONFLICT");
  return {
    id: row.id,
    organizationId: row.organization_id,
    kind: row.kind as JobKind,
    opaquePayload: requireOpaquePayload(row.opaque_payload),
    attempt: Number(row.attempt),
    leaseToken: row.lease_token,
    leasedUntil: requireTimestamp(row.leased_until),
  };
}

export function createPostgresBackgroundJobStore(
  options: { databaseUrl: string; postgresFactory?: PostgresFactory },
): CanaryBackgroundJobStore {
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
          application_name: "osp-background-worker",
          statement_timeout: "3000",
        },
      },
    );
  if (typeof created !== "function") {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  const sql = created as SqlPort;
  return Object.freeze({
    async enqueue(
      input: {
        organizationId: string;
        kind: JobKind;
        opaquePayload: Record<string, string>;
        idempotencyKey: string;
      },
    ) {
      const payload = canonicalPayload(input.opaquePayload);
      return await withOrganizationTransaction(
        sql,
        input.organizationId,
        async (tx) => {
          const inserted =
            await tx`insert into osp_private.background_jobs (id, organization_id, kind, opaque_payload, idempotency_key) values (${crypto.randomUUID()}, ${input.organizationId}, ${input.kind}, ${payload}::text::jsonb, ${input.idempotencyKey}) on conflict (organization_id, kind, idempotency_key) do nothing returning id, opaque_payload`;
          const rows = inserted.length === 1
            ? inserted
            : await tx`select id, opaque_payload from osp_private.background_jobs where organization_id = ${input.organizationId} and kind = ${input.kind} and idempotency_key = ${input.idempotencyKey}`;
          if (
            rows.length !== 1 || typeof rows[0].id !== "string" ||
            canonicalPayload(requireOpaquePayload(rows[0].opaque_payload)) !==
              payload
          ) throw new Error("IDEMPOTENCY_CONFLICT");
          return rows[0].id;
        },
      );
    },
    async claim(
      input: { workerId: string; now: Date; leaseMs: number; limit: number },
    ) {
      if (
        !/^[A-Za-z0-9:_-]{1,256}$/.test(input.workerId) ||
        !Number.isSafeInteger(input.leaseMs) || input.leaseMs < 1 ||
        !Number.isSafeInteger(input.limit) || input.limit < 1 ||
        input.limit > 100
      ) throw new Error("INVALID_CLAIM");
      return await withWorkerTransaction(sql, async (tx) => {
        const rows =
          await tx`select * from osp_private.claim_next_background_jobs(${input.leaseMs}, ${input.limit})`;
        return rows.map(leasedJob);
      });
    },
    async claimShadowDocumentExtract(input: ShadowDocumentExtractClaim) {
      if (
        !UUID_PATTERN.test(input.organizationId) ||
        !UUID_PATTERN.test(input.caseId) ||
        !UUID_PATTERN.test(input.jobId) ||
        !UUID_PATTERN.test(input.documentVersionId) ||
        !SHA256_PATTERN.test(input.sourceSha256) ||
        !Number.isSafeInteger(input.leaseMs) || input.leaseMs < 1 ||
        input.leaseMs > 900_000
      ) throw new Error("INVALID_CLAIM");
      return await withWorkerTransaction(sql, async (tx) => {
        const rows =
          await tx`select * from osp_private.claim_shadow_document_extract(${input.organizationId}, ${input.caseId}, ${input.jobId}, ${input.documentVersionId}, ${input.sourceSha256}, ${input.leaseMs})`;
        if (rows.length > 1) throw new Error("LEASE_CONFLICT");
        return rows.map(leasedJob);
      });
    },
    async claimSupplierPackageCanary(input: SupplierPackageCanaryClaim) {
      if (
        !UUID_PATTERN.test(input.organizationId) ||
        !UUID_PATTERN.test(input.caseId) ||
        !UUID_PATTERN.test(input.jobId) ||
        !UUID_PATTERN.test(input.snapshotId) ||
        !SHA256_PATTERN.test(input.snapshotSha256) ||
        !Number.isSafeInteger(input.leaseMs) || input.leaseMs < 1 ||
        input.leaseMs > 900_000
      ) throw new Error("INVALID_CLAIM");
      return await withWorkerTransaction(sql, async (tx) => {
        const rows =
          await tx`select * from osp_private.claim_supplier_package_canary(${input.organizationId}, ${input.caseId}, ${input.jobId}, ${input.snapshotId}, ${input.snapshotSha256}, ${input.leaseMs})`;
        if (rows.length > 1) throw new Error("LEASE_CONFLICT");
        return rows.map(leasedJob);
      });
    },
    async claimSignatureApplicationCanary(
      input: SignatureApplicationCanaryClaim,
    ) {
      if (
        !UUID_PATTERN.test(input.organizationId) ||
        !UUID_PATTERN.test(input.caseId) ||
        !UUID_PATTERN.test(input.jobId) ||
        !UUID_PATTERN.test(input.approvalId) ||
        !Number.isSafeInteger(input.expectedCaseVersion) ||
        input.expectedCaseVersion < 1 ||
        !SHA256_PATTERN.test(input.inputSnapshotSha256) ||
        !SHA256_PATTERN.test(input.inputPackageSha256) ||
        !Number.isSafeInteger(input.signaturePositionVersion) ||
        input.signaturePositionVersion < 1 ||
        !Number.isSafeInteger(input.leaseMs) || input.leaseMs < 1 ||
        input.leaseMs > 900_000
      ) throw new Error("INVALID_CLAIM");
      return await withWorkerTransaction(sql, async (tx) => {
        const rows =
          await tx`select * from osp_private.claim_signature_application_canary(${input.organizationId}, ${input.caseId}, ${input.jobId}, ${input.approvalId}, ${input.expectedCaseVersion}, ${input.inputSnapshotSha256}, ${input.inputPackageSha256}, ${input.signaturePositionVersion}, ${input.leaseMs})`;
        if (rows.length > 1) throw new Error("LEASE_CONFLICT");
        return rows.map(leasedJob);
      });
    },
    async complete(
      input: { jobId: string; leaseToken: string; completedAt: Date },
    ) {
      const leaseToken = requireLeaseToken(input.leaseToken);
      await withWorkerTransaction(sql, async (tx) => {
        await tx`select osp_private.complete_background_job(${input.jobId}, ${leaseToken}, ${input.completedAt})`;
      });
    },
    async fail(
      input: {
        jobId: string;
        leaseToken: string;
        errorCode: JobErrorCode;
        retryAt: Date | null;
      },
    ) {
      const leaseToken = requireLeaseToken(input.leaseToken);
      await withWorkerTransaction(sql, async (tx) => {
        await tx`select osp_private.fail_background_job(${input.jobId}, ${leaseToken}, ${input.errorCode}, ${input.retryAt})`;
      });
    },
  });
}
