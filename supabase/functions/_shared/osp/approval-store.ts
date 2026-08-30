import postgres from "postgres";

import {
  type SqlPort,
  type SqlRow,
  withOrganizationTransaction,
} from "./database-context.ts";
import { requireApprovalAuthority } from "./approval-policy.ts";
import type {
  ApprovalCommand,
  ApprovalEvent,
  ApprovalResult,
  ApprovalStore,
} from "./approval-types.ts";

type SeedCase = {
  organizationId: string;
  caseId: string;
  state:
    | "operations_review"
    | "awaiting_clarification"
    | "signature_approval"
    | "sales_authorization"
    | "ready_to_send";
  version: number;
  currentSnapshotSha256: string;
};
type SeedPayload = {
  organizationId: string;
  caseId: string;
  payloadId: string;
  payloadSha256: string;
  kind?: "clarification" | "final_response";
  attachmentSha256?: readonly string[];
};
type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const OPAQUE = /^[A-Za-z0-9:_-]{1,256}$/;

function fail(code: string): never {
  throw new Error(code);
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")
  }}`;
}

const SAFE_ERRORS = new Set([
  "APPROVAL_COMMAND_INVALID",
  "APPROVAL_FORBIDDEN",
  "APPROVAL_PERSISTENCE_FAILED",
  "APPROVAL_SCOPE_MISMATCH",
  "APPROVAL_TRANSITION_INVALID",
  "IDEMPOTENCY_CONFLICT",
  "OUTBOUND_AUTHORIZATION_STALE",
  "SNAPSHOT_HASH_MISMATCH",
  "VERSION_CONFLICT",
]);

const SAFE_POSTGRES_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  OSP_APPROVAL_FORBIDDEN: "APPROVAL_FORBIDDEN",
  OSP_APPROVAL_INVALID: "APPROVAL_COMMAND_INVALID",
  OSP_PACKAGE_MISMATCH: "PACKAGE_MISMATCH",
  OSP_PAYLOAD_MISMATCH: "PAYLOAD_HASH_MISMATCH",
  OSP_SNAPSHOT_MISMATCH: "SNAPSHOT_HASH_MISMATCH",
  OSP_TRANSITION_INVALID: "APPROVAL_TRANSITION_INVALID",
  OSP_VERSION_CONFLICT: "VERSION_CONFLICT",
});

function reducePostgresError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (SAFE_ERRORS.has(message)) throw error;
  const safeMessage = SAFE_POSTGRES_MESSAGES[message];
  if (safeMessage) fail(safeMessage);
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  if (code === "40001") fail("VERSION_CONFLICT");
  if (code === "42501") fail("APPROVAL_FORBIDDEN");
  if (code === "22023") fail("APPROVAL_COMMAND_INVALID");
  if (code === "23505") fail("IDEMPOTENCY_CONFLICT");
  if (code === "23514") fail("APPROVAL_TRANSITION_INVALID");
  fail("APPROVAL_PERSISTENCE_FAILED");
}

export async function approvalCommandHash(
  command: ApprovalCommand,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical(command)),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function assertCommand(command: ApprovalCommand): void {
  if (command?.actor?.organizationId !== command?.organizationId) {
    fail("APPROVAL_SCOPE_MISMATCH");
  }
  if (
    !command || !UUID.test(command.organizationId) ||
    !UUID.test(command.caseId) ||
    !Number.isSafeInteger(command.expectedCaseVersion) ||
    command.expectedCaseVersion < 0 ||
    command.expectedCaseVersion > 2_147_483_647 ||
    !OPAQUE.test(command.idempotencyKey)
  ) fail("APPROVAL_COMMAND_INVALID");
  if (
    (command.type === "complete_operations_review" ||
      command.type === "approve_signature") &&
    !SHA.test(command.inputSnapshotSha256)
  ) fail("APPROVAL_COMMAND_INVALID");
  if (
    command.type === "approve_signature" &&
    (!OPAQUE.test(command.signatureVaultRef) ||
      !Number.isSafeInteger(command.signaturePositionVersion) ||
      command.signaturePositionVersion < 1 ||
      command.signaturePositionVersion > 2_147_483_647)
  ) fail("APPROVAL_COMMAND_INVALID");
  if (
    command.type === "authorize_outbound" &&
    (!UUID.test(command.payloadId) || !SHA.test(command.payloadSha256) ||
      !Array.isArray(command.attachmentSha256) ||
      command.attachmentSha256.some((hash) =>
        typeof hash !== "string" || !SHA.test(hash)
      ))
  ) fail("APPROVAL_COMMAND_INVALID");
  if (
    command.type === "request_authorized_send" &&
    (!UUID.test(command.salesAuthorizationId) ||
      !SHA.test(command.payloadSha256))
  ) fail("APPROVAL_COMMAND_INVALID");
}

function locked<T>(
  lock: { current: Promise<void> },
  action: () => Promise<T>,
): Promise<T> {
  const previous = lock.current;
  let release!: () => void;
  lock.current = new Promise<void>((resolve) => release = resolve);
  return previous.then(action).finally(release);
}

export function createInMemoryApprovalStore(input: {
  cases: readonly SeedCase[];
  payloads: readonly SeedPayload[];
  now?: () => Date;
}): ApprovalStore {
  const cases = new Map(input.cases.map((item) => [item.caseId, { ...item }]));
  const payloads = new Map(
    input.payloads.map((item) => [item.payloadId, { ...item }]),
  );
  const events: ApprovalEvent[] = [];
  const receipts = new Map<string, { hash: string; result: ApprovalResult }>();
  const lock = { current: Promise.resolve() };
  const now = input.now ?? (() => new Date());

  return Object.freeze({
    async transact(
      command: ApprovalCommand,
      prepare?: () => Promise<void>,
    ): Promise<ApprovalResult> {
      assertCommand(command);
      requireApprovalAuthority(command.actor, command.type, now());
      return await locked(lock, async () => {
        const hash = await approvalCommandHash(command);
        const receiptKey =
          `${command.organizationId}\0${command.type}\0${command.idempotencyKey}`;
        const receipt = receipts.get(receiptKey);
        if (receipt) {
          if (receipt.hash !== hash) fail("IDEMPOTENCY_CONFLICT");
          return Object.freeze({ ...receipt.result, replayed: true });
        }
        if (prepare) await prepare();
        const current = cases.get(command.caseId);
        if (!current || current.organizationId !== command.organizationId) {
          fail("APPROVAL_SCOPE_MISMATCH");
        }
        if (current.version !== command.expectedCaseVersion) {
          fail("VERSION_CONFLICT");
        }

        let state: ApprovalResult["state"];
        let approvalId: string | undefined;
        let authorizationId: string | undefined;
        if (command.type === "complete_operations_review") {
          if (current.state !== "operations_review") {
            fail("APPROVAL_TRANSITION_INVALID");
          }
          if (current.currentSnapshotSha256 !== command.inputSnapshotSha256) {
            fail("SNAPSHOT_HASH_MISMATCH");
          }
          state = "signature_approval";
        } else if (command.type === "approve_signature") {
          if (current.state !== "signature_approval") {
            fail("APPROVAL_TRANSITION_INVALID");
          }
          if (current.currentSnapshotSha256 !== command.inputSnapshotSha256) {
            fail("SNAPSHOT_HASH_MISMATCH");
          }
          state = "signature_approval";
          approvalId = crypto.randomUUID();
        } else if (command.type === "authorize_outbound") {
          const payload = payloads.get(command.payloadId);
          if (
            !payload || payload.organizationId !== command.organizationId ||
            payload.caseId !== command.caseId
          ) fail("PAYLOAD_NOT_FOUND");
          if (payload.payloadSha256 !== command.payloadSha256) {
            fail("PAYLOAD_HASH_MISMATCH");
          }
          const attachmentSha256 = payload.attachmentSha256 ?? [];
          if (
            attachmentSha256.length !== command.attachmentSha256.length ||
            attachmentSha256.some((hash, index) =>
              hash !== command.attachmentSha256[index]
            )
          ) fail("PAYLOAD_HASH_MISMATCH");
          const expectedState = payload.kind === "clarification"
            ? "awaiting_clarification"
            : "sales_authorization";
          if (current.state !== expectedState) {
            fail("APPROVAL_TRANSITION_INVALID");
          }
          state = "ready_to_send";
          authorizationId = crypto.randomUUID();
        } else fail("APPROVAL_TRANSITION_INVALID");
        current.state = state;
        current.version += 1;
        const result = Object.freeze({
          caseId: current.caseId,
          state,
          caseVersion: current.version,
          replayed: false,
          ...(approvalId ? { approvalId } : {}),
          ...(authorizationId ? { authorizationId } : {}),
        });
        events.push(Object.freeze({
          id: crypto.randomUUID(),
          organizationId: command.organizationId,
          caseId: command.caseId,
          caseVersion: current.version,
          type: command.type,
          actorSubject: command.actor.subject,
          actorRole: command.actor.role,
          commandSha256: hash,
          occurredAt: now().toISOString(),
        }));
        receipts.set(receiptKey, { hash, result });
        return result;
      });
    },
    events(caseId: string): Promise<readonly ApprovalEvent[]> {
      return Promise.resolve(Object.freeze(
        events.filter((event) => event.caseId === caseId).map((event) =>
          Object.freeze({ ...event })
        ),
      ));
    },
  });
}

function requireDatabaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      value.trim() !== value ||
      !(url.protocol === "postgres:" || url.protocol === "postgresql:") ||
      !url.hostname || url.search || url.hash
    ) fail("INVALID_RUNTIME_CONFIGURATION");
    return value;
  } catch {
    fail("INVALID_RUNTIME_CONFIGURATION");
  }
}

function resultFromRow(row: SqlRow, replayed: boolean): ApprovalResult {
  const version = Number(row.case_version);
  if (
    typeof row.case_id !== "string" || !UUID.test(row.case_id) ||
    !Number.isSafeInteger(version) || version < 0 ||
    !["signature_approval", "sales_authorization", "ready_to_send"].includes(
      String(row.state),
    )
  ) fail("APPROVAL_PERSISTENCE_FAILED");
  return Object.freeze({
    caseId: row.case_id,
    state: row.state as ApprovalResult["state"],
    caseVersion: version,
    replayed,
    ...(typeof row.approval_id === "string"
      ? { approvalId: row.approval_id }
      : {}),
    ...(typeof row.authorization_id === "string"
      ? { authorizationId: row.authorization_id }
      : {}),
  });
}

function textArray(values: readonly string[]): string {
  // The approval pool disables PostgreSQL type discovery, so postgres.js cannot
  // map the text OID (25) to text[] (1009). Bind a quoted array literal and let
  // the explicit ::text[] cast in each command resolve the server-side type.
  return "{" +
    values.map((value) =>
      '"' + value.replaceAll("\\", "\\\\").replaceAll('"', '\\"') + '"'
    ).join(",") +
    "}";
}

export function createPostgresApprovalStore(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
  now?: () => Date;
}): ApprovalStore {
  const factory = options.postgresFactory ??
    postgres as unknown as PostgresFactory;
  const created = factory(requireDatabaseUrl(options.databaseUrl), {
    ssl: "verify-full",
    fetch_types: false,
    prepare: false,
    max: 1,
    connect_timeout: 5,
    connection: {
      application_name: "osp-approval-api",
      statement_timeout: "3000",
    },
  });
  if (typeof created !== "function") fail("INVALID_RUNTIME_CONFIGURATION");
  const sql = created as SqlPort;
  const now = options.now ?? (() => new Date());

  return Object.freeze({
    async transact(
      command: ApprovalCommand,
      prepare?: () => Promise<void>,
    ): Promise<ApprovalResult> {
      assertCommand(command);
      requireApprovalAuthority(command.actor, command.type, now());
      try {
        return await withOrganizationTransaction(
          sql,
          command.organizationId,
          async (tx) => {
            await tx`set local statement_timeout = '3000ms'`;
            const hash = await approvalCommandHash(command);
            const operation = `approval:${command.type}`;
            const lockKey = JSON.stringify([
              command.organizationId,
              operation,
              command.idempotencyKey,
            ]);
            await tx`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
            const prior =
              await tx`select request_hash, response_json from osp_private.command_receipts where organization_id = ${command.organizationId} and operation = ${operation} and idempotency_key = ${command.idempotencyKey}`;
            if (prior.length === 1) {
              if (prior[0].request_hash !== hash) fail("IDEMPOTENCY_CONFLICT");
              const response = typeof prior[0].response_json === "string"
                ? JSON.parse(prior[0].response_json) as SqlRow
                : prior[0].response_json as SqlRow;
              return resultFromRow(response, true);
            }
            if (prepare) await prepare();
            let rows: SqlRow[];
            const permissions = [...command.actor.permissions];
            if (command.type === "complete_operations_review") {
              const permissionArray = textArray(permissions);
              rows =
                await tx`select * from osp_private.complete_operations_review_command(${command.organizationId}, ${command.caseId}, ${command.inputSnapshotSha256}, ${command.expectedCaseVersion}, ${command.actor.subject}, ${command.actor.verifiedEmail}, ${permissionArray}::text[], ${command.actor.role}, ${command.actor.authorizationSessionId}, ${command.actor.authorizationSessionIssuedAt}, ${hash})`;
            } else if (command.type === "approve_signature") {
              const permissionArray = textArray(permissions);
              rows =
                await tx`select * from osp_private.approve_signature_command(${command.organizationId}, ${command.caseId}, ${command.inputSnapshotSha256}, ${command.signatureVaultRef}, ${command.signaturePositionVersion}, ${command.expectedCaseVersion}, ${command.idempotencyKey}, ${command.actor.subject}, ${command.actor.verifiedEmail}, ${permissionArray}::text[], ${command.actor.role}, ${command.actor.authorizationSessionId}, ${command.actor.authorizationSessionIssuedAt}, ${hash})`;
            } else if (command.type === "authorize_outbound") {
              const attachmentArray = textArray(command.attachmentSha256);
              const permissionArray = textArray(permissions);
              rows =
                await tx`select * from osp_private.authorize_outbound_command(${command.organizationId}, ${command.caseId}, ${command.payloadId}, ${command.payloadSha256}, ${attachmentArray}::text[], ${command.expectedCaseVersion}, ${command.idempotencyKey}, ${command.actor.subject}, ${command.actor.verifiedEmail}, ${permissionArray}::text[], ${command.actor.role}, ${command.actor.authorizationSessionId}, ${command.actor.authorizationSessionIssuedAt}, ${hash})`;
            } else {
              fail("APPROVAL_TRANSITION_INVALID");
            }
            if (rows.length !== 1) fail("APPROVAL_PERSISTENCE_FAILED");
            const result = resultFromRow(rows[0], false);
            await tx`insert into osp_private.command_receipts (id, organization_id, operation, idempotency_key, request_hash, response_json) values (${crypto.randomUUID()}, ${command.organizationId}, ${operation}, ${command.idempotencyKey}, ${hash}, ${
              JSON.stringify(result)
            })`;
            return result;
          },
        );
      } catch (error) {
        reducePostgresError(error);
      }
    },
    events(caseId: string): Promise<readonly ApprovalEvent[]> {
      if (!UUID.test(caseId)) {
        return Promise.reject(new Error("APPROVAL_COMMAND_INVALID"));
      }
      return Promise.reject(
        new Error("APPROVAL_EVENT_QUERY_REQUIRES_AUTHORITY"),
      );
    },
  });
}
