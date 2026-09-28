// Sending through the organization's connected Gmail mailbox, for functions
// other than rateware-api. Copies rateware-api's token format (AES-GCM "v1:"),
// mailbox selection (owner_email + GMAIL_ALLOWED_SENDER + connected) and MIME
// shape, so every function sends as the same mailbox with the same tokens.
//
// One deliberate difference: a failed token refresh only marks the shared
// connection as "error" when Google says the grant is gone (invalid_grant). A
// transient failure must not stop every other sender that shares the mailbox.

type Db = { from: (table: string) => any };

export const GMAIL_ALLOWED_SENDER = (Deno.env.get("GMAIL_ALLOWED_SENDER") || "sales@heymarksman.com").trim().toLowerCase();

const BLOCKED_EMAIL_STATUSES = ["hard_bounce", "complaint", "unsubscribed", "manual"];

export class GmailSendError extends Error {
  /** "failed" = Google rejected it; "delivery_unknown" = it may have been sent. */
  outcome: "failed" | "delivery_unknown";
  status: number | null;
  constructor(message: string, outcome: "failed" | "delivery_unknown", status: number | null = null) {
    super(message);
    this.outcome = outcome;
    this.status = status;
  }
}

function text(value: unknown) {
  const cleaned = value === null || value === undefined ? "" : String(value).trim();
  return cleaned || null;
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesToBase64Url(bytes: Uint8Array) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function gmailCryptoKey(usages: KeyUsage[]) {
  const secret = Deno.env.get("GMAIL_TOKEN_ENCRYPTION_KEY");
  if (!secret) throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, usages);
}

async function encryptGmailToken(value: string) {
  const key = await gmailCryptoKey(["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ciphertext))}`;
}

async function decryptGmailToken(value: unknown) {
  const token = text(value);
  if (!token) throw new Error("Gmail token is missing.");
  const [version, ivText, ciphertextText] = token.split(":");
  if (version !== "v1" || !ivText || !ciphertextText) throw new Error("Gmail token format is invalid.");
  const key = await gmailCryptoKey(["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(ivText) }, key, base64ToBytes(ciphertextText));
  return new TextDecoder().decode(plain);
}

/** A fresh access token for the organization's connected sender mailbox. */
export async function gmailAccessToken(supabase: Db, ownerEmail: string) {
  const result = await supabase.from("gmail_mailbox_connections").select("*")
    .eq("owner_email", ownerEmail)
    .eq("mailbox_email", GMAIL_ALLOWED_SENDER)
    .eq("status", "connected")
    .maybeSingle();
  if (result.error) throw result.error;
  const connection = result.data as Record<string, unknown> | null;
  if (!connection) throw new Error(`Conecta ${GMAIL_ALLOWED_SENDER} en Integraciones antes de enviar correos.`);
  const scopes = Array.isArray(connection.scopes) ? connection.scopes.map(String) : [];
  if (!scopes.includes("https://www.googleapis.com/auth/gmail.send")) {
    throw new Error(`${GMAIL_ALLOWED_SENDER} está conectado sin permiso para enviar correos.`);
  }

  const expiresAt = connection.token_expires_at ? new Date(String(connection.token_expires_at)).getTime() : 0;
  if (connection.access_token_encrypted && expiresAt > Date.now() + 120_000) {
    return await decryptGmailToken(connection.access_token_encrypted);
  }

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Google OAuth client is not configured.");
  const refreshToken = await decryptGmailToken(connection.refresh_token_encrypted);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" })
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || !data.access_token) {
    const message = text(data.error_description) || text(data.error) || "Google token refresh failed.";
    if (data.error === "invalid_grant") {
      await supabase.from("gmail_mailbox_connections")
        .update({ status: "error", last_error: message, updated_at: new Date().toISOString() })
        .eq("owner_email", ownerEmail)
        .eq("mailbox_email", GMAIL_ALLOWED_SENDER);
    }
    throw new Error(message);
  }
  const accessToken = String(data.access_token);
  const expiresIn = Number(data.expires_in) || 3600;
  const update = await supabase.from("gmail_mailbox_connections").update({
    access_token_encrypted: await encryptGmailToken(accessToken),
    token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    last_error: null,
    updated_at: new Date().toISOString()
  }).eq("owner_email", ownerEmail).eq("mailbox_email", GMAIL_ALLOWED_SENDER);
  if (update.error) throw update.error;
  return accessToken;
}

/** Recipients on the organization's bounce / complaint / unsubscribe list. */
export async function suppressedEmails(supabase: Db, ownerEmail: string, emails: string[]) {
  const clean = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (!clean.length) return new Set<string>();
  const result = await supabase.from("email_suppression_list").select("email")
    .eq("owner_email", ownerEmail)
    .in("email", clean)
    .is("resolved_at", null)
    .in("status", BLOCKED_EMAIL_STATUSES);
  if (result.error) throw result.error;
  return new Set(((result.data || []) as Record<string, unknown>[]).map((row) => String(row.email).toLowerCase()));
}

function safeHeader(value: unknown) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function encodedHeader(value: string) {
  return `=?UTF-8?B?${bytesToBase64(new TextEncoder().encode(value))}?=`;
}

export interface GmailMessage {
  to: string;
  cc?: string[];
  from: string;
  fromName?: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

/** RFC 2822 multipart/alternative message, base64url-encoded for Gmail. */
export function gmailRawMessage(message: GmailMessage) {
  const boundary = `quotedesk_${crypto.randomUUID().replace(/-/g, "")}`;
  const from = message.fromName ? `${encodedHeader(message.fromName)} <${safeHeader(message.from)}>` : safeHeader(message.from);
  const extra = Object.entries(message.headers || {}).map(([name, value]) => `${safeHeader(name)}: ${safeHeader(value)}`);
  const mime = [
    `To: ${safeHeader(message.to)}`,
    ...(message.cc?.length ? [`Cc: ${message.cc.map(safeHeader).join(", ")}`] : []),
    `From: ${from}`,
    `Reply-To: ${safeHeader(message.from)}`,
    `Subject: ${encodedHeader(message.subject)}`,
    ...extra,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    message.text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    message.html,
    "",
    `--${boundary}--`
  ].join("\r\n");
  return bytesToBase64Url(new TextEncoder().encode(mime));
}

/** Sends a raw message; classifies failures as definitely failed or possibly sent. */
export async function sendGmailRaw(accessToken: string, raw: string) {
  let response: Response;
  try {
    response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw })
    });
  } catch (error) {
    throw new GmailSendError(`Gmail no respondió: ${error instanceof Error ? error.message : String(error)}`, "delivery_unknown");
  }
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const detail = text((data.error as Record<string, unknown> | undefined)?.message) || `HTTP ${response.status}`;
    const uncertain = response.status === 408 || response.status === 429 || response.status >= 500;
    throw new GmailSendError(`Gmail rechazó el envío: ${detail}`, uncertain ? "delivery_unknown" : "failed", response.status);
  }
  const id = text(data.id);
  if (!id) throw new GmailSendError("Gmail no devolvió el id del mensaje.", "delivery_unknown", response.status);
  return { id, threadId: text(data.threadId) };
}
