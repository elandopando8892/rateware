import type { OspAuthorizationIdentity } from "../osp-read-api/auth-policy.ts";
import {
  jsonResponse,
  OspApiError,
  postCorsHeaders,
  safeErrorResponse,
} from "../osp-read-api/http.ts";

const ALLOWED_ORIGINS = new Set([
  "https://osp.heymarksman.com",
  "http://localhost:8791",
]);
const MAX_BODY_BYTES = 1_024;

export type GmailSyncReceipt = Readonly<{
  discovered: number;
  insertedMessages: number;
  duplicates: number;
  attachmentMetadataRows: number;
  ospEnqueued: number;
  ospProcessed: number;
}>;

export type GmailWatchReceipt = Readonly<{
  watchExpiresAt: string;
}>;

export type HistoricalGmailPreviewReceipt = Readonly<{
  query: string;
  candidates: readonly Readonly<{
    candidateId: string;
    subject: string;
    senderDomain: string;
    receivedAt: string;
    attachmentCount: number;
    duplicateState: "ready" | "already_imported";
  }>[];
}>;

export type HistoricalGmailImportReceipt = Readonly<{
  candidateId: string;
  claimId: string;
  importStatus: "imported" | "replayed";
  attachmentMetadataRows: number;
  ospEnqueued: number;
  ospProcessed: number;
}>;

type GmailAction =
  | "sync_provider_gmail_inbox"
  | "renew_provider_gmail_watch"
  | "preview_historical_provider_gmail"
  | "import_historical_provider_gmail";

type GmailRequestBody = Readonly<{
  action: GmailAction;
  historicalCriteria?: Readonly<{
    subjectPhrase: string;
    afterDate: string;
    beforeDate: string;
  }>;
  candidateId?: string;
  idempotencyKey?: string;
}>;

export type OspGmailSyncHandlerOptions = {
  verifyToken(
    token: string,
    signal?: AbortSignal,
  ): Promise<OspAuthorizationIdentity>;
  resolveWorkspace(
    identity: OspAuthorizationIdentity,
    signal?: AbortSignal,
  ): Promise<string>;
  syncInbox(
    organizationId: string,
    signal?: AbortSignal,
  ): Promise<GmailSyncReceipt>;
  renewWatch(
    organizationId: string,
    signal?: AbortSignal,
  ): Promise<GmailWatchReceipt>;
  previewHistoricalInbox(
    organizationId: string,
    criteria: NonNullable<GmailRequestBody["historicalCriteria"]>,
    signal?: AbortSignal,
  ): Promise<HistoricalGmailPreviewReceipt>;
  importHistoricalInbox(
    organizationId: string,
    identity: OspAuthorizationIdentity,
    input: Readonly<{
      criteria: NonNullable<GmailRequestBody["historicalCriteria"]>;
      candidateId: string;
      idempotencyKey: string;
    }>,
    signal?: AbortSignal,
  ): Promise<HistoricalGmailImportReceipt>;
  incidentId?: () => string;
};

function allowedOrigin(request: Request): string {
  const origin = request.headers.get("origin")?.trim() ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) throw new OspApiError("FORBIDDEN");
  return origin;
}

function bearer(request: Request): string {
  const match = request.headers.get("authorization")?.match(
    /^Bearer ([^\s]+)$/,
  );
  if (!match) throw new OspApiError("UNAUTHORIZED");
  return match[1];
}

