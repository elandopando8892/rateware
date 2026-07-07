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

function cleanBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const text = cleanText(value)?.toLowerCase();
  if (!text) return null;
  if (["true", "1", "yes", "y", "on", "checked"].includes(text)) return true;
  if (["false", "0", "no", "n", "off", "unchecked"].includes(text)) return false;
  return null;
}

function cleanTimestamp(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanPercent(value: unknown) {
  const numberValue = cleanNumber(value);
  if (numberValue === null) return null;
  return Math.min(100, Math.max(0, numberValue));
}

function strictBidNumber(value: unknown, label: string, options: { required?: boolean; positive?: boolean } = {}) {
  const text = cleanText(value);
  if (!text) {
    if (options.required) throw new Error(`${label} is required.`);
    return null;
  }
  const normalized = text.replace(/[$,]/g, "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`${label} must be numeric.`);
  }
  const numberValue = Number(normalized);
  if (!Number.isFinite(numberValue)) throw new Error(`${label} must be numeric.`);
  if (options.positive !== false && numberValue <= 0) throw new Error(`${label} must be greater than zero.`);
  return numberValue;
}

function strictPercentNumber(value: unknown, label: string) {
  const numberValue = strictBidNumber(value, label, { positive: false });
  if (numberValue === null) return null;
  if (numberValue < 0 || numberValue > 100) throw new Error(`${label} must be between 0 and 100.`);
  return numberValue;
}

function strictCommercialSharePercent(value: unknown, label: string) {
  const numberValue = strictBidNumber(value, label, { positive: false, required: true });
  if (numberValue === null) throw new Error(`${label} is required for this commercial structure.`);
  if (numberValue < 2 || numberValue > 5) throw new Error(`${label} must be between 2% and 5%.`);
  return numberValue;
}

function strictCurrencyCode(value: unknown, fallback = "USD") {
  const currency = (cleanText(value) || fallback || "USD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be a 3-letter code like USD, MXN, or CAD.");
  return currency;
}

function normalizeCommercialModel(value: unknown) {
  const text = cleanText(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  if (!text) return null;
  const aliases: Record<string, string> = {
    direct: "direct_cost_plus",
    direct_carrier: "direct_cost_plus",
    cost_plus: "direct_cost_plus",
    direct_cost_plus: "direct_cost_plus",
    carrier_share: "carrier_share",
    shared_margin: "carrier_share",
    share: "carrier_share",
    xbf: "xbf_buy_sell",
    buy_sell: "xbf_buy_sell",
    xbf_buy_sell: "xbf_buy_sell"
  };
  const normalized = aliases[text] || text;
  return ["direct_cost_plus", "carrier_share", "xbf_buy_sell"].includes(normalized) ? normalized : null;
}

function availabilityValidationStatus(value: unknown, mirrorEnabled: boolean) {
  const text = cleanText(value)?.toLowerCase();
  if (text && ["not_requested", "mirror_requested", "mirror_enabled", "validated", "rejected"].includes(text)) return text;
  return mirrorEnabled ? "mirror_requested" : "not_requested";
}

function relationRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return (value[0] || {}) as Record<string, unknown>;
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
  const awardRole = String(cleanText(row.award_role) || "").toLowerCase();
  const event = relationRecord(row.rfx_events);
  const bidRate = cleanNumber(row.bid_rate);
  if (awardRole === "primary") return "awarded";
  if (awardRole === "backup") return "backup";
  if (String(cleanText(event.status) || "").toLowerCase() === "awarded" && (bidRate !== null || ["invited", "viewed", "responded", "quoted", "bid_submitted"].includes(status))) return "not_awarded";
  if (status === "awarded") return "awarded";
  if (bidRate !== null || ["quoted", "bid_submitted"].includes(status)) return "quoted";
  if (["invited", "viewed", "responded"].includes(status)) return "invited";
  return status || "drafted";
}

function awardOutcome(row: Record<string, unknown>) {
  const status = businessBookStatus(row);
  if (status === "awarded") return "awarded";
  if (status === "backup") return "backup";
  if (status === "not_awarded") return "not_awarded";
  return "pending";
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
      google_chat_thread_name: cleanText(payload?.thread?.name),
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
      google_chat_thread_name: cleanText(payload?.thread?.name),
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

function googleChatConnectionCanReadMessages(connection: Record<string, unknown> | null | undefined) {
  const scopes = Array.isArray(connection?.scopes) ? connection?.scopes.map(String) : [];
  return scopes.includes("https://www.googleapis.com/auth/chat.messages.readonly")
    || scopes.includes("https://www.googleapis.com/auth/chat.messages");
}

function googleChatMessageThreadName(message: Record<string, unknown>) {
  return cleanText(objectRecord(message.thread).name);
}

function googleChatMessageBody(message: Record<string, unknown>) {
  return cleanText(message.text || message.argumentText || message.formattedText);
}

async function syncGoogleChatInboundMessagesForThreads(
  supabase: ReturnType<typeof createClient>,
  ownerEmail: string | null,
  threads: Record<string, unknown>[],
  input: Record<string, unknown> = {}
) {
  const owner = cleanText(ownerEmail);
  const candidateThreads = (threads || []).filter((thread) => cleanText(thread.id) && cleanText(thread.rfx_event_id));
  if (!owner || !candidateThreads.length) return { status: "skipped", imported: 0, skipped: 0, reason: "No Bid Room threads to sync." };

  const connectionResult = await supabase
    .from("google_chat_connections")
    .select("*")
    .eq("owner_email", owner)
    .eq("account_email", GOOGLE_CHAT_ALLOWED_ACCOUNT)
    .eq("status", "connected")
    .maybeSingle();
  if (connectionResult.error) throw connectionResult.error;
  const connection = connectionResult.data;
  const spaceName = cleanText(connection?.default_space_name);
  if (!connection || !spaceName) return { status: "not_configured", imported: 0, skipped: 0 };
  if (!googleChatConnectionCanReadMessages(connection)) {
    return {
      status: "needs_reconnect",
      imported: 0,
      skipped: 0,
      reason: `Reconnect Google Chat in Settings to allow Rateware to read messages from ${spaceName}.`
    };
  }

  const accessToken = await googleChatAccessToken(supabase, owner);
  const url = new URL(`https://chat.googleapis.com/v1/${spaceName}/messages`);
  url.searchParams.set("pageSize", String(Math.min(Math.max(Number(input.limit) || 100, 10), 100)));
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = cleanText(payload?.error?.message) || `Google Chat message sync failed (${response.status}).`;
    await supabase.from("google_chat_connections").update({
      last_error: message,
      updated_at: new Date().toISOString()
    }).eq("owner_email", owner).eq("account_email", GOOGLE_CHAT_ALLOWED_ACCOUNT);
    return { status: "error", imported: 0, skipped: 0, error: message };
  }

  const googleMessages = Array.isArray(payload.messages)
    ? payload.messages
        .filter((message: Record<string, unknown>) => cleanText(message.name))
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
          const aTime = new Date(String(a.createTime || 0)).getTime();
          const bTime = new Date(String(b.createTime || 0)).getTime();
          return aTime - bTime;
        })
    : [];
  if (!googleMessages.length) return { status: "synced", imported: 0, skipped: 0 };

  const googleNames = googleMessages.map((message: Record<string, unknown>) => cleanText(message.name)).filter(Boolean) as string[];
  const existingResult = googleNames.length
    ? await supabase
        .from("bid_room_chat_messages")
        .select("id,thread_id,google_chat_message_name")
        .eq("owner_email", owner)
        .in("google_chat_message_name", googleNames)
    : { data: [], error: null };
  if (existingResult.error) throw existingResult.error;

  const existingByGoogleName = new Map((existingResult.data || []).map((message) => [String(message.google_chat_message_name), message]));
  const threadsById = new Map(candidateThreads.map((thread) => [String(thread.id), thread]));
  const threadsByGoogleThreadName = new Map(
    candidateThreads
      .map((thread) => [cleanText(thread.google_chat_thread_name), thread] as [string | null, Record<string, unknown>])
      .filter(([name]) => Boolean(name)) as [string, Record<string, unknown>][]
  );
  const eventGroupThread = candidateThreads.find((thread) => cleanText(thread.thread_type) === "event_group") || candidateThreads[0];

  let imported = 0;
  let skipped = 0;
  let updatedThreads = 0;

  for (const googleMessage of googleMessages) {
    const googleMessageName = cleanText(googleMessage.name);
    const googleThreadName = googleChatMessageThreadName(googleMessage);
    const existingMessage = googleMessageName ? existingByGoogleName.get(googleMessageName) : null;
    if (existingMessage) {
      const existingThread = threadsById.get(String(existingMessage.thread_id));
      if (existingThread && googleThreadName && cleanText(existingThread.google_chat_thread_name) !== googleThreadName) {
        await supabase.from("bid_room_chat_threads").update({
          google_chat_space: spaceName,
          google_chat_thread_name: googleThreadName,
          google_chat_sync_status: "synced",
          updated_at: new Date().toISOString()
        }).eq("id", existingThread.id);
        existingThread.google_chat_thread_name = googleThreadName;
        threadsByGoogleThreadName.set(googleThreadName, existingThread);
        updatedThreads += 1;
      }
      skipped += 1;
      continue;
    }

    const body = googleChatMessageBody(googleMessage);
    if (!body) {
      skipped += 1;
      continue;
    }
    const targetThread = (googleThreadName && threadsByGoogleThreadName.get(googleThreadName)) || eventGroupThread;
    if (!targetThread) {
      skipped += 1;
      continue;
    }
    if (googleThreadName && cleanText(targetThread.google_chat_thread_name) !== googleThreadName) {
      await supabase.from("bid_room_chat_threads").update({
        google_chat_space: spaceName,
        google_chat_thread_name: googleThreadName,
        google_chat_sync_status: "synced",
        updated_at: new Date().toISOString()
      }).eq("id", targetThread.id);
      targetThread.google_chat_thread_name = googleThreadName;
      threadsByGoogleThreadName.set(googleThreadName, targetThread);
      updatedThreads += 1;
    }

    const sender = objectRecord(googleMessage.sender);
    const senderType = cleanText(sender.type)?.toUpperCase();
    const createdAt = new Date(String(googleMessage.createTime || ""));
    const insertResult = await supabase.from("bid_room_chat_messages").insert({
      owner_user_id: cleanText(targetThread.owner_user_id),
      owner_email: owner,
      thread_id: targetThread.id,
      rfx_event_id: targetThread.rfx_event_id,
      rfx_lane_id: targetThread.rfx_lane_id || null,
      vendor_id: targetThread.vendor_id || null,
      sender_role: senderType === "BOT" ? "system" : "procurement",
      sender_name: cleanText(sender.displayName || sender.name) || "Google Chat",
      sender_email: null,
      body,
      google_chat_message_name: googleMessageName,
      google_chat_sender_name: cleanText(sender.name),
      google_chat_sync_status: "synced",
      created_at: Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString(),
      metadata: {
        source: "google_chat_inbound",
        google_chat_space: spaceName,
        google_chat_thread_name: googleThreadName,
        sender
      }
    });
    if (insertResult.error) {
      if (String(insertResult.error.code || "") === "23505") skipped += 1;
      else throw insertResult.error;
    } else {
      await supabase.from("bid_room_chat_threads").update({
        updated_at: Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString(),
        read_status: "unread",
        last_action_at: new Date().toISOString()
      }).eq("id", targetThread.id);
      imported += 1;
    }
  }

  return { status: "synced", imported, skipped, updated_threads: updatedThreads };
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
  const googleChatInbound = await syncGoogleChatInboundMessagesForThreads(supabase, cleanText(event.owner_email), threads).catch((error) => ({
    status: "error",
    imported: 0,
    skipped: 0,
    error: String(error?.message || error)
  }));
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
    google_chat_inbound: googleChatInbound,
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
  await supabase.from("bid_room_chat_threads").update({
    updated_at: new Date().toISOString(),
    communication_status: "needs_reply",
    needs_reply: true,
    read_status: "unread",
    last_action_at: new Date().toISOString()
  }).eq("id", thread.id);
  const sync = await syncBidRoomMessageToGoogleChat(supabase, thread, messageResult.data, event);
  return { thread, message: { ...messageResult.data, google_chat_sync_status: sync.status }, google_chat_configured: sync.status !== "not_configured" || Boolean(GOOGLE_CHAT_WEBHOOK_URL) };
}

