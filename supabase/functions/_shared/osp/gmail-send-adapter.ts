import type {
  GmailSendPort,
  GmailSendRequest,
  GmailSendResult,
} from "./gmail-send-port.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const OPAQUE = /^[A-Za-z0-9:_-]{1,256}$/;
const GMAIL_ID = /^[A-Za-z0-9_-]{1,256}$/;
const EXPECTED_MAILBOX = "carriers@xbfreight.com";
const MAX_MIME_BYTES = 26_214_400;

export class AmbiguousSendError extends Error {
  constructor() {
    super("GMAIL_SEND_OUTCOME_AMBIGUOUS");
    this.name = "AmbiguousSendError";
  }
}

export class KnownPreAcceptanceSendError extends Error {
  constructor(code = "GMAIL_SEND_REFUSED") {
    super(code);
    this.name = "KnownPreAcceptanceSendError";
  }
}

export interface FrozenMimeObjectReader {
  read(input: { objectId: string }): Promise<Uint8Array | null>;
}

type AdapterOptions = {
  accessToken(signal?: AbortSignal): Promise<string>;
  fetch: typeof globalThis.fetch;
  mimeObjects: FrozenMimeObjectReader;
};

function invalid(code: string): never {
  throw new Error(code);
}

function token(value: string): string {
  if (!value || value.trim() !== value || /[\r\n]/.test(value)) {
    invalid("GMAIL_AUTH_UNAVAILABLE");
  }
  return value;
}

async function json(response: Response): Promise<Record<string, unknown>> {
  if (
    response.redirected || response.type === "opaqueredirect" ||
    !response.headers.get("content-type")?.toLowerCase().startsWith(
      "application/json",
    )
  ) invalid("GMAIL_RESPONSE_INVALID");
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    invalid("GMAIL_RESPONSE_INVALID");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("GMAIL_RESPONSE_INVALID");
  }
  return value as Record<string, unknown>;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)].map((value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(
    /=+$/,
    "",
  );
}

function assertRequest(value: GmailSendRequest): void {
  if (
    !value || !UUID.test(value.authorizationId) ||
    !OPAQUE.test(value.mimeObjectId) || !SHA.test(value.expectedMimeSha256) ||
    value.expectedMailbox !== EXPECTED_MAILBOX ||
    (value.threadId !== null && !GMAIL_ID.test(value.threadId)) ||
    Object.keys(value).sort().join(",") !==
      "authorizationId,expectedMailbox,expectedMimeSha256,mimeObjectId,threadId"
  ) invalid("GMAIL_SEND_REQUEST_INVALID");
}

function assertFrozenHeaders(bytes: Uint8Array): void {
  let mime: string;
  try {
    mime = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    invalid("GMAIL_MIME_MISMATCH");
  }
  const head = mime.split("\r\n\r\n", 1)[0];
  const from = head.match(/^From: ([^\r\n]+)$/gm) ?? [];
  const messageIds = head.match(
    new RegExp(
      "^Message-ID: <osp-[0-9a-f-]+@" + "xbfreight\\.com>$",
      "gm",
    ),
  ) ?? [];
  if (
    from.length !== 1 || from[0] !== `From: ${EXPECTED_MAILBOX}` ||
    messageIds.length !== 1
  ) invalid("GMAIL_MIME_MISMATCH");
}

export async function createGmailSendAdapter(
  options: AdapterOptions,
): Promise<GmailSendPort> {
  if (
    !options || typeof options.accessToken !== "function" ||
    typeof options.fetch !== "function" ||
    typeof options.mimeObjects?.read !== "function"
  ) invalid("INVALID_RUNTIME_CONFIGURATION");
  const profileSignal = AbortSignal.timeout(5_000);
  const profileToken = token(await options.accessToken(profileSignal));
  let profileResponse: Response;
  try {
    profileResponse = await options.fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      {
        method: "GET",
        redirect: "error",
        headers: { Authorization: `Bearer ${profileToken}` },
        signal: profileSignal,
      },
    );
  } catch {
    invalid("GMAIL_PROFILE_UNAVAILABLE");
  }
  if (!profileResponse.ok) invalid("GMAIL_PROFILE_UNAVAILABLE");
  const profile = await json(profileResponse);
  if (
    typeof profile.emailAddress !== "string" ||
    profile.emailAddress.trim().toLowerCase() !== EXPECTED_MAILBOX
  ) invalid("GMAIL_MAILBOX_MISMATCH");

  return Object.freeze({
    async sendFrozen(
      request: GmailSendRequest,
      signal: AbortSignal,
    ): Promise<GmailSendResult> {
      assertRequest(request);
      if (!(signal instanceof AbortSignal) || signal.aborted) {
        throw new AmbiguousSendError();
      }
      let stored: Uint8Array | null;
      try {
        stored = await options.mimeObjects.read({
          objectId: request.mimeObjectId,
        });
      } catch {
        invalid("GMAIL_MIME_UNAVAILABLE");
      }
      if (
        !(stored instanceof Uint8Array) || stored.byteLength < 1 ||
        stored.byteLength > MAX_MIME_BYTES
      ) {
        invalid("GMAIL_MIME_UNAVAILABLE");
      }
      const bytes = stored.slice();
      if (await sha256(bytes) !== request.expectedMimeSha256) {
        invalid("GMAIL_MIME_MISMATCH");
      }
      assertFrozenHeaders(bytes);
      const accessToken = token(await options.accessToken(signal));
      const body = request.threadId === null
        ? { raw: base64Url(bytes) }
        : { raw: base64Url(bytes), threadId: request.threadId };
      let response: Response;
      try {
        response = await options.fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
          {
            method: "POST",
            redirect: "error",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal,
          },
        );
      } catch {
        throw new AmbiguousSendError();
      }
      if (response.status === 429) throw new KnownPreAcceptanceSendError();
      if (response.status >= 500) throw new AmbiguousSendError();
      if (
        !response.ok || response.redirected ||
        response.type === "opaqueredirect"
      ) {
        throw new KnownPreAcceptanceSendError("GMAIL_SEND_REJECTED");
      }
      const value = await json(response);
      const date = response.headers.get("date");
      const acceptedAt = date ? new Date(date) : null;
      if (
        typeof value.id !== "string" || !GMAIL_ID.test(value.id) ||
        typeof value.threadId !== "string" || !GMAIL_ID.test(value.threadId) ||
        !acceptedAt || Number.isNaN(acceptedAt.getTime())
      ) throw new AmbiguousSendError();
      return Object.freeze({
        gmailMessageId: value.id,
        gmailThreadId: value.threadId,
        acceptedAt: acceptedAt.toISOString(),
      });
    },
  });
}
