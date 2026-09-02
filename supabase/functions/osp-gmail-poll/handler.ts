export type ScheduledGmailPollReceipt = Readonly<{
  discovered: number;
  insertedMessages: number;
  duplicates: number;
  attachmentMetadataRows: number;
  ospEnqueued: number;
  ospProcessed: number;
}>;

export type ScheduledGmailPollFailureCode =
  | "POLL_DEPENDENCY_UNAVAILABLE"
  | "POLL_GMAIL_CONNECTION_UNAVAILABLE"
  | "POLL_TOKEN_DECRYPT_FAILED"
  | "POLL_REFRESH_TOKEN_MISSING"
  | "POLL_OAUTH_CLIENT_MISSING"
  | "POLL_TOKEN_REFRESH_REJECTED"
  | "POLL_ACCESS_TOKEN_UNAVAILABLE"
  | "POLL_SCOPE_INVALID"
  | "POLL_GMAIL_SYNC_UNAVAILABLE"
  | "POLL_WORKER_UNAVAILABLE";

export class ScheduledGmailPollDependencyError extends Error {
  constructor(readonly code: ScheduledGmailPollFailureCode) {
    super(code);
    this.name = "ScheduledGmailPollDependencyError";
  }
}

export function classifyScheduledGmailPollFailure(
  error: unknown,
): ScheduledGmailPollFailureCode {
  if (error instanceof ScheduledGmailPollDependencyError) return error.code;
  const message = error instanceof Error
    ? `${error.name} ${error.message}`
    : "";
  if (
    /unsupported gmail token envelope|operationerror|decrypt|cipher/i.test(
      message,
    )
  ) return "POLL_TOKEN_DECRYPT_FAILED";
  if (/refresh token is unavailable/i.test(message)) {
    return "POLL_REFRESH_TOKEN_MISSING";
  }
  if (/oauth client is not configured/i.test(message)) {
    return "POLL_OAUTH_CLIENT_MISSING";
  }
  if (
    /invalid_grant|expired or revoked|token refresh|refresh token.*(?:failed|rejected)|bad request/i
      .test(message)
  ) {
    return "POLL_TOKEN_REFRESH_REJECTED";
  }
  if (/access token/i.test(message)) return "POLL_ACCESS_TOKEN_UNAVAILABLE";
  if (/scope/i.test(message)) return "POLL_SCOPE_INVALID";
  if (/gmail/i.test(message)) return "POLL_GMAIL_SYNC_UNAVAILABLE";
  return "POLL_DEPENDENCY_UNAVAILABLE";
}

export type ScheduledGmailPollHandlerOptions = Readonly<{
  expectedToken: string;
  drain?(): Promise<Readonly<{ enqueued: number; processed: number }>>;
  runSupplierPackageCanary?(
    input: SupplierPackageCanaryRequest,
  ): Promise<Readonly<{ processed: 1 }>>;
  claim(): Promise<
    | Readonly<{ status: "claimed"; leaseId: string }>
    | Readonly<{ status: "disabled" | "busy" }>
  >;
  poll(): Promise<ScheduledGmailPollReceipt>;
  complete(receipt: ScheduledGmailPollReceipt, leaseId: string): Promise<void>;
  fail(code: ScheduledGmailPollFailureCode, leaseId: string): Promise<void>;
  incidentId?: () => string;
}>;

const MAX_BODY_BYTES = 512;
const NO_STORE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  pragma: "no-cache",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: NO_STORE_HEADERS,
  });
}

function exactToken(actual: string, expected: string): boolean {
  const left = new TextEncoder().encode(actual);
  const right = new TextEncoder().encode(expected);
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return mismatch === 0;
}

type SupplierPackageCanaryRequest = Readonly<{
  organizationId: string;
  caseId: string;
  snapshotId: string;
  snapshotSha256: string;
}>;

type ScheduledRequest =
  | Readonly<
    { action: "poll_connected_provider_mailbox" | "drain_queued_osp_jobs" }
  >
  | (
    & Readonly<{ action: "run_supplier_package_canary" }>
    & SupplierPackageCanaryRequest
  );

