import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/kinde.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const GMAIL_TOKEN_ENCRYPTION_KEY = Deno.env.get("GMAIL_TOKEN_ENCRYPTION_KEY");
const GOOGLE_CHAT_ALLOWED_ACCOUNT = (Deno.env.get("GOOGLE_CHAT_ALLOWED_ACCOUNT") || Deno.env.get("GMAIL_ALLOWED_SENDER") || "sales@heymarksman.com").trim().toLowerCase();
const GOOGLE_CHAT_WEBHOOK_URL = Deno.env.get("GOOGLE_CHAT_WEBHOOK_URL");

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function cleanRateText(value: unknown) {
  const text = cleanText(value);
  if (!text || /^x$/i.test(text) || /^n\/?a$/i.test(text) || /^please estimate$/i.test(text) || /^tier\s*[123]$/i.test(text)) return null;
  const cleaned = text
    .replace(/\b(USD|US\$|DLLS?|DOLLARS?|MXN|MX\$|PESOS?|CAD|CAN\$)\b/gi, "")
    .replace(/[$,]/g, "")
    .trim();
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  return match ? match[0] : null;
}

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const rateText = cleanRateText(value);
  if (rateText) return Number(rateText);
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function relationRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return (value[0] || {}) as Record<string, unknown>;
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
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

async function googleTokenCryptoKey(usages: KeyUsage[]) {
  if (!GMAIL_TOKEN_ENCRYPTION_KEY) throw new Error("Google token encryption is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(GMAIL_TOKEN_ENCRYPTION_KEY));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, usages);
}

async function encryptGoogleToken(value: string) {
  const key = await googleTokenCryptoKey(["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ciphertext))}`;
}

async function decryptGoogleToken(value: unknown) {
  const text = cleanText(value);
  if (!text) throw new Error("Google token is missing.");
  const [version, ivText, ciphertextText] = text.split(":");
  if (version !== "v1" || !ivText || !ciphertextText) throw new Error("Google token format is invalid.");
  const key = await googleTokenCryptoKey(["decrypt"]);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivText) },
    key,
    base64ToBytes(ciphertextText)
  );
  return new TextDecoder().decode(plain);
}

function publicLane(row: Record<string, unknown>) {
  return {
    id: row.id,
    lane_number: row.lane_number,
    origin: row.origin || row.origin_city,
    destination: row.destination || row.destination_city,
    origin_city: row.origin_city,
    origin_state: row.origin_state,
    origin_market: row.origin_market,
    origin_region: row.origin_region,
    destination_city: row.destination_city,
    destination_state: row.destination_state,
    destination_market: row.destination_market,
    destination_region: row.destination_region,
    equipment: row.equipment,
    trailer: row.trailer,
    config: row.config,
    operation: row.operation,
    service: row.service,
    weekly_volume: row.weekly_volume,
    target_rate: row.target_rate,
    currency: row.currency || "USD"
  };
}

function publicEvent(row: Record<string, unknown>) {
  return {
    id: row.id,
    rfx_id: row.rfx_id,
    name: row.name,
    customer: row.customer,
    event_type: row.event_type,
    status: row.status,
    due_date: row.due_date,
    bid_visibility_mode: cleanText(row.bid_visibility_mode) || "anonymous_rank"
  };
}

function bidRoomVisibility(event: Record<string, unknown> = {}) {
  const mode = cleanText(event.bid_visibility_mode)?.toLowerCase() || "anonymous_rank";
  const normalizedMode = ["private", "anonymous_rank", "open_leaderboard"].includes(mode) ? mode : "anonymous_rank";
  return {
    mode: normalizedMode,
    competitor_names_visible: normalizedMode === "open_leaderboard",
    competitor_rates_visible: normalizedMode === "open_leaderboard",
    competitor_rank_visible: normalizedMode !== "private",
    competitor_activity_visible: normalizedMode !== "private",
    request_invite_enabled: true,
    open_book_enabled: true,
    refresh_seconds: 30
  };
}

function dueState(dueDate: unknown) {
  const due = cleanText(dueDate);
  if (!due) return { due_date: null, days_remaining: null, status: "no_deadline" };
  const dueAt = new Date(`${due}T23:59:59`);
  if (Number.isNaN(dueAt.getTime())) return { due_date: due, days_remaining: null, status: "unknown" };
  const now = new Date();
  const ms = dueAt.getTime() - now.getTime();
  const days = Math.ceil(ms / 86400000);
  return {
    due_date: due,
    days_remaining: days,
    status: days < 0 ? "closed" : days <= 1 ? "closing" : "open"
  };
}