function rangeScore(value: number | null, best: number | null, worst: number | null, weight: number, lowerIsBetter = true) {
  if (value === null) return 0;
  if (best === null || worst === null || best === worst) return Math.round(weight * 0.82);
  const ratio = Math.min(1, Math.max(0, (value - best) / (worst - best)));
  return Math.round(weight * (lowerIsBetter ? 1 - ratio : ratio));
}

function timestampValue(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const time = new Date(text).getTime();
  return Number.isNaN(time) ? null : time;
}

function commercialModelScore(row: Record<string, unknown>) {
  const model = cleanText(row.commercial_model);
  const marksmanMargin = cleanNumber(row.marksman_margin_pct);
  const carrierShare = cleanNumber(row.carrier_share_pct);
  if (model === "direct_cost_plus") {
    if (marksmanMargin !== null && marksmanMargin >= 2 && marksmanMargin <= 5) return 10;
    return marksmanMargin !== null ? 8 : 6;
  }
  if (model === "carrier_share") {
    if (carrierShare !== null && carrierShare >= 2 && carrierShare <= 5) return 9;
    return carrierShare !== null ? 7 : 5;
  }
  if (model === "xbf_buy_sell") return 7;
  return 3;
}

function liveBoardContext(rows: Record<string, unknown>[]) {
  const amounts = rows.map((row) => cleanNumber(row.amount)).filter((value): value is number => value !== null);
  const capacities = rows.map((row) => cleanNumber(row.weekly_capacity)).filter((value): value is number => value !== null);
  const transits = rows.map((row) => cleanNumber(row.transit_days)).filter((value): value is number => value !== null);
  const pickupTimes = rows.map((row) => timestampValue(row.eta_pickup)).filter((value): value is number => value !== null);
  return {
    minAmount: amounts.length ? Math.min(...amounts) : null,
    maxAmount: amounts.length ? Math.max(...amounts) : null,
    maxCapacity: capacities.length ? Math.max(...capacities) : null,
    minCapacity: capacities.length ? Math.min(...capacities) : null,
    minTransit: transits.length ? Math.min(...transits) : null,
    maxTransit: transits.length ? Math.max(...transits) : null,
    minPickup: pickupTimes.length ? Math.min(...pickupTimes) : null,
    maxPickup: pickupTimes.length ? Math.max(...pickupTimes) : null
  };
}

