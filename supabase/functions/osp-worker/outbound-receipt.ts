import PostalMime from "postalMime";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const OPAQUE = /^[A-Za-z0-9:_-]{1,256}$/;
const GMAIL_ID = /^[A-Za-z0-9_-]{1,256}$/;
const DETERMINISTIC_MESSAGE_ID = new RegExp(
  "^<osp-[0-9a-f-]{36}@" + "xbfreight\\.com>$",
);

function messageIdForPayload(payloadId: string): string {
  return `<osp-${payloadId}@${["xbfreight", "com"].join(".")}>`;
}

export type SendOutcome =
  | "reserved"
  | "sending"
  | "sent"
  | "failed"
  | "manual_reconciliation_required";

export type OutboundSendReceipt = Readonly<{
  authorizationId: string;
  gmailMessageId: string;
  gmailThreadId: string;
  canonicalMimeSha256: string;
  deterministicMessageId: string;
  outcome: "sent";
  providerTimestamp: string;
  replayed: boolean;
}>;

export type SendReservationInput = Readonly<{
  organizationId: string;
  caseId: string;
  salesAuthorizationId: string;
  payloadSha256: string;
  expectedCaseVersion: number;
  idempotencyKey: string;
  actorSubject: string;
  actorEmail: string;
  actorPermissions: readonly string[];
  actorRole: "carriers_sender";
  authorizationSessionId: string;
  authorizationSessionIssuedAt: string;
  commandSha256: string;
}>;

export type SendReservation = Readonly<{
  attemptId: string;
  jobId: string;
  outcome: SendOutcome;
  replayed: boolean;
}>;

export type InboundGmailEventResult = Readonly<{
  caseId: string;
  outcome: "outbound_receipt" | "supplier_response";
  replayed: boolean;
}>;

type InboundGmailEventRecord = Readonly<{
  organizationId: string;
  jobId: string;
  leaseToken: string;
  gmailMessageId: string;
  gmailThreadId: string;
  sourceSha256: string;
  deterministicMessageId: string;
  eventKind: "outbound_receipt" | "supplier_response";
  providerTimestamp: string;
}>;

export type ClaimedSend =
  | Readonly<{
    kind: "send";
    authorizationId: string;
    mimeObjectId: string;
    mimeSha256: string;
    threadId: string | null;
    deterministicMessageId: string;
    sendClaimToken: string;
  }>
  | Readonly<{
    kind: "terminal";
    result: OutboundSendReceipt | {
      outcome: "failed" | "manual_reconciliation_required";
    };
  }>;

export interface OutboundSendStore {
  reserve(input: SendReservationInput): Promise<SendReservation>;
  claim(
    input: {
      organizationId: string;
      attemptId: string;
      jobId: string;
      leaseToken: string;
    },
  ): Promise<ClaimedSend>;
  recordSent(
    input: {
      organizationId: string;
      attemptId: string;
      jobId: string;
      leaseToken: string;
      sendClaimToken: string;
      authorizationId: string;
      gmailMessageId: string;
      gmailThreadId: string;
      canonicalMimeSha256: string;
      deterministicMessageId: string;
      providerTimestamp: string;
    },
  ): Promise<OutboundSendReceipt>;
  recordKnownFailure(
    input: {
      organizationId: string;
      attemptId: string;
      jobId: string;
      leaseToken: string;
      sendClaimToken: string;
      failureCode: string;
    },
  ): Promise<{ outcome: "failed" }>;
  recordAmbiguous(
    input: {
      organizationId: string;
      attemptId: string;
      jobId: string;
      leaseToken: string;
      sendClaimToken: string;
    },
  ): Promise<{ outcome: "manual_reconciliation_required" }>;
  captureReceipt(
    input: Omit<OutboundSendReceipt, "outcome" | "replayed">,
  ): Promise<OutboundSendReceipt>;
  captureInboundGmailEvent(
    input: InboundGmailEventRecord,
  ): Promise<InboundGmailEventResult>;
}

