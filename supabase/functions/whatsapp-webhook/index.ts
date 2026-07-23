import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/kinde.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = (Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN") || "").trim();
const WHATSAPP_APP_SECRET = (Deno.env.get("WHATSAPP_APP_SECRET") || "").trim();
const WHATSAPP_TOKEN_ENCRYPTION_KEY = (Deno.env.get("WHATSAPP_TOKEN_ENCRYPTION_KEY") || "").trim();

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeWhatsappPhone(value: unknown) {
  const digits = cleanText(value).replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function deliveryResult(stage: string, details: Record<string, unknown> = {}) {
  return {
    stage,
    recorded_at: new Date().toISOString(),
    ...details
  };
}

function arrayValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Record<string, unknown>[] : [];
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEquals(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function whatsappCryptoKey() {
  if (!WHATSAPP_TOKEN_ENCRYPTION_KEY) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(WHATSAPP_TOKEN_ENCRYPTION_KEY));
  return await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}

async function decryptWhatsappSecret(value: unknown) {
  const text = cleanText(value);
  const [version, ivText, ciphertextText] = text.split(":");
  if (version !== "v1" || !ivText || !ciphertextText) return "";
  const key = await whatsappCryptoKey();
  if (!key) return "";
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(ivText) },
      key,
      base64ToBytes(ciphertextText)
    );
    return new TextDecoder().decode(plain);
  } catch {
    return "";
  }
}

async function verifyWebhookToken(
  supabase: ReturnType<typeof createClient>,
  candidate: string
) {
  if (WHATSAPP_WEBHOOK_VERIFY_TOKEN && constantTimeEquals(candidate, WHATSAPP_WEBHOOK_VERIFY_TOKEN)) {
    return { valid: true, connectionId: null };
  }
  if (!candidate || !WHATSAPP_TOKEN_ENCRYPTION_KEY) return { valid: false, connectionId: null };
  const result = await supabase
    .from("whatsapp_business_connections")
    .select("id,webhook_verify_token_encrypted")
    .eq("provider", "meta")
    .neq("status", "revoked")
    .not("webhook_verify_token_encrypted", "is", null);
  if (result.error) throw result.error;
  for (const row of result.data || []) {
    const storedToken = await decryptWhatsappSecret(row.webhook_verify_token_encrypted);
    if (storedToken && constantTimeEquals(candidate, storedToken)) {
      return { valid: true, connectionId: cleanText(row.id) || null };
    }
  }
  return { valid: false, connectionId: null };
}

async function findWebhookConnection(
  supabase: ReturnType<typeof createClient>,
  entry: Record<string, unknown>,
  value: Record<string, unknown>
) {
  const metadata = objectRecord(value.metadata);
  const phoneNumberId = cleanText(metadata.phone_number_id);
  const wabaId = cleanText(entry.id);
  const select = "id,owner_user_id,owner_email,organization_id,connection_mode,status,meta_phone_number_id,phone_number_id,meta_waba_id,waba_id,display_phone_number,app_secret_encrypted,updated_at";
  const candidates = new Map<string, Record<string, unknown>>();
  const addMatches = async (column: string, valueToMatch: string) => {
    if (!valueToMatch) return;
    const result = await supabase
      .from("whatsapp_business_connections")
      .select(select)
      .eq(column, valueToMatch)
      .neq("status", "revoked")
      .order("updated_at", { ascending: false });
    if (result.error) throw result.error;
    for (const row of result.data || []) {
      const id = cleanText(row.id);
      if (id) candidates.set(id, row);
    }
  };
  if (phoneNumberId) {
    for (const column of ["meta_phone_number_id", "phone_number_id"]) {
      await addMatches(column, phoneNumberId);
    }
  }
  if (wabaId) {
    for (const column of ["meta_waba_id", "waba_id"]) {
      await addMatches(column, wabaId);
    }
  }
  const rows = [...candidates.values()];
  const connectionPhone = (row: Record<string, unknown>) => cleanText(row.meta_phone_number_id || row.phone_number_id);
  const connectionWaba = (row: Record<string, unknown>) => cleanText(row.meta_waba_id || row.waba_id);
  const exactMatches = rows.filter((row) => (
    (!phoneNumberId || connectionPhone(row) === phoneNumberId)
    && (!wabaId || connectionWaba(row) === wabaId)
  ));
  if (exactMatches.length > 1) {
    throw new Error(`Ambiguous WhatsApp webhook connection for phone_number_id ${phoneNumberId || "-"} and WABA ${wabaId || "-"}.`);
  }
  if (exactMatches.length === 1) {
    return { connection: exactMatches[0], phoneNumberId, wabaId };
  }
  // Never route by WABA alone when Meta supplied a phone id that does not
  // belong to that exact saved connection.
  if (phoneNumberId) return { connection: null, phoneNumberId, wabaId };
  const wabaMatches = rows.filter((row) => wabaId && connectionWaba(row) === wabaId);
  if (wabaMatches.length > 1) {
    throw new Error(`Ambiguous WhatsApp webhook connection for WABA ${wabaId}.`);
  }
  return { connection: wabaMatches[0] || null, phoneNumberId, wabaId };
}