function liveBoardRowScore(row: Record<string, unknown>, context: Record<string, number | null>) {
  const amount = cleanNumber(row.amount);
  const capacity = cleanNumber(row.weekly_capacity);
  const transit = cleanNumber(row.transit_days);
  const pickupTime = timestampValue(row.eta_pickup);
  const equipmentAvailable = cleanBoolean(row.equipment_available);
  const mirrorEnabled = cleanBoolean(row.mirror_account_enabled) === true;
  const validationStatus = cleanText(row.availability_validation_status);
  const bestAlternative = cleanBoolean(row.best_alternative_offered) === true;
  const badges: string[] = [];
  const riskFlags: string[] = [];

  const priceScore = rangeScore(amount, context.minAmount || null, context.maxAmount || null, 35, true);
  if (amount !== null && context.minAmount !== null && amount <= context.minAmount) badges.push("Best price");
  else if (amount !== null && context.minAmount !== null && amount <= context.minAmount * 1.05) badges.push("Within 5%");
  else riskFlags.push("Price gap");

  const capacityScore = rangeScore(capacity, context.minCapacity || null, context.maxCapacity || null, 15, false);
  if (capacity === null) riskFlags.push("No capacity");
  else if (context.maxCapacity !== null && capacity >= context.maxCapacity) badges.push("Top capacity");
  else badges.push("Capacity stated");

  const transitScore = rangeScore(transit, context.minTransit || null, context.maxTransit || null, 10, true);
  if (transit === null) riskFlags.push("No transit");
  else if (context.minTransit !== null && transit <= context.minTransit) badges.push("Fast transit");

  const etaScore = rangeScore(pickupTime, context.minPickup || null, context.maxPickup || null, 5, true);
  if (pickupTime !== null) badges.push("Pickup ETA");
  else if (equipmentAvailable === true) riskFlags.push("Missing ETA");

  let availabilityScore = 2;
  if (equipmentAvailable === true) {
    availabilityScore = 12;
    badges.push("Equipment available");
  } else if (equipmentAvailable === false) {
    availabilityScore = -8;
    riskFlags.push("Equipment unavailable");
  } else {
    riskFlags.push("Availability pending");
  }

  let validationScore = 0;
  if (validationStatus === "validated") {
    validationScore = 10;
    badges.push("Validated");
  } else if (validationStatus === "mirror_enabled") {
    validationScore = 8;
    badges.push("Mirror enabled");
  } else if (validationStatus === "mirror_requested" || mirrorEnabled) {
    validationScore = 5;
    badges.push("Mirror requested");
  } else if (validationStatus === "rejected") {
    validationScore = -10;
    riskFlags.push("Validation rejected");
  }
  if (cleanText(row.unit_details)) badges.push("Unit details");

  const commercialScore = commercialModelScore(row);
  if (cleanText(row.commercial_model)) badges.push("Commercial model");
  else riskFlags.push("No commercial model");

  const alternativeScore = bestAlternative ? 5 : 0;
  if (bestAlternative) badges.push("Alternative offer");

  const score = Math.max(0, Math.min(100, Math.round(
    priceScore +
    capacityScore +
    transitScore +
    etaScore +
    availabilityScore +
    validationScore +
    commercialScore +
    alternativeScore
  )));
  const bucket = score >= 85 ? "leading" : score >= 72 ? "strong" : score >= 58 ? "competitive" : "needs_review";
  return {
    score,
    score_bucket: bucket,
    badges: badges.slice(0, 5),
    risk_flags: riskFlags.slice(0, 5),
    price_signal: amount === null ? "No rate" : priceScore >= 30 ? "Best rate range" : priceScore >= 20 ? "Competitive rate" : "Rate gap",
    capacity_signal: capacity === null ? "No capacity" : capacityScore >= 12 ? "High capacity" : "Capacity stated",
    eta_signal: pickupTime === null ? "ETA pending" : etaScore >= 4 ? "Fast pickup" : "Pickup scheduled"
  };
}