type Seed = {
  outboundEnabled: boolean;
  cases: readonly {
    organizationId: string;
    caseId: string;
    version: number;
    state: string;
  }[];
  payloads: readonly {
    organizationId: string;
    caseId: string;
    payloadId: string;
    mimeObjectId: string;
    mimeSha256: string;
    threadId: string | null;
    status: string;
  }[];
  authorizations: readonly {
    organizationId: string;
    caseId: string;
    authorizationId: string;
    payloadId: string;
    payloadSha256: string;
    status: string;
  }[];
  now?: () => Date;
};

type Attempt = {
  organizationId: string;
  caseId: string;
  authorizationId: string;
  payloadId: string;
  attemptId: string;
  jobId: string;
  idempotencyKey: string;
  requestKey: string;
  outcome: SendOutcome;
  receipt?: OutboundSendReceipt;
  sendClaimToken?: string;
  reservedCaseVersion: number;
};

function fail(code: string): never {
  throw new Error(code);
}

function canonicalReservation(input: SendReservationInput): string {
  return JSON.stringify({
    actorSubject: input.actorSubject,
    actorEmail: input.actorEmail,
    actorPermissions: [...input.actorPermissions],
    actorRole: input.actorRole,
    authorizationSessionId: input.authorizationSessionId,
    authorizationSessionIssuedAt: input.authorizationSessionIssuedAt,
    caseId: input.caseId,
    expectedCaseVersion: input.expectedCaseVersion,
    organizationId: input.organizationId,
    payloadSha256: input.payloadSha256,
    salesAuthorizationId: input.salesAuthorizationId,
  });
}

function validReservation(input: SendReservationInput): boolean {
  return !!input && UUID.test(input.organizationId) &&
    UUID.test(input.caseId) &&
    UUID.test(input.salesAuthorizationId) && SHA.test(input.payloadSha256) &&
    Number.isSafeInteger(input.expectedCaseVersion) &&
    input.expectedCaseVersion >= 0 &&
    input.expectedCaseVersion <= 2_147_483_647 &&
    OPAQUE.test(input.idempotencyKey) &&
    OPAQUE.test(input.actorSubject) &&
    input.actorEmail === "carriers@xbfreight.com" &&
    Array.isArray(input.actorPermissions) &&
    input.actorPermissions.length > 0 &&
    input.actorRole === "carriers_sender" &&
    OPAQUE.test(input.authorizationSessionId) &&
    !Number.isNaN(new Date(input.authorizationSessionIssuedAt).getTime()) &&
    SHA.test(input.commandSha256);
}