async function connectionAppSecret(connection: Record<string, unknown> | null) {
  if (!connection) return "";
  if (cleanText(connection.connection_mode) === "internal_managed") return WHATSAPP_APP_SECRET;
  return await decryptWhatsappSecret(connection.app_secret_encrypted);
}

async function signatureValid(request: Request, body: string, appSecret: string) {
  if (!appSecret) return false;
  const signature = cleanText(request.headers.get("x-hub-signature-256")).replace(/^sha256=/i, "");
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return constantTimeEquals(hex(digest), signature);
}

async function outreachMessageByProviderId(
  supabase: ReturnType<typeof createClient>,
  providerMessageId: string,
  connection: Record<string, unknown>
) {
  const connectionId = cleanText(connection.id);
  const exact = await supabase
    .from("outreach_messages")
    .select("*")
    .eq("provider_message_id", providerMessageId)
    .eq("whatsapp_connection_id", connectionId)
    .limit(2);
  if (exact.error) throw exact.error;
  if ((exact.data || []).length > 1) throw new Error("Ambiguous WhatsApp delivery status target.");
  if (exact.data?.[0]) return exact.data[0];

  // Backfill compatibility is owner-scoped. It must never attach an old
  // connection-less message owned by a different workspace.
  let legacyQuery = supabase
    .from("outreach_messages")
    .select("*")
    .eq("provider_message_id", providerMessageId)
    .is("whatsapp_connection_id", null);
  const ownerUserId = cleanText(connection.owner_user_id);
  const ownerEmail = cleanText(connection.owner_email);
  if (ownerUserId) legacyQuery = legacyQuery.eq("owner_user_id", ownerUserId);
  else if (ownerEmail) legacyQuery = legacyQuery.eq("owner_email", ownerEmail);
  else return null;
  const legacy = await legacyQuery.limit(2);
  if (legacy.error) throw legacy.error;
  if ((legacy.data || []).length > 1) throw new Error("Ambiguous legacy WhatsApp delivery status target.");
  return legacy.data?.[0] || null;
}

