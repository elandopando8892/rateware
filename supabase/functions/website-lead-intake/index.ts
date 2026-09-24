import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deliverClaimedNotification, NotificationRejected, type NotificationClaim } from "./notification-workflow.ts";
import { createFollowUpToken, verifyFollowUpToken } from "./follow-up-token.ts";
import { normalizeCarrierRateSheet } from "./carrier-rate-sheet.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
const GMAIL_ALLOWED_SENDER = (Deno.env.get("GMAIL_ALLOWED_SENDER") || "sales@heymarksman.com").trim().toLowerCase();
const GMAIL_TOKEN_ENCRYPTION_KEY = (Deno.env.get("GMAIL_TOKEN_ENCRYPTION_KEY") || "").trim();
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const MAX_BODY_BYTES = 16 * 1024;
const MAX_RATE_SHEET_BODY_BYTES = 2_100_000;
const WEBSITE_INTAKE_PUBLIC_KEY = "MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAw7toUjkst+hWHoUsJJSc1rPgOdoh/9aIaZP9/6RVzse0ev8wcvEEZ6JaRDvZI07R0JaSf9L5Esc15kG9tfiYV8zqbGS8sbJ4lAvDKHw3xFHx0H8qm31EGmz8nBzBed/9cqM1BFf9mGPm3NKLFp6ZyMA3WtCHYmIXubXacaECxgLqICo5lJg2uTAnP2R+344jg13bJUnx/9zWiVnlqlk+39cPB4/kHSGztJ2he7cZHfkonVyzPwKNYcEHIcRDq6OKnMmmD0VCHLthhbll9XtXUmJnIyuAMKZWX7YfL3616uG0pu/vXa1X3GjxKTV+yQ0MutqWMyOjlPWi0bWDSC3rQwsbokYpFB0ic0O4yDetkENE9chnzeIDH55w54SxbmTSo3mKflni5+HogqNpU1fv9Vgw3ZerJ2+GlfIFQJTinrDHSRSdIHzI8H+ngfzfmKAv0t46JMerGNUqZeLkCK87JARcTP2JPf1HxAeyG2qJm7Ycs0W8Bd072OHHRC0XSq5xAgMBAAE=";

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Rateware service role is not configured.");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

type IntakeSupabase = ReturnType<typeof getClient>;
type Lead = Record<string, unknown>;