export function createInMemoryOutboundLedger(seed: Seed) {
  const cases = new Map(
    seed.cases.map((value) => [value.caseId, { ...value }]),
  );
  const payloads = new Map(
    seed.payloads.map((value) => [value.payloadId, { ...value }]),
  );
  const authorizations = new Map(
    seed.authorizations.map((value) => [value.authorizationId, { ...value }]),
  );
  const attempts = new Map<string, Attempt>();
  const idempotency = new Map<string, Attempt>();
  const receiptRows = new Map<string, OutboundSendReceipt>();
  const inboundRows = new Map<
    string,
    InboundGmailEventResult & {
      sourceSha256: string;
      deterministicMessageId: string;
      gmailThreadId: string;
    }
  >();
  let failReceipt = false;

  const store: OutboundSendStore & {
    pendingJobs(): Promise<readonly { jobId: string; attemptId: string }[]>;
    receipts(authorizationId: string): Promise<readonly OutboundSendReceipt[]>;
    failNextReceiptCommit(): void;
    caseState(caseId: string): Promise<string | null>;
  } = {
    async reserve(input) {
      if (!validReservation(input)) fail("OUTBOUND_SEND_INVALID");
      const idempotencyKey = `${input.organizationId}\0${input.idempotencyKey}`;
      const requestKey = canonicalReservation(input);
      const prior = idempotency.get(idempotencyKey);
      if (prior) {
        if (prior.requestKey !== requestKey) fail("IDEMPOTENCY_CONFLICT");
        return Object.freeze({
          attemptId: prior.attemptId,
          jobId: prior.jobId,
          outcome: prior.outcome,
          replayed: true,
        });
      }
      if (!seed.outboundEnabled) fail("OUTBOUND_DISABLED");
      const currentCase = cases.get(input.caseId);
      const authorization = authorizations.get(input.salesAuthorizationId);
      const payload = authorization
        ? payloads.get(authorization.payloadId)
        : undefined;
      if (
        !currentCase || currentCase.organizationId !== input.organizationId ||
        currentCase.state !== "ready_to_send" ||
        currentCase.version !== input.expectedCaseVersion
      ) fail("OUTBOUND_SEND_STALE");
      if (
        !authorization ||
        authorization.organizationId !== input.organizationId ||
        authorization.caseId !== input.caseId ||
        authorization.status !== "authorized" ||
        authorization.payloadSha256 !== input.payloadSha256 || !payload ||
        payload.organizationId !== input.organizationId ||
        payload.caseId !== input.caseId ||
        payload.status !== "frozen" ||
        payload.mimeSha256 !== input.payloadSha256
      ) fail("OUTBOUND_SEND_STALE");
      const attempt: Attempt = {
        organizationId: input.organizationId,
        caseId: input.caseId,
        authorizationId: input.salesAuthorizationId,
        payloadId: authorization.payloadId,
        attemptId: crypto.randomUUID(),
        jobId: crypto.randomUUID(),
        idempotencyKey: input.idempotencyKey,
        requestKey,
        outcome: "reserved",
        reservedCaseVersion: input.expectedCaseVersion + 1,
      };
      attempts.set(attempt.attemptId, attempt);
      idempotency.set(idempotencyKey, attempt);
      currentCase.version += 1;
      return Object.freeze({
        attemptId: attempt.attemptId,
        jobId: attempt.jobId,
        outcome: "reserved",
        replayed: false,
      });
    },
    async claim(input): Promise<ClaimedSend> {
      if (!seed.outboundEnabled) fail("OUTBOUND_DISABLED");
      const attempt = attempts.get(input.attemptId);
      if (
        !attempt || attempt.organizationId !== input.organizationId ||
        attempt.jobId !== input.jobId || !UUID.test(input.leaseToken)
      ) fail("OUTBOUND_SEND_STALE");
      if (attempt.outcome === "sent" && attempt.receipt) {
        return Object.freeze({ kind: "terminal", result: attempt.receipt });
      }
      if (
        attempt.outcome === "failed" ||
        attempt.outcome === "manual_reconciliation_required"
      ) {
        const outcome: "failed" | "manual_reconciliation_required" =
          attempt.outcome;
        return Object.freeze({ kind: "terminal", result: { outcome } });
      }
      if (attempt.outcome === "sending") {
        attempt.outcome = "manual_reconciliation_required";
        return Object.freeze({
          kind: "terminal",
          result: { outcome: "manual_reconciliation_required" as const },
        });
      }
      const currentCase = cases.get(attempt.caseId);
      const authorization = authorizations.get(attempt.authorizationId);
      const payload = authorization
        ? payloads.get(authorization.payloadId)
        : undefined;
      if (
        !currentCase || currentCase.version !== attempt.reservedCaseVersion ||
        currentCase.state !== "ready_to_send" ||
        !authorization || authorization.status !== "authorized" || !payload ||
        payload.status !== "frozen" ||
        authorization.payloadSha256 !== payload.mimeSha256
      ) fail("OUTBOUND_SEND_STALE");
      attempt.outcome = "sending";
      attempt.sendClaimToken = crypto.randomUUID();
      return Object.freeze({
        kind: "send",
        authorizationId: authorization.authorizationId,
        mimeObjectId: payload.mimeObjectId,
        mimeSha256: payload.mimeSha256,
        threadId: payload.threadId,
        deterministicMessageId: messageIdForPayload(payload.payloadId),
        sendClaimToken: attempt.sendClaimToken,
      });
    },
    async recordSent(input) {
      if (failReceipt) {
        failReceipt = false;
        fail("DATABASE_TEMPORARY");
      }
      const attempt = attempts.get(input.attemptId);
      if (
        !attempt || attempt.organizationId !== input.organizationId ||
        attempt.outcome !== "sending" ||
        attempt.authorizationId !== input.authorizationId ||
        attempt.jobId !== input.jobId ||
        attempt.sendClaimToken !== input.sendClaimToken
      ) {
        fail("OUTBOUND_SEND_STALE");
      }
      const receipt = await store.captureReceipt({
        authorizationId: input.authorizationId,
        gmailMessageId: input.gmailMessageId,
        gmailThreadId: input.gmailThreadId,
        canonicalMimeSha256: input.canonicalMimeSha256,
        deterministicMessageId: input.deterministicMessageId,
        providerTimestamp: input.providerTimestamp,
      });
      attempt.outcome = "sent";
      attempt.receipt = receipt;
      return receipt;
    },
    async recordKnownFailure(input) {
      const attempt = attempts.get(input.attemptId);
      if (
        !attempt || attempt.organizationId !== input.organizationId ||
        attempt.outcome !== "sending" || attempt.jobId !== input.jobId ||
        attempt.sendClaimToken !== input.sendClaimToken ||
        !/^[A-Z0-9_]{1,64}$/.test(input.failureCode)
      ) fail("OUTBOUND_SEND_STALE");
      attempt.outcome = "failed";
      return Object.freeze({ outcome: "failed" });
    },
    async recordAmbiguous(input) {
      const attempt = attempts.get(input.attemptId);
      if (
        !attempt || attempt.organizationId !== input.organizationId ||
        attempt.outcome !== "sending" || attempt.jobId !== input.jobId ||
        attempt.sendClaimToken !== input.sendClaimToken
      ) fail("OUTBOUND_SEND_STALE");
      attempt.outcome = "manual_reconciliation_required";
      return Object.freeze({ outcome: "manual_reconciliation_required" });
    },
    async captureReceipt(input) {
      const authorization = authorizations.get(input.authorizationId);
      const payload = authorization
        ? payloads.get(authorization.payloadId)
        : undefined;
      const accepted = new Date(input.providerTimestamp);
      if (
        !authorization || !payload || !GMAIL_ID.test(input.gmailMessageId) ||
        !GMAIL_ID.test(input.gmailThreadId) ||
        !SHA.test(input.canonicalMimeSha256) ||
        input.canonicalMimeSha256 !== authorization.payloadSha256 ||
        (payload.threadId !== null &&
          input.gmailThreadId !== payload.threadId) ||
        input.deterministicMessageId !==
          messageIdForPayload(payload.payloadId) ||
        Number.isNaN(accepted.getTime()) ||
        accepted.toISOString() !== input.providerTimestamp
      ) fail("OUTBOUND_RECEIPT_INVALID");
      const key = `${authorization.organizationId}\0${input.gmailMessageId}`;
      const prior = receiptRows.get(key);
      if (prior) {
        if (
          prior.authorizationId !== input.authorizationId ||
          prior.gmailThreadId !== input.gmailThreadId ||
          prior.canonicalMimeSha256 !== input.canonicalMimeSha256 ||
          prior.deterministicMessageId !== input.deterministicMessageId ||
          prior.providerTimestamp !== input.providerTimestamp
        ) fail("OUTBOUND_RECEIPT_INVALID");
        return Object.freeze({ ...prior, replayed: true });
      }
      const receipt: OutboundSendReceipt = Object.freeze({
        ...input,
        outcome: "sent",
        replayed: false,
      });
      receiptRows.set(key, receipt);
      return receipt;
    },
    async captureInboundGmailEvent(input) {
      const accepted = new Date(input.providerTimestamp);
      if (
        !UUID.test(input.organizationId) || !UUID.test(input.jobId) ||
        !UUID.test(input.leaseToken) || !GMAIL_ID.test(input.gmailMessageId) ||
        !GMAIL_ID.test(input.gmailThreadId) || !SHA.test(input.sourceSha256) ||
        !DETERMINISTIC_MESSAGE_ID.test(
          input.deterministicMessageId,
        ) || Number.isNaN(accepted.getTime()) ||
        accepted.toISOString() !== input.providerTimestamp
      ) fail("OUTBOUND_RECEIPT_INVALID");
      const attempt = [...attempts.values()].find((candidate) =>
        messageIdForPayload(candidate.payloadId) ===
          input.deterministicMessageId
      );
      if (!attempt || attempt.organizationId !== input.organizationId) {
        fail("OUTBOUND_RECEIPT_INVALID");
      }
      const key = `${input.organizationId}\0${input.gmailMessageId}`;
      const prior = inboundRows.get(key);
      if (prior) {
        if (
          prior.sourceSha256 !== input.sourceSha256 ||
          prior.deterministicMessageId !== input.deterministicMessageId ||
          prior.gmailThreadId !== input.gmailThreadId ||
          prior.outcome !== input.eventKind
        ) fail("OUTBOUND_RECEIPT_INVALID");
        return Object.freeze({
          caseId: prior.caseId,
          outcome: prior.outcome,
          replayed: true,
        });
      }
      const currentCase = cases.get(attempt.caseId);
      if (!currentCase) fail("OUTBOUND_RECEIPT_INVALID");
      if (input.eventKind === "outbound_receipt") {
        if (
          !["sending", "sent", "manual_reconciliation_required"].includes(
            attempt.outcome,
          ) ||
          (attempt.receipt &&
            (attempt.receipt.gmailMessageId !== input.gmailMessageId ||
              attempt.receipt.gmailThreadId !== input.gmailThreadId))
        ) fail("OUTBOUND_RECEIPT_INVALID");
        const authorization = authorizations.get(attempt.authorizationId);
        if (!authorization) fail("OUTBOUND_RECEIPT_INVALID");
        const receipt = await store.captureReceipt({
          authorizationId: attempt.authorizationId,
          gmailMessageId: input.gmailMessageId,
          gmailThreadId: input.gmailThreadId,
          canonicalMimeSha256: authorization.payloadSha256,
          deterministicMessageId: input.deterministicMessageId,
          providerTimestamp: input.providerTimestamp,
        });
        attempt.outcome = "sent";
        attempt.receipt = receipt;
        currentCase.state = "sent";
      } else {
        if (
          attempt.outcome !== "sent" || !attempt.receipt ||
          attempt.receipt.gmailThreadId !== input.gmailThreadId ||
          attempt.receipt.gmailMessageId === input.gmailMessageId
        ) fail("OUTBOUND_RECEIPT_INVALID");
        currentCase.state = "analyzing_requirements";
      }
      const result = Object.freeze({
        caseId: attempt.caseId,
        outcome: input.eventKind,
        replayed: false,
        sourceSha256: input.sourceSha256,
        deterministicMessageId: input.deterministicMessageId,
        gmailThreadId: input.gmailThreadId,
      });
      inboundRows.set(key, result);
      return Object.freeze({
        caseId: result.caseId,
        outcome: result.outcome,
        replayed: false,
      });
    },
    pendingJobs() {
      return Promise.resolve(Object.freeze(
        [...attempts.values()].filter((attempt) =>
          attempt.outcome === "reserved"
        )
          .map((attempt) =>
            Object.freeze({
              jobId: attempt.jobId,
              attemptId: attempt.attemptId,
            })
          ),
      ));
    },
    receipts(authorizationId) {
      return Promise.resolve(Object.freeze(
        [...receiptRows.values()].filter((receipt) =>
          receipt.authorizationId === authorizationId
        ),
      ));
    },
    failNextReceiptCommit() {
      failReceipt = true;
    },
    caseState(caseId) {
      return Promise.resolve(cases.get(caseId)?.state ?? null);
    },
  };
  return Object.freeze(store);
}

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;

function databaseUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (
      value.trim() !== value ||
      !["postgres:", "postgresql:"].includes(parsed.protocol) ||
      !parsed.hostname || parsed.search || parsed.hash
    ) fail("INVALID_RUNTIME_CONFIGURATION");
    return value;
  } catch {
    fail("INVALID_RUNTIME_CONFIGURATION");
  }
}

function text(
  row: Record<string, unknown>,
  key: string,
  pattern = OPAQUE,
): string {
  const value = row[key];
  if (typeof value !== "string" || !pattern.test(value)) {
    fail("OUTBOUND_SEND_PERSISTENCE_FAILED");
  }
  return value;
}

function postgresError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  const safe = new Set([
    "OSP_OUTBOUND_DISABLED",
    "OSP_SEND_INVALID",
    "OSP_SEND_STALE",
    "OSP_SEND_LEASE_INVALID",
    "OSP_SEND_RECEIPT_INVALID",
    "OSP_IDEMPOTENCY_CONFLICT",
  ]);
  if (safe.has(message)) throw new Error(message.replace(/^OSP_/, ""));
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  if (code === "40001") fail("OUTBOUND_SEND_STALE");
  if (code === "23505") fail("IDEMPOTENCY_CONFLICT");
  if (code === "42501") fail("OUTBOUND_SEND_FORBIDDEN");
  if (code === "23514" || code === "22023") fail("OUTBOUND_SEND_STALE");
  fail("OUTBOUND_SEND_PERSISTENCE_FAILED");
}