async function strictRequestBody(request: Request): Promise<GmailRequestBody> {
  if (request.headers.get("transfer-encoding")) {
    throw new OspApiError("INVALID_REQUEST");
  }
  const encoding = request.headers.get("content-encoding");
  if (encoding && encoding.trim().toLowerCase() !== "identity") {
    throw new OspApiError("INVALID_REQUEST");
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]
    .trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new OspApiError("UNSUPPORTED_MEDIA_TYPE");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new OspApiError("CONTENT_TOO_LARGE");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new OspApiError("INVALID_REQUEST");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new OspApiError("INVALID_REQUEST");
  }
  const body = parsed as Record<string, unknown>;
  if (
    body.version !== 1 || ![
      "sync_provider_gmail_inbox",
      "renew_provider_gmail_watch",
      "preview_historical_provider_gmail",
      "import_historical_provider_gmail",
    ].includes(String(body.action))
  ) {
    throw new OspApiError("INVALID_REQUEST");
  }
  const action = body.action as GmailAction;
  if (
    action !== "preview_historical_provider_gmail" &&
    action !== "import_historical_provider_gmail"
  ) {
    if (Object.keys(body).sort().join(",") !== "action,version") {
      throw new OspApiError("INVALID_REQUEST");
    }
    return { action };
  }
  const expectedKeys = action === "preview_historical_provider_gmail"
    ? "action,after_date,before_date,subject_phrase,version"
    : "action,after_date,before_date,candidate_id,confirmation,idempotency_key,subject_phrase,version";
  if (Object.keys(body).sort().join(",") !== expectedKeys) {
    throw new OspApiError("INVALID_REQUEST");
  }
  const subjectPhrase = typeof body.subject_phrase === "string"
    ? body.subject_phrase
    : "";
  const afterDate = typeof body.after_date === "string" ? body.after_date : "";
  const beforeDate = typeof body.before_date === "string"
    ? body.before_date
    : "";
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (
    subjectPhrase.trim() !== subjectPhrase || subjectPhrase.length < 3 ||
    subjectPhrase.length > 200 ||
    /[\u0000-\u001f\u007f"\\]/.test(subjectPhrase) ||
    !datePattern.test(afterDate) || !datePattern.test(beforeDate)
  ) throw new OspApiError("INVALID_REQUEST");
  const historicalCriteria = { subjectPhrase, afterDate, beforeDate };
  if (action === "preview_historical_provider_gmail") {
    return { action, historicalCriteria };
  }
  const candidateId = typeof body.candidate_id === "string"
    ? body.candidate_id
    : "";
  const idempotencyKey = typeof body.idempotency_key === "string"
    ? body.idempotency_key
    : "";
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(candidateId) ||
    !/^[A-Za-z0-9:_-]{1,256}$/.test(idempotencyKey) ||
    body.confirmation !== "IMPORT_EXACT_HISTORICAL_CUSTOMER_SETUP"
  ) throw new OspApiError("INVALID_REQUEST");
  return { action, historicalCriteria, candidateId, idempotencyKey };
}

function preflight(request: Request): Response {
  const origin = allowedOrigin(request);
  if (request.headers.get("access-control-request-method") !== "POST") {
    throw new OspApiError("INVALID_REQUEST");
  }
  const requestedHeaders = request.headers.get("access-control-request-headers")
    ?.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean)
    .sort() ?? [];
  if (requestedHeaders.join(",") !== "authorization,content-type") {
    throw new OspApiError("INVALID_REQUEST");
  }
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-max-age": "600",
      vary:
        "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
    },
  });
}

function safeReceipt(receipt: GmailSyncReceipt): GmailSyncReceipt {
  for (const value of Object.values(receipt)) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 100_000) {
      throw new OspApiError("DEPENDENCY_UNAVAILABLE");
    }
  }
  return receipt;
}

function safeWatchReceipt(receipt: GmailWatchReceipt): GmailWatchReceipt {
  if (!receipt || typeof receipt !== "object") {
    throw new OspApiError("DEPENDENCY_UNAVAILABLE");
  }
  const expiration = new Date(receipt.watchExpiresAt);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
      receipt.watchExpiresAt,
    ) || !Number.isFinite(expiration.getTime()) ||
    expiration.toISOString() !== receipt.watchExpiresAt
  ) {
    throw new OspApiError("DEPENDENCY_UNAVAILABLE");
  }
  return receipt;
}

function safeHistoricalReceipt(
  receipt: HistoricalGmailPreviewReceipt,
): HistoricalGmailPreviewReceipt {
  if (
    !receipt || typeof receipt !== "object" ||
    typeof receipt.query !== "string" ||
    receipt.query.length < 1 || receipt.query.length > 512 ||
    !Array.isArray(receipt.candidates) || receipt.candidates.length > 25
  ) throw new OspApiError("DEPENDENCY_UNAVAILABLE");
  for (const candidate of receipt.candidates) {
    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(candidate.candidateId) ||
      candidate.subject.length < 1 || candidate.subject.length > 998 ||
      !/^[a-z0-9.-]{1,253}$/.test(candidate.senderDomain) ||
      !Number.isSafeInteger(candidate.attachmentCount) ||
      candidate.attachmentCount < 0 ||
      candidate.attachmentCount > 100 ||
      !["ready", "already_imported"].includes(candidate.duplicateState) ||
      new Date(candidate.receivedAt).toISOString() !== candidate.receivedAt
    ) throw new OspApiError("DEPENDENCY_UNAVAILABLE");
  }
  return receipt;
}

function safeHistoricalImportReceipt(
  receipt: HistoricalGmailImportReceipt,
): HistoricalGmailImportReceipt {
  if (
    !receipt || typeof receipt !== "object" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(receipt.candidateId) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt.claimId) ||
    !["imported", "replayed"].includes(receipt.importStatus)
  ) throw new OspApiError("DEPENDENCY_UNAVAILABLE");
  for (const value of [
    receipt.attachmentMetadataRows,
    receipt.ospEnqueued,
    receipt.ospProcessed,
  ]) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 100) {
      throw new OspApiError("DEPENDENCY_UNAVAILABLE");
    }
  }
  return receipt;
}

