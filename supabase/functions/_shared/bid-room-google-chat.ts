// Mirrors a Bid Room chat message into the team's Google Chat thread.
//
// This is rfx-bid-api's syncBidRoomMessageToGoogleChat (and the token helpers
// it depends on), moved here so other functions can post to the same threads.
// rfx-bid-api and rateware-api still carry their own inline copies; keep the
// behavior identical until they import this module instead.

type ChatSupabaseClient = {
  from: (table: string) => any;
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const GMAIL_TOKEN_ENCRYPTION_KEY = Deno.env.get("GMAIL_TOKEN_ENCRYPTION_KEY");
const GMAIL_ALLOWED_SENDER = (Deno.env.get("GMAIL_ALLOWED_SENDER") || "sales@heymarksman.com").trim().toLowerCase();
const GOOGLE_CHAT_ALLOWED_ACCOUNT = (Deno.env.get("GOOGLE_CHAT_ALLOWED_ACCOUNT") || GMAIL_ALLOWED_SENDER).trim().toLowerCase();
const GOOGLE_CHAT_WEBHOOK_URL = Deno.env.get("GOOGLE_CHAT_WEBHOOK_URL");

export type GoogleChatSyncResult = {
  status: string;
  name: string | null;
  space_name?: string;
  error?: string;
};

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function errorMessage(value: unknown) {
  if (value instanceof Error) return cleanText(value.message) || "Google Chat sync failed.";
  return cleanText(value) || "Google Chat sync failed.";
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

function googleChatThreadTarget(thread: Record<string, unknown>, threadKey: string) {
  const threadName = cleanText(thread.google_chat_thread_name);
  return {
    replyOption: threadName ? "REPLY_MESSAGE_OR_FAIL" : "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD",
    thread: threadName ? { name: threadName } : { threadKey }
  };
}

async function googleChatAccessToken(supabase: ChatSupabaseClient, ownerEmail: string) {
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
  supabase: ChatSupabaseClient,
  thread: Record<string, unknown>,
  message: Record<string, unknown>,
  event: Record<string, unknown>
): Promise<GoogleChatSyncResult> {
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
    const target = googleChatThreadTarget(thread, threadKey);
    const params = new URLSearchParams({ messageReplyOption: target.replyOption });
    const response = await fetch(`https://chat.googleapis.com/v1/${spaceName}/messages?${params.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        thread: target.thread
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
      google_chat_thread_name: cleanText(payload?.thread?.name) || cleanText(thread.google_chat_thread_name),
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
    return { status: "error", name: null, error: errorMessage(error) };
  }
}

export async function syncBidRoomMessageToGoogleChat(
  supabase: ChatSupabaseClient,
  thread: Record<string, unknown>,
  message: Record<string, unknown>,
  event: Record<string, unknown> = {}
): Promise<GoogleChatSyncResult> {
  const apiSync = await syncBidRoomMessageToGoogleChatApi(supabase, thread, message, event);
  if (apiSync.status !== "not_configured") return apiSync;
  if (!GOOGLE_CHAT_WEBHOOK_URL) return { status: "not_configured", name: null };
  const threadKey = cleanText(thread.google_chat_thread_key) || bidRoomGoogleThreadKey(thread.rfx_event_id, String(thread.thread_type || "event_group"), thread.rfx_lane_id, thread.vendor_id);
  const url = new URL(GOOGLE_CHAT_WEBHOOK_URL);
  url.searchParams.set("threadKey", threadKey);
  url.searchParams.set("messageReplyOption", "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD");
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
    return { status: "error", name: null, error: errorMessage(error) };
  }
}