function text(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanEmail(value: unknown) {
  const email = text(value, 200).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return base64ToBytes(normalized);
}

async function signed(raw: string, signature: string) {
  const encoded = signature.replace(/^rsa-sha256=/i, "");
  if (!encoded || encoded === signature) return false;
  const key = await crypto.subtle.importKey(
    "spki",
    base64ToBytes(WEBSITE_INTAKE_PUBLIC_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlToBytes(encoded), new TextEncoder().encode(raw));
}

async function sha256(raw: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64(value: Uint8Array) {
  let output = "";
  for (const byte of value) output += String.fromCharCode(byte);
  return btoa(output);
}

function bytesToBase64Url(value: Uint8Array) {
  return bytesToBase64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function tokenKey() {
  if (!GMAIL_TOKEN_ENCRYPTION_KEY) throw new Error("Gmail token encryption is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(GMAIL_TOKEN_ENCRYPTION_KEY));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt", "encrypt"]);
}

async function decryptToken(value: unknown) {
  const [version, ivText, ciphertextText] = text(value, 12000).split(":");
  if (version !== "v1" || !ivText || !ciphertextText) throw new Error("Gmail token format is invalid.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(ivText) }, await tokenKey(), base64ToBytes(ciphertextText));
  return new TextDecoder().decode(plain);
}

async function encryptToken(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await tokenKey(), new TextEncoder().encode(value));
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ciphertext))}`;
}

function safeHeader(value: unknown) {
  return text(value, 500).replace(/[\r\n]+/g, " ");
}

function encodedSubject(value: unknown) {
  const subject = safeHeader(value);
  return /^[\x00-\x7F]*$/.test(subject) ? subject : `=?UTF-8?B?${bytesToBase64(new TextEncoder().encode(subject))}?=`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function rawEmail({ recipient, subject, plain, html }: { recipient: string; subject: string; plain: string; html: string }) {
  const boundary = `rateware_${crypto.randomUUID().replace(/-/g, "")}`;
  const message = [
    `To: ${safeHeader(recipient)}`,
    `From: ${safeHeader(GMAIL_ALLOWED_SENDER)}`,
    `Subject: ${encodedSubject(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary=\"${boundary}\"`, "",
    `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", plain, "",
    `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", html, "",
    `--${boundary}--`
  ].join("\r\n");
  return bytesToBase64Url(new TextEncoder().encode(message));
}

async function gmailAccessToken(supabase: IntakeSupabase) {
  const result = await supabase.from("gmail_mailbox_connections")
    .select("*")
    .eq("mailbox_email", GMAIL_ALLOWED_SENDER)
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(2);
  if (result.error) throw result.error;
  if ((result.data || []).length !== 1) throw new Error("Exactly one connected commercial Gmail mailbox is required.");
  const connection = result.data[0];
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (connection.access_token_encrypted && expiresAt > Date.now() + 120_000) return { accessToken: await decryptToken(connection.access_token_encrypted), connection };
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error("Google OAuth client is not configured.");
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: await decryptToken(connection.refresh_token_encrypted), grant_type: "refresh_token" })
  });
  const tokenBody = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenBody.access_token) throw new Error("Commercial Gmail token refresh failed.");
  const accessToken = String(tokenBody.access_token);
  const update = await supabase.from("gmail_mailbox_connections").update({
    access_token_encrypted: await encryptToken(accessToken),
    token_expires_at: new Date(Date.now() + (Number(tokenBody.expires_in) || 3600) * 1000).toISOString(),
    last_error: null,
    updated_at: new Date().toISOString()
  }).eq("id", connection.id);
  if (update.error) throw update.error;
  return { accessToken, connection };
}

function recipientFor(site: string) {
  const configured: Record<string, string | undefined> = {
    marksman: Deno.env.get("WEBSITE_LEAD_RECIPIENT_MARKSMAN"),
    xbf: Deno.env.get("WEBSITE_LEAD_RECIPIENT_XBF"),
    holding: Deno.env.get("WEBSITE_LEAD_RECIPIENT_HOLDING")
  };
  return cleanEmail(configured[site]) || (site === "xbf" ? "sales@xbfreight.com" : GMAIL_ALLOWED_SENDER);
}

function normalizeLead(input: Lead) {
  const site = text(input.site, 32).toLowerCase();
  const source = text(input.source, 32).toLowerCase();
  const expectedSource: Record<string, string> = { marksman: "marksman-web", xbf: "xbf-web", holding: "holding-web" };
  const lead = {
    schema_version: text(input.schema_version, 64),
    site,
    source,
    language: ["es", "en"].includes(text(input.language, 8)) ? text(input.language, 8) : "es",
    name: text(input.name, 120), company: text(input.company, 160), email: cleanEmail(input.email),
    origin_city: text(input.origin_city, 120), origin_postal_code: text(input.origin_postal_code, 24), origin_facility: text(input.origin_facility, 160),
    destination_city: text(input.destination_city, 120), destination_postal_code: text(input.destination_postal_code, 24), destination_facility: text(input.destination_facility, 160),
    operation: text(input.operation, 80), service_type: text(input.service_type, 80),
    truck_type: text(input.truck_type, 80), trailer_type: text(input.trailer_type, 80),
    configuration: text(input.configuration, 80), border: text(input.border, 80), product: text(input.product, 200),
    hazmat: text(input.hazmat, 80), packaging: text(input.packaging, 80), weight_lbs: text(input.weight_lbs, 40),
    loads_per_week: text(input.loads_per_week, 40), seasonality: text(input.seasonality, 80), schedule: text(input.schedule, 80),
    lead_time: text(input.lead_time, 80), target_rate: text(input.target_rate, 80), currency: text(input.currency, 8),
    idempotency_key: text(input.idempotency_key, 128), attribution: object(input.attribution)
  };
  const valid = lead.schema_version === "marksman-web-intake.v1"
    && expectedSource[site] === source
    && [lead.name, lead.company, lead.email, lead.origin_city, lead.destination_city, lead.idempotency_key].every(Boolean);
  return { valid, lead };
}