export function createPostgresOutboundSendStore(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
}): OutboundSendStore {
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
          application_name: "osp-authorized-send",
          statement_timeout: "3000",
        },
      },
    );
  if (typeof created !== "function") fail("INVALID_RUNTIME_CONFIGURATION");
  const sql = created as SqlPort;
  const store: OutboundSendStore = {
    async reserve(input) {
      try {
        return await withOrganizationTransaction(
          sql,
          input.organizationId,
          async (tx) => {
            const rows =
              await tx`select * from osp_private.request_authorized_send_command(
            ${input.organizationId}, ${input.caseId}, ${input.salesAuthorizationId},
            ${input.payloadSha256}, ${input.expectedCaseVersion}, ${input.idempotencyKey},
            ${input.actorSubject}, ${input.actorEmail}, ${[
                ...input.actorPermissions,
              ]},
            ${input.actorRole}, ${input.authorizationSessionId},
            ${input.authorizationSessionIssuedAt}, ${input.commandSha256}
          )`;
            if (rows.length !== 1) {
              fail("OUTBOUND_SEND_PERSISTENCE_FAILED");
            }
            const outcome = text(
              rows[0],
              "outcome",
              /^(?:reserved|sending|sent|failed|manual_reconciliation_required)$/,
            ) as SendOutcome;
            return Object.freeze({
              attemptId: text(rows[0], "attempt_id", UUID),
              jobId: text(rows[0], "job_id", UUID),
              outcome,
              replayed: rows[0].replayed === true,
            });
          },
        );
      } catch (error) {
        postgresError(error);
      }
    },
    async claim(input) {
      try {
        return await withWorkerTransaction(sql, async (tx) => {
          const rows =
            await tx`select * from osp_private.claim_authorized_send(${input.organizationId}, ${input.attemptId}, ${input.jobId}, ${input.leaseToken})`;
          if (rows.length !== 1) fail("OUTBOUND_SEND_PERSISTENCE_FAILED");
          const row = rows[0];
          if (row.preparation === "sent") {
            return Object.freeze({
              kind: "terminal" as const,
              result: Object.freeze({
                authorizationId: text(row, "authorization_id", UUID),
                gmailMessageId: text(row, "gmail_message_id", GMAIL_ID),
                gmailThreadId: text(row, "gmail_thread_id", GMAIL_ID),
                canonicalMimeSha256: text(row, "mime_sha256", SHA),
                deterministicMessageId: text(
                  row,
                  "deterministic_message_id",
                  DETERMINISTIC_MESSAGE_ID,
                ),
                outcome: "sent" as const,
                providerTimestamp: new Date(String(row.provider_timestamp))
                  .toISOString(),
                replayed: true,
              }),
            });
          }
          if (
            row.preparation === "failed" ||
            row.preparation === "manual_reconciliation_required"
          ) {
            const outcome = row.preparation as
              | "failed"
              | "manual_reconciliation_required";
            return Object.freeze({
              kind: "terminal" as const,
              result: { outcome },
            });
          }
          if (row.preparation !== "ready") {
            fail("OUTBOUND_SEND_PERSISTENCE_FAILED");
          }
          return Object.freeze({
            kind: "send" as const,
            authorizationId: text(row, "authorization_id", UUID),
            mimeObjectId: text(row, "mime_object_id"),
            mimeSha256: text(row, "mime_sha256", SHA),
            threadId: row.gmail_thread_id === null
              ? null
              : text(row, "gmail_thread_id", GMAIL_ID),
            deterministicMessageId: text(
              row,
              "deterministic_message_id",
              DETERMINISTIC_MESSAGE_ID,
            ),
            sendClaimToken: text(row, "send_claim_token", UUID),
          });
        });
      } catch (error) {
        postgresError(error);
      }
    },
    async recordSent(input) {
      try {
        await withWorkerTransaction(sql, async (tx) => {
          await tx`select osp_private.complete_authorized_send(
            ${input.organizationId}, ${input.attemptId}, ${input.jobId},
            ${input.leaseToken}, ${input.sendClaimToken}, ${input.gmailMessageId},
            ${input.gmailThreadId}, ${input.canonicalMimeSha256}, ${input.providerTimestamp}
          )`;
        });
        return Object.freeze({
          authorizationId: input.authorizationId,
          gmailMessageId: input.gmailMessageId,
          gmailThreadId: input.gmailThreadId,
          canonicalMimeSha256: input.canonicalMimeSha256,
          deterministicMessageId: input.deterministicMessageId,
          outcome: "sent" as const,
          providerTimestamp: input.providerTimestamp,
          replayed: false,
        });
      } catch (error) {
        postgresError(error);
      }
    },
    async recordKnownFailure(input) {
      try {
        await withWorkerTransaction(sql, async (tx) => {
          await tx`select osp_private.fail_authorized_send(${input.organizationId}, ${input.attemptId}, ${input.jobId}, ${input.leaseToken}, ${input.sendClaimToken}, ${input.failureCode})`;
        });
        return Object.freeze({ outcome: "failed" as const });
      } catch (error) {
        postgresError(error);
      }
    },
    async recordAmbiguous(input) {
      try {
        await withWorkerTransaction(sql, async (tx) => {
          await tx`select osp_private.mark_authorized_send_ambiguous(${input.organizationId}, ${input.attemptId}, ${input.jobId}, ${input.leaseToken}, ${input.sendClaimToken})`;
        });
        return Object.freeze({
          outcome: "manual_reconciliation_required" as const,
        });
      } catch (error) {
        postgresError(error);
      }
    },
    captureReceipt() {
      return Promise.reject(new Error("OUTBOUND_RECEIPT_REQUIRES_LEASE"));
    },
    async captureInboundGmailEvent(input) {
      try {
        return await withWorkerTransaction(sql, async (tx) => {
          const rows =
            await tx`select * from osp_private.capture_authorized_gmail_event(
            ${input.organizationId}, ${input.jobId}, ${input.leaseToken},
            ${input.gmailMessageId}, ${input.gmailThreadId}, ${input.sourceSha256},
            ${input.deterministicMessageId}, ${input.eventKind},
            ${input.providerTimestamp}
          )`;
          if (rows.length !== 1) fail("OUTBOUND_SEND_PERSISTENCE_FAILED");
          return Object.freeze({
            caseId: text(rows[0], "case_id", UUID),
            outcome: text(
              rows[0],
              "event_kind",
              /^(?:outbound_receipt|supplier_response)$/,
            ) as "outbound_receipt" | "supplier_response",
            replayed: rows[0].replayed === true,
          });
        });
      } catch (error) {
        postgresError(error);
      }
    },
  };
  return Object.freeze(store);
}