export function createOspGmailSyncHandler({
  verifyToken,
  resolveWorkspace,
  syncInbox,
  renewWatch,
  previewHistoricalInbox,
  importHistoricalInbox,
  incidentId = () => crypto.randomUUID(),
}: OspGmailSyncHandlerOptions): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const requestOrigin = request.headers.get("origin")?.trim();
    const cors = requestOrigin && ALLOWED_ORIGINS.has(requestOrigin)
      ? postCorsHeaders(requestOrigin)
      : {};
    try {
      if (request.method === "OPTIONS") return preflight(request);
      if (request.method !== "POST") {
        throw new OspApiError("METHOD_NOT_ALLOWED");
      }
      const origin = allowedOrigin(request);
      const identity = await verifyToken(bearer(request), request.signal);
      const body = await strictRequestBody(request);
      const organizationId = await resolveWorkspace(identity, request.signal);
      if (body.action === "import_historical_provider_gmail") {
        if (identity.email !== "sales@heymarksman.com") {
          throw new OspApiError("FORBIDDEN");
        }
        let receipt: HistoricalGmailImportReceipt;
        try {
          receipt = safeHistoricalImportReceipt(
            await importHistoricalInbox(
              organizationId,
              identity,
              {
                criteria: body.historicalCriteria!,
                candidateId: body.candidateId!,
                idempotencyKey: body.idempotencyKey!,
              },
              request.signal,
            ),
          );
        } catch (error) {
          if (error instanceof OspApiError) throw error;
          throw new OspApiError("DEPENDENCY_UNAVAILABLE");
        }
        return jsonResponse(
          {
            version: 1,
            data: {
              candidate_id: receipt.candidateId,
              claim_id: receipt.claimId,
              import_status: receipt.importStatus,
              attachment_metadata_rows: receipt.attachmentMetadataRows,
              osp_enqueued: receipt.ospEnqueued,
              osp_processed: receipt.ospProcessed,
              checkpoint_unchanged: true,
              source_preserved: true,
              persisted: true,
              outbound_enabled: false,
            },
          },
          200,
          postCorsHeaders(origin),
        );
      }
      if (body.action === "preview_historical_provider_gmail") {
        let receipt: HistoricalGmailPreviewReceipt;
        try {
          receipt = safeHistoricalReceipt(
            await previewHistoricalInbox(
              organizationId,
              body.historicalCriteria!,
              request.signal,
            ),
          );
        } catch (error) {
          if (error instanceof OspApiError) throw error;
          throw new OspApiError("DEPENDENCY_UNAVAILABLE");
        }
        return jsonResponse(
          {
            version: 1,
            data: {
              query: receipt.query,
              candidates: receipt.candidates.map((candidate) => ({
                candidate_id: candidate.candidateId,
                subject: candidate.subject,
                sender_domain: candidate.senderDomain,
                received_at: candidate.receivedAt,
                attachment_count: candidate.attachmentCount,
                duplicate_state: candidate.duplicateState,
              })),
              checkpoint_unchanged: true,
              persisted: false,
              outbound_enabled: false,
            },
          },
          200,
          postCorsHeaders(origin),
        );
      }
      if (body.action === "renew_provider_gmail_watch") {
        let receipt: GmailWatchReceipt;
        try {
          receipt = safeWatchReceipt(
            await renewWatch(organizationId, request.signal),
          );
        } catch (error) {
          if (error instanceof OspApiError) throw error;
          throw new OspApiError("DEPENDENCY_UNAVAILABLE");
        }
        return jsonResponse(
          {
            version: 1,
            data: {
              watch_configured: true,
              watch_expires_at: receipt.watchExpiresAt,
              outbound_enabled: false,
            },
          },
          200,
          postCorsHeaders(origin),
        );
      }
      let receipt: GmailSyncReceipt;
      try {
        receipt = safeReceipt(await syncInbox(organizationId, request.signal));
      } catch (error) {
        if (error instanceof OspApiError) throw error;
        throw new OspApiError("DEPENDENCY_UNAVAILABLE");
      }
      return jsonResponse(
        {
          version: 1,
          data: {
            discovered: receipt.discovered,
            inserted_messages: receipt.insertedMessages,
            duplicates: receipt.duplicates,
            attachment_metadata_rows: receipt.attachmentMetadataRows,
            osp_enqueued: receipt.ospEnqueued,
            osp_processed: receipt.ospProcessed,
            outbound_enabled: false,
          },
        },
        200,
        postCorsHeaders(origin),
      );
    } catch (error) {
      return safeErrorResponse(error, incidentId(), cors);
    }
  };
}