function leadEmail(lead: ReturnType<typeof normalizeLead>["lead"], receiptId: string) {
  const entries = [
    ["Folio", receiptId], ["Marca", lead.site.toUpperCase()], ["Contacto", lead.name], ["Empresa", lead.company], ["Email", lead.email],
    ["Corredor", `${lead.origin_city} → ${lead.destination_city}`],
    ["Origen", [lead.origin_facility, lead.origin_postal_code].filter(Boolean).join(" · ")],
    ["Destino", [lead.destination_facility, lead.destination_postal_code].filter(Boolean).join(" · ")],
    ["Operación", lead.operation], ["Servicio", lead.service_type],
    ["Equipo", [lead.truck_type, lead.trailer_type, lead.configuration].filter(Boolean).join(" · ")], ["Frontera", lead.border],
    ["Producto", lead.product], ["Cargas/semana", lead.loads_per_week], ["Ventana", lead.schedule], ["Lead time", lead.lead_time],
    ["Atribución", Object.entries(lead.attribution).map(([key, value]) => `${key}=${text(value, 200)}`).join(" · ")]
  ].filter(([, value]) => Boolean(value));
  return { entries, subject: `[Web lead] ${lead.site.toUpperCase()} · ${lead.company} · ${receiptId}` };
}

async function sendNotification(supabase: IntakeSupabase, recipient: string, lead: ReturnType<typeof normalizeLead>["lead"], receiptId: string) {
  const content = leadEmail(lead, receiptId);
  let followUpToken = "";
  try {
    followUpToken = await createFollowUpToken(GMAIL_TOKEN_ENCRYPTION_KEY, receiptId);
  } catch {
    throw new NotificationRejected("Follow-up link could not be prepared.");
  }
  const { accessToken } = await gmailAccessToken(supabase);
  const followUpUrl = `https://group.heymarksman.com/seguimiento#${followUpToken}`;
  const plain = ["Nuevo lead web", ...content.entries.map(([label, value]) => `${label}: ${value}`), "", "Registrar cotización enviada:", followUpUrl].join("\n");
  const html = `<h2>Nuevo lead web</h2><table>${content.entries.map(([label, value]) => `<tr><th align=\"left\">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</table><p><a href=\"${escapeHtml(followUpUrl)}\">Registrar cotización enviada</a></p><p>Usa este enlace únicamente después de enviar la cotización desde ${escapeHtml(GMAIL_ALLOWED_SENDER)}.</p>`;
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: rawEmail({ recipient, subject: content.subject, plain, html }) })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new NotificationRejected("Commercial Gmail did not accept the lead notification.");
  if (!body.id) throw new Error("Commercial Gmail accepted an incomplete delivery receipt.");
  return { messageId: text(body.id, 200), threadId: text(body.threadId, 200) };
}

class FollowUpError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