export async function captureOutboundGmailReceipt(
  input: {
    organizationId: string;
    authorizationId: string;
    gmailMessageId: string;
    gmailThreadId: string;
    canonicalMimeSha256: string;
    deterministicMessageId: string;
    providerTimestamp: string;
  },
  deps: { store: OutboundSendStore },
): Promise<OutboundSendReceipt> {
  if (!UUID.test(input.organizationId)) fail("OUTBOUND_RECEIPT_INVALID");
  return await deps.store.captureReceipt({
    authorizationId: input.authorizationId,
    gmailMessageId: input.gmailMessageId,
    gmailThreadId: input.gmailThreadId,
    canonicalMimeSha256: input.canonicalMimeSha256,
    deterministicMessageId: input.deterministicMessageId,
    providerTimestamp: input.providerTimestamp,
  });
}

function unfoldedHeader(raw: string, name: string): string | null {
  const lines = raw.split(/\r?\n/);
  const prefix = `${name.toLowerCase()}:`;
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].toLowerCase().startsWith(prefix)) continue;
    const values = [lines[index].slice(prefix.length).trim()];
    while (index + 1 < lines.length && /^[ \t]/.test(lines[index + 1])) {
      values.push(lines[++index].trim());
    }
    return values.join(" ");
  }
  return null;
}