function liveBoardFromRows(currentInvitation: Record<string, unknown>, peerRows: Record<string, unknown>[]) {
  const event = relationRecord(currentInvitation.rfx_events);
  const visibility = bidRoomVisibility(event);
  const baseRows = [currentInvitation, ...peerRows]
    .filter((row) => cleanNumber(row.bid_rate) !== null)
    .map((row) => ({
      id: row.id,
      amount: cleanNumber(row.bid_rate) as number,
      currency: cleanText(row.currency) || cleanText(currentInvitation.currency) || "USD",
      weekly_capacity: cleanNumber(row.weekly_capacity),
      transit_days: cleanNumber(row.transit_days),
      commercial_model: cleanText(row.commercial_model),
      marksman_margin_pct: cleanNumber(row.marksman_margin_pct),
      carrier_share_pct: cleanNumber(row.carrier_share_pct),
      best_alternative_offered: cleanBoolean(row.best_alternative_offered) === true,
      alternative_equipment: cleanText(row.alternative_equipment),
      alternative_units: cleanNumber(row.alternative_units),
      equipment_available: cleanBoolean(row.equipment_available),
      unit_details: cleanText(row.unit_details),
      eta_pickup: cleanText(row.eta_pickup),
      eta_delivery: cleanText(row.eta_delivery),
      mirror_account_enabled: cleanBoolean(row.mirror_account_enabled),
      availability_validation_status: cleanText(row.availability_validation_status),
      responded_at: cleanText(row.responded_at || row.updated_at),
      vendor_name: cleanText(relationRecord(row.vendors).vendor_name),
      vendor_domain: cleanText(relationRecord(row.vendors).domain),
      is_current: row.id === currentInvitation.id
    }));
  const context = liveBoardContext(baseRows);
  const rows = baseRows
    .map((row) => {
      const score = liveBoardRowScore(row, context);
      return {
        ...row,
        marketplace_score: score.score,
        score_bucket: score.score_bucket,
        marketplace_badges: score.badges,
        risk_flags: score.risk_flags,
        price_signal: score.price_signal,
        capacity_signal: score.capacity_signal,
        eta_signal: score.eta_signal
      };
    })
    .sort((a, b) => b.marketplace_score - a.marketplace_score || a.amount - b.amount);
  const currentIndex = rows.findIndex((row) => row.is_current);
  const currentAmount = cleanNumber(currentInvitation.bid_rate);
  const bestAmount = context.minAmount;
  const bestScore = rows[0]?.marketplace_score || null;
  const currentScore = currentIndex >= 0 ? rows[currentIndex].marketplace_score : null;
  const currency = rows[0]?.currency || cleanText(currentInvitation.currency) || "USD";
  const deltaToBest = currentAmount !== null && bestAmount !== null ? currentAmount - bestAmount : null;
  const deltaPct = currentAmount !== null && bestAmount ? deltaToBest / bestAmount : null;
  const scoreGap = currentScore !== null && bestScore !== null ? bestScore - currentScore : null;
  const positionSignal = currentAmount === null
    ? (rows.length ? "Market is active" : "Awaiting first offer")
    : currentIndex === 0
      ? "Leading capacity offer"
      : Number(scoreGap) <= 5
        ? "Operationally competitive"
        : Number(deltaPct) <= 0.05
          ? "Price competitive"
          : "Improve capacity score";
  const guidance = currentAmount === null
    ? "Submit your all-in offer, capacity, ETA and validation details to unlock your marketplace score."
    : currentIndex === 0
      ? "Your offer is leading on the full operational score. Keep capacity, ETA and assumptions current."
      : Number(scoreGap) <= 5
        ? "You are close to the leading operational score. Improve ETA, capacity or validation before repricing."
        : "Your offer trails the marketplace score. Review rate, capacity, ETA and validation before the deadline.";
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
    marketplace_mode: "capacity_score",
    award_outcome: {
      status: awardOutcome(currentInvitation),
      role: cleanText(currentInvitation.award_role) || null,
      reason: cleanText(currentInvitation.award_reason || currentInvitation.award_notes),
      awarded_at: currentInvitation.awarded_at || null,
      rateware_closeout_at: currentInvitation.rateware_closeout_at || null
    },
    bid_count: visibility.competitor_activity_visible ? rows.length : rows.filter((row) => row.is_current).length,
    current_rank: visibility.competitor_rank_visible && currentIndex >= 0 ? currentIndex + 1 : null,
    best_rate: currentIndex === 0 ? currentAmount : null,
    best_rate_visible: visibility.competitor_rates_visible || currentIndex === 0,
    currency,
    position_signal: positionSignal,
    marketplace_signal: positionSignal,
    current_score: currentScore,
    current_score_bucket: currentIndex >= 0 ? rows[currentIndex].score_bucket : null,
    current_badges: currentIndex >= 0 ? rows[currentIndex].marketplace_badges : [],
    leader_score: bestScore,
    guidance: visibility.mode === "private"
      ? "This event is running in private mode. Procurement can see all offers, but carriers cannot see competitors."
      : guidance,
    delta_to_leader: deltaToBest,
    score_gap_to_leader: scoreGap,
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
      marketplace_score: row.is_current || visibility.competitor_rates_visible ? row.marketplace_score : null,
      score_bucket: row.score_bucket,
      marketplace_badges: row.marketplace_badges,
      risk_flags: row.risk_flags,
      price_signal: row.price_signal,
      capacity_signal: row.capacity_signal,
      eta_signal: row.eta_signal,
      commercial_model: row.commercial_model,
      marksman_margin_pct: row.is_current || visibility.competitor_rates_visible ? row.marksman_margin_pct : null,
      carrier_share_pct: row.is_current || visibility.competitor_rates_visible ? row.carrier_share_pct : null,
      best_alternative_offered: row.best_alternative_offered,
      alternative_equipment: row.alternative_equipment,
      alternative_units: row.alternative_units,
      equipment_available: row.equipment_available,
      unit_details: row.is_current || visibility.competitor_rates_visible ? row.unit_details : null,
      eta_pickup: row.eta_pickup,
      eta_delivery: row.eta_delivery,
      mirror_account_enabled: row.mirror_account_enabled,
      availability_validation_status: row.availability_validation_status,
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
      commercial_model: cleanText(row.commercial_model),
      marksman_margin_pct: cleanNumber(row.marksman_margin_pct),
      carrier_share_pct: cleanNumber(row.carrier_share_pct),
      best_alternative_offered: cleanBoolean(row.best_alternative_offered) === true,
      alternative_equipment: cleanText(row.alternative_equipment),
      alternative_units: cleanNumber(row.alternative_units),
      alternative_notes: cleanText(row.alternative_notes),
      equipment_available: cleanBoolean(row.equipment_available),
      unit_details: cleanText(row.unit_details),
      eta_pickup: row.eta_pickup,
      eta_delivery: row.eta_delivery,
      mirror_account_enabled: cleanBoolean(row.mirror_account_enabled) === true,
      availability_validation_status: cleanText(row.availability_validation_status),
      availability_validation_notes: cleanText(row.availability_validation_notes),
      award_role: cleanText(row.award_role),
      award_status: awardOutcome(row),
      award_reason: cleanText(row.award_reason),
      award_notes: cleanText(row.award_notes),
      awarded_at: row.awarded_at,
      rateware_closeout_at: row.rateware_closeout_at,
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
      awarded: invited.filter((row) => row.award_status === "awarded").length,
      backup: invited.filter((row) => row.award_status === "backup").length,
      not_awarded: invited.filter((row) => row.award_status === "not_awarded").length
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
          commercial_model,
          marksman_margin_pct,
          carrier_share_pct,
          best_alternative_offered,
          alternative_equipment,
          alternative_units,
          alternative_notes,
          equipment_available,
          unit_details,
          eta_pickup,
          eta_delivery,
          mirror_account_enabled,
          availability_validation_status,
          availability_validation_notes,
          award_role,
          award_reason,
          award_notes,
          awarded_at,
          rate_staging_id,
          rateware_closeout_at,
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
        .select("id,bid_rate,currency,weekly_capacity,transit_days,commercial_model,marksman_margin_pct,carrier_share_pct,best_alternative_offered,alternative_equipment,alternative_units,equipment_available,eta_pickup,eta_delivery,responded_at,updated_at,vendors(vendor_name,domain)")
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
              commercial_model,
              marksman_margin_pct,
              carrier_share_pct,
              best_alternative_offered,
              alternative_equipment,
              alternative_units,
              alternative_notes,
              equipment_available,
              unit_details,
              eta_pickup,
              eta_delivery,
              mirror_account_enabled,
              availability_validation_status,
              availability_validation_notes,
              award_role,
              award_reason,
              award_notes,
              awarded_at,
              rate_staging_id,
              rateware_closeout_at,
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
      const bidHistoryResult = ownerEmail
        ? await supabase
            .from("contact_history")
            .select("id,occurred_at,created_at,status,subject,body_preview,channel,direction,metadata")
            .eq("owner_email", ownerEmail)
            .eq("rfx_event_id", result.data.rfx_event_id)
            .eq("vendor_id", result.data.vendor_id)
            .eq("channel", "portal")
            .order("occurred_at", { ascending: false })
            .limit(100)
        : { data: [], error: null };
      if (bidHistoryResult.error) throw bidHistoryResult.error;
      const bidHistory = (bidHistoryResult.data || [])
        .filter((row) => {
          const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
          return cleanText(metadata.rfx_lane_vendor_id) === cleanText(result.data.id)
            || cleanText(metadata.rfx_lane_id) === cleanText(result.data.rfx_lane_id);
        })
        .slice(0, 25);

      return jsonResponse({
        invitation: result.data,
        live_board: liveBoardFromRows(result.data, peersResult.data || []),
        carrier_book: carrierBusinessBook(result.data, invitedResult.data || [], openLanesResult.data || []),
        bid_history: bidHistory
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
      const bidRate = strictBidNumber(body.bid_rate, "Bid rate", { required: true });
      const mirrorEnabled = cleanBoolean(body.mirror_account_enabled) === true;
      const equipmentAvailable = cleanBoolean(body.equipment_available);
      const bestFinal = cleanBoolean(body.best_final) === true;
      const invitationResult = await supabase
        .from("rfx_lane_vendors")
        .select(`
          id,
          rfx_event_id,
          rfx_lane_id,
          vendor_id,
          bid_rate,
          currency,
          weekly_capacity,
          transit_days,
          commercial_model,
          equipment_available,
          responded_at,
          notes,
          vendors(vendor_name,domain,primary_email),
          rfx_events(id,owner_user_id,owner_email,rfx_id,name,customer),
          rfx_lanes(origin,destination,equipment,trailer,operation,service)
        `)
        .eq("invitation_token", token)
        .single();
      if (invitationResult.error) throw invitationResult.error;
      const previousBidRate = cleanNumber(invitationResult.data.bid_rate);
      const revisionType = bestFinal ? "best_final" : previousBidRate !== null ? "revision" : "initial";
      const commercialModel = normalizeCommercialModel(body.commercial_model) || "direct_cost_plus";
      const marksmanMarginPct = commercialModel === "direct_cost_plus"
        ? strictCommercialSharePercent(body.marksman_margin_pct, "Suggested margin to share")
        : null;
      const carrierSharePct = commercialModel === "carrier_share"
        ? strictCommercialSharePercent(body.carrier_share_pct, "Carrier invoice share")
        : null;
      const revisionLabel = revisionType === "best_final"
        ? "Best and final"
        : revisionType === "revision"
          ? "Quote revision"
          : "Initial quote";

      const patch = {
        invitation_status: "quoted",
        bid_rate: bidRate,
        currency: strictCurrencyCode(body.currency),
        weekly_capacity: strictBidNumber(body.weekly_capacity, "Weekly capacity"),
        transit_days: strictBidNumber(body.transit_days, "Transit days"),
        commercial_model: commercialModel,
        marksman_margin_pct: marksmanMarginPct,
        carrier_share_pct: carrierSharePct,
        best_alternative_offered: cleanBoolean(body.best_alternative_offered) === true,
        alternative_equipment: cleanText(body.alternative_equipment),
        alternative_units: strictBidNumber(body.alternative_units, "Alternative units"),
        alternative_notes: cleanText(body.alternative_notes),
        equipment_available: equipmentAvailable,
        unit_details: cleanText(body.unit_details),
        eta_pickup: cleanTimestamp(body.eta_pickup),
        eta_delivery: cleanTimestamp(body.eta_delivery),
        mirror_account_enabled: mirrorEnabled,
        availability_validation_status: availabilityValidationStatus(body.availability_validation_status, mirrorEnabled),
        availability_validation_notes: cleanText(body.availability_validation_notes),
        notes: cleanText(body.notes),
        response_source: "carrier_portal",
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const result = await supabase
        .from("rfx_lane_vendors")
        .update(patch)
        .eq("id", invitationResult.data.id)
        .select("id,invitation_status,bid_rate,currency,weekly_capacity,transit_days,commercial_model,marksman_margin_pct,carrier_share_pct,best_alternative_offered,alternative_equipment,alternative_units,alternative_notes,equipment_available,unit_details,eta_pickup,eta_delivery,mirror_account_enabled,availability_validation_status,availability_validation_notes,notes,responded_at")
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
        const historyResult = await supabase.from("contact_history").insert({
          owner_user_id: rfxEvent.owner_user_id || null,
          owner_email: rfxEvent.owner_email || null,
          vendor_id: invitationResult.data.vendor_id,
          rfx_event_id: invitationResult.data.rfx_event_id,
          channel: "portal",
          direction: "inbound",
          status: "quoted",
          subject: `${rfxEvent.rfx_id || "RFx"} ${revisionLabel.toLowerCase()}`,
          body_preview: [
            revisionLabel,
            vendor?.vendor_name || vendor?.domain || "Carrier",
            `${bidRate} ${patch.currency}`,
            patch.commercial_model ? `model ${patch.commercial_model}` : null,
            equipmentAvailable === null ? null : `available ${equipmentAvailable ? "yes" : "no"}`,
            lane?.origin && lane?.destination ? `${lane.origin} -> ${lane.destination}` : null
          ].filter(Boolean).join(" | "),
          metadata: {
            source: "rfx_bid_portal",
            revision_type: revisionType,
            best_final: bestFinal,
            rfx_lane_vendor_id: invitationResult.data.id,
            rfx_lane_id: invitationResult.data.rfx_lane_id,
            before: {
              bid_rate: previousBidRate,
              currency: cleanText(invitationResult.data.currency),
              weekly_capacity: cleanNumber(invitationResult.data.weekly_capacity),
              transit_days: cleanNumber(invitationResult.data.transit_days),
              commercial_model: cleanText(invitationResult.data.commercial_model),
              equipment_available: cleanBoolean(invitationResult.data.equipment_available),
              responded_at: invitationResult.data.responded_at || null
            },
            after: {
              bid_rate: bidRate,
              currency: patch.currency,
              weekly_capacity: patch.weekly_capacity,
              transit_days: patch.transit_days,
              commercial_model: patch.commercial_model,
              equipment_available: patch.equipment_available,
              responded_at: patch.responded_at
            }
          }
        });
        if (historyResult.error) throw historyResult.error;
      }
      return jsonResponse({ row: result.data });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    return jsonResponse({ error: error.message }, 400);
  }
});
