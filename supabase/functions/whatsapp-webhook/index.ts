import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/kinde.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = (Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN") || "").trim();
const WHATSAPP_APP_SECRET = (Deno.env.get("WHATSAPP_APP_SECRET") || "").trim();

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

async function signatureValid(request: Request, body: string) {
  if (!WHATSAPP_APP_SECRET) return true;
  const signature = cleanText(request.headers.get("x-hub-signature-256")).replace(/^sha256=/i, "");
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WHATSAPP_APP_SECRET),
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

async function recordStatusUpdate(supabase: ReturnType<typeof createClient>, statusRow: Record<string, unknown>) {
  const now = new Date().toISOString();
  const { providerMessageId, providerStatus, patch, errorText } = statusPatch(statusRow, now);
  if (!providerMessageId || !providerStatus) return false;
  const update = await supabase
    .from("outreach_messages")
    .update(patch)
    .eq("provider_message_id", providerMessageId)
    .select("*")
    .limit(1)
    .maybeSingle();
  if (update.error) throw update.error;
  const message = update.data;
  if (!message) return false;
  const history = await supabase.from("contact_history").insert({
    owner_user_id: message.owner_user_id,
    owner_email: message.owner_email,
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
      provider_message_id: providerMessageId,
      whatsapp_status_payload: statusRow
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

async function recordInboundMessage(supabase: ReturnType<typeof createClient>, inbound: Record<string, unknown>) {
  const now = new Date().toISOString();
  const fromPhone = normalizeWhatsappPhone(inbound.from);
  if (!fromPhone) return false;
  const latest = await supabase
    .from("outreach_messages")
    .select("*")
    .eq("channel", "whatsapp")
    .eq("normalized_recipient_phone", fromPhone)
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
      provider_message_id: cleanText(inbound.id),
      from_phone: fromPhone,
      inbound_payload: inbound
    }
  });
  if (history.error) throw history.error;
  await supabase
    .from("outreach_messages")
    .update({ status: "replied", delivery_status: "replied", updated_at: now })
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
    if (mode === "subscribe" && token && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      return new Response(challenge, { headers: { ...corsHeaders(), "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403, headers: corsHeaders() });
  }
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const bodyText = await request.text();
    if (!(await signatureValid(request, bodyText))) {
      return jsonResponse({ error: "Invalid Meta webhook signature." }, 403);
    }
    const payload = bodyText ? JSON.parse(bodyText) : {};
    const supabase = getClient();
    let processed = 0;
    const entries = arrayValue(payload.entry);
    for (const entry of entries) {
      for (const change of arrayValue(entry.changes)) {
        const value = objectRecord(change.value);
        for (const status of arrayValue(value.statuses)) {
          if (await recordStatusUpdate(supabase, status)) processed += 1;
        }
        for (const message of arrayValue(value.messages)) {
          if (await recordInboundMessage(supabase, message)) processed += 1;
        }
      }
    }
    return jsonResponse({ ok: true, processed });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "WhatsApp webhook failed." }, 400);
  }
});