async function strictBody(request: Request): Promise<ScheduledRequest> {
  if (request.headers.get("transfer-encoding")) {
    throw new Error("INVALID_REQUEST");
  }
  const encoding = request.headers.get("content-encoding");
  if (encoding && encoding.trim().toLowerCase() !== "identity") {
    throw new Error("INVALID_REQUEST");
  }
  if (
    request.headers.get("content-type")?.split(";", 1)[0].trim()
      .toLowerCase() !== "application/json"
  ) {
    throw new Error("INVALID_REQUEST");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new Error("INVALID_REQUEST");
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("INVALID_REQUEST");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("INVALID_REQUEST");
  }
  const record = body as Record<string, unknown>;
  if (record.version !== 1) throw new Error("INVALID_REQUEST");
  if (record.action === "run_supplier_package_canary") {
    if (
      Object.keys(record).sort().join(",") !==
        "action,caseId,organizationId,snapshotId,snapshotSha256,version" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(String(record.organizationId)) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(String(record.caseId)) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(String(record.snapshotId)) ||
      !/^[0-9a-f]{64}$/.test(String(record.snapshotSha256))
    ) throw new Error("INVALID_REQUEST");
    return {
      action: record.action,
      organizationId: String(record.organizationId),
      caseId: String(record.caseId),
      snapshotId: String(record.snapshotId),
      snapshotSha256: String(record.snapshotSha256),
    };
  }
  if (
    Object.keys(record).sort().join(",") !== "action,version" ||
    !["poll_connected_provider_mailbox", "drain_queued_osp_jobs"].includes(
      String(record.action),
    )
  ) throw new Error("INVALID_REQUEST");
  return {
    action: record.action as
      | "poll_connected_provider_mailbox"
      | "drain_queued_osp_jobs",
  };
}

function safeReceipt(
  receipt: ScheduledGmailPollReceipt,
): ScheduledGmailPollReceipt {
  for (const value of Object.values(receipt)) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 100_000) {
      throw new Error("INVALID_RECEIPT");
    }
  }
  return receipt;
}

export function createScheduledGmailPollHandler(
  options: ScheduledGmailPollHandlerOptions,
) {
  const incidentId = options.incidentId ?? (() => crypto.randomUUID());
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method !== "POST") {
        return json({
          error: { code: "METHOD_NOT_ALLOWED", incident_id: incidentId() },
        }, 405);
      }
      const match = request.headers.get("authorization")?.match(
        /^Bearer ([^\s]+)$/,
      );
      if (!match || !exactToken(match[1], options.expectedToken)) {
        return json({
          error: { code: "UNAUTHORIZED", incident_id: incidentId() },
        }, 401);
      }
      const action = await strictBody(request);
      if (action.action === "run_supplier_package_canary") {
        if (!options.runSupplierPackageCanary) {
          return json({
            error: {
              code: "DEPENDENCY_UNAVAILABLE",
              incident_id: incidentId(),
            },
          }, 503);
        }
        try {
          const result = await options.runSupplierPackageCanary(action);
          if (result.processed !== 1) throw new Error("INVALID_RECEIPT");
          return json({
            version: 1,
            data: {
              status: "completed",
              processed: 1,
              outbound_enabled: false,
            },
          }, 200);
        } catch {
          return json({
            error: {
              code: "DEPENDENCY_UNAVAILABLE",
              incident_id: incidentId(),
            },
          }, 503);
        }
      }
      if (action.action === "drain_queued_osp_jobs") {
        if (!options.drain) {
          return json({
            error: {
              code: "DEPENDENCY_UNAVAILABLE",
              incident_id: incidentId(),
            },
          }, 503);
        }
        try {
          const drained = await options.drain();
          const receipt = safeReceipt({
            discovered: 0,
            insertedMessages: 0,
            duplicates: 0,
            attachmentMetadataRows: 0,
            ospEnqueued: drained.enqueued,
            ospProcessed: drained.processed,
          });
          return json({
            version: 1,
            data: {
              status: "completed",
              source_sync_performed: false,
              osp_enqueued: receipt.ospEnqueued,
              osp_processed: receipt.ospProcessed,
              outbound_enabled: false,
            },
          }, 200);
        } catch {
          return json({
            error: {
              code: "DEPENDENCY_UNAVAILABLE",
              incident_id: incidentId(),
            },
          }, 503);
        }
      }
      const claim = await options.claim();
      if (claim.status !== "claimed") {
        return json({
          version: 1,
          data: {
            status: "skipped",
            reason: claim.status,
            outbound_enabled: false,
          },
        }, 200);
      }
      try {
        const receipt = safeReceipt(await options.poll());
        await options.complete(receipt, claim.leaseId);
        return json({
          version: 1,
          data: {
            status: "completed",
            discovered: receipt.discovered,
            inserted_messages: receipt.insertedMessages,
            duplicates: receipt.duplicates,
            attachment_metadata_rows: receipt.attachmentMetadataRows,
            osp_enqueued: receipt.ospEnqueued,
            osp_processed: receipt.ospProcessed,
            outbound_enabled: false,
          },
        }, 200);
      } catch (error) {
        await options.fail(
          classifyScheduledGmailPollFailure(error),
          claim.leaseId,
        ).catch(() => undefined);
        return json({
          error: { code: "DEPENDENCY_UNAVAILABLE", incident_id: incidentId() },
        }, 503);
      }
    } catch {
      return json({
        error: { code: "INVALID_REQUEST", incident_id: incidentId() },
      }, 400);
    }
  };
}
