import { trackingEventReceipts, TRACKING_SENDER } from './tracking-sender.mjs';
import { normalizeMetaPhone, parseCallback, callbackReceiptId, selectInboundAssociation, callbackProjection } from "./callback-policy.mjs";
import { forwardPayload, shouldForward } from "../fr8onboard-whatsapp/policy.mjs";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import { corsHeaders, jsonResponse as baseJsonResponse } from "../_shared/kinde.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = (Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN") || "").trim();
const WHATSAPP_APP_SECRET = (Deno.env.get("WHATSAPP_APP_SECRET") || "").trim();
const WHATSAPP_TOKEN_ENCRYPTION_KEY = (Deno.env.get("WHATSAPP_TOKEN_ENCRYPTION_KEY") || "").trim();
const FR8ONBOARD_FORWARD = {
  url: (Deno.env.get("FR8ONBOARD_INBOUND_URL") || "").trim(),
  secret: (Deno.env.get("FR8ONBOARD_SHARED_SECRET") || "").trim(),
  phoneNumberId: (Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "").trim(),
};

// Best effort: a Fr8Onboard outage must not make Meta retry an already persisted callback.
async function forwardToFr8onboard(event: any, phoneNumberId: string) {
  if (!shouldForward(FR8ONBOARD_FORWARD, phoneNumberId, event)) return;
  try {
    await fetch(FR8ONBOARD_FORWARD.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${FR8ONBOARD_FORWARD.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify(forwardPayload(event)),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.warn("Fr8Onboard forward failed", error instanceof Error ? error.message : error);
  }
}

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

type WhatsappWebhookSupabaseClient = ReturnType<typeof getClient>;

function cleanText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
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
  supabase: WhatsappWebhookSupabaseClient,
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
  supabase: WhatsappWebhookSupabaseClient,
  entry: Record<string, unknown>,
  value: Record<string, unknown>
) {
  const metadata = objectRecord(value.metadata);
  const phoneNumberId = cleanText(metadata.phone_number_id);
  const wabaId = cleanText(entry.id);
  const select = "id,owner_user_id,owner_email,organization_id,connection_mode,status,meta_phone_number_id,phone_number_id,meta_waba_id,waba_id,display_phone_number,app_secret_encrypted,updated_at,metadata";
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

// Scope every lookup, including rows which already carry a connection id.
function owned(query: any, connection: Record<string, unknown>) {
  const email = cleanText(connection.owner_email);
  const user = cleanText(connection.owner_user_id);
  if (!email) throw new Error("CALLBACK_OWNER_UNRESOLVED");
  query = query.eq("owner_email", email);
  if (user) query = query.eq("owner_user_id", user);
  return query;
}

function phoneSpellings(phone: string) {
  const digits = normalizeMetaPhone(phone);
  if (!digits) return [];
  const phones = [digits];
  if (/^52\d{10}$/.test(digits)) phones.push(`521${digits.slice(2)}`);
  return phones.flatMap(value => [value, `+${value}`]);
}

async function scopedMessages(supabase: WhatsappWebhookSupabaseClient, connection: Record<string, unknown>, event: any) {
  const rows = [];
  // Both exact and owner-scoped legacy rows participate in ambiguity detection.
  for (const legacy of [false, true]) {
    let query = owned(supabase.from("outreach_messages").select("*").eq("channel", "whatsapp"), connection);
    query = legacy ? query.is("whatsapp_connection_id", null) : query.eq("whatsapp_connection_id", connection.id);
    if (event.kind === "status") query = query.eq("provider_message_id", event.provider_message_id);
    else {
      query = query.in("normalized_recipient_phone", phoneSpellings(event.from_phone));
      if (event.context_id) query = query.eq("provider_message_id", event.context_id);
    }
    const result = await query.limit(201);
    if (result.error) throw result.error;
    // A truncated result must never look like a unique conversation.
    if ((result.data || []).length >= 201) throw new Error("CALLBACK_CANDIDATE_LIMIT");
    rows.push(...(result.data || []));
  }
  return rows;
}

function binding(message: any) {
  return message ? Object.fromEntries(["id","owner_email","owner_user_id","provider_message_id","normalized_recipient_phone","whatsapp_connection_id","rfx_event_id","vendor_id","campaign_id"].map(key => [key,message[key] ?? null])) : null;
}

async function readReceipt(supabase: WhatsappWebhookSupabaseClient, connection: Record<string, unknown>, id: string) {
  const result = await owned(supabase.from("contact_history").select("*").eq("id",id).eq("whatsapp_connection_id",connection.id),connection).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function saveCallbackReceipt(supabase: WhatsappWebhookSupabaseClient, connection: Record<string, unknown>, event: any, webhookIdentity: {phoneNumberId:string;wabaId:string}) {
  const id = await callbackReceiptId(connection,event);
  const previous = await readReceipt(supabase,connection,id);
  if (previous) return previous;
  const candidates = await scopedMessages(supabase,connection,event);
  const association = event.kind === "inbound" ? selectInboundAssociation(candidates,event) : (() => {
    const matched = candidates.filter(row => !event.from_phone || normalizeMetaPhone(row.normalized_recipient_phone) === event.from_phone);
    return matched.length === 1 ? {message:matched[0],reason:"provider_id"} : {message:null,reason:"status_target_unresolved"};
  })();
  const message = association.message;
  const receivedAt = new Date().toISOString();
  const row = {
    id,owner_email:connection.owner_email,owner_user_id:connection.owner_user_id || null,whatsapp_connection_id:connection.id,
    outreach_message_id:message?.id || null,campaign_id:message?.campaign_id || null,vendor_id:message?.vendor_id || null,rfx_event_id:message?.rfx_event_id || null,
    channel:"whatsapp",direction:event.kind === "inbound" ? "inbound" : "outbound",status:event.status,
    subject:message?.subject || null,body_preview:event.body,occurred_at:event.occurred_at,
    metadata:{provider:"meta",whatsapp_connection_id:connection.id,provider_message_id:event.provider_message_id,
      sender_address:connection.display_phone_number || null,sender_display_phone:connection.display_phone_number || null,
      sender_connection_type:connection.connection_mode || "unresolved",webhook_phone_number_id:webhookIdentity.phoneNumberId,webhook_waba_id:webhookIdentity.wabaId,
      from_phone:event.from_phone || null,received_at:receivedAt,callback:event,
      association:{state:message ? "linked" : "pending",reason:association.reason},target_binding:binding(message)}
  };
  // Reuse the existing UUID PK. The winner freezes both content and association.
  const insert = await supabase.from("contact_history").upsert(row,{onConflict:"id",ignoreDuplicates:true});
  if (insert.error) throw insert.error;
  const persisted = await readReceipt(supabase,connection,id);
  if (!persisted) throw new Error("CALLBACK_RECEIPT_NOT_CONFIRMED");
  return persisted;
}

async function reconcilePendingStatus(supabase: WhatsappWebhookSupabaseClient, connection: Record<string, unknown>, receipt: any) {
  const metadata = objectRecord(receipt.metadata);
  const association = objectRecord(metadata.association);
  if (receipt.outreach_message_id || receipt.direction !== "outbound" || association.state !== "pending" || association.reason !== "status_target_unresolved") return receipt;
  const event = objectRecord(metadata.callback);
  if (await callbackReceiptId(connection,event) !== receipt.id) throw new Error("CALLBACK_RECEIPT_MISMATCH");
  const candidates = (await scopedMessages(supabase,connection,event)).filter(row => !event.from_phone || normalizeMetaPhone(row.normalized_recipient_phone) === event.from_phone);
  if (candidates.length !== 1) return receipt;
  const message = candidates[0];
  const patch = {outreach_message_id:message.id,campaign_id:message.campaign_id || null,vendor_id:message.vendor_id || null,rfx_event_id:message.rfx_event_id || null,subject:message.subject || null,
    metadata:{...metadata,target_binding:binding(message),association:{state:"linked",reason:"provider_id_reconciled",initial_reason:association.reason,resolved_at:new Date().toISOString()}}};
  const result = await owned(supabase.from("contact_history").update(patch).eq("id",receipt.id).eq("whatsapp_connection_id",connection.id)
    .is("outreach_message_id",null).eq("metadata->association->>state","pending").eq("metadata->association->>reason","status_target_unresolved"),connection);
  if (result.error) throw result.error;
  const winner = await readReceipt(supabase,connection,receipt.id);
  if (!winner) throw new Error("CALLBACK_RECEIPT_NOT_CONFIRMED");
  return winner;
}

async function hasOpenAttempt(supabase: WhatsappWebhookSupabaseClient, connection: Record<string, unknown>, event: Record<string, unknown>) {
  for (const legacy of [false,true]) {
    let query = owned(supabase.from("outreach_messages").select("id").eq("channel","whatsapp").eq("status","sending"),connection);
    query = legacy ? query.is("whatsapp_connection_id",null) : query.eq("whatsapp_connection_id",connection.id);
    if (event.from_phone) query = query.in("normalized_recipient_phone",phoneSpellings(String(event.from_phone)));
    const result = await query.limit(1);
    if (result.error) throw result.error;
    if (result.data?.length) return true;
  }
  return false;
}

function exact(query: any, key: string, value: unknown) {
  return value === null || value === undefined ? query.is(key,null) : query.eq(key,value);
}

async function projectCallbackReceipt(supabase: WhatsappWebhookSupabaseClient, connection: Record<string, unknown>, receipt: any) {
  if (!receipt.outreach_message_id) return; // Visible pending evidence, no guessed RFx.
  const targetBinding = objectRecord(objectRecord(receipt.metadata).target_binding);
  const event = objectRecord(objectRecord(receipt.metadata).callback);
  if (await callbackReceiptId(connection,event) !== receipt.id) throw new Error("CALLBACK_RECEIPT_MISMATCH");
  for (let retry=0;retry<4;retry++) {
    const result = await owned(supabase.from("outreach_messages").select("*").eq("id",receipt.outreach_message_id),connection).maybeSingle();
    if (result.error) throw result.error;
    const current = result.data;
    if (!current || current.channel !== "whatsapp") throw new Error("CALLBACK_TARGET_CHANGED");
    for (const key of Object.keys(targetBinding)) {
      // The first successful projection may bind a legacy row to this connection.
      if (key === "whatsapp_connection_id" && targetBinding[key] === null && current[key] === connection.id) continue;
      if ((current[key] ?? null) !== targetBinding[key]) throw new Error("CALLBACK_TARGET_CHANGED");
    }
    // Only the sender finalizes its claim/approval receipt. A provider callback
    // may arrive before that write; keep its evidence and ask for redelivery.
    if (current.status === "sending" || (current.send_attempt_id && !current.send_completed_at)) throw new Error("CALLBACK_SEND_ATTEMPT_OPEN");
    const patch = callbackProjection(current,receipt,new Date().toISOString());
    if (!patch) return;
    Object.assign(patch,{whatsapp_connection_id:connection.id,sender_address:connection.display_phone_number || current.sender_address || null,sender_connection_type:connection.connection_mode || current.sender_connection_type || "unresolved"});
    let update = owned(supabase.from("outreach_messages").update(patch).eq("id",current.id).eq("channel","whatsapp"),connection);
    for (const key of ["updated_at","status","delivery_status",...Object.keys(targetBinding).filter(key => key !== "id")]) update = exact(update,key,current[key]);
    const saved = await update.select("id").maybeSingle();
    if (saved.error) throw saved.error;
    if (saved.data) return;
  }
  // Re-delivery resumes from the immutable receipt; never dispatches outbound.
  throw new Error("CALLBACK_PROJECTION_CONFLICT");
}

async function recordCallback(supabase: WhatsappWebhookSupabaseClient, event: any, connection: Record<string, unknown>, webhookIdentity: {phoneNumberId:string;wabaId:string}) {
  let receipt = await saveCallbackReceipt(supabase,connection,event,webhookIdentity);
  receipt = await reconcilePendingStatus(supabase,connection,receipt);
  if (!receipt.outreach_message_id && receipt.direction === "outbound") {
    const persistedEvent = objectRecord(objectRecord(receipt.metadata).callback);
    if (await hasOpenAttempt(supabase,connection,persistedEvent)) throw new Error("CALLBACK_SEND_ATTEMPT_OPEN");
    // Recheck after the open-attempt read, to cover completion between lookups.
    receipt = await reconcilePendingStatus(supabase,connection,receipt);
  }
  await projectCallbackReceipt(supabase,connection,receipt);
  return true;
}


Deno.serve(async (request) => {
  const jsonResponse = (body: unknown, status = 200) => baseJsonResponse(body, status, request);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
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
      return new Response(challenge, { headers: { ...corsHeaders(request), "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403, headers: corsHeaders(request) });
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

    const callbacks = [];
    let processed = 0;
    for (const { value, connection, phoneNumberId, wabaId } of resolvedChanges) {
      const webhookIdentity = {phoneNumberId,wabaId};
      // Explicit receive-only tracking route. Never enter vendor/autoreply handlers.
      if (phoneNumberId === TRACKING_SENDER.phoneId || wabaId === TRACKING_SENDER.wabaId) {
        if (objectRecord(connection.metadata).purpose !== 'fleetrocket_tracking') return jsonResponse({error:'Tracking sender is not configured.'},403);
        const receipts = await trackingEventReceipts(value,{phoneNumberId,wabaId});
        for (const receipt of receipts) {
          const {data,error} = await supabase.rpc('markos_tracking_sender_event',{p_connection_id:connection.id,p_event:receipt});
          if(error) throw new Error('Tracking event persistence failed.');
          if(data) processed += 1;
        }
        continue;
      }
      if (!cleanText(connection.owner_email)) return jsonResponse({error:"WhatsApp webhook owner could not be resolved."},403);
      for (const [key,kind] of [["statuses","status"],["messages","inbound"]]) {
        const items = value[key];
        if (items !== undefined && !Array.isArray(items)) throw new Error("INVALID_CALLBACK");
        for (const row of (items as unknown[] || [])) {
          const event = parseCallback(kind,row);
          if (event) callbacks.push({event,connection,webhookIdentity:{phoneNumberId,wabaId}});
        }
      }
    }
    for (const {event,connection,webhookIdentity} of callbacks) {
      if (await recordCallback(supabase,event,connection,webhookIdentity)) processed++;
      await forwardToFr8onboard(event,webhookIdentity.phoneNumberId);
    }
    return jsonResponse({ ok: true, processed });
  } catch (error) {
    const malformed = error instanceof SyntaxError || (error instanceof Error && error.message === "INVALID_CALLBACK");
    return jsonResponse({ error: malformed ? "Invalid WhatsApp callback." : "WhatsApp callback could not be persisted. Retry the same callback." }, malformed ? 400 : 503);
  }
});

