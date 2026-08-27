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
const MAX_BODY_BYTES = 128;

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

type GmailAction =
  | "sync_provider_gmail_inbox"
  | "renew_provider_gmail_watch";

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

async function strictRequestBody(request: Request): Promise<GmailAction> {
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
    Object.keys(body).sort().join(",") !== "action,version" ||
    body.version !== 1 ||
    ![
      "sync_provider_gmail_inbox",
      "renew_provider_gmail_watch",
    ].includes(String(body.action))
  ) {
    throw new OspApiError("INVALID_REQUEST");
  }
  return body.action as GmailAction;
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

export function createOspGmailSyncHandler({
  verifyToken,
  resolveWorkspace,
  syncInbox,
  renewWatch,
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
      const action = await strictRequestBody(request);
      const organizationId = await resolveWorkspace(identity, request.signal);
      if (action === "renew_provider_gmail_watch") {
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