async function bytesSha256(bytes: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)].map((value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}

export async function captureInboundGmailEvent(
  input: {
    organizationId: string;
    jobId: string;
    leaseToken: string;
    gmailMessageId: string;
    gmailThreadId: string;
    receivedAt: string;
    rawMime: Uint8Array;
  },
  deps: { store: Pick<OutboundSendStore, "captureInboundGmailEvent"> },
): Promise<InboundGmailEventResult | { outcome: "not_outbound" }> {
  if (
    !input || !UUID.test(input.organizationId) || !UUID.test(input.jobId) ||
    !UUID.test(input.leaseToken) || !GMAIL_ID.test(input.gmailMessageId) ||
    !GMAIL_ID.test(input.gmailThreadId) ||
    !(input.rawMime instanceof Uint8Array) || input.rawMime.byteLength < 1 ||
    input.rawMime.byteLength > 10 * 1024 * 1024
  ) fail("OUTBOUND_RECEIPT_INVALID");
  let raw: string;
  let parsed: Awaited<ReturnType<PostalMime["parse"]>>;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(input.rawMime);
    parsed = await new PostalMime().parse(input.rawMime);
  } catch {
    fail("OUTBOUND_RECEIPT_INVALID");
  }
  const from = parsed.from?.address?.trim().toLowerCase() ?? "";
  const to = Array.isArray(parsed.to)
    ? parsed.to.map((mailbox) => mailbox.address?.trim().toLowerCase() ?? "")
    : [];
  const messageId = unfoldedHeader(raw, "message-id");
  const inReplyTo = unfoldedHeader(raw, "in-reply-to");
  let eventKind: "outbound_receipt" | "supplier_response";
  let deterministicMessageId: string;
  if (
    from === "carriers@xbfreight.com" && messageId &&
    DETERMINISTIC_MESSAGE_ID.test(messageId)
  ) {
    eventKind = "outbound_receipt";
    deterministicMessageId = messageId;
  } else if (
    from.length > 0 && !from.endsWith("@xbfreight.com") &&
    to.includes("carriers@xbfreight.com") && inReplyTo &&
    DETERMINISTIC_MESSAGE_ID.test(inReplyTo)
  ) {
    eventKind = "supplier_response";
    deterministicMessageId = inReplyTo;
  } else {
    return Object.freeze({ outcome: "not_outbound" as const });
  }
  return await deps.store.captureInboundGmailEvent({
    organizationId: input.organizationId,
    jobId: input.jobId,
    leaseToken: input.leaseToken,
    gmailMessageId: input.gmailMessageId,
    gmailThreadId: input.gmailThreadId,
    sourceSha256: await bytesSha256(input.rawMime),
    deterministicMessageId,
    eventKind,
    providerTimestamp: new Date(input.receivedAt).toISOString(),
  });
}
import postgres from "postgres";

import {
  type SqlPort,
  withOrganizationTransaction,
  withWorkerTransaction,
} from "../_shared/osp/database-context.ts";
