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
  const select = "id,owner_user_id,owner_email,organization_id,connection_mode,status,meta_phone_number_id,phone_number_id,meta_waba_id,waba_id,display_phone_number,app_secret_encrypted";
  if (phoneNumberId) {
    for (const column of ["meta_phone_number_id", "phone_number_id"]) {
      const result = await supabase
        .from("whatsapp_business_connections")
        .select(select)
        .eq(column, phoneNumberId)
        .neq("status", "revoked")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (result.error) throw result.error;
      if (result.data) return result.data;
    }
  }
  if (wabaId) {
    for (const column of ["meta_waba_id", "waba_id"]) {
      const result = await supabase
        .from("whatsapp_business_connections")
        .select(select)
        .eq(column, wabaId)
        .neq("status", "revoked")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (result.error) throw result.error;
      if (result.data) return result.data;
    }
  }
  return null;
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
  connection: Record<string, unknown> | null
) {
  const now = new Date().toISOString();
  const { providerMessageId, providerStatus, patch, errorText } = statusPatch(statusRow, now);
  if (!providerMessageId || !providerStatus) return false;
  const connectionId = cleanText(connection?.id) || null;
  const senderAddress = cleanText(connection?.display_phone_number) || null;
  patch.whatsapp_connection_id = connectionId;
  patch.sender_address = senderAddress;
  patch.sender_connection_type = cleanText(connection?.connection_mode) || "unresolved";
  patch.provider_response_status = providerStatus;
  patch.send_result = deliveryResult("webhook_status", {
    channel: "whatsapp",
    provider: "meta",
    outcome: providerStatus,
    connection_id: connectionId,
    sender: senderAddress,
    provider_message_id: providerMessageId,
    ...(errorText ? { error: errorText } : {})
  });
  let updateQuery = supabase
    .from("outreach_messages")
    .update(patch)
    .eq("provider_message_id", providerMessageId);
  if (connection?.id) {
    updateQuery = updateQuery.or(`whatsapp_connection_id.eq.${connection.id},whatsapp_connection_id.is.null`);
  }
  const update = await updateQuery
    .select("*")
    .limit(1)
    .maybeSingle();
  if (update.error) throw update.error;
  const message = update.data;
  if (!message) return false;
  const history = await supabase.from("contact_history").insert({
    owner_user_id: message.owner_user_id,
    owner_email: message.owner_email,
    whatsapp_connection_id: connection?.id || message.whatsapp_connection_id || null,
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
      whatsapp_connection_id: connection?.id || message.whatsapp_connection_id || null,
      sender_address: senderAddress,
      sender_connection_type: cleanText(connection?.connection_mode) || "unresolved",
      sender_display_phone: connection?.display_phone_number || null,
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
  connection: Record<string, unknown> | null
) {
  const now = new Date().toISOString();
  const fromPhone = normalizeWhatsappPhone(inbound.from);
  if (!fromPhone) return false;
  let latestQuery = supabase
    .from("outreach_messages")
    .select("*")
    .eq("channel", "whatsapp")
    .eq("normalized_recipient_phone", fromPhone);
  if (connection?.id) {
    latestQuery = latestQuery.or(`whatsapp_connection_id.eq.${connection.id},whatsapp_connection_id.is.null`);
  }
  const latest = await latestQuery
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw latest.error;
  const message = latest.data;
  if (!message) return false;
  const body = inboundText(inbound);
  const history = await supabase.from("contact_history").insert({
    owner_user_id: message.owner_user_id,
    owner_email: message.owner_email,
    whatsapp_connection_id: connection?.id || message.whatsapp_connection_id || null,
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
      whatsapp_connection_id: connection?.id || message.whatsapp_connection_id || null,
      sender_display_phone: connection?.display_phone_number || null,
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
      whatsapp_connection_id: connection?.id || message.whatsapp_connection_id || null,
      sender_address: cleanText(connection?.display_phone_number || message.sender_address) || null,
      sender_connection_type: cleanText(connection?.connection_mode || message.sender_connection_type) || "unresolved",
      provider_response_status: "replied",
      send_result: deliveryResult("inbound_reply", {
        channel: "whatsapp",
        provider: "meta",
        outcome: "replied",
        connection_id: connection?.id || message.whatsapp_connection_id || null,
        sender: cleanText(connection?.display_phone_number || message.sender_address) || null,
        provider_message_id: cleanText(inbound.id)
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
    const resolvedChanges: Array<{ value: Record<string, unknown>; connection: Record<string, unknown> | null }> = [];
    const connectionIds = new Set<string>();
    for (const entry of entries) {
      for (const change of arrayValue(entry.changes)) {
        const value = objectRecord(change.value);
        const connection = await findWebhookConnection(supabase, entry, value);
        if (connection?.id) connectionIds.add(cleanText(connection.id));
        resolvedChanges.push({ value, connection });
      }
    }
    if (connectionIds.size !== 1) {
      return jsonResponse({ error: "WhatsApp webhook connection could not be resolved uniquely." }, 403);
    }
    const resolvedConnection = resolvedChanges.find((item) => item.connection)?.connection || null;
    const appSecret = await connectionAppSecret(resolvedConnection);
    if (!(await signatureValid(request, bodyText, appSecret))) {
      return jsonResponse({ error: "Invalid Meta webhook signature." }, 403);
    }

    let processed = 0;
    for (const { value, connection } of resolvedChanges) {
      for (const status of arrayValue(value.statuses)) {
        if (await recordStatusUpdate(supabase, status, connection)) processed += 1;
      }
      for (const message of arrayValue(value.messages)) {
        if (await recordInboundMessage(supabase, message, connection)) processed += 1;
      }
    }
    return jsonResponse({ ok: true, processed });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "WhatsApp webhook failed." }, 400);
  }
});