async function receiveCarrierRateSheet(input: Lead, raw: string, supabase: IntakeSupabase) {
  const normalized = normalizeCarrierRateSheet(input);
  if (!normalized.ok) return json({ error: "Invalid carrier rate sheet.", code: normalized.code }, 422);
  const { lead, bytes, extension, contentType } = normalized;
  const payloadHash = await sha256(raw);
  const recipient = recipientFor("holding");
  try {
    const inserted = await supabase.from("website_lead_intakes").insert({
      source_site: "holding", source_channel: "holding-web", idempotency_key: lead.idempotency_key,
      payload_hash: payloadHash, notification_recipient: recipient, lead, attribution: {},
    }).select("id,notification_status,payload_hash").single();
    let row = inserted.data;
    if (inserted.error?.code === "23505") {
      const existing = await supabase.from("website_lead_intakes").select("id,notification_status,payload_hash")
        .eq("source_site", "holding").eq("idempotency_key", lead.idempotency_key).maybeSingle();
      if (existing.error || !existing.data) throw existing.error || new Error("Could not reconcile duplicate intake.");
      if (existing.data.payload_hash !== payloadHash) return json({ error: "Idempotency conflict." }, 409);
      row = existing.data;
    } else if (inserted.error) throw inserted.error;
    if (!row) throw new Error("Could not persist carrier intake.");
    const bucket = supabase.storage.from("website-carrier-rate-sheets");
    const path = `${row.id}/rate-sheet.${extension}`;
    const upload = await bucket.upload(path, bytes, { contentType, upsert: true });
    if (upload.error) throw upload.error;
    const signedUrl = await bucket.createSignedUrl(path, 7 * 24 * 60 * 60);
    if (signedUrl.error || !signedUrl.data?.signedUrl) throw signedUrl.error || new Error("Could not prepare private rate sheet link.");
    const claimToken = crypto.randomUUID();
    const record = async (status: "sent" | "failed" | "uncertain", message?: string, delivery?: { messageId: string; threadId: string }) => {
      const result = await supabase.rpc("website_lead_intake_record_notification", {
        p_intake_id: row.id, p_claim_token: claimToken, p_status: status,
        p_message_id: delivery?.messageId || null, p_thread_id: delivery?.threadId || null, p_last_error: message || null,
      });
      if (result.error || result.data !== true) throw result.error || new Error("Notification claim was lost.");
    };
    const outcome = await deliverClaimedNotification({
      claim: async () => {
        const result = await supabase.rpc("website_lead_intake_claim_notification", { p_intake_id: row.id, p_claim_token: claimToken });
        if (result.error || !result.data?.[0]?.notification_status) throw result.error || new Error("Could not claim notification.");
        return result.data[0].notification_status as NotificationClaim;
      },
      send: async () => {
        const { accessToken } = await gmailAccessToken(supabase);
        const entries = [
          ["Folio", row.id], ["Empresa", lead.company], ["Contacto", lead.name], ["Email", lead.email],
          ["MC/DOT", lead.mc_dot], ["Flota", lead.fleet], ["Equipo", lead.equipment],
          ["Configuración", lead.configuration], ["Corredores", lead.coverage],
          ["Servicio", lead.service_level], ["Archivo original", lead.file_name],
        ].filter(([, value]) => Boolean(value));
        const subject = `[Tarifario web] ${lead.company} · ${row.id}`;
        const nextSteps = [
          "Descarga y revisa el original antes de que venza el enlace de 7 días.",
          "Responde al contacto desde sales@heymarksman.com en menos de 24 horas hábiles con el siguiente paso de validación.",
          "El folio confirma recepción; no importa tarifas ni da de alta al transportista automáticamente.",
        ];
        const plain = ["Nuevo tarifario de transportista", ...entries.map(([label, value]) => `${label}: ${value}`), "", "Acción comercial:", ...nextSteps.map((step, index) => `${index + 1}. ${step}`), "", "Descarga privada (7 días):", signedUrl.data.signedUrl].join("\n");
        const html = `<h2>Nuevo tarifario de transportista</h2><table>${entries.map(([label, value]) => `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</table><h3>Acción comercial</h3><ol>${nextSteps.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol><p><a href="${escapeHtml(signedUrl.data.signedUrl)}">Descargar archivo original (7 días)</a></p>`;
        const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw: rawEmail({ recipient, subject, plain, html }) }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new NotificationRejected("Commercial Gmail rejected the carrier notification.");
        if (!body.id) throw new Error("Commercial Gmail accepted an incomplete delivery receipt.");
        return { messageId: text(body.id, 200), threadId: text(body.threadId, 200) };
      },
      markSent: delivery => record("sent", undefined, delivery),
      markFailed: message => record("failed", message),
      markUncertain: message => record("uncertain", message),
    });
    if (outcome === "accepted" || outcome === "duplicate") return json({ receipt_id: row.id, duplicate: outcome === "duplicate" }, 202);
    if (outcome === "in_progress") return json({ receipt_id: row.id, notification_pending: true }, 202);
    if (outcome === "review_required") return json({ error: "Notification requires commercial review." }, 409);
    return json({ error: "Commercial notification unavailable." }, 502);
  } catch (error) {
    console.error("Carrier rate sheet intake failed", error instanceof Error ? error.message : JSON.stringify(error));
    return json({ error: "Carrier rate sheet intake unavailable." }, 502);
  }
}

async function followUp(request: Record<string, unknown>, supabase: IntakeSupabase) {
  const verified = await verifyFollowUpToken(GMAIL_TOKEN_ENCRYPTION_KEY, text(request.token, 4096));
  if (!verified.ok) throw new FollowUpError(verified.code, 401);
  const intake = await supabase.from("website_lead_intakes")
    .select("id,lead").eq("id", verified.receiptId).maybeSingle();
  if (intake.error) throw intake.error;
  if (!intake.data) throw new FollowUpError("lead_not_found", 404);
  const lead = object(intake.data.lead);
  const existing = await supabase.from("website_lead_follow_up_events")
    .select("id,quote_reference,occurred_at").eq("intake_id", intake.data.id)
    .eq("event_type", "quote_sent").order("occurred_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  if (text(request.action, 40) === "view_follow_up") return json({
    receipt_id: intake.data.id,
    company: text(lead.company, 160), contact_name: text(lead.name, 120),
    recipient_email: cleanEmail(lead.email), origin_city: text(lead.origin_city, 120),
    destination_city: text(lead.destination_city, 120), quote_sent: Boolean(existing.data),
    quote_reference: text(existing.data?.quote_reference, 120), occurred_at: text(existing.data?.occurred_at, 80),
  });
  if (text(request.action, 40) !== "record_quote_sent") throw new FollowUpError("follow_up_invalid", 422);
  const quoteReference = text(request.quote_reference, 120);
  const idempotencyKey = text(request.idempotency_key, 128);
  if (!quoteReference || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(idempotencyKey)) throw new FollowUpError("follow_up_invalid", 422);
  const inserted = await supabase.from("website_lead_follow_up_events").insert({
    intake_id: intake.data.id, event_type: "quote_sent", quote_reference: quoteReference,
    recipient_email: cleanEmail(lead.email), actor_email: GMAIL_ALLOWED_SENDER,
    idempotency_key: idempotencyKey, source: "holding-follow-up",
  }).select("id,quote_reference,occurred_at").single();
  if (inserted.error?.code === "23505") {
    const duplicate = await supabase.from("website_lead_follow_up_events")
      .select("id,quote_reference,occurred_at").eq("intake_id", intake.data.id)
      .eq("event_type", "quote_sent").eq("quote_reference", quoteReference).maybeSingle();
    if (duplicate.error) throw duplicate.error;
    if (!duplicate.data) throw new FollowUpError("quote_reference_conflict", 409);
    return json({ event: "quote_sent", event_id: duplicate.data.id, receipt_id: intake.data.id,
      quote_reference: duplicate.data.quote_reference, occurred_at: duplicate.data.occurred_at, duplicate: true }, 202);
  }
  if (inserted.error || !inserted.data) throw inserted.error || new Error("Could not record quote_sent.");
  return json({ event: "quote_sent", event_id: inserted.data.id, receipt_id: intake.data.id,
    quote_reference: inserted.data.quote_reference, occurred_at: inserted.data.occurred_at, duplicate: false }, 202);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_RATE_SHEET_BODY_BYTES) return json({ error: "Body too large." }, 413);
  const raw = await request.text();
  const bodyBytes = new TextEncoder().encode(raw).byteLength;
  if (bodyBytes > MAX_RATE_SHEET_BODY_BYTES) return json({ error: "Body too large." }, 413);
  if (!(await signed(raw, request.headers.get("x-marksman-intake-signature") || ""))) return json({ error: "Invalid intake signature." }, 403);
  let input: Lead;
  try { input = object(JSON.parse(raw)); } catch { return json({ error: "Invalid JSON." }, 400); }
  if (input.action !== "submit_carrier_rate_sheet" && bodyBytes > MAX_BODY_BYTES) return json({ error: "Body too large." }, 413);
  const supabase = getClient();
  if (input.action === "submit_carrier_rate_sheet") return receiveCarrierRateSheet(input, raw, supabase);
  if (["view_follow_up", "record_quote_sent"].includes(text(input.action, 40))) {
    try { return await followUp(input, supabase); }
    catch (error) {
      if (error instanceof FollowUpError) return json({ error: "Follow-up rejected.", code: error.code }, error.status);
      console.error("Website lead follow-up failed", error instanceof Error ? error.message : "unknown_error");
      return json({ error: "Follow-up unavailable." }, 502);
    }
  }
  const normalized = normalizeLead(input);
  if (!normalized.valid) return json({ error: "Invalid intake payload." }, 422);
  const { lead } = normalized;
  const payloadHash = await sha256(raw);
  const recipient = recipientFor(lead.site);
  try {
    const inserted = await supabase.from("website_lead_intakes").insert({
      source_site: lead.site, source_channel: lead.source, idempotency_key: lead.idempotency_key, payload_hash: payloadHash,
      notification_recipient: recipient, lead: { ...lead, attribution: undefined }, attribution: lead.attribution
    }).select("id,notification_status,payload_hash").single();
    let row = inserted.data;
    if (inserted.error?.code === "23505") {
      const existing = await supabase.from("website_lead_intakes").select("id,notification_status,payload_hash")
        .eq("source_site", lead.site).eq("idempotency_key", lead.idempotency_key).maybeSingle();
      if (existing.error || !existing.data) throw existing.error || new Error("Could not reconcile duplicate intake.");
      if (existing.data.payload_hash !== payloadHash) return json({ error: "Idempotency conflict." }, 409);
      row = existing.data;
    } else if (inserted.error) throw inserted.error;
    if (!row) throw new Error("Could not persist web lead.");
    const claimToken = crypto.randomUUID();
    const record = async (status: "sent" | "failed" | "uncertain", message?: string, delivery?: { messageId: string; threadId: string }) => {
      const result = await supabase.rpc("website_lead_intake_record_notification", {
        p_intake_id: row.id, p_claim_token: claimToken, p_status: status,
        p_message_id: delivery?.messageId || null, p_thread_id: delivery?.threadId || null, p_last_error: message || null
      });
      if (result.error || result.data !== true) throw result.error || new Error("Notification claim was lost before it could be reconciled.");
    };
    const outcome = await deliverClaimedNotification({
      claim: async () => {
        const result = await supabase.rpc("website_lead_intake_claim_notification", { p_intake_id: row.id, p_claim_token: claimToken });
        if (result.error || !result.data?.[0]?.notification_status) throw result.error || new Error("Could not claim lead notification.");
        return result.data[0].notification_status as NotificationClaim;
      },
      send: () => sendNotification(supabase, recipient, lead, row.id),
      markSent: (delivery) => record("sent", undefined, delivery),
      markFailed: (message) => record("failed", message),
      markUncertain: (message) => record("uncertain", message)
    });
    if (outcome === "accepted") return json({ receipt_id: row.id }, 202);
    if (outcome === "duplicate") return json({ receipt_id: row.id, duplicate: true }, 202);
    if (outcome === "review_required") return json({ error: "Notification state requires commercial review." }, 409);
    if (outcome === "in_progress") return json({ receipt_id: row.id, notification_pending: true }, 202);
    return json({ error: "Commercial notification unavailable." }, 502);
  } catch (error) {
    console.error("Website lead intake failed", error instanceof Error ? error.message : "unknown_error");
    return json({ error: "Lead intake unavailable." }, 502);
  }
});