function laneFitTags(lane: Record<string, unknown>, event: Record<string, unknown>) {
  return [
    cleanText(lane.equipment),
    cleanText(lane.trailer),
    cleanText(lane.config),
    cleanText(lane.operation),
    cleanText(lane.service),
    cleanText(lane.origin_market),
    cleanText(lane.destination_market),
    cleanText(event.event_type)
  ].filter(Boolean).slice(0, 6);
}

function businessBookStatus(row: Record<string, unknown>) {
  const status = String(cleanText(row.invitation_status) || "drafted").toLowerCase();
  const bidRate = cleanNumber(row.bid_rate);
  if (status === "awarded") return "awarded";
  if (bidRate !== null || ["quoted", "bid_submitted"].includes(status)) return "quoted";
  if (["invited", "viewed", "responded"].includes(status)) return "invited";
  return status || "drafted";
}

const BID_ROOM_CHAT_THREAD_TYPES = new Set(["event_group", "lane_group", "carrier_private"]);

function normalizeBidRoomThreadType(value: unknown) {
  const threadType = cleanText(value)?.toLowerCase() || "carrier_private";
  return BID_ROOM_CHAT_THREAD_TYPES.has(threadType) ? threadType : "carrier_private";
}

function bidRoomGoogleThreadKey(eventId: unknown, threadType: string, laneId: unknown, vendorId: unknown) {
  return [
    "rateware",
    "bid-room",
    cleanText(eventId) || "event",
    threadType,
    cleanText(laneId) || "event",
    cleanText(vendorId) || "group"
  ].join("-").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 190);
}

function bidRoomThreadTitle(threadType: string, event: Record<string, unknown>, lane?: Record<string, unknown> | null, vendor?: Record<string, unknown> | null) {
  const eventRef = [cleanText(event.rfx_id), cleanText(event.name)].filter(Boolean).join(" | ") || "Bid Room";
  if (threadType === "carrier_private") return `${eventRef} | Private: ${cleanText(vendor?.vendor_name || vendor?.domain) || "Carrier"}`;
  if (threadType === "lane_group") return `${eventRef} | Lane: ${[lane?.origin, lane?.destination].filter(Boolean).join(" -> ") || lane?.lane_number || "Selected lane"}`;
  return `${eventRef} | Event group`;
}

async function googleChatAccessToken(supabase: ReturnType<typeof createClient>, ownerEmail: string) {
  const result = await supabase
    .from("google_chat_connections")
    .select("*")
    .eq("owner_email", ownerEmail)
    .eq("account_email", GOOGLE_CHAT_ALLOWED_ACCOUNT)
    .eq("status", "connected")
    .maybeSingle();
  if (result.error) throw result.error;
  const connection = result.data;
  if (!connection) throw new Error(`Connect ${GOOGLE_CHAT_ALLOWED_ACCOUNT} in Settings before using Google Chat.`);

  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (connection.access_token_encrypted && expiresAt > Date.now() + 120_000) {
    return await decryptGoogleToken(connection.access_token_encrypted);
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error("Google OAuth client is not configured.");
  const refreshToken = await decryptGoogleToken(connection.refresh_token_encrypted);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) {
    const message = cleanText(tokenData.error_description) || cleanText(tokenData.error) || "Google Chat token refresh failed.";
    await supabase
      .from("google_chat_connections")
      .update({ status: "error", last_error: message, updated_at: new Date().toISOString() })
      .eq("owner_email", ownerEmail)
      .eq("account_email", GOOGLE_CHAT_ALLOWED_ACCOUNT);
    throw new Error(message);
  }

  const accessToken = String(tokenData.access_token);
  const expiresIn = Number(tokenData.expires_in) || 3600;
  const update = await supabase
    .from("google_chat_connections")
    .update({
      access_token_encrypted: await encryptGoogleToken(accessToken),
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      last_error: null,
      updated_at: new Date().toISOString()
    })
    .eq("owner_email", ownerEmail)
    .eq("account_email", GOOGLE_CHAT_ALLOWED_ACCOUNT);
  if (update.error) throw update.error;
  return accessToken;
}