async function latestOutboundForInbound(
  supabase: ReturnType<typeof createClient>,
  fromPhone: string,
  connection: Record<string, unknown>
) {
  const connectionId = cleanText(connection.id);
  const exact = await supabase
    .from("outreach_messages")
    .select("*")
    .eq("channel", "whatsapp")
    .eq("normalized_recipient_phone", fromPhone)
    .eq("whatsapp_connection_id", connectionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (exact.error) throw exact.error;
  if (exact.data) return exact.data;

  let legacyQuery = supabase
    .from("outreach_messages")
    .select("*")
    .eq("channel", "whatsapp")
    .eq("normalized_recipient_phone", fromPhone)
    .is("whatsapp_connection_id", null);
  const ownerUserId = cleanText(connection.owner_user_id);
  const ownerEmail = cleanText(connection.owner_email);
  if (ownerUserId) legacyQuery = legacyQuery.eq("owner_user_id", ownerUserId);
  else if (ownerEmail) legacyQuery = legacyQuery.eq("owner_email", ownerEmail);
  else return null;
  const legacy = await legacyQuery
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (legacy.error) throw legacy.error;
  return legacy.data || null;
}

function statusPatch(statusRow: Record<string, unknown>, now: string) {
  const providerStatus = cleanText(statusRow.status).toLowerCase();
  const providerMessageId = cleanText(statusRow.id);
  const errors = arrayValue(statusRow.errors);
  const errorText = errors
    .map((error) => cleanText(error.message || error.title || error.code))
    .filter(Boolean)
    .join(" | ");
  const patch: Record<string, unknown> = {
    provider: "meta",
    delivery_status: providerStatus || null,
    updated_at: now
  };
  if (providerStatus === "sent") {
    patch.status = "sent";
    patch.sent_at = now;
    patch.last_contacted_at = now;
    patch.delivery_error = null;
  } else if (providerStatus === "delivered") {
    patch.status = "delivered";
    patch.delivered_at = now;
    patch.delivery_error = null;
  } else if (providerStatus === "read") {
    patch.status = "read";
    patch.read_at = now;
    patch.delivery_error = null;
  } else if (providerStatus === "failed") {
    patch.status = "failed";
    patch.failed_at = now;
    patch.delivery_error = errorText || "Meta WhatsApp delivery failed.";
  }
  return { providerMessageId, providerStatus, patch, errorText };
}

async function recordStatusUpdate(
  supabase: ReturnType<typeof createClient>,
  statusRow: Record<string, unknown>,
  connection: Record<string, unknown>,
  webhookIdentity: { phoneNumberId: string; wabaId: string }
) {
  const now = new Date().toISOString();
  const { providerMessageId, providerStatus, patch, errorText } = statusPatch(statusRow, now);
  if (!providerMessageId || !providerStatus) return false;
  const connectionId = cleanText(connection.id);
  const senderAddress = cleanText(connection.display_phone_number) || null;
  patch.whatsapp_connection_id = connectionId;
  patch.sender_address = senderAddress;
  patch.sender_connection_type = cleanText(connection.connection_mode) || "unresolved";
  patch.provider_response_status = providerStatus;
  patch.send_result = deliveryResult("webhook_status", {
    channel: "whatsapp",
    provider: "meta",
    outcome: providerStatus,
    connection_id: connectionId,
    sender: senderAddress,
    provider_message_id: providerMessageId,
    webhook_phone_number_id: webhookIdentity.phoneNumberId,
    webhook_waba_id: webhookIdentity.wabaId,
    ...(errorText ? { error: errorText } : {})
  });
  const target = await outreachMessageByProviderId(supabase, providerMessageId, connection);
  if (!target) return false;
  const update = await supabase
    .from("outreach_messages")
    .update(patch)
    .eq("id", target.id)
    .select("*")
    .single();
  if (update.error) throw update.error;
  const message = update.data;
  if (!message) return false;
  const history = await supabase.from("contact_history").insert({
    owner_user_id: message.owner_user_id,
    owner_email: message.owner_email,
    whatsapp_connection_id: connectionId,
    outreach_message_id: message.id,
    campaign_id: message.campaign_id,
    vendor_id: message.vendor_id,
    rfx_event_id: message.rfx_event_id,
    channel: "whatsapp",
    direction: "outbound",
    status: providerStatus,
    subject: message.subject,
    body_preview: errorText || providerStatus,
    occurred_at: now,
    metadata: {
      provider: "meta",
      whatsapp_connection_id: connectionId,
      sender_address: senderAddress,
      sender_connection_type: cleanText(connection.connection_mode) || "unresolved",
      sender_display_phone: connection.display_phone_number || null,
      webhook_phone_number_id: webhookIdentity.phoneNumberId,
      webhook_waba_id: webhookIdentity.wabaId,
      provider_message_id: providerMessageId,
      result: objectRecord(patch.send_result)
    }
  });
  if (history.error) throw history.error;
  return true;
}

function inboundText(message: Record<string, unknown>) {
  const text = objectRecord(message.text);
  if (text.body) return cleanText(text.body);
  const button = objectRecord(message.button);
  if (button.text) return cleanText(button.text);
  const interactive = objectRecord(message.interactive);
  const buttonReply = objectRecord(interactive.button_reply);
  const listReply = objectRecord(interactive.list_reply);
  return cleanText(buttonReply.title || listReply.title || message.type || "Inbound WhatsApp message");
}

async function recordInboundMessage(
  supabase: ReturnType<typeof createClient>,
  inbound: Record<string, unknown>,
  connection: Record<string, unknown>,
  webhookIdentity: { phoneNumberId: string; wabaId: string }
) {
  const now = new Date().toISOString();
  const fromPhone = normalizeWhatsappPhone(inbound.from);
  if (!fromPhone) return false;
  const message = await latestOutboundForInbound(supabase, fromPhone, connection);
  if (!message) return false;
  const body = inboundText(inbound);
  const history = await supabase.from("contact_history").insert({
    owner_user_id: message.owner_user_id,
    owner_email: message.owner_email,
    whatsapp_connection_id: connection.id,
    outreach_message_id: message.id,
    campaign_id: message.campaign_id,
    vendor_id: message.vendor_id,
    rfx_event_id: message.rfx_event_id,
    channel: "whatsapp",
    direction: "inbound",
    status: "replied",
    subject: message.subject,
    body_preview: body,
    occurred_at: now,
    metadata: {
      provider: "meta",
      whatsapp_connection_id: connection.id,
      sender_display_phone: connection.display_phone_number || null,
      webhook_phone_number_id: webhookIdentity.phoneNumberId,
      webhook_waba_id: webhookIdentity.wabaId,
      provider_message_id: cleanText(inbound.id),
      from_phone: fromPhone,
      inbound_payload: inbound
    }
  });
  if (history.error) throw history.error;
  await supabase
    .from("outreach_messages")
    .update({
      status: "replied",
      delivery_status: "replied",
      whatsapp_connection_id: connection.id,
      sender_address: cleanText(connection.display_phone_number || message.sender_address) || null,
      sender_connection_type: cleanText(connection.connection_mode || message.sender_connection_type) || "unresolved",
      provider_response_status: "replied",
      send_result: deliveryResult("inbound_reply", {
        channel: "whatsapp",
        provider: "meta",
        outcome: "replied",
        connection_id: connection.id,
        sender: cleanText(connection.display_phone_number || message.sender_address) || null,
        provider_message_id: cleanText(inbound.id),
        webhook_phone_number_id: webhookIdentity.phoneNumberId,
        webhook_waba_id: webhookIdentity.wabaId
      }),
      updated_at: now
    })
    .eq("id", message.id);
  return true;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (request.method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") || "";
    const supabase = getClient();
    const verification = token ? await verifyWebhookToken(supabase, token) : { valid: false, connectionId: null };
    if (mode === "subscribe" && verification.valid) {
      if (verification.connectionId) {
        await supabase
          .from("whatsapp_business_connections")
          .update({ webhook_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", verification.connectionId);
      }
      return new Response(challenge, { headers: { ...corsHeaders(), "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403, headers: corsHeaders() });
  }
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const bodyText = await request.text();
    const payload = bodyText ? JSON.parse(bodyText) : {};
    const supabase = getClient();
    const entries = arrayValue(payload.entry);
    const resolvedChanges: Array<{
      value: Record<string, unknown>;
      connection: Record<string, unknown>;
      phoneNumberId: string;
      wabaId: string;
    }> = [];
    for (const entry of entries) {
      for (const change of arrayValue(entry.changes)) {
        const value = objectRecord(change.value);
        const resolved = await findWebhookConnection(supabase, entry, value);
        if (!resolved.connection) {
          return jsonResponse({
            error: "WhatsApp webhook connection could not be resolved for the supplied phone_number_id and WABA."
          }, 403);
        }
        resolvedChanges.push({ value, ...resolved, connection: resolved.connection });
      }
    }
    if (!resolvedChanges.length) {
      return jsonResponse({ error: "WhatsApp webhook did not include routable changes." }, 400);
    }
    const appSecrets = new Set<string>();
    for (const item of resolvedChanges) {
      const secret = await connectionAppSecret(item.connection);
      if (!secret) return jsonResponse({ error: "WhatsApp webhook App Secret is not configured for the resolved connection." }, 403);
      appSecrets.add(secret);
    }
    if (appSecrets.size !== 1) {
      return jsonResponse({ error: "WhatsApp webhook payload spans connections with different Meta apps." }, 403);
    }
    const appSecret = [...appSecrets][0];
    if (!(await signatureValid(request, bodyText, appSecret))) {
      return jsonResponse({ error: "Invalid Meta webhook signature." }, 403);
    }

    let processed = 0;
    for (const { value, connection, phoneNumberId, wabaId } of resolvedChanges) {
      const webhookIdentity = { phoneNumberId, wabaId };
      for (const status of arrayValue(value.statuses)) {
        if (await recordStatusUpdate(supabase, status, connection, webhookIdentity)) processed += 1;
      }
      for (const message of arrayValue(value.messages)) {
        if (await recordInboundMessage(supabase, message, connection, webhookIdentity)) processed += 1;
      }
    }
    return jsonResponse({ ok: true, processed });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "WhatsApp webhook failed." }, 400);
  }
});