async function syncBidRoomMessageToGoogleChatApi(
  supabase: ReturnType<typeof createClient>,
  thread: Record<string, unknown>,
  message: Record<string, unknown>,
  event: Record<string, unknown>
) {
  const ownerEmail = cleanText(message.owner_email || thread.owner_email || event.owner_email);
  if (!ownerEmail) return { status: "not_configured", name: null };
  const connectionResult = await supabase
    .from("google_chat_connections")
    .select("default_space_name,status")
    .eq("owner_email", ownerEmail)
    .eq("account_email", GOOGLE_CHAT_ALLOWED_ACCOUNT)
    .eq("status", "connected")
    .maybeSingle();
  if (connectionResult.error) throw connectionResult.error;
  const spaceName = cleanText(connectionResult.data?.default_space_name);
  if (!spaceName) return { status: "not_configured", name: null };

  const threadKey = cleanText(thread.google_chat_thread_key) || bidRoomGoogleThreadKey(thread.rfx_event_id, String(thread.thread_type || "event_group"), thread.rfx_lane_id, thread.vendor_id);
  const sender = cleanText(message.sender_name || message.sender_email) || "Carrier";
  const title = cleanText(thread.title) || cleanText(event.rfx_id || event.name) || "Bid Room";
  const text = `*${title}*\n${sender}: ${cleanText(message.body) || ""}`;
  try {
    const accessToken = await googleChatAccessToken(supabase, ownerEmail);
    const response = await fetch(`https://chat.googleapis.com/v1/${spaceName}/messages?messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        thread: { threadKey }
      })
    });
    const payload = await response.json().catch(() => ({}));
    const status = response.ok ? "synced" : "error";
    await supabase.from("bid_room_chat_messages").update({
      google_chat_message_name: cleanText(payload.name),
      google_chat_sync_status: status
    }).eq("id", message.id);
    await supabase.from("bid_room_chat_threads").update({
      google_chat_space: spaceName,
      google_chat_thread_key: threadKey,
      google_chat_sync_status: status,
      updated_at: new Date().toISOString()
    }).eq("id", thread.id);
    if (!response.ok) {
      await supabase.from("google_chat_connections").update({
        last_error: cleanText(payload?.error?.message) || `Google Chat send failed (${response.status}).`,
        updated_at: new Date().toISOString()
      }).eq("owner_email", ownerEmail).eq("account_email", GOOGLE_CHAT_ALLOWED_ACCOUNT);
    }
    return { status, name: cleanText(payload.name), space_name: spaceName };
  } catch (error) {
    await supabase.from("bid_room_chat_messages").update({ google_chat_sync_status: "error" }).eq("id", message.id);
    await supabase.from("bid_room_chat_threads").update({ google_chat_sync_status: "error" }).eq("id", thread.id);
    return { status: "error", name: null, error: String(error?.message || error) };
  }
}

async function syncBidRoomMessageToGoogleChat(
  supabase: ReturnType<typeof createClient>,
  thread: Record<string, unknown>,
  message: Record<string, unknown>,
  event: Record<string, unknown>
) {
  const apiSync = await syncBidRoomMessageToGoogleChatApi(supabase, thread, message, event);
  if (apiSync.status !== "not_configured") return apiSync;
  if (!GOOGLE_CHAT_WEBHOOK_URL) return { status: "not_configured", name: null };
  const threadKey = cleanText(thread.google_chat_thread_key) || bidRoomGoogleThreadKey(thread.rfx_event_id, String(thread.thread_type || "event_group"), thread.rfx_lane_id, thread.vendor_id);
  const url = new URL(GOOGLE_CHAT_WEBHOOK_URL);
  url.searchParams.set("threadKey", threadKey);
  const sender = cleanText(message.sender_name || message.sender_email) || "Carrier";
  const title = cleanText(thread.title) || cleanText(event.rfx_id || event.name) || "Bid Room";
  const text = `*${title}*\n${sender}: ${cleanText(message.body) || ""}`;
  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    const payload = await response.json().catch(() => ({}));
    const status = response.ok ? "synced" : "error";
    await supabase.from("bid_room_chat_messages").update({
      google_chat_message_name: cleanText(payload.name),
      google_chat_sync_status: status
    }).eq("id", message.id);
    await supabase.from("bid_room_chat_threads").update({
      google_chat_thread_key: threadKey,
      google_chat_sync_status: status,
      updated_at: new Date().toISOString()
    }).eq("id", thread.id);
    return { status, name: cleanText(payload.name) };
  } catch (error) {
    await supabase.from("bid_room_chat_messages").update({ google_chat_sync_status: "error" }).eq("id", message.id);
    await supabase.from("bid_room_chat_threads").update({ google_chat_sync_status: "error" }).eq("id", thread.id);
    return { status: "error", name: null, error: String(error?.message || error) };
  }
}

async function currentInvitationContext(supabase: ReturnType<typeof createClient>, token: string) {
  const result = await supabase
    .from("rfx_lane_vendors")
    .select(`
      id,
      rfx_event_id,
      rfx_lane_id,
      vendor_id,
      invitation_status,
      invitation_token,
      vendors(id,vendor_name,domain,primary_email),
      rfx_events(id,owner_user_id,owner_email,rfx_id,name,customer,event_type,status,due_date,bid_visibility_mode),
      rfx_lanes(id,rfx_event_id,lane_number,origin,destination)
    `)
    .eq("invitation_token", token)
    .single();
  if (result.error) throw result.error;
  return result.data;
}

async function findOrCreateCarrierChatThread(
  supabase: ReturnType<typeof createClient>,
  invitation: Record<string, unknown>,
  input: Record<string, unknown>
) {
  const event = relationRecord(invitation.rfx_events);
  const lane = relationRecord(invitation.rfx_lanes);
  const vendor = relationRecord(invitation.vendors);
  const threadType = normalizeBidRoomThreadType(input.thread_type || input.scope);
  const laneId = threadType === "event_group" ? null : cleanText(lane.id || invitation.rfx_lane_id);
  const vendorId = threadType === "carrier_private" ? cleanText(vendor.id || invitation.vendor_id) : null;
  const owner = {
    owner_user_id: cleanText(event.owner_user_id),
    owner_email: cleanText(event.owner_email)
  };

  let query = supabase
    .from("bid_room_chat_threads")
    .select("*, vendors(vendor_name,domain), rfx_lanes(lane_number,origin,destination)")
    .eq("rfx_event_id", event.id)
    .eq("thread_type", threadType)
    .neq("status", "archived");
  query = laneId ? query.eq("rfx_lane_id", laneId) : query.is("rfx_lane_id", null);
  query = vendorId ? query.eq("vendor_id", vendorId) : query.is("vendor_id", null);
  const existing = await query.maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const row = {
    owner_user_id: owner.owner_user_id,
    owner_email: owner.owner_email,
    rfx_event_id: event.id,
    rfx_lane_id: laneId,
    vendor_id: vendorId,
    thread_type: threadType,
    title: bidRoomThreadTitle(threadType, event, lane, vendor),
    google_chat_thread_key: bidRoomGoogleThreadKey(event.id, threadType, laneId, vendorId),
    google_chat_sync_status: "ready",
    metadata: { source: "carrier_portal", rfx_id: event.rfx_id || null }
  };
  const created = await supabase
    .from("bid_room_chat_threads")
    .insert(row)
    .select("*, vendors(vendor_name,domain), rfx_lanes(lane_number,origin,destination)")
    .single();
  if (created.error) throw created.error;
  return created.data;
}

async function listCarrierBidRoomChat(supabase: ReturnType<typeof createClient>, invitation: Record<string, unknown>) {
  const event = relationRecord(invitation.rfx_events);
  const laneId = cleanText(invitation.rfx_lane_id);
  const vendorId = cleanText(invitation.vendor_id);
  const threadsResult = await supabase
    .from("bid_room_chat_threads")
    .select("*, vendors(vendor_name,domain), rfx_lanes(lane_number,origin,destination)")
    .eq("rfx_event_id", event.id)
    .neq("status", "archived")
    .or([
      "thread_type.eq.event_group",
      `and(thread_type.eq.lane_group,rfx_lane_id.eq.${laneId})`,
      `and(thread_type.eq.carrier_private,vendor_id.eq.${vendorId})`
    ].join(","))
    .order("updated_at", { ascending: false });
  if (threadsResult.error) throw threadsResult.error;
  const threads = threadsResult.data || [];
  const threadIds = threads.map((thread) => thread.id).filter(Boolean);
  const messagesResult = threadIds.length
    ? await supabase
        .from("bid_room_chat_messages")
        .select("*, vendors(vendor_name,domain)")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (messagesResult.error) throw messagesResult.error;
  const messagesByThread = new Map<string, Record<string, unknown>[]>();
  for (const message of messagesResult.data || []) {
    const list = messagesByThread.get(String(message.thread_id)) || [];
    list.push(message);
    messagesByThread.set(String(message.thread_id), list);
  }
  const chatConnection = await supabase
    .from("google_chat_connections")
    .select("default_space_name,status")
    .eq("owner_email", cleanText(event.owner_email))
    .eq("account_email", GOOGLE_CHAT_ALLOWED_ACCOUNT)
    .eq("status", "connected")
    .maybeSingle();
  if (chatConnection.error) throw chatConnection.error;
  return {
    google_chat_configured: Boolean(chatConnection.data?.default_space_name || GOOGLE_CHAT_WEBHOOK_URL),
    rows: threads.map((thread) => ({
      ...thread,
      messages: messagesByThread.get(String(thread.id)) || []
    }))
  };
}

async function postCarrierBidRoomChatMessage(
  supabase: ReturnType<typeof createClient>,
  invitation: Record<string, unknown>,
  input: Record<string, unknown>
) {
  const body = cleanText(input.body || input.message);
  if (!body) throw new Error("Message body is required.");
  const event = relationRecord(invitation.rfx_events);
  const vendor = relationRecord(invitation.vendors);
  const thread = await findOrCreateCarrierChatThread(supabase, invitation, input);
  const row = {
    owner_user_id: cleanText(event.owner_user_id),
    owner_email: cleanText(event.owner_email),
    thread_id: thread.id,
    rfx_event_id: event.id,
    rfx_lane_id: thread.rfx_lane_id || null,
    vendor_id: cleanText(vendor.id || invitation.vendor_id),
    sender_role: "carrier",
    sender_name: cleanText(vendor.vendor_name || vendor.domain) || "Carrier",
    sender_email: cleanText(vendor.primary_email),
    body,
    google_chat_sync_status: "pending",
    metadata: { source: "carrier_portal" }
  };
  const messageResult = await supabase.from("bid_room_chat_messages").insert(row).select("*, vendors(vendor_name,domain)").single();
  if (messageResult.error) throw messageResult.error;
  await supabase.from("bid_room_chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", thread.id);
  const sync = await syncBidRoomMessageToGoogleChat(supabase, thread, messageResult.data, event);
  return { thread, message: { ...messageResult.data, google_chat_sync_status: sync.status }, google_chat_configured: sync.status !== "not_configured" || Boolean(GOOGLE_CHAT_WEBHOOK_URL) };
}

function liveBoardFromRows(currentInvitation: Record<string, unknown>, peerRows: Record<string, unknown>[]) {
  const event = relationRecord(currentInvitation.rfx_events);
  const visibility = bidRoomVisibility(event);
  const rows = [currentInvitation, ...peerRows]
    .filter((row) => cleanNumber(row.bid_rate) !== null)
    .map((row) => ({
      id: row.id,
      amount: cleanNumber(row.bid_rate) as number,
      currency: cleanText(row.currency) || cleanText(currentInvitation.currency) || "USD",
      weekly_capacity: cleanNumber(row.weekly_capacity),
      transit_days: cleanNumber(row.transit_days),
      responded_at: cleanText(row.responded_at || row.updated_at),
      vendor_name: cleanText(relationRecord(row.vendors).vendor_name),
      vendor_domain: cleanText(relationRecord(row.vendors).domain),
      is_current: row.id === currentInvitation.id
    }))
    .sort((a, b) => a.amount - b.amount);
  const currentIndex = rows.findIndex((row) => row.is_current);
  const currentAmount = cleanNumber(currentInvitation.bid_rate);
  const bestAmount = rows[0]?.amount || null;
  const currency = rows[0]?.currency || cleanText(currentInvitation.currency) || "USD";
  const deltaToBest = currentAmount !== null && bestAmount !== null ? currentAmount - bestAmount : null;
  const deltaPct = currentAmount !== null && bestAmount ? deltaToBest / bestAmount : null;
  const positionSignal = currentAmount === null
    ? (rows.length ? "Market is active" : "Awaiting first offer")
    : currentIndex === 0
      ? "Leading offer"
      : Number(deltaPct) <= 0.05
        ? "Competitive range"
        : "Needs pricing review";
  const guidance = currentAmount === null
    ? "Submit your all-in offer to unlock your anonymous rank."
    : currentIndex === 0
      ? "Your offer is currently leading. Keep capacity and assumptions current."
      : Number(deltaPct) <= 0.05
        ? "You are close to the leading range. Review capacity, transit, and price before the deadline."
        : "Your offer is behind the leading range. Reprice only if this lane is strategic.";
  const amountDisplayFor = (row: { is_current: boolean; amount: number }) => {
    if (row.is_current) return "Your submitted offer";
    if (visibility.mode === "private") return "Private";
    if (visibility.competitor_rates_visible) return "Visible";
    if (currentAmount === null) return "Hidden until you bid";
    if (row.amount < currentAmount) return "Lower than your offer";
    if (row.amount === currentAmount) return "Comparable to your offer";
    return "Above your offer";
  };
  const visibleRows = visibility.mode === "private" ? rows.filter((row) => row.is_current) : rows;
  return {
    updated_at: new Date().toISOString(),
    visibility,
    bid_count: visibility.competitor_activity_visible ? rows.length : rows.filter((row) => row.is_current).length,
    current_rank: visibility.competitor_rank_visible && currentIndex >= 0 ? currentIndex + 1 : null,
    best_rate: currentIndex === 0 ? currentAmount : null,
    best_rate_visible: visibility.competitor_rates_visible || currentIndex === 0,
    currency,
    position_signal: positionSignal,
    guidance: visibility.mode === "private"
      ? "This event is running in private mode. Procurement can see all offers, but carriers cannot see competitors."
      : guidance,
    delta_to_leader: deltaToBest,
    delta_bucket: deltaToBest === null
      ? null
      : deltaToBest <= 0
        ? "leading"
        : deltaToBest <= 250
          ? "within_250"
          : deltaToBest <= 500
            ? "within_500"
            : "above_500",
    rows: visibleRows.map((row, index) => ({
      rank: index + 1,
      bidder: row.is_current
        ? "Your offer"
        : visibility.competitor_names_visible
          ? (row.vendor_name || row.vendor_domain || `Carrier ${index + 1}`)
          : `Anonymous carrier ${index + 1}`,
      amount: row.is_current || visibility.competitor_rates_visible ? row.amount : null,
      amount_display: amountDisplayFor(row),
      currency: row.currency,
      weekly_capacity: row.weekly_capacity,
      transit_days: row.transit_days,
      responded_at: row.responded_at,
      is_current: row.is_current
    }))
  };
}

function carrierBusinessBook(currentInvitation: Record<string, unknown>, invitedRows: Record<string, unknown>[], openLaneRows: Record<string, unknown>[]) {
  const vendor = relationRecord(currentInvitation.vendors);
  const invitedLaneIds = new Set(invitedRows.map((row) => cleanText(row.rfx_lane_id)).filter(Boolean));
  const invited = invitedRows.map((row) => {
    const lane = relationRecord(row.rfx_lanes);
    const event = relationRecord(row.rfx_events);
    return {
      participation_status: cleanText(row.invitation_status) || "drafted",
      business_status: businessBookStatus(row),
      is_invited: true,
      invitation_token: row.invitation_token,
      invitation_id: row.id,
      bid_rate: cleanNumber(row.bid_rate),
      currency: cleanText(row.currency) || cleanText(lane.currency) || "USD",
      weekly_capacity: cleanNumber(row.weekly_capacity),
      transit_days: cleanNumber(row.transit_days),
      invited_at: row.invited_at,
      responded_at: row.responded_at,
      due_state: dueState(relationRecord(row.rfx_events).due_date),
      fit_tags: laneFitTags(lane, event),
      event: publicEvent(event),
      lane: publicLane(lane)
    };
  });
  const open_not_invited = openLaneRows
    .filter((lane) => !invitedLaneIds.has(cleanText(lane.id)))
    .map((lane) => ({
      participation_status: "not_invited",
      business_status: "open",
      is_invited: false,
      due_state: dueState(relationRecord(lane.rfx_events).due_date),
      fit_tags: laneFitTags(lane, relationRecord(lane.rfx_events)),
      event: publicEvent(relationRecord(lane.rfx_events)),
      lane: publicLane(lane)
    }));
  const quoted = invited.filter((row) => row.bid_rate !== null || ["quoted", "bid_submitted", "awarded"].includes(String(row.participation_status || "").toLowerCase()));
  return {
    visibility: bidRoomVisibility(relationRecord(currentInvitation.rfx_events)),
    carrier: {
      vendor_name: vendor.vendor_name || vendor.domain || "Carrier",
      domain: vendor.domain || "",
      primary_email: vendor.primary_email || ""
    },
    summary: {
      invited: invited.length,
      not_invited_open: open_not_invited.length,
      quoted: quoted.length,
      awarded: invited.filter((row) => row.participation_status === "awarded").length
    },
    invited,
    open_not_invited,
    quoted
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const supabase = getClient();
    const body = await request.json().catch(() => ({}));
    const token = cleanText(body.token);
    if (!token) return jsonResponse({ error: "Invitation token is required." }, 400);

    if (body.action === "get_invitation") {
      const result = await supabase
        .from("rfx_lane_vendors")
        .select(`
          id,
          rfx_event_id,
          rfx_lane_id,
          vendor_id,
          invitation_status,
          invitation_token,
          invited_at,
          viewed_at,
          responded_at,
          bid_rate,
          currency,
          weekly_capacity,
          transit_days,
          notes,
          vendors(vendor_name,domain,primary_email),
          rfx_events(id,owner_user_id,owner_email,rfx_id,name,customer,event_type,status,due_date,bid_visibility_mode,notes),
          rfx_lanes(id,rfx_event_id,lane_number,origin,destination,origin_city,origin_state,origin_market,origin_region,destination_city,destination_state,destination_market,destination_region,equipment,trailer,config,operation,service,weekly_volume,target_rate,currency)
        `)
        .eq("invitation_token", token)
        .single();
      if (result.error) throw result.error;

      if (!result.data.viewed_at) {
        await supabase
          .from("rfx_lane_vendors")
          .update({
            invitation_status: result.data.invitation_status === "invited" ? "viewed" : result.data.invitation_status,
            viewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", result.data.id);
      }

      const peersResult = await supabase
        .from("rfx_lane_vendors")
        .select("id,bid_rate,currency,weekly_capacity,transit_days,responded_at,updated_at,vendors(vendor_name,domain)")
        .eq("rfx_lane_id", result.data.rfx_lane_id)
        .neq("id", result.data.id)
        .not("bid_rate", "is", null)
        .in("invitation_status", ["quoted", "bid_submitted", "awarded"]);
      if (peersResult.error) throw peersResult.error;

      const currentEvent = relationRecord(result.data.rfx_events);
      const ownerEmail = cleanText(currentEvent.owner_email);
      const invitedResult = ownerEmail
        ? await supabase
            .from("rfx_lane_vendors")
            .select(`
              id,
              rfx_event_id,
              rfx_lane_id,
              vendor_id,
              invitation_status,
              invitation_token,
              invited_at,
              responded_at,
              bid_rate,
              currency,
              weekly_capacity,
              transit_days,
              rfx_events!inner(id,owner_email,rfx_id,name,customer,event_type,status,due_date,bid_visibility_mode),
              rfx_lanes(id,rfx_event_id,lane_number,origin,destination,origin_city,origin_state,origin_market,origin_region,destination_city,destination_state,destination_market,destination_region,equipment,trailer,config,operation,service,weekly_volume,target_rate,currency)
            `)
            .eq("vendor_id", result.data.vendor_id)
            .eq("rfx_events.owner_email", ownerEmail)
            .neq("invitation_status", "archived")
            .order("responded_at", { ascending: false, nullsFirst: false })
            .limit(500)
        : { data: [], error: null };
      if (invitedResult.error) throw invitedResult.error;

      const openLanesResult = ownerEmail
        ? await supabase
            .from("rfx_lanes")
            .select(`
              id,
              rfx_event_id,
              lane_number,
              origin,
              destination,
              origin_city,
              origin_state,
              origin_market,
              origin_region,
              destination_city,
              destination_state,
              destination_market,
              destination_region,
              equipment,
              trailer,
              config,
              operation,
              service,
              weekly_volume,
              target_rate,
              currency,
              rfx_events!inner(id,owner_email,rfx_id,name,customer,event_type,status,due_date,bid_visibility_mode)
            `)
            .eq("rfx_events.owner_email", ownerEmail)
            .eq("rfx_events.status", "open")
            .order("lane_number", { ascending: true })
            .limit(500)
        : { data: [], error: null };
      if (openLanesResult.error) throw openLanesResult.error;

      return jsonResponse({
        invitation: result.data,
        live_board: liveBoardFromRows(result.data, peersResult.data || []),
        carrier_book: carrierBusinessBook(result.data, invitedResult.data || [], openLanesResult.data || [])
      });
    }

    if (body.action === "list_bid_room_chat") {
      const invitation = await currentInvitationContext(supabase, token);
      return jsonResponse(await listCarrierBidRoomChat(supabase, invitation));
    }

    if (body.action === "post_bid_room_chat_message") {
      const invitation = await currentInvitationContext(supabase, token);
      return jsonResponse(await postCarrierBidRoomChatMessage(supabase, invitation, body));
    }

    if (body.action === "request_lane_access") {
      const laneId = cleanText(body.lane_id);
      if (!laneId) return jsonResponse({ error: "Lane id is required." }, 400);
      const contextResult = await supabase
        .from("rfx_lane_vendors")
        .select("id,vendor_id,rfx_events(id,owner_user_id,owner_email,rfx_id,name),vendors(vendor_name,domain,primary_email)")
        .eq("invitation_token", token)
        .single();
      if (contextResult.error) throw contextResult.error;
      const currentEvent = relationRecord(contextResult.data.rfx_events);
      const ownerEmail = cleanText(currentEvent.owner_email);
      const laneResult = await supabase
        .from("rfx_lanes")
        .select("id,rfx_event_id,origin,destination,rfx_events!inner(id,owner_email,rfx_id,name)")
        .eq("id", laneId)
        .eq("rfx_events.owner_email", ownerEmail)
        .single();
      if (laneResult.error) throw laneResult.error;
      const existing = await supabase
        .from("rfx_lane_vendors")
        .select("id,invitation_status")
        .eq("vendor_id", contextResult.data.vendor_id)
        .eq("rfx_lane_id", laneId)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) return jsonResponse({ requested: false, status: existing.data.invitation_status, message: "Carrier already has this lane in its book." });

      const lane = laneResult.data;
      const laneEvent = relationRecord(lane.rfx_events);
      const vendor = relationRecord(contextResult.data.vendors);
      const history = await supabase.from("contact_history").insert({
        owner_user_id: currentEvent.owner_user_id || null,
        owner_email: ownerEmail,
        vendor_id: contextResult.data.vendor_id,
        rfx_event_id: lane.rfx_event_id,
        channel: "portal",
        direction: "inbound",
        status: "requested_invite",
        subject: `${laneEvent.rfx_id || "RFx"} carrier requested lane access`,
        body_preview: [
          vendor.vendor_name || vendor.domain || "Carrier",
          lane.origin && lane.destination ? `${lane.origin} -> ${lane.destination}` : null
        ].filter(Boolean).join(" | "),
        metadata: { source: "carrier_business_book", requested_lane_id: laneId }
      });
      if (history.error) throw history.error;
      return jsonResponse({ requested: true, message: "Access request recorded." });
    }

    if (body.action === "submit_bid") {
      const bidRate = cleanNumber(body.bid_rate);
      if (bidRate === null) return jsonResponse({ error: "Bid rate must be a valid number." }, 400);
      const invitationResult = await supabase
        .from("rfx_lane_vendors")
        .select(`
          id,
          rfx_event_id,
          rfx_lane_id,
          vendor_id,
          vendors(vendor_name,domain,primary_email),
          rfx_events(id,owner_user_id,owner_email,rfx_id,name,customer),
          rfx_lanes(origin,destination,equipment,trailer,operation,service)
        `)
        .eq("invitation_token", token)
        .single();
      if (invitationResult.error) throw invitationResult.error;

      const patch = {
        invitation_status: "quoted",
        bid_rate: bidRate,
        currency: cleanText(body.currency)?.toUpperCase() || "USD",
        weekly_capacity: cleanNumber(body.weekly_capacity),
        transit_days: cleanNumber(body.transit_days),
        notes: cleanText(body.notes),
        response_source: "carrier_portal",
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const result = await supabase
        .from("rfx_lane_vendors")
        .update(patch)
        .eq("id", invitationResult.data.id)
        .select("id,invitation_status,bid_rate,currency,weekly_capacity,transit_days,notes,responded_at")
        .single();
      if (result.error) throw result.error;

      const rfxEvent = Array.isArray(invitationResult.data.rfx_events)
        ? invitationResult.data.rfx_events[0]
        : invitationResult.data.rfx_events;
      const vendor = Array.isArray(invitationResult.data.vendors)
        ? invitationResult.data.vendors[0]
        : invitationResult.data.vendors;
      const lane = Array.isArray(invitationResult.data.rfx_lanes)
        ? invitationResult.data.rfx_lanes[0]
        : invitationResult.data.rfx_lanes;
      if (rfxEvent?.owner_email) {
        await supabase.from("contact_history").insert({
          owner_user_id: rfxEvent.owner_user_id || null,
          owner_email: rfxEvent.owner_email || null,
          vendor_id: invitationResult.data.vendor_id,
          rfx_event_id: invitationResult.data.rfx_event_id,
          channel: "portal",
          direction: "inbound",
          status: "quoted",
          subject: `${rfxEvent.rfx_id || "RFx"} carrier quote submitted`,
          body_preview: [
            vendor?.vendor_name || vendor?.domain || "Carrier",
            `${bidRate} ${patch.currency}`,
            lane?.origin && lane?.destination ? `${lane.origin} -> ${lane.destination}` : null
          ].filter(Boolean).join(" | "),
          metadata: {
            source: "rfx_bid_portal",
            rfx_lane_vendor_id: invitationResult.data.id,
            rfx_lane_id: invitationResult.data.rfx_lane_id
          }
        });
      }
      return jsonResponse({ row: result.data });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    return jsonResponse({ error: error.message }, 400);
  }
});
