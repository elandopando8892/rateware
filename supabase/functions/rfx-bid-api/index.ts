import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/kinde.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const GMAIL_TOKEN_ENCRYPTION_KEY = Deno.env.get("GMAIL_TOKEN_ENCRYPTION_KEY");
const GMAIL_ALLOWED_SENDER = (Deno.env.get("GMAIL_ALLOWED_SENDER") || "sales@heymarksman.com").trim().toLowerCase();
const RATEWARE_APP_URL = (Deno.env.get("RATEWARE_APP_URL") || Deno.env.get("RATEWARE_PUBLIC_APP_URL") || "https://rateware.vercel.app").trim();
const GOOGLE_CHAT_ALLOWED_ACCOUNT = (Deno.env.get("GOOGLE_CHAT_ALLOWED_ACCOUNT") || GMAIL_ALLOWED_SENDER).trim().toLowerCase();
const GOOGLE_CHAT_WEBHOOK_URL = Deno.env.get("GOOGLE_CHAT_WEBHOOK_URL");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const DEFAULT_COMMERCIAL_SHARE_PCT = 3;
const XBF_BUY_SELL_DEFAULT_MARKUP_PCT = 12;
const XBF_BUY_SELL_MIN_MARKUP_PCT = 7.5;
const XBF_BUY_SELL_MAX_MARKUP_PCT = 15;
const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "hotmail.com",
  "hotmail.com.mx",
  "yahoo.com",
  "yahoo.com.mx",
  "outlook.com",
  "live.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com"
]);

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

function cleanEmail(value: unknown) {
  const email = cleanText(value)?.toLowerCase() || null;
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function emailDomain(email: unknown) {
  const text = cleanEmail(email);
  return text ? text.split("@").pop() || null : null;
}

function escapeHtmlText(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

function strictNonNegativeBidNumber(value: unknown, label: string) {
  const numberValue = strictBidNumber(value, label, { positive: false });
  if (numberValue === null) return null;
  if (numberValue < 0) throw new Error(`${label} must be zero or greater.`);
  return numberValue;
}

function strictPercentNumber(value: unknown, label: string) {
  const numberValue = strictBidNumber(value, label, { positive: false });
  if (numberValue === null) return null;
  if (numberValue < 0 || numberValue > 100) throw new Error(`${label} must be between 0 and 100.`);
  return numberValue;
}

function strictOptionalPercentWithDefault(value: unknown, label: string, min: number, max: number, defaultValue: number) {
  const numberValue = strictBidNumber(value, label, { positive: false });
  const effectiveValue = numberValue === null ? defaultValue : numberValue;
  if (effectiveValue < min || effectiveValue > max) throw new Error(`${label} must be between ${min}% and ${max}%.`);
  return effectiveValue;
}

function strictCurrencyCode(value: unknown, fallback = "USD") {
  const currency = (cleanText(value) || fallback || "USD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be a 3-letter code like USD, MXN, or CAD.");
  return currency;
}

function normalizeDeadheadUnit(value: unknown) {
  const text = cleanText(value)?.toLowerCase();
  if (!text) return null;
  if (["mi", "mile", "miles", "milla", "millas"].includes(text)) return "mi";
  if (["km", "kms", "kilometer", "kilometers", "kilometro", "kilometros"].includes(text)) return "km";
  throw new Error("Deadhead unit must be mi or km.");
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

function roundMoney(value: number | null) {
  return value === null ? null : Math.round((value + Number.EPSILON) * 100) / 100;
}

function commercialRateEconomics(row: Record<string, unknown>) {
  const carrierRate = cleanNumber(row.bid_rate);
  const commercialModel = normalizeCommercialModel(row.commercial_model) || "direct_cost_plus";
  const marksmanMarginPct = cleanNumber(row.marksman_margin_pct) ?? (commercialModel === "xbf_buy_sell" ? XBF_BUY_SELL_DEFAULT_MARKUP_PCT : DEFAULT_COMMERCIAL_SHARE_PCT);
  const carrierSharePct = cleanNumber(row.carrier_share_pct) ?? DEFAULT_COMMERCIAL_SHARE_PCT;
  const currency = cleanText(row.currency) || "USD";
  if (carrierRate === null) {
    return {
      commercial_model: commercialModel,
      currency,
      carrier_rate: null,
      board_rate: null,
      rate_visibility: null,
      commission_fee: null,
      commission_pct: null,
      markup_fee: null,
      markup_pct: commercialModel === "xbf_buy_sell" ? marksmanMarginPct : null,
      rate_basis: "no_rate",
      fee_label: null
    };
  }

  if (commercialModel === "carrier_share") {
    const commissionFee = carrierSharePct === null ? null : carrierRate * carrierSharePct / 100;
    return {
      commercial_model: commercialModel,
      currency,
      carrier_rate: roundMoney(carrierRate),
      board_rate: roundMoney(carrierRate),
      rate_visibility: roundMoney(carrierRate),
      commission_fee: roundMoney(commissionFee),
      commission_pct: carrierSharePct,
      markup_fee: null,
      markup_pct: null,
      rate_basis: "carrier_share",
      fee_label: "Carrier invoice share"
    };
  }

  if (commercialModel === "xbf_buy_sell") {
    const boardRate = carrierRate * (1 + marksmanMarginPct / 100);
    return {
      commercial_model: commercialModel,
      currency,
      carrier_rate: roundMoney(carrierRate),
      board_rate: roundMoney(boardRate),
      rate_visibility: roundMoney(boardRate),
      commission_fee: null,
      commission_pct: null,
      markup_fee: roundMoney(boardRate - carrierRate),
      markup_pct: marksmanMarginPct,
      rate_basis: "xbf_buy_sell",
      fee_label: "XBF buy-sell markup"
    };
  }

  const boardRate = marksmanMarginPct === null ? carrierRate : carrierRate * (1 + marksmanMarginPct / 100);
  return {
    commercial_model: "direct_cost_plus",
    currency,
    carrier_rate: roundMoney(carrierRate),
    board_rate: roundMoney(boardRate),
    rate_visibility: roundMoney(boardRate),
    commission_fee: roundMoney(boardRate - carrierRate),
    commission_pct: marksmanMarginPct,
    markup_fee: null,
    markup_pct: null,
    rate_basis: "direct_cost_plus",
    fee_label: "Cost-plus commission"
  };
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

function normalizeDomain(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const cleaned = text
    .toLowerCase()
    .replace(/^mailto:/, "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/^@/, "")
    .split(/[\/\s,;]+/)[0]
    .replace(/^.*@/, "")
    .replace(/[^a-z0-9.-]+$/g, "")
    .replace(/\.+$/g, "");
  return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(cleaned) ? cleaned : null;
}

function carrierDomain(value: unknown) {
  const domain = normalizeDomain(value);
  if (!domain || GENERIC_EMAIL_DOMAINS.has(domain)) return null;
  return domain;
}

function safeStorageSegment(value: unknown, fallback = "unknown") {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96) || fallback;
}

function cleanDate(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function strictDateOnly(value: unknown, label: string) {
  const text = cleanText(value);
  if (!text) return null;
  const date = cleanDate(text);
  if (!date) throw new Error(`${label} must be a valid date.`);
  return date;
}

function rateText(value: unknown) {
  const numberValue = cleanNumber(value);
  return numberValue === null ? null : String(numberValue);
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
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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

function encodedSubject(subject: unknown) {
  const text = cleanText(subject) || "";
  return /^[\x00-\x7F]*$/.test(text) ? text : `=?UTF-8?B?${bytesToBase64(new TextEncoder().encode(text))}?=`;
}

function safeHeader(value: unknown) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function simpleTextFromHtml(html: unknown) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function gmailRawMessage(message: Record<string, unknown>, senderEmail: string) {
  const to = safeHeader(message.recipient_email);
  const subject = encodedSubject(message.subject);
  const htmlBody = cleanText(message.html_body) || "";
  const textBody = cleanText(message.text_body) || simpleTextFromHtml(htmlBody);
  const boundary = `rateware_${crypto.randomUUID().replace(/-/g, "")}`;
  const mime = [
    `To: ${to}`,
    `From: ${safeHeader(senderEmail)}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    textBody || "",
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    htmlBody || `<pre>${escapeHtmlText(textBody || "")}</pre>`,
    "",
    `--${boundary}--`
  ].join("\r\n");
  return bytesToBase64Url(new TextEncoder().encode(mime));
}

async function gmailAccessTokenForOwner(supabase: ReturnType<typeof createClient>, ownerEmail: unknown) {
  const owner = cleanEmail(ownerEmail);
  if (!owner) throw new Error("Bid Room owner email is missing.");
  const result = await supabase
    .from("gmail_mailbox_connections")
    .select("*")
    .eq("owner_email", owner)
    .eq("mailbox_email", GMAIL_ALLOWED_SENDER)
    .eq("status", "connected")
    .maybeSingle();
  if (result.error) throw result.error;
  let connection = result.data;
  if (!connection) {
    const fallbackResult = await supabase
      .from("gmail_mailbox_connections")
      .select("*")
      .eq("mailbox_email", GMAIL_ALLOWED_SENDER)
      .eq("status", "connected")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (fallbackResult.error) throw fallbackResult.error;
    connection = fallbackResult.data?.[0] || null;
  }
  if (!connection) throw new Error(`Connect ${GMAIL_ALLOWED_SENDER} in Settings before sending magic links.`);
  const connectionOwner = cleanEmail(connection.owner_email) || owner;

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
    const message = cleanText(tokenData.error_description) || cleanText(tokenData.error) || "Google token refresh failed.";
    await supabase
      .from("gmail_mailbox_connections")
      .update({ status: "error", last_error: message, updated_at: new Date().toISOString() })
      .eq("owner_email", connectionOwner)
      .eq("mailbox_email", GMAIL_ALLOWED_SENDER);
    throw new Error(message);
  }

  const accessToken = String(tokenData.access_token);
  const expiresIn = Number(tokenData.expires_in) || 3600;
  const update = await supabase
    .from("gmail_mailbox_connections")
    .update({
      access_token_encrypted: await encryptGoogleToken(accessToken),
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      last_error: null,
      updated_at: new Date().toISOString()
    })
    .eq("owner_email", connectionOwner)
    .eq("mailbox_email", GMAIL_ALLOWED_SENDER);
  if (update.error) throw update.error;
  return accessToken;
}

async function sendGmailMessageForOwner(
  supabase: ReturnType<typeof createClient>,
  ownerEmail: unknown,
  message: Record<string, unknown>
) {
  const accessToken = await gmailAccessTokenForOwner(supabase, ownerEmail);
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw: gmailRawMessage(message, GMAIL_ALLOWED_SENDER) })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const messageText = cleanText(payload?.error?.message) || cleanText(payload?.error_description) || `Gmail send failed (${response.status}).`;
    throw new Error(messageText);
  }
  return payload;
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
    currency: row.currency || "USD",
    logistics_model: row.logistics_model,
    operation_criteria: row.operation_criteria,
    business_rules: row.business_rules,
    service_specifications: row.service_specifications,
    other_notes: row.other_notes,
    notes: row.notes,
    rfx_segment_key: row.rfx_segment_key,
    rfx_segment_name: row.rfx_segment_name
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
    bid_visibility_mode: cleanText(row.bid_visibility_mode) || "anonymous_rank",
    source_rfx_process_project_id: row.source_rfx_process_project_id,
    source_rfx_package_id: row.source_rfx_package_id,
    source_rfx_package_name: row.source_rfx_package_name,
    rfx_master_package: row.rfx_master_package && typeof row.rfx_master_package === "object" ? row.rfx_master_package : {}
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

function googleChatThreadTarget(thread: Record<string, unknown>, threadKey: string) {
  const threadName = cleanText(thread.google_chat_thread_name);
  return {
    replyOption: threadName ? "REPLY_MESSAGE_OR_FAIL" : "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD",
    thread: threadName ? { name: threadName } : { threadKey }
  };
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
      bid_rate,
      currency,
      weekly_capacity,
      transit_days,
      valid_through,
      current_unit_location,
      deadhead_distance,
      deadhead_unit,
      vendors(id,vendor_name,domain,primary_email),
      rfx_events(id,owner_user_id,owner_email,rfx_id,name,customer,event_type,status,due_date,bid_visibility_mode,source_rfx_process_project_id,source_rfx_package_id,source_rfx_package_name,rfx_master_package),
      rfx_lanes(*)
    `)
    .eq("invitation_token", token)
    .single();
  if (result.error) throw result.error;
  return result.data;
}

const SEGMENT_CONFIRMATION_ANSWERS = new Set(["pending", "agree", "exception", "disagree", "not_applicable"]);
const SEGMENT_CONFIRMATION_RUBRICS = new Set(["logistics_model", "operation_criteria", "business_rules", "service_specifications", "other_notes"]);

function normalizeSegmentConfirmationRows(input: unknown) {
  const rows = Array.isArray(input) ? input : [];
  return rows.slice(0, 100).map((row) => {
    const record = row && typeof row === "object" ? row as Record<string, unknown> : {};
    const segmentKey = cleanText(record.segment_key);
    const rubricKey = cleanText(record.rubric_key);
    const answer = cleanText(record.answer)?.toLowerCase() || "pending";
    if (!segmentKey) throw new Error("Segment key is required.");
    if (!SEGMENT_CONFIRMATION_RUBRICS.has(rubricKey)) throw new Error("Invalid segment rubric.");
    if (!SEGMENT_CONFIRMATION_ANSWERS.has(answer)) throw new Error("Invalid segment confirmation answer.");
    return {
      segment_key: segmentKey,
      rubric_key: rubricKey,
      answer,
      comment: cleanText(record.comment).slice(0, 1200)
    };
  });
}

async function listSegmentConfirmations(
  supabase: ReturnType<typeof createClient>,
  invitationIds: string[]
) {
  const ids = [...new Set(invitationIds.map((id) => cleanText(id)).filter(Boolean))];
  if (!ids.length) return [];
  const result = await supabase
    .from("rfx_segment_confirmations")
    .select("*")
    .in("rfx_lane_vendor_id", ids)
    .order("updated_at", { ascending: false });
  if (result.error) throw result.error;
  return result.data || [];
}

async function saveSegmentConfirmations(
  supabase: ReturnType<typeof createClient>,
  token: string,
  input: Record<string, unknown>
) {
  const invitation = await currentInvitationContext(supabase, token);
  const event = relationRecord(invitation.rfx_events);
  const rows = normalizeSegmentConfirmationRows(input.confirmations);
  if (!rows.length) return { rows: [] };
  const now = new Date().toISOString();
  const payload = rows.map((row) => ({
    owner_user_id: cleanText(event.owner_user_id) || null,
    owner_email: cleanText(event.owner_email) || null,
    rfx_event_id: cleanText(invitation.rfx_event_id),
    rfx_lane_vendor_id: cleanText(invitation.id),
    vendor_id: cleanText(invitation.vendor_id) || null,
    segment_key: row.segment_key,
    rubric_key: row.rubric_key,
    answer: row.answer,
    comment: row.comment,
    source: "carrier_portal",
    metadata: {
      source: "rfx_master_package_fit",
      invitation_token: cleanText(invitation.invitation_token),
      lane_id: cleanText(invitation.rfx_lane_id)
    },
    updated_at: now
  }));
  const result = await supabase
    .from("rfx_segment_confirmations")
    .upsert(payload, { onConflict: "rfx_lane_vendor_id,segment_key,rubric_key" })
    .select("*");
  if (result.error) throw result.error;
  const historyResult = await supabase.from("contact_history").insert({
    owner_user_id: cleanText(event.owner_user_id) || null,
    owner_email: cleanText(event.owner_email) || null,
    vendor_id: cleanText(invitation.vendor_id) || null,
    rfx_event_id: cleanText(invitation.rfx_event_id),
    channel: "portal",
    direction: "inbound",
    status: "rfx_fit_confirmed",
    subject: `${cleanText(event.rfx_id) || "RFx"} carrier fit checklist updated`,
    body_preview: `${rows.length} checklist item(s) updated for RFx master package fit.`,
    metadata: {
      source: "rfx_master_package_fit",
      rfx_lane_vendor_id: cleanText(invitation.id),
      segment_keys: [...new Set(rows.map((row) => row.segment_key))]
    }
  });
  if (historyResult.error) console.warn("segment confirmation history failed", historyResult.error.message);
  return { rows: result.data || [] };
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
    .select("*, vendors(vendor_name,domain), rfx_lanes(*)")
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
    .select("*, vendors(vendor_name,domain), rfx_lanes(*)")
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
    .select("*, vendors(vendor_name,domain), rfx_lanes(*)")
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
  const marksmanMargin = cleanNumber(row.marksman_margin_pct) ?? DEFAULT_COMMERCIAL_SHARE_PCT;
  const carrierShare = cleanNumber(row.carrier_share_pct) ?? DEFAULT_COMMERCIAL_SHARE_PCT;
  if (model === "direct_cost_plus") {
    if (marksmanMargin !== null && marksmanMargin >= 2 && marksmanMargin <= 5) return 10;
    return marksmanMargin !== null ? 8 : 6;
  }
  if (model === "carrier_share") {
    if (carrierShare !== null && carrierShare >= 2 && carrierShare <= 5) return 9;
    return carrierShare !== null ? 7 : 5;
  }
  if (model === "xbf_buy_sell") {
    const xbfMargin = cleanNumber(row.marksman_margin_pct) ?? XBF_BUY_SELL_DEFAULT_MARKUP_PCT;
    return xbfMargin >= XBF_BUY_SELL_MIN_MARKUP_PCT && xbfMargin <= XBF_BUY_SELL_MAX_MARKUP_PCT ? 8 : 4;
  }
  return 3;
}

function liveBoardContext(rows: Record<string, unknown>[]) {
  const amounts = rows.map((row) => cleanNumber(row.amount)).filter((value): value is number => value !== null);
  const capacities = rows.map((row) => cleanNumber(row.weekly_capacity)).filter((value): value is number => value !== null);
  const transits = rows.map((row) => cleanNumber(row.transit_days)).filter((value): value is number => value !== null);
  const deadheads = rows.map((row) => cleanNumber(row.deadhead_distance)).filter((value): value is number => value !== null);
  const pickupTimes = rows.map((row) => timestampValue(row.eta_pickup)).filter((value): value is number => value !== null);
  return {
    minAmount: amounts.length ? Math.min(...amounts) : null,
    maxAmount: amounts.length ? Math.max(...amounts) : null,
    maxCapacity: capacities.length ? Math.max(...capacities) : null,
    minCapacity: capacities.length ? Math.min(...capacities) : null,
    minTransit: transits.length ? Math.min(...transits) : null,
    maxTransit: transits.length ? Math.max(...transits) : null,
    minDeadhead: deadheads.length ? Math.min(...deadheads) : null,
    maxDeadhead: deadheads.length ? Math.max(...deadheads) : null,
    minPickup: pickupTimes.length ? Math.min(...pickupTimes) : null,
    maxPickup: pickupTimes.length ? Math.max(...pickupTimes) : null
  };
}

function liveBoardRowScore(row: Record<string, unknown>, context: Record<string, number | null>) {
  const amount = cleanNumber(row.amount);
  const capacity = cleanNumber(row.weekly_capacity);
  const transit = cleanNumber(row.transit_days);
  const validThrough = cleanDate(row.valid_through);
  const deadheadDistance = cleanNumber(row.deadhead_distance);
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

  if (validThrough) badges.push("Validity stated");
  else riskFlags.push("No validity");

  const deadheadScore = rangeScore(deadheadDistance, context.minDeadhead || null, context.maxDeadhead || null, 5, true);
  if (deadheadDistance !== null) badges.push("Deadhead stated");
  else if (equipmentAvailable === true) riskFlags.push("No deadhead");

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
    deadheadScore +
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
    .map((row) => {
      const economics = commercialRateEconomics(row as Record<string, unknown>);
      return {
        id: row.id,
        amount: economics.board_rate as number,
        currency: cleanText(row.currency) || cleanText(currentInvitation.currency) || "USD",
        carrier_bid_rate: economics.carrier_rate,
        board_rate: economics.board_rate,
        rate_visibility: economics.rate_visibility,
        commission_fee: economics.commission_fee,
        commission_pct: economics.commission_pct,
        markup_fee: economics.markup_fee,
        markup_pct: economics.markup_pct,
        rate_basis: economics.rate_basis,
        fee_label: economics.fee_label,
        weekly_capacity: cleanNumber(row.weekly_capacity),
        transit_days: cleanNumber(row.transit_days),
        valid_through: cleanDate(row.valid_through),
        notes: cleanText(row.notes),
        commercial_model: economics.commercial_model,
        marksman_margin_pct: cleanNumber(row.marksman_margin_pct),
        carrier_share_pct: cleanNumber(row.carrier_share_pct),
        best_alternative_offered: cleanBoolean(row.best_alternative_offered) === true,
        alternative_equipment: cleanText(row.alternative_equipment),
        alternative_units: cleanNumber(row.alternative_units),
        equipment_available: cleanBoolean(row.equipment_available),
        current_unit_location: cleanText(row.current_unit_location),
        deadhead_distance: cleanNumber(row.deadhead_distance),
        deadhead_unit: cleanText(row.deadhead_unit),
        unit_details: cleanText(row.unit_details),
        eta_pickup: cleanText(row.eta_pickup),
        eta_delivery: cleanText(row.eta_delivery),
        mirror_account_enabled: cleanBoolean(row.mirror_account_enabled),
        availability_validation_status: cleanText(row.availability_validation_status),
        responded_at: cleanText(row.responded_at || row.updated_at),
        vendor_name: cleanText(relationRecord(row.vendors).vendor_name),
        vendor_domain: cleanText(relationRecord(row.vendors).domain),
        is_current: row.id === currentInvitation.id
      };
    });
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
  const currentEconomics = commercialRateEconomics(currentInvitation);
  const currentAmount = currentEconomics.board_rate;
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
      carrier_bid_rate: row.is_current || visibility.competitor_rates_visible ? row.carrier_bid_rate : null,
      board_rate: row.is_current || visibility.competitor_rates_visible ? row.board_rate : null,
      rate_visibility: row.is_current || visibility.competitor_rates_visible ? row.rate_visibility : null,
      commission_fee: row.is_current || visibility.competitor_rates_visible ? row.commission_fee : null,
      commission_pct: row.is_current || visibility.competitor_rates_visible ? row.commission_pct : null,
      markup_fee: row.is_current || visibility.competitor_rates_visible ? row.markup_fee : null,
      markup_pct: row.is_current || visibility.competitor_rates_visible ? row.markup_pct : null,
      rate_basis: row.rate_basis,
      fee_label: row.is_current || visibility.competitor_rates_visible ? row.fee_label : null,
      weekly_capacity: row.weekly_capacity,
      transit_days: row.transit_days,
      valid_through: row.valid_through,
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
      current_unit_location: row.current_unit_location,
      deadhead_distance: row.deadhead_distance,
      deadhead_unit: row.deadhead_unit,
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
    const economics = commercialRateEconomics(row as Record<string, unknown>);
    return {
      participation_status: cleanText(row.invitation_status) || "drafted",
      business_status: businessBookStatus(row),
      is_invited: true,
      invitation_token: row.invitation_token,
      invitation_id: row.id,
      bid_rate: cleanNumber(row.bid_rate),
      currency: cleanText(row.currency) || cleanText(lane.currency) || "USD",
      carrier_bid_rate: economics.carrier_rate,
      board_rate: economics.board_rate,
      rate_visibility: economics.rate_visibility,
      commission_fee: economics.commission_fee,
      commission_pct: economics.commission_pct,
      markup_fee: economics.markup_fee,
      markup_pct: economics.markup_pct,
      rate_basis: economics.rate_basis,
      fee_label: economics.fee_label,
      weekly_capacity: cleanNumber(row.weekly_capacity),
      transit_days: cleanNumber(row.transit_days),
      valid_through: cleanDate(row.valid_through),
      notes: cleanText(row.notes),
      commercial_model: cleanText(row.commercial_model),
      marksman_margin_pct: cleanNumber(row.marksman_margin_pct),
      carrier_share_pct: cleanNumber(row.carrier_share_pct),
      best_alternative_offered: cleanBoolean(row.best_alternative_offered) === true,
      alternative_equipment: cleanText(row.alternative_equipment),
      alternative_units: cleanNumber(row.alternative_units),
      alternative_notes: cleanText(row.alternative_notes),
      equipment_available: cleanBoolean(row.equipment_available),
      current_unit_location: cleanText(row.current_unit_location),
      deadhead_distance: cleanNumber(row.deadhead_distance),
      deadhead_unit: cleanText(row.deadhead_unit),
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

const PUBLIC_BOARD_STATUSES = new Set(["all", "live", "closing", "expired", "awarded"]);

function publicBidBoardState(event: Record<string, unknown>) {
  const status = String(cleanText(event.status) || "draft").toLowerCase();
  const due = dueState(event.due_date);
  if (status === "awarded") return "awarded";
  if (status === "closed") return "expired";
  if (status === "draft") return "live";
  if (status === "open" && due.status === "closed") return "expired";
  if (status === "open" && due.status === "closing") return "closing";
  if (status === "open") return "live";
  return status;
}

function publicQuoteStats(rows: Record<string, unknown>[]) {
  const validRows = rows
    .filter((row) => String(cleanText(row.invitation_status) || "").toLowerCase() !== "archived")
    .map((row) => {
      const economics = commercialRateEconomics(row);
      return {
        amount: economics.board_rate,
        carrier_bid_rate: economics.carrier_rate,
        board_rate: economics.board_rate,
        currency: cleanText(row.currency) || "USD",
        capacity: cleanNumber(row.weekly_capacity),
        transit_days: cleanNumber(row.transit_days),
        commercial_model: economics.commercial_model,
        best_alternative_offered: cleanBoolean(row.best_alternative_offered) === true,
        equipment_available: cleanBoolean(row.equipment_available),
        deadhead_distance: cleanNumber(row.deadhead_distance),
        eta_pickup: cleanText(row.eta_pickup),
        responded_at: cleanText(row.responded_at || row.updated_at),
        award_role: cleanText(row.award_role)
      };
    })
    .filter((row) => row.amount !== null);
  const amounts = validRows.map((row) => row.amount as number).sort((a, b) => a - b);
  const capacities = validRows.map((row) => row.capacity).filter((value) => value !== null) as number[];
  const transitDays = validRows.map((row) => row.transit_days).filter((value) => value !== null) as number[];
  const lastQuoteAt = validRows
    .map((row) => cleanText(row.responded_at))
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const commercialModels = [...new Set(validRows.map((row) => row.commercial_model).filter(Boolean) as string[])];
  const avgRate = amounts.length ? amounts.reduce((sum, value) => sum + value, 0) / amounts.length : null;
  return {
    quote_count: validRows.length,
    best_rate: amounts[0] ?? null,
    best_board_rate: amounts[0] ?? null,
    average_rate: avgRate === null ? null : Math.round(avgRate * 100) / 100,
    highest_rate: amounts.at(-1) ?? null,
    currency: validRows[0]?.currency || "USD",
    total_weekly_capacity: capacities.length ? capacities.reduce((sum, value) => sum + value, 0) : null,
    best_transit_days: transitDays.length ? Math.min(...transitDays) : null,
    alternative_offer_count: validRows.filter((row) => row.best_alternative_offered).length,
    available_equipment_count: validRows.filter((row) => row.equipment_available === true).length,
    deadhead_count: validRows.filter((row) => row.deadhead_distance !== null).length,
    eta_count: validRows.filter((row) => Boolean(row.eta_pickup)).length,
    commercial_models: commercialModels,
    awarded_count: validRows.filter((row) => cleanText(row.award_role) === "primary").length,
    last_quote_at: lastQuoteAt
  };
}

function publicBidBoardSummary(rows: Record<string, unknown>[]) {
  const eventIds = new Set(rows.map((row) => cleanText(row.event_id)).filter(Boolean));
  return {
    events: eventIds.size,
    opportunities: rows.length,
    live: rows.filter((row) => row.board_status === "live").length,
    closing: rows.filter((row) => row.board_status === "closing").length,
    expired: rows.filter((row) => row.board_status === "expired").length,
    awarded: rows.filter((row) => row.board_status === "awarded").length,
    lanes_with_quotes: rows.filter((row) => Number(row.quote_count || 0) > 0).length,
    total_quotes: rows.reduce((sum, row) => sum + Number(row.quote_count || 0), 0)
  };
}

async function publicBidRoomBoard(supabase: ReturnType<typeof createClient>, input: Record<string, unknown>) {
  const requestedStatus = String(cleanText(input.status) || "all").toLowerCase();
  const statusFilter = PUBLIC_BOARD_STATUSES.has(requestedStatus) ? requestedStatus : "all";
  const eventId = cleanText(input.event_id || input.rfx_event_id);
  const limit = Math.min(1000, Math.max(1, Number(input.limit || 1000) || 1000));
  const eventLimit = Math.min(500, Math.max(20, Number(input.event_limit || 250) || 250));

  let eventsQuery = supabase
    .from("rfx_events")
    .select("id,rfx_id,name,customer,event_type,status,due_date,bid_visibility_mode,created_at,updated_at")
    .in("status", ["draft", "open", "closed", "awarded"]);
  eventsQuery = eventId
    ? eventsQuery.eq("id", eventId).limit(1)
    : eventsQuery.order("updated_at", { ascending: false }).limit(eventLimit);
  const eventsResult = await eventsQuery;
  if (eventsResult.error) throw eventsResult.error;

  const events = eventsResult.data || [];
  const eventIds = events.map((event) => event.id).filter(Boolean);
  if (!eventIds.length) {
    return {
      rows: [],
      summary: publicBidBoardSummary([]),
      refresh_seconds: 15,
      generated_at: new Date().toISOString()
    };
  }

  const [lanesResult, quotesResult] = await Promise.all([
    supabase
      .from("rfx_lanes")
      .select("id,rfx_event_id,lane_number,origin,destination,origin_city,origin_state,origin_market,origin_region,destination_city,destination_state,destination_market,destination_region,equipment,trailer,config,operation,service,weekly_volume,annual_volume,target_rate,currency,logistics_model,operation_criteria,business_rules,service_specifications,other_notes,notes,updated_at")
      .in("rfx_event_id", eventIds)
      .order("lane_number", { ascending: true }),
    supabase
      .from("rfx_lane_vendors")
      .select("id,rfx_event_id,rfx_lane_id,invitation_status,bid_rate,currency,weekly_capacity,transit_days,commercial_model,marksman_margin_pct,carrier_share_pct,best_alternative_offered,equipment_available,current_unit_location,deadhead_distance,deadhead_unit,eta_pickup,responded_at,updated_at,award_role")
      .in("rfx_event_id", eventIds)
      .not("bid_rate", "is", null)
      .neq("invitation_status", "archived")
      .limit(10000)
  ]);
  if (lanesResult.error) throw lanesResult.error;
  if (quotesResult.error) throw quotesResult.error;

  const eventsById = new Map(events.map((event) => [String(event.id), event as Record<string, unknown>]));
  const quotesByLane = new Map<string, Record<string, unknown>[]>();
  for (const quote of quotesResult.data || []) {
    const laneId = cleanText(quote.rfx_lane_id);
    if (!laneId) continue;
    const bucket = quotesByLane.get(laneId) || [];
    bucket.push(quote as Record<string, unknown>);
    quotesByLane.set(laneId, bucket);
  }

  const rows = (lanesResult.data || [])
    .map((lane) => {
      const event = eventsById.get(String(lane.rfx_event_id)) || {};
      const boardStatus = publicBidBoardState(event);
      const quoteStats = publicQuoteStats(quotesByLane.get(String(lane.id)) || []);
      const visibility = bidRoomVisibility(event);
      return {
        id: lane.id,
        event_id: lane.rfx_event_id,
        board_status: boardStatus,
        due_state: dueState(event.due_date),
        visibility: {
          mode: visibility.mode,
          competitor_rank_visible: visibility.competitor_rank_visible,
          public_board: true,
          carrier_identity_visible: false
        },
        event: {
          id: event.id,
          rfx_id: event.rfx_id,
          name: event.name,
          customer: event.customer,
          event_type: event.event_type,
          status: event.status,
          due_date: event.due_date,
          updated_at: event.updated_at
        },
        lane: publicLane(lane as Record<string, unknown>),
        route_label: [lane.origin || lane.origin_city, lane.destination || lane.destination_city].filter(Boolean).join(" -> "),
        fit_tags: laneFitTags(lane as Record<string, unknown>, event),
        ...quoteStats
      };
    })
    .filter((row) => statusFilter === "all" || row.board_status === statusFilter)
    .sort((a, b) => {
      const order: Record<string, number> = { live: 0, closing: 1, awarded: 2, expired: 3 };
      const statusDelta = (order[a.board_status] ?? 9) - (order[b.board_status] ?? 9);
      if (statusDelta) return statusDelta;
      return String(b.last_quote_at || b.event.updated_at || "").localeCompare(String(a.last_quote_at || a.event.updated_at || ""));
    })
    .slice(0, limit);

  return {
    rows,
    summary: publicBidBoardSummary(rows),
    refresh_seconds: 15,
    generated_at: new Date().toISOString()
  };
}

async function publicBidRoomInviteRequest(supabase: ReturnType<typeof createClient>, input: Record<string, unknown>) {
  const eventId = cleanText(input.event_id || input.rfx_event_id);
  const laneId = cleanText(input.lane_id || input.rfx_lane_id);
  const company = cleanText(input.company || input.vendor_name || input.carrier_name);
  const contactName = cleanText(input.contact_name || input.name);
  const email = cleanEmail(input.email);
  const phone = cleanText(input.phone || input.whatsapp);
  const notes = cleanText(input.notes);
  const language = ["en", "es"].includes(String(cleanText(input.language) || "").toLowerCase())
    ? String(cleanText(input.language)).toLowerCase()
    : "en";

  if (!eventId) return { requested: false, error: "Event id is required.", status: 400 };
  if (!laneId) return { requested: false, error: "Lane id is required.", status: 400 };
  if (!company) return { requested: false, error: "Carrier company is required.", status: 400 };
  if (!email) return { requested: false, error: "A valid email is required.", status: 400 };

  const laneResult = await supabase
    .from("rfx_lanes")
    .select(`
      id,
      rfx_event_id,
      lane_number,
      origin,
      destination,
      origin_city,
      destination_city,
      equipment,
      trailer,
      operation,
      service,
      rfx_events!inner(id,owner_user_id,owner_email,rfx_id,name,customer,event_type,status,due_date)
    `)
    .eq("id", laneId)
    .eq("rfx_event_id", eventId)
    .single();
  if (laneResult.error) throw laneResult.error;

  const lane = laneResult.data as Record<string, unknown>;
  const event = relationRecord(lane.rfx_events);
  const eventStatus = String(cleanText(event.status) || "").toLowerCase();
  if (!["draft", "open", "closed", "awarded"].includes(eventStatus)) {
    return { requested: false, error: "This Bid Room is not accepting public invitation requests.", status: 409 };
  }

  const duplicateResult = await supabase
    .from("contact_history")
    .select("id,created_at")
    .eq("rfx_event_id", event.id)
    .eq("status", "requested_invite")
    .contains("metadata", { source: "public_bid_room_board", lane_id: lane.id, email })
    .limit(1);
  if (duplicateResult.error) throw duplicateResult.error;
  if ((duplicateResult.data || []).length) {
    return {
      requested: false,
      duplicate: true,
      message: language === "es" ? "Tu solicitud ya estaba registrada." : "Your invitation request is already registered."
    };
  }

  const route = [lane.origin || lane.origin_city, lane.destination || lane.destination_city].filter(Boolean).join(" -> ");
  const history = await supabase.from("contact_history").insert({
    owner_user_id: event.owner_user_id || null,
    owner_email: cleanText(event.owner_email),
    rfx_event_id: event.id,
    channel: "portal",
    direction: "inbound",
    status: "requested_invite",
    subject: `${event.rfx_id || event.name || "Bid Room"} public marketplace invitation request`,
    body_preview: [
      company,
      contactName,
      email,
      route || null
    ].filter(Boolean).join(" | "),
    metadata: {
      source: "public_bid_room_board",
      event_id: event.id,
      lane_id: lane.id,
      rfx_id: event.rfx_id || null,
      event_name: event.name || null,
      customer: event.customer || null,
      lane_number: lane.lane_number || null,
      route,
      company,
      contact_name: contactName,
      email,
      phone,
      notes,
      language,
      requested_at: new Date().toISOString()
    }
  });
  if (history.error) throw history.error;

  return {
    requested: true,
    message: language === "es"
      ? "Solicitud enviada. Procurement revisara tu acceso al Bid Room privado."
      : "Request sent. Procurement will review access to the private Bid Room."
  };
}

async function publicInvitationVendorIds(supabase: ReturnType<typeof createClient>, email: string) {
  const domain = emailDomain(email);
  const candidates = new Map<string, Record<string, unknown>>();
  const queries = [
    supabase
      .from("vendors")
      .select("id,vendor_name,legal_name,domain,primary_email,secondary_emails")
      .eq("primary_email", email)
      .limit(50),
    supabase
      .from("vendors")
      .select("id,vendor_name,legal_name,domain,primary_email,secondary_emails")
      .contains("secondary_emails", [email])
      .limit(50)
  ];
  if (domain && !GENERIC_EMAIL_DOMAINS.has(domain)) {
    queries.push(
      supabase
        .from("vendors")
        .select("id,vendor_name,legal_name,domain,primary_email,secondary_emails")
        .eq("domain", domain)
        .limit(50)
    );
  }
  const results = await Promise.all(queries);
  for (const result of results) {
    if (result.error) throw result.error;
    for (const row of result.data || []) {
      const id = cleanText(row.id);
      if (id) candidates.set(id, row as Record<string, unknown>);
    }
  }
  return [...candidates.keys()];
}

function privateBidLink(token: unknown) {
  return `${RATEWARE_APP_URL.replace(/\/$/, "")}/rfx-bid.html?token=${encodeURIComponent(String(token || ""))}`;
}

function publicInvitationSummary(row: Record<string, unknown>) {
  const event = relationRecord(row.rfx_events);
  const lane = relationRecord(row.rfx_lanes);
  return {
    invitation_id: row.id,
    event_id: row.rfx_event_id,
    lane_id: row.rfx_lane_id,
    rfx_id: event.rfx_id || event.name || "Bid Room",
    customer: event.customer || "",
    status: row.invitation_status || "invited",
    route: [lane.origin || lane.origin_city, lane.destination || lane.destination_city].filter(Boolean).join(" -> "),
    equipment: [lane.equipment, lane.trailer, lane.config].filter(Boolean).join(" / "),
    service: [lane.operation, lane.service].filter(Boolean).join(" / "),
    due_date: event.due_date || null,
    owner_email: event.owner_email || null,
    vendor_id: row.vendor_id,
    link: privateBidLink(row.invitation_token)
  };
}

function publicInvitationAccessSummary(row: Record<string, unknown>) {
  const item = publicInvitationSummary(row);
  return {
    invitation_id: item.invitation_id,
    event_id: item.event_id,
    lane_id: item.lane_id,
    rfx_id: item.rfx_id,
    customer: item.customer,
    status: item.status,
    route: item.route,
    equipment: item.equipment,
    service: item.service,
    due_date: item.due_date,
    vendor_id: item.vendor_id
  };
}

function publicInvitationEmailHtml(rows: Record<string, unknown>[], recipientEmail: string) {
  const cards = rows.map((row) => {
    const item = publicInvitationSummary(row);
    return `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #dbe4eb">
          <strong>${escapeHtmlText(item.rfx_id)}</strong><br>
          <span style="color:#526372">${escapeHtmlText(item.customer || "Private Bid Room")}</span><br>
          <span>${escapeHtmlText(item.route || "Lane pending")}</span><br>
          <span style="color:#526372">${escapeHtmlText([item.equipment, item.service].filter(Boolean).join(" | ") || "Bid details")}</span>
        </td>
        <td style="padding:10px;border-bottom:1px solid #dbe4eb;text-align:right;white-space:nowrap">
          <a href="${escapeHtmlText(item.link)}" style="display:inline-block;background:#25313b;color:#ffffff;text-decoration:none;border-radius:6px;padding:8px 10px;font-weight:700">Open Bid Room</a>
        </td>
      </tr>
    `;
  }).join("");
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#172530;font-size:14px;line-height:1.45">
      <p>We found active Rateware Bid Room invitation(s) for <strong>${escapeHtmlText(recipientEmail)}</strong>.</p>
      <p>Use the private links below to access your assigned events and submit or update your offers. Do not forward these links outside your carrier team.</p>
      <table style="border-collapse:collapse;width:100%;max-width:760px;border:1px solid #dbe4eb">${cards}</table>
      <p style="color:#647584;font-size:12px">If you did not request these links, you can ignore this message.</p>
    </div>
  `;
}

function publicInvitationEmailText(rows: Record<string, unknown>[], recipientEmail: string) {
  const lines = rows.map((row, index) => {
    const item = publicInvitationSummary(row);
    return [
      `${index + 1}. ${item.rfx_id}`,
      item.route ? `Route: ${item.route}` : null,
      item.equipment ? `Equipment: ${item.equipment}` : null,
      item.service ? `Service: ${item.service}` : null,
      `Private link: ${item.link}`
    ].filter(Boolean).join("\n");
  }).join("\n\n");
  return `We found active Rateware Bid Room invitations for ${recipientEmail}.\n\n${lines}\n\nDo not forward these private links outside your carrier team.`;
}

function resolvedPublicInvitationEvent(
  row: Record<string, unknown>,
  eventOwnerMap: Map<string, Record<string, unknown>>,
  fallbackOwnerEmail: string | null
) {
  const related = relationRecord(row.rfx_events);
  const eventId = cleanText(row.rfx_event_id) || cleanText(related.id);
  const direct = eventId ? eventOwnerMap.get(eventId) || {} : {};
  const ownerEmail = cleanEmail(direct.owner_email) || cleanEmail(related.owner_email) || fallbackOwnerEmail;
  return {
    ...related,
    ...direct,
    id: cleanText(direct.id) || cleanText(related.id) || eventId || null,
    owner_user_id: direct.owner_user_id || related.owner_user_id || null,
    owner_email: ownerEmail,
    rfx_id: cleanText(direct.rfx_id) || cleanText(related.rfx_id),
    name: cleanText(direct.name) || cleanText(related.name),
    customer: cleanText(direct.customer) || cleanText(related.customer),
    event_type: cleanText(direct.event_type) || cleanText(related.event_type),
    status: cleanText(direct.status) || cleanText(related.status),
    due_date: cleanText(direct.due_date) || cleanText(related.due_date)
  };
}

async function publicBidRoomFindInvitations(supabase: ReturnType<typeof createClient>, input: Record<string, unknown>) {
  const email = cleanEmail(input.email);
  const language = ["en", "es"].includes(String(cleanText(input.language) || "").toLowerCase())
    ? String(cleanText(input.language)).toLowerCase()
    : "en";
  if (!email) return { sent: false, error: "A valid email is required.", status: 400 };

  const vendorIds = await publicInvitationVendorIds(supabase, email);
  if (!vendorIds.length) {
    return {
      sent: false,
      matched: 0,
      matched_lane_ids: [],
      matched_event_ids: [],
      matched_invitations: [],
      message: language === "es"
        ? "No encontramos invitaciones activas para ese correo. Solicita invitacion desde una oportunidad publica."
        : "No active invitations were found for that email. Request an invitation from a public opportunity."
    };
  }

  const invitationsResult = await supabase
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
      vendors(id,vendor_name,legal_name,domain,primary_email,secondary_emails),
      rfx_events(id,owner_user_id,owner_email,rfx_id,name,customer,event_type,status,due_date),
      rfx_lanes(*)
    `)
    .in("vendor_id", vendorIds)
    .neq("invitation_status", "archived")
    .limit(100);
  if (invitationsResult.error) throw invitationsResult.error;

  const invitationRows = (invitationsResult.data || []) as Record<string, unknown>[];
  const fallbackOwnerEmail = cleanEmail(GMAIL_ALLOWED_SENDER);
  const eventIds = [...new Set(invitationRows.map((row) => cleanText(row.rfx_event_id)).filter(Boolean) as string[])];
  const eventOwnerMap = new Map<string, Record<string, unknown>>();
  if (eventIds.length) {
    const eventsResult = await supabase
      .from("rfx_events")
      .select("id,owner_user_id,owner_email,rfx_id,name,customer,event_type,status,due_date")
      .in("id", eventIds);
    if (eventsResult.error) throw eventsResult.error;
    for (const event of eventsResult.data || []) {
      const id = cleanText(event.id);
      if (id) eventOwnerMap.set(id, event as Record<string, unknown>);
    }
  }

  const matchingInvitations = invitationRows
    .map((row) => ({
      ...row,
      rfx_events: resolvedPublicInvitationEvent(row, eventOwnerMap, fallbackOwnerEmail)
    }))
    .filter((row) => cleanText(row.invitation_token))
    .filter((row) => ["draft", "open", "closed", "awarded"].includes(String(cleanText(relationRecord(row.rfx_events).status) || "").toLowerCase()));
  const matchedLaneIds = [...new Set(matchingInvitations.map((row) => cleanText(row.rfx_lane_id)).filter(Boolean) as string[])];
  const matchedEventIds = [...new Set(matchingInvitations.map((row) => cleanText(row.rfx_event_id)).filter(Boolean) as string[])];
  const matchedInvitations = matchingInvitations.map(publicInvitationAccessSummary);
  const invitations = matchingInvitations.slice(0, 25);
  if (!matchingInvitations.length) {
    return {
      sent: false,
      matched: 0,
      matched_lane_ids: [],
      matched_event_ids: [],
      matched_invitations: [],
      message: language === "es"
        ? "No encontramos invitaciones activas para ese correo. Solicita invitacion desde una oportunidad publica."
        : "No active invitations were found for that email. Request an invitation from a public opportunity."
    };
  }

  const byOwner = new Map<string, Record<string, unknown>[]>();
  for (const row of invitations) {
    const ownerEmail = cleanEmail(relationRecord(row.rfx_events).owner_email);
    if (!ownerEmail) continue;
    const bucket = byOwner.get(ownerEmail) || [];
    bucket.push(row as Record<string, unknown>);
    byOwner.set(ownerEmail, bucket);
  }
  if (!byOwner.size) throw new Error("Matched invitations do not have a valid owner email.");

  let sent = 0;
  const sentOwners: string[] = [];
  for (const [ownerEmail, rows] of byOwner.entries()) {
    const subject = rows.length === 1
      ? `Your Rateware Bid Room link: ${publicInvitationSummary(rows[0]).rfx_id}`
      : `Your Rateware Bid Room links (${rows.length})`;
    const htmlBody = publicInvitationEmailHtml(rows, email);
    const textBody = publicInvitationEmailText(rows, email);
    const gmailResult = await sendGmailMessageForOwner(supabase, ownerEmail, {
      recipient_email: email,
      subject,
      html_body: htmlBody,
      text_body: textBody
    });
    sent += rows.length;
    sentOwners.push(ownerEmail);
    const now = new Date().toISOString();
    const historyRows = rows.map((row) => ({
      owner_user_id: relationRecord(row.rfx_events).owner_user_id || null,
      owner_email: ownerEmail,
      vendor_id: row.vendor_id,
      rfx_event_id: row.rfx_event_id,
      channel: "email",
      direction: "outbound",
      status: "magic_link_sent",
      subject,
      body_preview: `Private Bid Room links sent to ${email}`,
      occurred_at: now,
      metadata: {
        source: "public_bid_room_soft_login",
        recipient_email: email,
        invitation_id: row.id,
        rfx_lane_id: row.rfx_lane_id,
        provider_message_id: cleanText(gmailResult.id),
        gmail_thread_id: cleanText(gmailResult.threadId)
      }
    }));
    const history = await supabase.from("contact_history").insert(historyRows);
    if (history.error) throw history.error;
  }

  return {
    sent: true,
    matched: matchingInvitations.length,
    sent_count: sent,
    owners: sentOwners.length,
    matched_lane_ids: matchedLaneIds,
    matched_event_ids: matchedEventIds,
    matched_invitations: matchedInvitations,
    message: language === "es"
      ? `Enviamos ${sent} link(s) privados a ${email}.`
      : `We sent ${sent} private Bid Room link(s) to ${email}.`
  };
}

function supportLanguage(input: Record<string, unknown>) {
  const language = String(cleanText(input.language) || "").toLowerCase();
  return language === "es" ? "es" : "en";
}

function supportRouteLabel(lane: Record<string, unknown>) {
  return [lane.origin || lane.origin_city, lane.destination || lane.destination_city]
    .map(cleanText)
    .filter(Boolean)
    .join(" -> ") || "selected lane";
}

function supportNormalizeSearch(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function supportCleanDetailText(value: unknown, maxLength = 320) {
  const text = cleanText(value);
  if (!text) return null;
  const withoutHtml = text
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<li[^>]*>/gi, " - ")
    .replace(/<\/p>|<\/div>|<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
  if (!withoutHtml) return null;
  return withoutHtml.length > maxLength ? `${withoutHtml.slice(0, maxLength - 1).trim()}...` : withoutHtml;
}

function supportLaneNumberLabel(lane: Record<string, unknown>, index = 0) {
  const number = cleanText(lane.lane_number);
  return number ? `#${number}` : `#${index + 1}`;
}

function supportLaneSummary(lane: Record<string, unknown>, language: string, index = 0) {
  const pieces = [
    supportLaneNumberLabel(lane, index),
    supportRouteLabel(lane),
    [lane.equipment, lane.trailer, lane.config, lane.operation, lane.service].map(cleanText).filter(Boolean).join(" / "),
    lane.weekly_volume !== null && lane.weekly_volume !== undefined ? `${lane.weekly_volume}/wk` : null,
    lane.target_rate ? `${lane.target_rate} ${cleanText(lane.currency) || ""}`.trim() : null
  ].filter(Boolean);
  return language === "es" ? pieces.join(" | ") : pieces.join(" | ");
}

function supportLaneDetailLines(lane: Record<string, unknown>, language: string) {
  const labels = language === "es"
    ? [
        ["Modelo logistico", lane.logistics_model],
        ["Criterios de operacion", lane.operation_criteria],
        ["Reglas de negocio", lane.business_rules],
        ["Especificaciones de servicio", lane.service_specifications],
        ["Otras notas", lane.other_notes],
        ["Notas", lane.notes]
      ]
    : [
        ["Logistics model", lane.logistics_model],
        ["Operation criteria", lane.operation_criteria],
        ["Business rules", lane.business_rules],
        ["Service specifications", lane.service_specifications],
        ["Other notes", lane.other_notes],
        ["Notes", lane.notes]
      ];
  return labels
    .map(([label, value]) => {
      const cleaned = supportCleanDetailText(value);
      return cleaned ? `${label}: ${cleaned}` : null;
    })
    .filter(Boolean) as string[];
}

function supportSelectLane(question: string, currentLane: Record<string, unknown>, lanes: Record<string, unknown>[] = []) {
  const haystack = supportNormalizeSearch(question);
  if (!haystack || !lanes.length) return currentLane;
  let bestLane = currentLane;
  let bestScore = 0;
  lanes.forEach((lane, index) => {
    const candidates = [
      lane.lane_number,
      lane.origin,
      lane.destination,
      lane.origin_city,
      lane.destination_city,
      lane.origin_market,
      lane.destination_market,
      lane.origin_region,
      lane.destination_region
    ].map(supportNormalizeSearch).filter(Boolean);
    const score = candidates.reduce((sum, candidate) => sum + (candidate && haystack.includes(candidate) ? Math.max(1, candidate.split(" ").length) : 0), 0);
    const numbered = haystack.includes(`ruta ${index + 1}`) || haystack.includes(`lane ${index + 1}`) || haystack.includes(`#${index + 1}`);
    const total = score + (numbered ? 3 : 0);
    if (total > bestScore) {
      bestScore = total;
      bestLane = lane;
    }
  });
  return bestScore > 0 ? bestLane : currentLane;
}

function supportEventLabel(event: Record<string, unknown>) {
  return [event.rfx_id, event.name].map(cleanText).filter(Boolean).join(" | ") || "Bid Room";
}

function supportCommercialModelCopy(question: string, language: string) {
  const lower = question.toLowerCase();
  if (!/(commercial|cost|share|margin|markup|modelo|comercial|margen|facturacion|facturación|compra|venta|xbf)/i.test(lower)) return null;
  return language === "es"
    ? "Estructura comercial: Cost-plus usa margen sugerido sobre tu costo all-in, default 3% si lo omites; Carrier invoice share mantiene tu tarifa y calcula share de factura, default 3% si lo omites; XBF Buy-Sell usa margen sugerido de compra-venta entre 7.5% y 15%, default 12% si lo omites."
    : "Commercial structure: Cost-plus uses suggested margin over your all-in cost, default 3% if blank; Carrier invoice share keeps your rate and calculates invoice share, default 3% if blank; XBF Buy-Sell uses a suggested buy-sell margin from 7.5% to 15%, default 12% if blank.";
}

function supportBestPracticeCopy(question: string, language: string) {
  const lower = question.toLowerCase();
  if (/(alternative|alternativa|alternativas|equipo|equipment|\bunidad(?:es)?\b|\bunit(?:s)?\b|\beta\b|capacity|capacidad|ranking|rank|score|displaced|superado|price|tarifa|rate|puja|bid)/i.test(lower)) {
    return language === "es"
      ? "Para mejorar una puja, captura tarifa all-in numerica, moneda, capacidad semanal, dias de transito, ETA de pickup/delivery si aplica, disponibilidad de equipo y cualquier alternativa real. Si ofreces una alternativa, explica unidades/equipo sustituto y restricciones. El ranking considera precio, capacidad, ETA, validacion y modelo comercial; no solo la tarifa mas baja."
      : "To improve a bid, enter numeric all-in rate, currency, weekly capacity, transit days, pickup/delivery ETA when available, equipment availability, and any real alternative. If you offer an alternative, describe substitute units/equipment and restrictions. Ranking considers price, capacity, ETA, validation, and commercial model, not only the lowest rate.";
  }
  return null;
}

function supportOutOfScopeReason(question: string, language: string) {
  const lower = question.toLowerCase();
  const hardEscalation = /(contract|legal|lawsuit|payment|invoice|factura|pago|cobranza|claim|reclamo|insurance|seguro|cancel|cancelar|delete|borrar|account|login|access error|error|fallo|bug|no puedo|human|humano|award guarantee|garantiza|why rejected|por que rechazaron|por qué rechazaron)/i;
  if (!hardEscalation.test(lower)) return null;
  return language === "es"
    ? "Esto requiere revision humana o datos fuera del contexto visible del Bid Room."
    : "This requires human review or data outside the visible Bid Room context.";
}

function supportMissingContextCopy(language: string) {
  return language === "es"
    ? "No puedo confirmar eso con el contexto visible. Te sugiero crear un ticket para procurement."
    : "I cannot confirm that from the visible context. I suggest creating a procurement ticket.";
}

function supportBriefAnswer(text: string, maxLength = 420) {
  const cleaned = cleanText(text).replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trim()}...` : cleaned;
}

function supportConversationalAnswer(text: string, language: string, maxLength = 300) {
  let cleaned = supportBriefAnswer(text, maxLength)
    .replace(/\s*\d+\)\s*/g, " ")
    .replace(/\s*[-•]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  if (!/[.!?]$/.test(cleaned)) cleaned += ".";
  if (cleaned.length < 40) return cleaned;
  return cleaned;
}

function supportQuestionIntent(question: string, needsTicket = false) {
  const lower = supportNormalizeSearch(question);
  if (needsTicket || /(ticket|humano|human|procurement|soporte|support|escalar|escalate)/i.test(lower)) return "ticket";
  if (/(deadline|due|vence|vencimiento|fecha|cierre|cerrar|extension|prorroga)/i.test(lower)) return "deadline";
  if (/(invitation|invite|access|participate|participating|participation|private link|link privado|invitacion|invitar|acceso|participa(?:r|cion|ción|ndo|do)?|participo|correo|email)/i.test(lower)) return "access";
  if (/(rank|ranking|score|position|posicion|leader|lider|superado|displaced|mejorar|competitivo)/i.test(lower)) return "ranking";
  if (/(alternative|alternativa|alternativas|sustituto|equipo|equipment|\bunidad(?:es)?\b|\bunit(?:s)?\b|\beta\b|availability|disponibilidad)/i.test(lower)) return "alternative";
  if (/(commercial|cost|share|margin|markup|modelo comercial|margen|facturacion|compra venta|xbf|cost plus|invoice share)/i.test(lower)) return "commercial";
  if (/(bid|puja|quote|cotizar|tarifa|rate|submit|enviar|actualizar|xlsx|excel|capacidad)/i.test(lower)) return "bidding";
  if (/(modelo logistico|logistics model|criterio|criteria|regla|rule|nota|note|servicio|service specification|detalle|detail|ruta enfocada)/i.test(lower)) return "lane_detail";
  if (/(lane|ruta|origin|origen|destination|destino|rutas invitadas|lanes invitadas|all lanes|todas las rutas|business book|libro)/i.test(lower)) return "lane_list";
  return "overview";
}

function supportPromptRoute(lane?: Record<string, unknown> | null, language = "en") {
  const route = lane ? supportRouteLabel(lane) : "";
  if (route && route !== "selected lane") {
    return language === "es" ? `Detalles de ${route}` : `Details for ${route}`;
  }
  return language === "es" ? "Detalles de la ruta seleccionada" : "Details for the selected lane";
}

function supportPromptFocusedLane(input: { lane?: Record<string, unknown> | null; invited_lanes?: Record<string, unknown>[] }) {
  if (input.lane && Object.keys(input.lane).length) return input.lane;
  return Array.isArray(input.invited_lanes) && input.invited_lanes.length ? input.invited_lanes[0] : null;
}

function supportPromptOptions(input: {
  language: string;
  token?: string | null;
  needs_ticket?: boolean;
  question: string;
  event?: Record<string, unknown> | null;
  lane?: Record<string, unknown> | null;
  invited_lanes?: Record<string, unknown>[];
}) {
  const language = input.language;
  const privateContext = Boolean(input.token);
  const intent = supportQuestionIntent(String(input.question || ""), input.needs_ticket === true);
  const focusedLane = supportPromptFocusedLane(input);
  const routePrompt = supportPromptRoute(focusedLane, language);
  const laneCount = Array.isArray(input.invited_lanes) ? input.invited_lanes.length : 0;
  const promptsByIntent: Record<string, string[]> = language === "es" ? {
    overview: privateContext
      ? ["Ver rutas invitadas", routePrompt, "Que debo capturar para cotizar?", "Como se calcula mi ranking?", "Que modelo comercial debo elegir?"]
      : ["Ver oportunidades abiertas", "Como solicito invitacion?", routePrompt, "Buscar mis invitaciones", "Como funciona el tablero publico?"],
    lane_list: [
      laneCount > 1 ? "Comparar mis rutas invitadas" : routePrompt,
      routePrompt,
      "Modelo logistico de esta ruta",
      "Reglas de negocio de esta ruta",
      "Que tarifa y capacidad debo capturar?"
    ],
    lane_detail: [
      "Modelo logistico de esta ruta",
      "Criterios de operacion de esta ruta",
      "Reglas de negocio de esta ruta",
      "Especificaciones de servicio",
      "Otras notas y riesgos"
    ],
    commercial: [
      "Explicame Cost-plus",
      "Explicame Carrier invoice share",
      "Cuando usar XBF Buy-Sell?",
      "Que porcentaje debo capturar?",
      "Como impacta mi ranking?"
    ],
    ranking: [
      "Que debo cambiar primero?",
      "Como afecta la capacidad semanal?",
      "Como afecta ETA y disponibilidad?",
      "Puedo subir una alternativa?",
      "Que me falta para mejorar score?"
    ],
    alternative: [
      "Que datos pide una alternativa?",
      "Como declaro multiples unidades?",
      "Como capturo ETA y disponibilidad?",
      "La alternativa afecta mi ranking?",
      "Que restricciones debo explicar?"
    ],
    deadline: [
      "Que debo completar antes del cierre?",
      "Ver rutas pendientes",
      "Actualizar mi oferta",
      "Confirmar si mi bid fue recibido",
      "Pedir extension via ticket"
    ],
    access: [
      "Buscar mis invitaciones",
      "Solicitar invitacion",
      "Que correo debo usar?",
      "Por que no puedo pujar desde publico?",
      "Crear ticket para procurement"
    ],
    bidding: [
      "Que campos son obligatorios?",
      "Como actualizo mi tarifa?",
      "Como confirmo capacidad?",
      "Como subo una alternativa?",
      "Como descargo/subo XLSX?"
    ],
    ticket: [
      "Crear ticket para procurement",
      "Que informacion debo incluir?",
      routePrompt,
      "Volver al resumen de la oportunidad",
      "Ver reglas de negocio visibles"
    ]
  } : {
    overview: privateContext
      ? ["Show invited lanes", routePrompt, "What do I need to quote?", "How is my rank calculated?", "Which commercial model should I use?"]
      : ["Show open opportunities", "How do I request an invitation?", routePrompt, "Find my invitations", "How does the public board work?"],
    lane_list: [
      laneCount > 1 ? "Compare my invited lanes" : routePrompt,
      routePrompt,
      "Logistics model for this lane",
      "Business rules for this lane",
      "What rate and capacity should I enter?"
    ],
    lane_detail: [
      "Logistics model for this lane",
      "Operation criteria for this lane",
      "Business rules for this lane",
      "Service specifications",
      "Other notes and risks"
    ],
    commercial: [
      "Explain Cost-plus",
      "Explain Carrier invoice share",
      "When should I use XBF Buy-Sell?",
      "Which percentage should I enter?",
      "How does this affect my rank?"
    ],
    ranking: [
      "What should I change first?",
      "How does weekly capacity affect rank?",
      "How do ETA and availability affect rank?",
      "Can I submit an alternative?",
      "What is missing to improve my score?"
    ],
    alternative: [
      "What data does an alternative need?",
      "How do I declare multiple units?",
      "How do I enter ETA and availability?",
      "Does an alternative affect my rank?",
      "Which restrictions should I explain?"
    ],
    deadline: [
      "What must I complete before close?",
      "Show pending lanes",
      "Update my offer",
      "Confirm my bid was received",
      "Request an extension by ticket"
    ],
    access: [
      "Find my invitations",
      "Request an invitation",
      "Which email should I use?",
      "Why can't I bid from the public board?",
      "Create a procurement ticket"
    ],
    bidding: [
      "Which fields are required?",
      "How do I update my rate?",
      "How do I confirm capacity?",
      "How do I submit an alternative?",
      "How do I download/upload XLSX?"
    ],
    ticket: [
      "Create a procurement ticket",
      "What information should I include?",
      routePrompt,
      "Back to opportunity summary",
      "Show visible business rules"
    ]
  };
  const prompts = promptsByIntent[intent] || promptsByIntent.overview;
  return [...new Set(prompts.map(cleanText).filter(Boolean))].slice(0, 5);
}

function supportIntentLabel(intent: string, language: string) {
  const labels: Record<string, Record<string, string>> = {
    overview: { en: "Opportunity overview", es: "Resumen de oportunidad" },
    lane_list: { en: "Invited lanes", es: "Rutas invitadas" },
    lane_detail: { en: "Lane details", es: "Detalles de ruta" },
    commercial: { en: "Commercial model", es: "Modelo comercial" },
    ranking: { en: "Ranking guidance", es: "Guia de ranking" },
    alternative: { en: "Alternative offer", es: "Oferta alternativa" },
    deadline: { en: "Deadline", es: "Fecha limite" },
    access: { en: "Access and invitations", es: "Acceso e invitaciones" },
    bidding: { en: "Bid submission", es: "Captura de puja" },
    ticket: { en: "Procurement follow-up", es: "Seguimiento procurement" }
  };
  return labels[intent]?.[language === "es" ? "es" : "en"] || labels.overview[language === "es" ? "es" : "en"];
}

function supportHighlightItems(input: {
  language: string;
  token?: string | null;
  event?: Record<string, unknown> | null;
  lane?: Record<string, unknown> | null;
  invited_lanes?: Record<string, unknown>[];
  live_board?: Record<string, unknown> | null;
}) {
  const language = input.language;
  const event = input.event || {};
  const lane = input.lane || {};
  const liveBoard = input.live_board || {};
  const items = [
    {
      label: language === "es" ? "RFx" : "RFx",
      value: supportEventLabel(event)
    },
    {
      label: language === "es" ? "Cierre" : "Deadline",
      value: cleanText(event.due_date) || (language === "es" ? "No definido" : "Not defined")
    },
    {
      label: language === "es" ? "Ruta" : "Lane",
      value: supportRouteLabel(lane)
    }
  ];
  const laneCount = Array.isArray(input.invited_lanes) ? input.invited_lanes.length : 0;
  if (input.token && laneCount > 1) {
    items.push({
      label: language === "es" ? "Rutas invitadas" : "Invited lanes",
      value: String(laneCount)
    });
  }
  if (input.token && liveBoard.current_rank) {
    items.push({
      label: language === "es" ? "Tu ranking" : "Your rank",
      value: `#${liveBoard.current_rank}`
    });
  }
  return items
    .map((item) => ({ label: cleanText(item.label), value: cleanText(item.value) }))
    .filter((item) => item.value && item.value !== "selected lane")
    .slice(0, 4);
}

function supportNextSteps(input: {
  language: string;
  intent: string;
  token?: string | null;
  needs_ticket?: boolean;
}) {
  const language = input.language;
  const privateContext = Boolean(input.token);
  if (input.needs_ticket || input.intent === "ticket") {
    return language === "es"
      ? ["Resume que decision necesitas.", "Incluye RFx, ruta y correo de contacto.", "Crea ticket si el dato no esta visible."]
      : ["Summarize the decision you need.", "Include RFx, lane, and contact email.", "Create a ticket if the data is not visible."];
  }
  const steps: Record<string, { en: string[]; es: string[] }> = {
    overview: {
      en: privateContext
        ? ["Review all invited lanes.", "Open a lane detail if rules matter.", "Submit or update your bid before the deadline."]
        : ["Review open opportunities.", "Request access or find your private invitations.", "Use a private link to submit a bid."],
      es: privateContext
        ? ["Revisa todas las rutas invitadas.", "Abre el detalle de ruta si importan las reglas.", "Envia o actualiza tu puja antes del cierre."]
        : ["Revisa oportunidades abiertas.", "Solicita acceso o busca tus invitaciones privadas.", "Usa un link privado para pujar."]
    },
    lane_list: {
      en: ["Compare route requirements.", "Open the lane with the closest fit.", "Bid each lane independently."],
      es: ["Compara requisitos por ruta.", "Abre la ruta con mejor fit.", "Cotiza cada ruta de forma independiente."]
    },
    lane_detail: {
      en: ["Check logistics model.", "Review operation rules and notes.", "Bid only if your operation can comply."],
      es: ["Revisa modelo logistico.", "Valida reglas de operacion y notas.", "Puja solo si tu operacion cumple."]
    },
    commercial: {
      en: ["Choose the structure that matches billing.", "Leave cost-plus or invoice share blank to use 3%.", "Use XBF Buy-Sell with 7.5%-15% suggested margin, or blank for 12%."],
      es: ["Elige la estructura que coincide con facturacion.", "Deja cost-plus o invoice share vacio para usar 3%.", "Usa XBF Buy-Sell con margen sugerido 7.5%-15%, o vacio para 12%."]
    },
    ranking: {
      en: ["Improve price first if capacity is equal.", "Confirm real weekly capacity.", "Add ETA and availability to reduce risk."],
      es: ["Mejora precio primero si la capacidad es igual.", "Confirma capacidad semanal real.", "Agrega ETA y disponibilidad para reducir riesgo."]
    },
    alternative: {
      en: ["Describe the substitute equipment.", "Add units, ETA, and restrictions.", "Clarify whether the same rate applies."],
      es: ["Describe el equipo sustituto.", "Agrega unidades, ETA y restricciones.", "Aclara si aplica la misma tarifa."]
    },
    deadline: {
      en: ["Finish required bid fields.", "Confirm capacity and ETA.", "Create a ticket only if you need an extension."],
      es: ["Completa campos requeridos.", "Confirma capacidad y ETA.", "Crea ticket solo si necesitas extension."]
    },
    access: {
      en: ["Use the invited email.", "Find private links if already invited.", "Request invitation only for opportunities without access."],
      es: ["Usa el correo invitado.", "Busca links privados si ya fuiste invitado.", "Solicita invitacion solo en oportunidades sin acceso."]
    },
    bidding: {
      en: ["Enter rate, currency, capacity, and transit.", "Save each update.", "Use XLSX upload for multiple lanes."],
      es: ["Captura tarifa, moneda, capacidad y transito.", "Guarda cada actualizacion.", "Usa XLSX para multiples rutas."]
    }
  };
  const selected = steps[input.intent] || steps.overview;
  return selected[language === "es" ? "es" : "en"].slice(0, 3);
}

function supportResult(input: {
  answer: string;
  needs_ticket: boolean;
  confidence: "low" | "medium" | "high";
  scope: string;
  language: string;
  token?: string | null;
  question: string;
  event?: Record<string, unknown> | null;
  lane?: Record<string, unknown> | null;
  invited_lanes?: Record<string, unknown>[];
  live_board?: Record<string, unknown> | null;
  ai_assisted?: boolean;
}) {
  const intent = supportQuestionIntent(input.question, input.needs_ticket === true);
  return {
    question: supportBriefAnswer(input.question, 140),
    answer: supportConversationalAnswer(input.answer, input.language),
    needs_ticket: input.needs_ticket,
    confidence: input.confidence,
    scope: input.scope,
    ai_assisted: input.ai_assisted === true,
    intent,
    intent_label: supportIntentLabel(intent, input.language),
    support_highlights: supportHighlightItems(input),
    next_steps: supportNextSteps({ ...input, intent }),
    ticket_suggestion: input.needs_ticket
      ? (input.language === "es" ? "Puedo crear un ticket con esta pregunta y el contexto del Bid Room." : "I can create a ticket with this question and the Bid Room context.")
      : "",
    suggested_prompts: supportPromptOptions(input)
  };
}

function supportContextScope(input: { token?: string | null; lane?: Record<string, unknown>; event?: Record<string, unknown>; vendor?: Record<string, unknown>; lane_count?: number }, language: string) {
  const pieces = [];
  if (input.token) pieces.push(language === "es" ? "Bid Room privado" : "Private Bid Room");
  else pieces.push(language === "es" ? "Tablero publico" : "Public board");
  if (input.event) pieces.push(supportEventLabel(input.event));
  if (input.lane_count && input.lane_count > 1) pieces.push(language === "es" ? `${input.lane_count} rutas invitadas` : `${input.lane_count} invited lanes`);
  if (input.lane) pieces.push(language === "es" ? `Ruta enfocada: ${supportRouteLabel(input.lane)}` : `Focused lane: ${supportRouteLabel(input.lane)}`);
  if (input.vendor) pieces.push(cleanText(input.vendor.vendor_name) || cleanText(input.vendor.domain) || "Carrier");
  return pieces.filter(Boolean).join(" | ");
}

function supportLanePayload(lane: Record<string, unknown>, language: string, index = 0) {
  return {
    lane_label: supportLaneSummary(lane, language, index),
    lane_number: cleanText(lane.lane_number),
    origin: cleanText(lane.origin || lane.origin_city),
    destination: cleanText(lane.destination || lane.destination_city),
    origin_market: cleanText(lane.origin_market),
    destination_market: cleanText(lane.destination_market),
    origin_region: cleanText(lane.origin_region),
    destination_region: cleanText(lane.destination_region),
    equipment: cleanText(lane.equipment),
    trailer: cleanText(lane.trailer),
    config: cleanText(lane.config),
    operation: cleanText(lane.operation),
    service: cleanText(lane.service),
    weekly_volume: lane.weekly_volume ?? null,
    target_rate: lane.target_rate ?? null,
    currency: cleanText(lane.currency),
    logistics_model: supportCleanDetailText(lane.logistics_model, 800),
    operation_criteria: supportCleanDetailText(lane.operation_criteria, 800),
    business_rules: supportCleanDetailText(lane.business_rules, 800),
    service_specifications: supportCleanDetailText(lane.service_specifications, 800),
    other_notes: supportCleanDetailText(lane.other_notes, 800),
    notes: supportCleanDetailText(lane.notes, 800)
  };
}

function supportAiOutputText(payload: Record<string, unknown>) {
  const direct = cleanText(payload.output_text);
  if (direct) return direct;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray((item as Record<string, unknown>).content) ? (item as Record<string, unknown>).content as Record<string, unknown>[] : [];
    for (const part of content) {
      if (part.type === "output_text" && cleanText(part.text)) return cleanText(part.text);
    }
  }
  return null;
}

async function bidSupportAiAnswer(
  question: string,
  context: {
    language: string;
    token?: string | null;
    event?: Record<string, unknown> | null;
    lane?: Record<string, unknown> | null;
    vendor?: Record<string, unknown> | null;
    invited_lanes?: Record<string, unknown>[];
    live_board?: Record<string, unknown> | null;
    scope: string;
  },
  fallback: Record<string, unknown>
) {
  if (!OPENAI_API_KEY || !OPENAI_MODEL) return null;
  const language = context.language;
  const lanes = Array.isArray(context.invited_lanes) ? context.invited_lanes : [];
  const focusedLane = supportSelectLane(question, context.lane || {}, lanes);
  const requestContext = {
    question,
    language,
    scope: context.scope,
    event: {
      rfx_id: cleanText(context.event?.rfx_id),
      name: cleanText(context.event?.name),
      customer: cleanText(context.event?.customer),
      event_type: cleanText(context.event?.event_type),
      status: cleanText(context.event?.status),
      due_date: cleanText(context.event?.due_date)
    },
    carrier: {
      name: cleanText(context.vendor?.vendor_name),
      domain: cleanText(context.vendor?.domain)
    },
    focused_lane: supportLanePayload(focusedLane || context.lane || {}, language),
    invited_lanes: lanes.slice(0, 25).map((lane, index) => supportLanePayload(lane, language, index)),
    live_board: {
      current_rank: context.live_board?.current_rank ?? null,
      marketplace_signal: cleanText(context.live_board?.marketplace_signal),
      current_score: context.live_board?.current_score ?? null
    },
    deterministic_fallback: {
      answer: cleanText(fallback.answer),
      needs_ticket: fallback.needs_ticket === true,
      confidence: cleanText(fallback.confidence)
    }
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [{
            type: "input_text",
            text: [
              "You are Rateware Bid Room support for freight procurement.",
              "Answer only from the supplied Bid Room context. Do not invent carriers, lanes, prices, rankings, legal terms, or commercial approvals.",
              "If the context does not contain the answer, say that procurement should review it and set needs_ticket true.",
              "Write like a helpful procurement chat assistant, not like a report.",
              "Keep the answer conversational, practical, and in the requested language.",
              "Use one or two short sentences, maximum 65 words. Do not use numbered lists unless the user explicitly asks for steps.",
              "Never promise an award, access, payment, capacity, or exception."
            ].join(" ")
          }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: JSON.stringify(requestContext) }]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "bid_support_answer",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              answer: { type: "string" },
              needs_ticket: { type: "boolean" },
              confidence: { type: "string", enum: ["low", "medium", "high"] },
              scope: { type: "string" }
            },
            required: ["answer", "needs_ticket", "confidence", "scope"]
          }
        }
      }
    })
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const outputText = supportAiOutputText(payload);
  if (!outputText) return null;
  try {
    const parsed = JSON.parse(outputText);
    const answer = cleanText(parsed.answer)?.slice(0, 2400);
    if (!answer) return null;
    return {
      answer,
      needs_ticket: parsed.needs_ticket === true,
      confidence: ["low", "medium", "high"].includes(String(parsed.confidence)) ? parsed.confidence : "medium",
      scope: cleanText(parsed.scope) || context.scope,
      ai_assisted: true
    };
  } catch (_error) {
    return null;
  }
}

async function loadPublicSupportLane(supabase: ReturnType<typeof createClient>, input: Record<string, unknown>) {
  const laneId = cleanText(input.lane_id || input.rfx_lane_id);
  if (!laneId) return null;
  const result = await supabase
    .from("rfx_lanes")
    .select(`
      id,
      rfx_event_id,
      lane_number,
      origin,
      destination,
      origin_city,
      destination_city,
      equipment,
      trailer,
      operation,
      service,
      weekly_volume,
      target_rate,
      currency,
      logistics_model,
      operation_criteria,
      business_rules,
      service_specifications,
      other_notes,
      notes,
      rfx_events!inner(id,owner_user_id,owner_email,rfx_id,name,customer,event_type,status,due_date,bid_visibility_mode)
    `)
    .eq("id", laneId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as Record<string, unknown> | null;
}

async function loadPrivateSupportContext(supabase: ReturnType<typeof createClient>, token: string) {
  const context = await currentInvitationContext(supabase, token);
  const currentResult = await supabase
    .from("rfx_lane_vendors")
    .select("id,bid_rate,currency,weekly_capacity,transit_days,commercial_model,marksman_margin_pct,carrier_share_pct,best_alternative_offered,alternative_equipment,alternative_units,equipment_available,current_unit_location,deadhead_distance,deadhead_unit,eta_pickup,eta_delivery,responded_at,updated_at,notes,vendors(vendor_name,domain)")
    .eq("id", context.id)
    .single();
  if (currentResult.error) throw currentResult.error;
  const current = {
    ...context,
    ...currentResult.data,
    rfx_events: context.rfx_events,
    rfx_lanes: context.rfx_lanes,
    vendors: context.vendors
  };
  const peersResult = await supabase
    .from("rfx_lane_vendors")
    .select("id,bid_rate,currency,weekly_capacity,transit_days,commercial_model,marksman_margin_pct,carrier_share_pct,best_alternative_offered,alternative_equipment,alternative_units,equipment_available,current_unit_location,deadhead_distance,deadhead_unit,eta_pickup,eta_delivery,responded_at,updated_at,vendors(vendor_name,domain)")
    .eq("rfx_lane_id", context.rfx_lane_id)
    .neq("id", context.id)
    .not("bid_rate", "is", null)
    .in("invitation_status", ["quoted", "bid_submitted", "awarded"])
    .limit(1000);
  if (peersResult.error) throw peersResult.error;
  const invitedResult = await supabase
    .from("rfx_lane_vendors")
    .select(`
      id,
      rfx_lane_id,
      invitation_status,
      bid_rate,
      currency,
      weekly_capacity,
      transit_days,
      commercial_model,
      marksman_margin_pct,
      carrier_share_pct,
      equipment_available,
      current_unit_location,
      deadhead_distance,
      deadhead_unit,
      responded_at,
      updated_at,
      notes,
      rfx_lanes(*)
    `)
    .eq("rfx_event_id", context.rfx_event_id)
    .eq("vendor_id", context.vendor_id)
    .neq("invitation_status", "archived")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (invitedResult.error) throw invitedResult.error;
  const invitedLanes = (invitedResult.data || []).map((row) => {
    const lane = relationRecord(row.rfx_lanes);
    return {
      ...lane,
      invitation_id: row.id,
      invitation_status: row.invitation_status,
      bid_rate: row.bid_rate,
      bid_currency: row.currency,
      bid_weekly_capacity: row.weekly_capacity,
      bid_transit_days: row.transit_days,
      commercial_model: row.commercial_model || lane.commercial_model,
      equipment_available: row.equipment_available,
      current_unit_location: row.current_unit_location,
      deadhead_distance: row.deadhead_distance,
      deadhead_unit: row.deadhead_unit,
      responded_at: row.responded_at,
      updated_at: row.updated_at,
      carrier_notes: row.notes,
      is_current_lane: cleanText(row.id) === cleanText(context.id)
    };
  });
  return {
    invitation: current,
    event: relationRecord(context.rfx_events),
    lane: relationRecord(context.rfx_lanes),
    vendor: relationRecord(context.vendors),
    invited_lanes: invitedLanes,
    live_board: liveBoardFromRows(current, peersResult.data || [])
  };
}

function bidSupportAnswerFromContext(
  question: string,
  context: {
    language: string;
    token?: string | null;
    event?: Record<string, unknown> | null;
    lane?: Record<string, unknown> | null;
    vendor?: Record<string, unknown> | null;
    live_board?: Record<string, unknown> | null;
  }
) {
  const language = context.language;
  const reason = supportOutOfScopeReason(question, language);
  const scope = supportContextScope({
    token: context.token,
    event: context.event || undefined,
    lane: context.lane || undefined,
    vendor: context.vendor || undefined
  }, language);
  if (reason) {
    return {
      answer: `${reason} ${supportMissingContextCopy(language)}`,
      needs_ticket: true,
      confidence: "low",
      scope
    };
  }

  const parts: string[] = [];
  const lane = context.lane || {};
  const event = context.event || {};
  const liveBoard = context.live_board || {};
  const commercialCopy = supportCommercialModelCopy(question, language);
  const bestPracticeCopy = supportBestPracticeCopy(question, language);
  if (/(deadline|due|vence|vencimiento|fecha|cierre)/i.test(question)) {
    const dueDate = cleanText(event.due_date);
    parts.push(language === "es"
      ? `La fecha limite visible para este Bid Room es ${dueDate || "no definida"}.`
      : `The visible deadline for this Bid Room is ${dueDate || "not defined"}.`);
  }
  if (/(lane|ruta|origin|origen|destination|destino|equipment|equipo|service|servicio|operation|operacion|operación)/i.test(question)) {
    parts.push(language === "es"
      ? `Contexto de ruta: ${supportRouteLabel(lane)}. Equipo/servicio visible: ${[lane.equipment, lane.trailer, lane.operation, lane.service].map(cleanText).filter(Boolean).join(" / ") || "no declarado"}.`
      : `Lane context: ${supportRouteLabel(lane)}. Visible equipment/service: ${[lane.equipment, lane.trailer, lane.operation, lane.service].map(cleanText).filter(Boolean).join(" / ") || "not declared"}.`);
  }
  if (/(rank|ranking|score|position|posicion|posición|leader|lider|líder|superado|displaced)/i.test(question) && context.token) {
    parts.push(language === "es"
      ? `Tu posicion visible es ${liveBoard.current_rank ? `#${liveBoard.current_rank}` : "no disponible aun"}. Senal actual: ${cleanText(liveBoard.marketplace_signal) || "sin senal"}.`
      : `Your visible position is ${liveBoard.current_rank ? `#${liveBoard.current_rank}` : "not available yet"}. Current signal: ${cleanText(liveBoard.marketplace_signal) || "no signal"}.`);
  }
  if (commercialCopy) parts.push(commercialCopy);
  if (bestPracticeCopy) parts.push(bestPracticeCopy);
  if (!context.token && /(invitation|invite|access|participate|participating|participation|private link|link privado|invitacion|invitación|invitar|acceso|participa(?:r|cion|ción|ndo|do)?|participo)/i.test(question)) {
    parts.push(language === "es"
      ? "Para participar desde el tablero publico, abre una oportunidad y usa Request invitation. Si ya recibiste invitacion, usa Find my invitations con el mismo correo al que procurement te contacto; Rateware enviara tus links privados a ese inbox."
      : "To participate from the public board, open an opportunity and use Request invitation. If you were already invited, use Find my invitations with the same email procurement contacted; Rateware will send your private links to that inbox.");
  }
  if (!context.token && /(opportunity|opportunities|marketplace|public board|tablero|publico|público|oportunidad|oportunidades)/i.test(question)) {
    parts.push(language === "es"
      ? "El tablero publico muestra oportunidades cargadas al Bid Room para visibilidad de mercado. No expone identidad de competidores y no permite pujar directamente; la puja ocurre en el Bid Room privado con token."
      : "The public board shows Bid Room opportunities for market visibility. It does not expose competitor identity and it does not accept direct bids; bidding happens in the private tokenized Bid Room.");
  }
  if (!context.token && /(bid|puja|quote|cotizar|tarifa|rate|submit|enviar)/i.test(question)) {
    parts.push(language === "es"
      ? "Desde el tablero publico no se puede pujar directamente. Solicita invitacion o usa tu link privado; si ya fuiste invitado, usa Find my invitations con el correo donde recibiste la invitacion."
      : "You cannot bid directly from the public board. Request an invitation or use your private link; if you were already invited, use Find my invitations with the email that received the invite.");
  }
  if (/(business|modelo logistico|logistico|criterios|rules|reglas|notes|notas|detail|detalle)/i.test(question)) {
    const details = [
      lane.logistics_model ? "logistics model" : null,
      lane.operation_criteria ? "operation criteria" : null,
      lane.business_rules ? "business rules" : null,
      lane.service_specifications ? "service specifications" : null,
      lane.other_notes || lane.notes ? "notes" : null
    ].filter(Boolean);
    parts.push(language === "es"
      ? `Los detalles disponibles son: ${details.length ? details.join(", ") : "no hay detalles adicionales capturados en esta lane"}.`
      : `Available details: ${details.length ? details.join(", ") : "no additional lane details are captured"}.`);
  }
  if (!parts.length) {
    return {
      answer: supportMissingContextCopy(language),
      needs_ticket: true,
      confidence: "low",
      scope
    };
  }
  parts.push(language === "es"
    ? "Si necesitas una decision comercial, excepcion o dato no visible, crea un ticket para procurement."
    : "If you need a commercial decision, exception, or data that is not visible, create a ticket for procurement.");
  return {
    answer: parts.join(" "),
    needs_ticket: false,
    confidence: context.token ? "high" : "medium",
    scope
  };
}

function bidSupportAnswerFromOpportunityContext(
  question: string,
  context: {
    language: string;
    token?: string | null;
    event?: Record<string, unknown> | null;
    lane?: Record<string, unknown> | null;
    vendor?: Record<string, unknown> | null;
    invited_lanes?: Record<string, unknown>[];
    live_board?: Record<string, unknown> | null;
  }
) {
  const language = context.language;
  const invitedLanes = Array.isArray(context.invited_lanes) ? context.invited_lanes : [];
  const focusedLane = supportSelectLane(question, context.lane || {}, invitedLanes);
  const reason = supportOutOfScopeReason(question, language);
  const scope = supportContextScope({
    token: context.token,
    event: context.event || undefined,
    lane: focusedLane || context.lane || undefined,
    vendor: context.vendor || undefined,
    lane_count: invitedLanes.length
  }, language);
  if (reason) {
    return supportResult({
      answer: `${reason} ${supportMissingContextCopy(language)}`,
      needs_ticket: true,
      confidence: "low",
      scope,
      language,
      token: context.token,
      question,
      event: context.event,
      lane: focusedLane || context.lane,
      invited_lanes: invitedLanes,
      live_board: context.live_board
    });
  }

  const event = context.event || {};
  const lane = focusedLane || context.lane || {};
  const liveBoard = context.live_board || {};
  const route = supportRouteLabel(lane);
  const equipment = [lane.equipment, lane.trailer, lane.config, lane.operation, lane.service].map(cleanText).filter(Boolean).join(" / ");
  const dueDate = cleanText(event.due_date);
  let answer = "";
  let needsTicket = false;
  let confidence: "low" | "medium" | "high" = context.token ? "high" : "medium";

  if (/(deadline|due|vence|vencimiento|fecha|cierre)/i.test(question)) {
    answer = language === "es"
      ? `La fecha limite visible es ${dueDate || "no definida"}. Si necesitas una extension, crea un ticket.`
      : `The visible deadline is ${dueDate || "not defined"}. If you need an extension, create a ticket.`;
  } else if (/(rank|ranking|score|position|posicion|position|leader|lider|superado|displaced)/i.test(question) && context.token) {
    answer = language === "es"
      ? `Tu ranking visible es ${liveBoard.current_rank ? `#${liveBoard.current_rank}` : "aun no disponible"}. Para mejorar, actualiza tarifa all-in, capacidad, ETA y disponibilidad real.`
      : `Your visible rank is ${liveBoard.current_rank ? `#${liveBoard.current_rank}` : "not available yet"}. To improve it, update all-in rate, capacity, ETA, and real availability.`;
  } else if (/(commercial|cost|share|margin|markup|modelo|comercial|margen|facturacion|facturacion|compra|venta|xbf)/i.test(question)) {
    answer = language === "es"
      ? "Cost-plus usa margen sugerido sobre tu all-in y default 3% si queda vacio. Carrier invoice share mantiene tu tarifa y default 3% si queda vacio. XBF Buy-Sell usa margen 7.5%-15%; si queda vacio aplica 12%."
      : "Cost-plus uses suggested margin over your all-in and defaults to 3% if blank. Carrier invoice share keeps your rate and defaults to 3% if blank. XBF Buy-Sell uses 7.5%-15%; if blank it applies 12%.";
  } else if (/(alternative|alternativa|alternativas|equipo|equipment|\bunidad(?:es)?\b|\bunit(?:s)?\b|\beta\b)/i.test(question)) {
    answer = language === "es"
      ? "Puedes proponer una alternativa si cambia equipo, unidades o capacidad. Indica unidades, restricciones, ETA y si la tarifa aplica al sustituto."
      : "You can propose an alternative if equipment, units, or capacity change. Include units, restrictions, ETA, and whether the rate applies to the substitute.";
  } else if (!context.token && /(invitation|invite|access|participate|participating|participation|private link|link privado|invitacion|invitar|acceso|participa(?:r|cion|ción|ndo|do)?|participo)/i.test(question)) {
    answer = language === "es"
      ? "Para participar necesitas invitacion. En el tablero publico puedes solicitar acceso o buscar tus links con el correo invitado."
      : "To participate you need an invitation. From the public board you can request access or find your links with the invited email.";
  } else if (!context.token && /(bid|puja|quote|cotizar|tarifa|rate|submit|enviar)/i.test(question)) {
    answer = language === "es"
      ? "La pagina publica no acepta pujas. La tarifa se captura desde el Bid Room privado con token."
      : "The public page does not accept bids. Rates are submitted from the private tokenized Bid Room.";
  } else if (/(lane|ruta|origin|origen|destination|destino|equipment|equipo|service|servicio|operation|operacion|operaci.n|detalle|detail|criterio|criteria|regla|rule|nota|note|modelo|logistico|logistics)/i.test(question)) {
    const detailCount = supportLaneDetailLines(lane, language).length;
    answer = language === "es"
      ? `Ruta enfocada: ${route}. Equipo/servicio: ${equipment || "no declarado"}. Hay ${detailCount} seccion(es) de detalle visibles para revisar.`
      : `Focused lane: ${route}. Equipment/service: ${equipment || "not declared"}. There are ${detailCount} visible detail section(s) to review.`;
  } else if (/(opportunity|oportunidad|general|evento|event|negocio|business|book|libro|all lanes|todas las rutas|rutas invitadas|lanes invitadas|resumen|summary|que|what|describe|explica|explain)/i.test(question)) {
    answer = language === "es"
      ? `${supportEventLabel(event)}${cleanText(event.customer) ? ` para ${cleanText(event.customer)}` : ""}. ${invitedLanes.length ? `${invitedLanes.length} ruta(s) invitadas.` : `Ruta visible: ${route}.`} Cierre: ${dueDate || "no definido"}.`
      : `${supportEventLabel(event)}${cleanText(event.customer) ? ` for ${cleanText(event.customer)}` : ""}. ${invitedLanes.length ? `${invitedLanes.length} invited lane(s).` : `Visible lane: ${route}.`} Deadline: ${dueDate || "not defined"}.`;
  } else {
    answer = supportMissingContextCopy(language);
    needsTicket = true;
    confidence = "low";
  }

  return supportResult({
    answer,
    needs_ticket: needsTicket,
    confidence,
    scope,
    language,
    token: context.token,
    question,
    event: context.event,
    lane,
    invited_lanes: invitedLanes,
    live_board: context.live_board
  });
}

async function createBidSupportTicket(
  supabase: ReturnType<typeof createClient>,
  input: Record<string, unknown>,
  support: Record<string, unknown>,
  context: {
    event?: Record<string, unknown> | null;
    lane?: Record<string, unknown> | null;
    vendor?: Record<string, unknown> | null;
  }
) {
  const event = context.event || {};
  const lane = context.lane || {};
  const vendor = context.vendor || {};
  const question = cleanText(input.message || input.question) || "Support request";
  const contactEmail = cleanEmail(input.email || relationRecord(vendor).primary_email);
  const ownerEmail = cleanText(event.owner_email) || GMAIL_ALLOWED_SENDER;
  const metadata = {
    source: "bid_support_agent",
    support_status: "open",
    priority: cleanText(input.priority) || "normal",
    question,
    answer: cleanText(support.answer),
    confidence: cleanText(support.confidence),
    scope: cleanText(support.scope),
    lane_id: cleanText(lane.id || input.lane_id || input.rfx_lane_id),
    route: Object.keys(lane).length ? supportRouteLabel(lane) : null,
    contact_email: contactEmail,
    public_context: cleanBoolean(input.public_context) === true
  };
  const result = await supabase.from("contact_history").insert({
    owner_user_id: cleanText(event.owner_user_id),
    owner_email: ownerEmail,
    vendor_id: cleanText(vendor.id || input.vendor_id),
    rfx_event_id: cleanText(event.id || input.event_id || input.rfx_event_id),
    channel: "portal",
    direction: "inbound",
    status: "support_ticket",
    subject: `${supportEventLabel(event)} support question`,
    body_preview: question.slice(0, 400),
    occurred_at: new Date().toISOString(),
    metadata
  }).select("id,metadata").single();
  if (result.error) throw result.error;

  const chatSync = await mirrorSupportTicketToGoogleChat(supabase, result.data, { event, lane, vendor, question, contactEmail }).catch((error) => ({
    status: "error",
    error: String(error?.message || error)
  }));
  if (chatSync?.status && chatSync.status !== "skipped") {
    await supabase.from("contact_history").update({
      metadata: {
        ...objectRecord(result.data.metadata),
        google_chat_sync_status: chatSync.status,
        google_chat_thread_id: cleanText(chatSync.thread_id),
        google_chat_message_id: cleanText(chatSync.message_id),
        google_chat_message_name: cleanText(chatSync.name),
        google_chat_error: cleanText(chatSync.error)
      }
    }).eq("id", result.data.id);
  }

  return { ...result.data, google_chat: chatSync };
}

async function mirrorSupportTicketToGoogleChat(
  supabase: ReturnType<typeof createClient>,
  ticket: Record<string, unknown>,
  context: {
    event: Record<string, unknown>;
    lane: Record<string, unknown>;
    vendor: Record<string, unknown>;
    question: string;
    contactEmail: string | null;
  }
) {
  const event = context.event || {};
  const eventId = cleanText(event.id);
  const ownerEmail = cleanText(event.owner_email);
  if (!eventId || !ownerEmail) return { status: "skipped", reason: "Ticket has no event context." };

  const vendorId = cleanText(context.vendor.id);
  const laneId = cleanText(context.lane.id);
  const threadType = vendorId ? "carrier_private" : "event_group";
  let threadQuery = supabase
    .from("bid_room_chat_threads")
    .select("*, vendors(vendor_name,domain), rfx_lanes(*)")
    .eq("rfx_event_id", eventId)
    .eq("thread_type", threadType)
    .neq("status", "archived");
  if (threadType === "carrier_private") {
    threadQuery = threadQuery.eq("vendor_id", vendorId);
    threadQuery = laneId ? threadQuery.eq("rfx_lane_id", laneId) : threadQuery.is("rfx_lane_id", null);
  } else {
    threadQuery = threadQuery.is("rfx_lane_id", null).is("vendor_id", null);
  }
  const threadResult = await threadQuery.maybeSingle();
  if (threadResult.error) throw threadResult.error;

  let thread = threadResult.data;
  if (!thread) {
    const created = await supabase.from("bid_room_chat_threads").insert({
      owner_user_id: cleanText(event.owner_user_id),
      owner_email: ownerEmail,
      rfx_event_id: eventId,
      rfx_lane_id: threadType === "carrier_private" ? laneId : null,
      vendor_id: threadType === "carrier_private" ? vendorId : null,
      thread_type: threadType,
      title: bidRoomThreadTitle(threadType, event, context.lane, context.vendor),
      google_chat_thread_key: bidRoomGoogleThreadKey(eventId, threadType, threadType === "carrier_private" ? laneId : null, threadType === "carrier_private" ? vendorId : null),
      google_chat_sync_status: "ready",
      metadata: { source: "vendor_support_ticket", rfx_id: cleanText(event.rfx_id) }
    }).select("*, vendors(vendor_name,domain), rfx_lanes(*)").single();
    if (created.error) throw created.error;
    thread = created.data;
  }

  const route = Object.keys(context.lane || {}).length ? supportRouteLabel(context.lane) : "No lane selected";
  const vendorName = cleanText(context.vendor.vendor_name || context.vendor.domain) || "Unknown carrier";
  const body = [
    `Vendor support ticket ${cleanText(ticket.id)}`,
    `Event: ${supportEventLabel(event)}`,
    `Vendor: ${vendorName}`,
    context.contactEmail ? `Contact: ${context.contactEmail}` : null,
    `Route: ${route}`,
    `Question: ${context.question}`
  ].filter(Boolean).join("\n");

  const messageResult = await supabase.from("bid_room_chat_messages").insert({
    owner_user_id: cleanText(event.owner_user_id),
    owner_email: ownerEmail,
    thread_id: thread.id,
    rfx_event_id: eventId,
    rfx_lane_id: cleanText(context.lane.id),
    vendor_id: cleanText(context.vendor.id),
    sender_role: "system",
    sender_name: "Vendor Support",
    sender_email: ownerEmail,
    body,
    google_chat_sync_status: "pending",
    metadata: {
      source: "vendor_support_ticket",
      contact_history_id: cleanText(ticket.id),
      support_status: "open"
    }
  }).select("*, vendors(vendor_name,domain)").single();
  if (messageResult.error) throw messageResult.error;

  await supabase.from("bid_room_chat_threads").update({
    updated_at: new Date().toISOString(),
    communication_status: "needs_reply",
    needs_reply: true,
    read_status: "unread",
    last_action_at: new Date().toISOString()
  }).eq("id", thread.id);

  const sync = await syncBidRoomMessageToGoogleChat(supabase, thread, messageResult.data, event);
  return {
    ...sync,
    thread_id: cleanText(thread.id),
    message_id: cleanText(messageResult.data.id)
  };
}

async function bidSupportReply(supabase: ReturnType<typeof createClient>, input: Record<string, unknown>) {
  const question = cleanText(input.message || input.question);
  const language = supportLanguage(input);
  if (!question) {
    return { error: language === "es" ? "Escribe una pregunta primero." : "Write a question first.", status: 400 };
  }

  const token = cleanText(input.token);
  let event: Record<string, unknown> | null = null;
  let lane: Record<string, unknown> | null = null;
  let vendor: Record<string, unknown> | null = null;
  let liveBoard: Record<string, unknown> | null = null;
  let invitedLanes: Record<string, unknown>[] = [];
  if (token) {
    const privateContext = await loadPrivateSupportContext(supabase, token);
    event = privateContext.event;
    lane = privateContext.lane;
    vendor = privateContext.vendor;
    liveBoard = privateContext.live_board;
    invitedLanes = Array.isArray(privateContext.invited_lanes) ? privateContext.invited_lanes : [];
  } else {
    const publicLane = await loadPublicSupportLane(supabase, input);
    if (publicLane) {
      event = relationRecord(publicLane.rfx_events);
      lane = publicLane;
      invitedLanes = [publicLane];
    }
  }

  let support = bidSupportAnswerFromOpportunityContext(question, { language, token, event, lane, vendor, invited_lanes: invitedLanes, live_board: liveBoard });
  const aiSupport = await bidSupportAiAnswer(question, {
    language,
    token,
    event,
    lane,
    vendor,
    invited_lanes: invitedLanes,
    live_board: liveBoard,
    scope: cleanText(support.scope) || supportContextScope({ token, event: event || undefined, lane: lane || undefined, vendor: vendor || undefined, lane_count: invitedLanes.length }, language)
  }, support).catch(() => null);
  if (aiSupport) {
    const aiConfidence = ["low", "medium", "high"].includes(String(aiSupport.confidence))
      ? aiSupport.confidence as "low" | "medium" | "high"
      : "medium";
    support = supportResult({
      answer: cleanText(aiSupport.answer) || cleanText(support.answer),
      needs_ticket: cleanBoolean(support.needs_ticket) === true || aiSupport.needs_ticket === true,
      confidence: aiConfidence,
      scope: cleanText(aiSupport.scope) || cleanText(support.scope),
      language,
      token,
      question,
      event,
      lane,
      invited_lanes: invitedLanes,
      live_board: liveBoard,
      ai_assisted: true
    });
  }
  let ticket = null;
  if (cleanBoolean(input.create_ticket) === true) {
    ticket = await createBidSupportTicket(supabase, input, support, { event, lane, vendor });
  }
  const suggestedPrompts = Array.isArray(support.suggested_prompts) && support.suggested_prompts.length
    ? support.suggested_prompts
    : supportPromptOptions({ language, token, question, event, lane, invited_lanes: invitedLanes, needs_ticket: cleanBoolean(support.needs_ticket) === true });
  return {
    ...support,
    ticket,
    escalation_available: true,
    suggested_prompts: suggestedPrompts
  };
}

function bidRateStagingInput(
  invitation: Record<string, unknown>,
  updatedBid: Record<string, unknown>,
  revisionType: string,
  now: string
) {
  const event = relationRecord(invitation.rfx_events);
  const lane = relationRecord(invitation.rfx_lanes);
  const vendor = relationRecord(invitation.vendors);
  const economics = commercialRateEconomics(updatedBid);
  const vendorDomain = carrierDomain(vendor.domain) || carrierDomain(vendor.primary_email);
  const vendorReference = cleanText(vendor.vendor_name || vendor.domain || vendor.primary_email || invitation.vendor_id);
  const quoteDate = cleanDate(updatedBid.responded_at || now);
  const rfxId = cleanText(event.rfx_id) || "RFx";
  const laneNumber = cleanText(lane.lane_number || invitation.rfx_lane_id) || "lane";
  const carrierKey = vendorDomain || safeStorageSegment(vendorReference || invitation.vendor_id, "carrier");
  const routeKey = [cleanText(lane.origin), cleanText(lane.destination)].filter(Boolean).join(" -> ");
  const businessKey = [rfxId, routeKey, carrierKey].filter(Boolean).join(" | ");
  const sourceEvidence = {
    import_method: "rfx_bid_submission",
    revision_type: revisionType,
    rfx_event_id: event.id || invitation.rfx_event_id,
    rfx_lane_id: lane.id || invitation.rfx_lane_id,
    rfx_lane_vendor_id: invitation.id,
    vendor_id: invitation.vendor_id,
    responded_at: updatedBid.responded_at || now,
    valid_through: cleanDate(updatedBid.valid_through),
    current_unit_location: cleanText(updatedBid.current_unit_location),
    deadhead_distance: cleanNumber(updatedBid.deadhead_distance),
    deadhead_unit: cleanText(updatedBid.deadhead_unit)
  };
  const validThrough = cleanDate(updatedBid.valid_through);
  const deadheadDistance = cleanNumber(updatedBid.deadhead_distance);
  const deadheadUnit = deadheadDistance !== null ? cleanText(updatedBid.deadhead_unit) || "mi" : null;

  return {
    vendor_id: invitation.vendor_id || null,
    vendor_domain: vendorDomain,
    vendor_reference: vendorReference,
    rfx_id: rfxId,
    row_id: [rfxId, laneNumber, carrierKey].filter(Boolean).join("-"),
    rfx_key: rfxId,
    route_key: routeKey || null,
    business_key: businessKey || null,
    quote_date: quoteDate,
    origin: cleanText(lane.origin),
    normalized_origin: cleanText(lane.normalized_origin || lane.origin),
    origin_country: cleanText(lane.origin_country),
    origin_zip_prefix: cleanText(lane.origin_zip_prefix || lane.origin_zip || lane.origin_postal_code),
    origin_city: cleanText(lane.origin_city),
    origin_state: cleanText(lane.origin_state),
    origin_market: cleanText(lane.origin_market),
    origin_region: cleanText(lane.origin_region),
    destination: cleanText(lane.destination),
    normalized_destination: cleanText(lane.normalized_destination || lane.destination),
    destination_country: cleanText(lane.destination_country),
    destination_zip_prefix: cleanText(lane.destination_zip_prefix || lane.destination_zip || lane.destination_postal_code),
    destination_city: cleanText(lane.destination_city),
    destination_state: cleanText(lane.destination_state),
    destination_market: cleanText(lane.destination_market),
    destination_region: cleanText(lane.destination_region),
    equipment: cleanText(lane.equipment),
    normalized_equipment: cleanText(lane.normalized_equipment || lane.equipment),
    trailer: cleanText(lane.trailer),
    normalized_trailer: cleanText(lane.normalized_trailer || lane.trailer),
    config: cleanText(lane.config),
    normalized_config: cleanText(lane.normalized_config || lane.config),
    operation: cleanText(lane.operation),
    normalized_operation: cleanText(lane.normalized_operation || lane.operation),
    service: cleanText(lane.service),
    normalized_service: cleanText(lane.normalized_service || lane.service),
    all_in_rate: rateText(economics.carrier_rate ?? updatedBid.bid_rate),
    currency: cleanText(economics.currency || updatedBid.currency || lane.currency) || "USD",
    weekly_capacity: rateText(updatedBid.weekly_capacity),
    valid_through: validThrough,
    current_unit_location: cleanText(updatedBid.current_unit_location),
    deadhead_distance: deadheadDistance,
    deadhead_unit: deadheadUnit,
    notes: [
      cleanText(updatedBid.notes),
      validThrough ? `Valid through: ${validThrough}` : null,
      cleanText(updatedBid.current_unit_location) ? `Current unit location: ${cleanText(updatedBid.current_unit_location)}` : null,
      deadheadDistance !== null ? `Deadhead: ${deadheadDistance} ${deadheadUnit || "mi"}` : null,
      `Source: RFx carrier bid ${revisionType}`,
      `Carrier cost: ${economics.carrier_rate ?? "-"} ${economics.currency || updatedBid.currency || lane.currency || "USD"}`,
      economics.board_rate !== null ? `Board rate: ${economics.board_rate} ${economics.currency || updatedBid.currency || lane.currency || "USD"}` : null,
      normalizeCommercialModel(updatedBid.commercial_model) ? `Commercial model: ${normalizeCommercialModel(updatedBid.commercial_model)}` : null,
      cleanNumber(updatedBid.marksman_margin_pct) !== null ? `Suggested margin: ${cleanNumber(updatedBid.marksman_margin_pct)}%` : null,
      cleanNumber(updatedBid.carrier_share_pct) !== null ? `Carrier invoice share: ${cleanNumber(updatedBid.carrier_share_pct)}%` : null,
      cleanBoolean(updatedBid.best_alternative_offered) ? `Best alternative: ${[cleanText(updatedBid.alternative_equipment), rateText(updatedBid.alternative_units) ? `${rateText(updatedBid.alternative_units)} unit(s)` : null, cleanText(updatedBid.alternative_notes)].filter(Boolean).join(" / ")}` : null,
      cleanBoolean(updatedBid.equipment_available) !== null ? `Equipment available: ${cleanBoolean(updatedBid.equipment_available) ? "yes" : "no"}` : null,
      cleanText(updatedBid.unit_details) ? `Unit details: ${cleanText(updatedBid.unit_details)}` : null,
      cleanText(updatedBid.eta_pickup) ? `ETA pickup: ${cleanText(updatedBid.eta_pickup)}` : null,
      cleanText(updatedBid.eta_delivery) ? `ETA delivery: ${cleanText(updatedBid.eta_delivery)}` : null
    ].filter(Boolean).join(" | "),
    carrier_cost_rate: economics.carrier_rate,
    customer_board_rate: economics.board_rate,
    commercial_model: economics.commercial_model,
    commission_fee: economics.commission_fee,
    commission_pct: economics.commission_pct,
    markup_fee: economics.markup_fee,
    markup_pct: economics.markup_pct,
    rate_basis: economics.rate_basis,
    source_bid_status: revisionType,
    confidence: 1,
    extraction_warnings: [],
    audit_flags: [],
    field_confidence: {
      import_method: "rfx_bid_submission",
      all_fields: 1,
      carrier_cost_rate: 1,
      customer_board_rate: 1,
      commercial_model: 1,
      valid_through: validThrough ? 1 : 0,
      deadhead_distance: deadheadDistance !== null ? 1 : 0
    },
    source_evidence: sourceEvidence,
    extracted_payload: {
      import_method: "rfx_bid_submission",
      revision_type: revisionType,
      rfx_event: {
        id: event.id || invitation.rfx_event_id,
        rfx_id: event.rfx_id || null,
        name: event.name || null,
        customer: event.customer || null
      },
      lane,
      vendor: {
        id: invitation.vendor_id || null,
        vendor_name: vendor.vendor_name || null,
        domain: vendor.domain || null,
        primary_email: vendor.primary_email || null
      },
      bid: {
        id: updatedBid.id || invitation.id,
        bid_rate: updatedBid.bid_rate,
        currency: updatedBid.currency,
        weekly_capacity: updatedBid.weekly_capacity,
        transit_days: updatedBid.transit_days,
        valid_through: validThrough,
        current_unit_location: cleanText(updatedBid.current_unit_location),
        deadhead_distance: deadheadDistance,
        deadhead_unit: deadheadUnit,
        notes: updatedBid.notes,
        commercial_model: updatedBid.commercial_model,
        marksman_margin_pct: updatedBid.marksman_margin_pct,
        carrier_share_pct: updatedBid.carrier_share_pct,
        best_alternative_offered: updatedBid.best_alternative_offered,
        alternative_equipment: updatedBid.alternative_equipment,
        alternative_units: updatedBid.alternative_units,
        alternative_notes: updatedBid.alternative_notes,
        equipment_available: updatedBid.equipment_available,
        unit_details: updatedBid.unit_details,
        eta_pickup: updatedBid.eta_pickup,
        eta_delivery: updatedBid.eta_delivery,
        responded_at: updatedBid.responded_at || now
      },
      economics
    }
  };
}

async function ensureBidRateStagingRow(
  supabase: ReturnType<typeof createClient>,
  invitation: Record<string, unknown>,
  updatedBid: Record<string, unknown>,
  revisionType: string,
  now: string
) {
  const event = relationRecord(invitation.rfx_events);
  if (!event.id) return { status: "skipped", reason: "missing_rfx_event" };
  const row = bidRateStagingInput(invitation, updatedBid, revisionType, now);
  const existingStagingId = cleanText(invitation.bid_rate_staging_id);
  let targetStagingId: string | null = null;

  if (existingStagingId) {
    const existing = await supabase
      .from("rate_staging")
      .select("id,status")
      .eq("id", existingStagingId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.status === "pending_review") targetStagingId = existing.data.id;
  }

  if (targetStagingId) {
    const update = await supabase
      .from("rate_staging")
      .update({
        ...row,
        status: "pending_review",
        updated_at: now
      })
      .eq("id", targetStagingId)
      .select("id,status,row_id")
      .single();
    if (update.error) throw update.error;

    const link = await supabase
      .from("rfx_lane_vendors")
      .update({ bid_rate_staging_id: update.data.id, bid_rate_staged_at: now, updated_at: now })
      .eq("id", invitation.id);
    if (link.error) throw link.error;
    return { status: "updated", id: update.data.id, row: update.data };
  }

  const storageStamp = now.replace(/[^0-9T]/g, "").slice(0, 15);
  const storageKey = `${storageStamp}-${safeStorageSegment(event.rfx_id || event.id)}-${safeStorageSegment(invitation.id)}-${crypto.randomUUID().slice(0, 8)}`;
  const rawUpload = await supabase
    .from("raw_uploads")
    .insert({
      original_filename: `${cleanText(event.rfx_id) || "rfx"}-carrier-bid-${safeStorageSegment(invitation.id)}.json`,
      storage_bucket: "rfx-bids",
      storage_path: `rfx-bids/${event.id}/${storageKey}.json`,
      mime_type: "application/json",
      file_size_bytes: 0,
      document_type: "email",
      vendor_id: invitation.vendor_id || null,
      vendor_hint: row.vendor_domain || row.vendor_reference || null,
      rfx_hint: event.rfx_id || null,
      status: "staged",
      staging_target: "rate_staging",
      interpreted_at: now,
      interpreted_rate_rows: 1,
      expected_rate_rows: 1,
      audit_status: "ok",
      audit_warnings: [],
      interpretation_audit: {
        status: "ok",
        import_method: "rfx_bid_submission",
        revision_type: revisionType,
        rfx_event_id: event.id,
        rfx_id: event.rfx_id || null,
        rfx_lane_id: invitation.rfx_lane_id || null,
        rfx_lane_vendor_id: invitation.id,
        target_status: "pending_review"
      }
    })
    .select("id")
    .single();
  if (rawUpload.error) throw rawUpload.error;

  const job = await supabase
    .from("interpretation_jobs")
    .insert({
      raw_upload_id: rawUpload.data.id,
      status: "completed",
      completed_at: now,
      model: "rfx-bid-capture",
      extracted_rows: 1,
      error_message: null
    })
    .select("id")
    .single();
  if (job.error) throw job.error;

  const insert = await supabase
    .from("rate_staging")
    .insert({
      ...row,
      raw_upload_id: rawUpload.data.id,
      interpretation_job_id: job.data.id,
      status: "pending_review"
    })
    .select("id,status,row_id")
    .single();
  if (insert.error) throw insert.error;

  const link = await supabase
    .from("rfx_lane_vendors")
    .update({ bid_rate_staging_id: insert.data.id, bid_rate_staged_at: now, updated_at: now })
    .eq("id", invitation.id);
  if (link.error) throw link.error;

  return {
    status: "created",
    id: insert.data.id,
    row: insert.data,
    raw_upload_id: rawUpload.data.id,
    job_id: job.data.id
  };
}

async function hashCustomerRfiToken(token: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function rfiArrayRecords(value: unknown, limit = 1000) {
  return Array.isArray(value)
    ? value.slice(0, limit).filter((row) => row && typeof row === "object").map((row) => row as Record<string, unknown>)
    : [];
}

function normalizeRfiSegment(value: unknown) {
  const text = cleanText(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  return text && ["expedited", "time_critical", "crossborder", "local", "regional", "national"].includes(text) ? text : null;
}

function normalizeRfiOperation(value: unknown) {
  const text = cleanText(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    intra_mex: "mx_domestic",
    mx: "mx_domestic",
    mexico: "mx_domestic",
    usa: "us_domestic",
    us: "us_domestic",
    cross_border: "crossborder"
  };
  const normalized = text ? aliases[text] || text : null;
  return normalized && ["mx_domestic", "us_domestic", "crossborder", "local", "regional", "national"].includes(normalized) ? normalized : null;
}

function normalizeRfiService(value: unknown) {
  const text = cleanText(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  return text && ["standard", "expedited", "time_critical", "dedicated", "spot", "recurring"].includes(text) ? text : null;
}

function rfiLaneIssues(row: Record<string, unknown>) {
  const issues: string[] = [];
  if (!cleanText(row.origin_text || row.origin || row.origin_key)) issues.push("origin_missing");
  if (!cleanText(row.destination_text || row.destination || row.destination_key)) issues.push("destination_missing");
  if (!cleanText(row.equipment_type || row.equipment)) issues.push("equipment_missing");
  if (cleanNumber(row.weekly_volume) === null && cleanNumber(row.monthly_volume) === null) issues.push("volume_missing");
  return issues;
}

function normalizeCustomerRfiPayload(input: Record<string, unknown>) {
  const source = objectRecord(input.rfi || input.response || input);
  const origins = rfiArrayRecords(source.origins, 500);
  const destinations = rfiArrayRecords(source.destinations, 500);
  const lanes = rfiArrayRecords(source.lanes, 1000);
  const issues = lanes.flatMap((lane) => rfiLaneIssues(lane));
  const required = Math.max(lanes.length * 4, 1);
  return {
    source,
    origins,
    destinations,
    lanes,
    issues,
    completeness_score: Math.max(0, Math.round((required - issues.length) / required * 100)),
    submission: {
      account_overview: objectRecord(source.account_overview || source.accountOverview),
      operating_segments: rfiArrayRecords(source.operating_segments || source.operatingSegments, 20).map((row) => cleanText(row.value || row.segment)).filter(Boolean),
      logistics_models: objectRecord(source.logistics_models || source.logisticsModels),
      operational_criteria: objectRecord(source.operational_criteria || source.operationalCriteria),
      business_rules: objectRecord(source.business_rules || source.businessRules),
      service_requirements: objectRecord(source.service_requirements || source.serviceRequirements),
      carrier_requirements: objectRecord(source.carrier_requirements || source.carrierRequirements),
      crossborder_details: objectRecord(source.crossborder_details || source.crossborderDetails),
      notes_exceptions: objectRecord(source.notes_exceptions || source.notesExceptions),
      attachments: Array.isArray(source.attachments) ? source.attachments : [],
      response: source
    }
  };
}

function normalizeRfiOrigin(row: Record<string, unknown>, owner: Record<string, unknown>, projectId: string, submissionId: string) {
  return {
    owner_user_id: owner.owner_user_id || null,
    owner_email: cleanEmail(owner.owner_email) || cleanText(owner.owner_email),
    project_id: projectId,
    submission_id: submissionId,
    origin_key: cleanText(row.origin_key || row.key || row.id),
    name: cleanText(row.name || row.origin || row.location),
    address: cleanText(row.address),
    city: cleanText(row.city),
    state: cleanText(row.state || row.st),
    country: cleanText(row.country),
    postal_code: cleanText(row.postal_code || row.zip || row.zip_code),
    contact_name: cleanText(row.contact_name || row.contact),
    contact_phone: cleanText(row.contact_phone || row.phone),
    contact_email: cleanEmail(row.contact_email || row.email),
    loading_hours: cleanText(row.loading_hours || row.hours),
    appointment_required: cleanBoolean(row.appointment_required),
    loading_type: cleanText(row.loading_type),
    average_loading_time_hours: cleanNumber(row.average_loading_time_hours),
    site_restrictions: cleanText(row.site_restrictions),
    notes: cleanText(row.notes)
  };
}

function normalizeRfiDestination(row: Record<string, unknown>, owner: Record<string, unknown>, projectId: string, submissionId: string) {
  return {
    owner_user_id: owner.owner_user_id || null,
    owner_email: cleanEmail(owner.owner_email) || cleanText(owner.owner_email),
    project_id: projectId,
    submission_id: submissionId,
    destination_key: cleanText(row.destination_key || row.key || row.id),
    name: cleanText(row.name || row.destination || row.location),
    address: cleanText(row.address),
    city: cleanText(row.city),
    state: cleanText(row.state || row.st),
    country: cleanText(row.country),
    postal_code: cleanText(row.postal_code || row.zip || row.zip_code),
    contact_name: cleanText(row.contact_name || row.contact),
    contact_phone: cleanText(row.contact_phone || row.phone),
    contact_email: cleanEmail(row.contact_email || row.email),
    receiving_hours: cleanText(row.receiving_hours || row.hours),
    appointment_required: cleanBoolean(row.appointment_required),
    unloading_type: cleanText(row.unloading_type),
    average_unloading_time_hours: cleanNumber(row.average_unloading_time_hours),
    late_delivery_penalties: cleanText(row.late_delivery_penalties),
    site_restrictions: cleanText(row.site_restrictions),
    notes: cleanText(row.notes)
  };
}

function normalizeRfiLane(
  row: Record<string, unknown>,
  owner: Record<string, unknown>,
  projectId: string,
  submissionId: string,
  originIds: Map<string, string>,
  destinationIds: Map<string, string>,
  index: number
) {
  const originKey = cleanText(row.origin_key || row.origin_id);
  const destinationKey = cleanText(row.destination_key || row.destination_id);
  const issues = rfiLaneIssues(row).map((issue) => ({ issue }));
  return {
    owner_user_id: owner.owner_user_id || null,
    owner_email: cleanEmail(owner.owner_email) || cleanText(owner.owner_email),
    project_id: projectId,
    submission_id: submissionId,
    lane_id: cleanText(row.lane_id || row.id) || `L${index + 1}`,
    origin_id: originKey ? originIds.get(originKey) || null : null,
    destination_id: destinationKey ? destinationIds.get(destinationKey) || null : null,
    origin_text: cleanText(row.origin_text || row.origin),
    destination_text: cleanText(row.destination_text || row.destination),
    operating_segment: normalizeRfiSegment(row.operating_segment || row.segment),
    operation_type: normalizeRfiOperation(row.operation_type || row.operation),
    service_type: normalizeRfiService(row.service_type || row.service),
    equipment_type: cleanText(row.equipment_type || row.equipment),
    trailer_requirements: cleanText(row.trailer_requirements || row.trailer),
    commodity: cleanText(row.commodity),
    hazmat: cleanBoolean(row.hazmat) === true,
    cargo_value: cleanNumber(row.cargo_value),
    cargo_value_currency: cleanText(row.cargo_value_currency),
    weight: cleanNumber(row.weight),
    pallets: cleanNumber(row.pallets),
    dimensions: cleanText(row.dimensions),
    weekly_volume: cleanNumber(row.weekly_volume),
    monthly_volume: cleanNumber(row.monthly_volume),
    frequency: cleanText(row.frequency),
    pickup_lead_time_hours: cleanNumber(row.pickup_lead_time_hours),
    expected_transit_time_hours: cleanNumber(row.expected_transit_time_hours),
    target_rate: cleanNumber(row.target_rate),
    current_rate: cleanNumber(row.current_rate),
    currency: cleanText(row.currency),
    seasonality_notes: cleanText(row.seasonality_notes),
    special_requirements: cleanText(row.special_requirements),
    notes: cleanText(row.notes),
    validation_issues: issues,
    completeness_score: Math.max(0, Math.round((4 - issues.length) / 4 * 100))
  };
}

function rfiSectionRecords(value: unknown, limit = 50) {
  const arrayRows = rfiArrayRecords(value, limit);
  if (arrayRows.length) return arrayRows.filter((row) => rfiSectionHasContent(row));
  const record = objectRecord(value);
  return rfiSectionHasContent(record) ? [record] : [];
}

function rfiSectionHasContent(row: Record<string, unknown>) {
  return Object.values(row).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
    if (typeof value === "boolean") return value === true;
    return Boolean(cleanText(value));
  });
}

function cleanJsonList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => cleanText(item)).filter(Boolean);
  const text = cleanText(value);
  return text ? text.split(/[\n;,]+/).map((item) => item.trim()).filter(Boolean) : [];
}

function rfiOwnerFields(owner: Record<string, unknown>, projectId: string, submissionId: string) {
  return {
    owner_user_id: owner.owner_user_id || null,
    owner_email: cleanEmail(owner.owner_email) || cleanText(owner.owner_email),
    project_id: projectId,
    submission_id: submissionId
  };
}

function normalizeRfiBusinessRule(row: Record<string, unknown>, owner: Record<string, unknown>, projectId: string, submissionId: string) {
  return {
    ...rfiOwnerFields(owner, projectId, submissionId),
    payment_terms: cleanText(row.payment_terms),
    rate_currency: cleanText(row.rate_currency || row.currency),
    fuel_surcharge_policy: cleanText(row.fuel_surcharge_policy || row.fsc_policy),
    detention_loading_free_time_hours: cleanNumber(row.detention_loading_free_time_hours),
    detention_loading_rate: cleanNumber(row.detention_loading_rate),
    detention_unloading_free_time_hours: cleanNumber(row.detention_unloading_free_time_hours),
    detention_unloading_rate: cleanNumber(row.detention_unloading_rate),
    layover_policy: cleanText(row.layover_policy),
    tonu_policy: cleanText(row.tonu_policy),
    cancellation_policy: cleanText(row.cancellation_policy),
    redelivery_policy: cleanText(row.redelivery_policy),
    border_wait_policy: cleanText(row.border_wait_policy),
    claims_process: cleanText(row.claims_process),
    insurance_requirements: cleanText(row.insurance_requirements),
    penalties: cleanText(row.penalties),
    accessorial_approval_required: cleanBoolean(row.accessorial_approval_required),
    notes: cleanText(row.notes),
    raw_payload: row
  };
}

function normalizeRfiServiceRequirement(row: Record<string, unknown>, owner: Record<string, unknown>, projectId: string, submissionId: string) {
  return {
    ...rfiOwnerFields(owner, projectId, submissionId),
    gps_tracking_required: cleanBoolean(row.gps_tracking_required),
    tracking_frequency: cleanText(row.tracking_frequency),
    check_calls_required: cleanBoolean(row.check_calls_required),
    pod_required: cleanBoolean(row.pod_required),
    pod_submission_time_hours: cleanNumber(row.pod_submission_time_hours),
    bol_required: cleanBoolean(row.bol_required),
    appointment_management_owner: cleanText(row.appointment_management_owner),
    support_24_7_required: cleanBoolean(row.support_24_7_required || row["24_7_support_required"]),
    escalation_sla: cleanText(row.escalation_sla),
    reporting_requirements: cleanText(row.reporting_requirements),
    communication_channels: cleanJsonList(row.communication_channels),
    notes: cleanText(row.notes),
    raw_payload: row
  };
}

function normalizeRfiCarrierRequirement(row: Record<string, unknown>, owner: Record<string, unknown>, projectId: string, submissionId: string) {
  return {
    ...rfiOwnerFields(owner, projectId, submissionId),
    allowed_carrier_types: cleanJsonList(row.allowed_carrier_types),
    mc_dot_required: cleanBoolean(row.mc_dot_required),
    mx_authority_required: cleanBoolean(row.mx_authority_required),
    crossborder_experience_required: cleanBoolean(row.crossborder_experience_required),
    minimum_years_experience: cleanNumber(row.minimum_years_experience),
    minimum_fleet_size: cleanNumber(row.minimum_fleet_size),
    fleet_ownership_preference: cleanText(row.fleet_ownership_preference),
    cargo_insurance_minimum: cleanNumber(row.cargo_insurance_minimum),
    liability_insurance_minimum: cleanNumber(row.liability_insurance_minimum),
    gps_required: cleanBoolean(row.gps_required),
    certifications_required: cleanJsonList(row.certifications_required),
    hazmat_certification_required: cleanBoolean(row.hazmat_certification_required),
    customer_preapproval_required: cleanBoolean(row.customer_preapproval_required),
    preferred_carriers: cleanJsonList(row.preferred_carriers),
    blocked_carriers: cleanJsonList(row.blocked_carriers),
    notes: cleanText(row.notes),
    raw_payload: row
  };
}

function normalizeRfiCrossborderDirection(value: unknown) {
  const text = cleanText(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  if (["mx_to_us", "mexico_to_us", "northbound", "export"].includes(text || "")) return "mx_to_us";
  if (["us_to_mx", "us_to_mexico", "southbound", "import"].includes(text || "")) return "us_to_mx";
  return null;
}

function normalizeRfiCrossingModel(value: unknown) {
  const text = cleanText(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  return text && ["direct", "transfer", "swap", "drayage", "b1"].includes(text) ? text : null;
}

function normalizeRfiCrossborderDetail(
  row: Record<string, unknown>,
  owner: Record<string, unknown>,
  projectId: string,
  submissionId: string,
  laneIds: Map<string, string>
) {
  const laneKey = cleanText(row.lane_id || row.lane_key);
  return {
    ...rfiOwnerFields(owner, projectId, submissionId),
    rfi_lane_id: laneKey ? laneIds.get(laneKey) || null : null,
    lane_id: laneKey,
    direction: normalizeRfiCrossborderDirection(row.direction),
    border_crossing: cleanText(row.border_crossing || row.mx_crossing || row.us_crossing),
    mx_customs_broker: cleanText(row.mx_customs_broker),
    us_customs_broker: cleanText(row.us_customs_broker),
    crossing_model: normalizeRfiCrossingModel(row.crossing_model),
    carta_porte_required: cleanBoolean(row.carta_porte_required),
    pedimento_required: cleanBoolean(row.pedimento_required),
    documents_required: cleanJsonList(row.documents_required),
    expected_border_time_hours: cleanNumber(row.expected_border_time_hours),
    broker_coordination_owner: cleanText(row.broker_coordination_owner),
    notes: cleanText(row.notes),
    raw_payload: row
  };
}

function normalizeRfiAttachment(row: Record<string, unknown>, owner: Record<string, unknown>, projectId: string, submissionId: string) {
  return {
    ...rfiOwnerFields(owner, projectId, submissionId),
    name: cleanText(row.name),
    url: cleanText(row.url),
    reference: cleanText(row.reference || row.file || row.path),
    attachment_type: cleanText(row.attachment_type || row.type),
    notes: cleanText(row.notes),
    raw_payload: row
  };
}

function normalizeRfiExceptionNote(row: Record<string, unknown>, owner: Record<string, unknown>, projectId: string, submissionId: string) {
  const severity = cleanText(row.severity)?.toLowerCase();
  return {
    ...rfiOwnerFields(owner, projectId, submissionId),
    section: cleanText(row.section),
    note_type: cleanText(row.note_type || row.type),
    severity: severity && ["info", "warning", "critical"].includes(severity) ? severity : null,
    note: cleanText(row.note || row.notes),
    raw_payload: row
  };
}

async function currentCustomerRfiContext(supabase: ReturnType<typeof createClient>, token: unknown) {
  const rawToken = cleanText(token);
  if (!rawToken) throw new Error("Customer RFI token is required.");
  const tokenHash = await hashCustomerRfiToken(rawToken);
  const result = await supabase
    .from("rfx_rfi_magic_links")
    .select("*, rfx_projects!inner(*)")
    .eq("token_hash", tokenHash)
    .single();
  if (result.error) throw result.error;
  const link = result.data as Record<string, unknown>;
  const project = relationRecord(link.rfx_projects);
  if (cleanText(link.status) !== "active" || link.revoked_at) throw new Error("Customer RFI link is not active.");
  const expiresAt = cleanText(link.expires_at);
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    await supabase.from("rfx_rfi_magic_links").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", link.id);
    throw new Error("Customer RFI link has expired.");
  }
  return { link, project };
}

async function getCustomerRfi(supabase: ReturnType<typeof createClient>, token: unknown) {
  const context = await currentCustomerRfiContext(supabase, token);
  await supabase.from("rfx_rfi_magic_links").update({ last_viewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", context.link.id);
  const [submission, origins, destinations, lanes] = await Promise.all([
    supabase.from("rfx_rfi_submissions").select("*").eq("project_id", context.project.id).maybeSingle(),
    supabase.from("rfx_rfi_origins").select("*").eq("project_id", context.project.id).order("created_at", { ascending: true }),
    supabase.from("rfx_rfi_destinations").select("*").eq("project_id", context.project.id).order("created_at", { ascending: true }),
    supabase.from("rfx_rfi_lanes").select("*").eq("project_id", context.project.id).order("created_at", { ascending: true })
  ]);
  for (const result of [submission, origins, destinations, lanes]) {
    if (result.error) throw result.error;
  }
  return {
    project: {
      id: context.project.id,
      title: context.project.title,
      customer_name: context.project.customer_name,
      customer_contact_name: context.project.customer_contact_name,
      opportunity_type: context.project.opportunity_type,
      operating_segments: context.project.operating_segments,
      due_date: context.project.due_date,
      status: context.project.status
    },
    link: {
      id: context.link.id,
      status: context.link.status,
      expires_at: context.link.expires_at,
      submitted_at: context.link.submitted_at
    },
    submission: submission.data || null,
    origins: origins.data || [],
    destinations: destinations.data || [],
    lanes: lanes.data || []
  };
}

async function saveCustomerRfi(supabase: ReturnType<typeof createClient>, input: Record<string, unknown>, submitting = false) {
  const context = await currentCustomerRfiContext(supabase, input.token);
  const projectId = cleanText(context.project.id) || "";
  const owner = { owner_user_id: context.project.owner_user_id || null, owner_email: context.project.owner_email || null };
  const existing = await supabase.from("rfx_rfi_submissions").select("*").eq("project_id", projectId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.status === "submitted") throw new Error("This Customer RFI has already been submitted. Ask procurement to reopen it before editing.");

  const normalized = normalizeCustomerRfiPayload(input);
  if (submitting && !normalized.lanes.length) throw new Error("Add at least one lane before submitting the Customer RFI.");
  if (submitting && normalized.issues.length) throw new Error("Resolve required lane fields before submitting the Customer RFI.");
  const now = new Date().toISOString();
  const submissionRow = {
    owner_user_id: owner.owner_user_id,
    owner_email: owner.owner_email,
    project_id: projectId,
    magic_link_id: context.link.id,
    status: submitting ? "submitted" : "draft",
    ...normalized.submission,
    frozen_snapshot: submitting ? normalized.source : objectRecord(existing.data?.frozen_snapshot),
    completeness_score: normalized.completeness_score,
    submitted_at: submitting ? now : existing.data?.submitted_at || null,
    updated_at: now
  };
  const submissionResult = existing.data?.id
    ? await supabase.from("rfx_rfi_submissions").update(submissionRow).eq("id", existing.data.id).select().single()
    : await supabase.from("rfx_rfi_submissions").insert(submissionRow).select().single();
  if (submissionResult.error) throw submissionResult.error;
  const submissionId = submissionResult.data.id;

  const deletes = await Promise.all([
    supabase.from("rfx_rfi_crossborder_details").delete().eq("submission_id", submissionId),
    supabase.from("rfx_rfi_attachments").delete().eq("submission_id", submissionId),
    supabase.from("rfx_rfi_exception_notes").delete().eq("submission_id", submissionId),
    supabase.from("rfx_rfi_business_rules").delete().eq("submission_id", submissionId),
    supabase.from("rfx_rfi_service_requirements").delete().eq("submission_id", submissionId),
    supabase.from("rfx_rfi_carrier_requirements").delete().eq("submission_id", submissionId),
    supabase.from("rfx_rfi_lanes").delete().eq("submission_id", submissionId),
    supabase.from("rfx_rfi_origins").delete().eq("submission_id", submissionId),
    supabase.from("rfx_rfi_destinations").delete().eq("submission_id", submissionId)
  ]);
  for (const result of deletes) {
    if (result.error) throw result.error;
  }

  const originRows = normalized.origins.map((row) => normalizeRfiOrigin(row, owner, projectId, submissionId));
  const destinationRows = normalized.destinations.map((row) => normalizeRfiDestination(row, owner, projectId, submissionId));
  const originInsert = originRows.length
    ? await supabase.from("rfx_rfi_origins").insert(originRows).select("id,origin_key")
    : { data: [], error: null };
  if (originInsert.error) throw originInsert.error;
  const destinationInsert = destinationRows.length
    ? await supabase.from("rfx_rfi_destinations").insert(destinationRows).select("id,destination_key")
    : { data: [], error: null };
  if (destinationInsert.error) throw destinationInsert.error;
  const originIds = new Map((originInsert.data || []).map((row) => [cleanText(row.origin_key) || cleanText(row.id) || "", row.id]));
  const destinationIds = new Map((destinationInsert.data || []).map((row) => [cleanText(row.destination_key) || cleanText(row.id) || "", row.id]));
  const laneRows = normalized.lanes.map((row, index) => normalizeRfiLane(row, owner, projectId, submissionId, originIds, destinationIds, index));
  const laneInsert = laneRows.length
    ? await supabase.from("rfx_rfi_lanes").insert(laneRows).select("id,lane_id")
    : { data: [], error: null };
  if (laneInsert.error) throw laneInsert.error;
  const laneIds = new Map((laneInsert.data || []).map((row) => [cleanText(row.lane_id) || cleanText(row.id) || "", row.id]));

  const businessRuleRows = rfiSectionRecords(normalized.submission.business_rules)
    .map((row) => normalizeRfiBusinessRule(row, owner, projectId, submissionId));
  const serviceRequirementRows = rfiSectionRecords(normalized.submission.service_requirements)
    .map((row) => normalizeRfiServiceRequirement(row, owner, projectId, submissionId));
  const carrierRequirementRows = rfiSectionRecords(normalized.submission.carrier_requirements)
    .map((row) => normalizeRfiCarrierRequirement(row, owner, projectId, submissionId));
  const crossborderRows = rfiSectionRecords(normalized.submission.crossborder_details, 1000)
    .map((row) => normalizeRfiCrossborderDetail(row, owner, projectId, submissionId, laneIds));
  const attachmentRows = rfiArrayRecords(normalized.submission.attachments, 1000)
    .map((row) => normalizeRfiAttachment(row, owner, projectId, submissionId));
  const exceptionRows = rfiSectionRecords(normalized.submission.notes_exceptions, 500)
    .map((row) => normalizeRfiExceptionNote(row, owner, projectId, submissionId));
  const structuredInserts = await Promise.all([
    businessRuleRows.length ? supabase.from("rfx_rfi_business_rules").insert(businessRuleRows).select("id") : { data: [], error: null },
    serviceRequirementRows.length ? supabase.from("rfx_rfi_service_requirements").insert(serviceRequirementRows).select("id") : { data: [], error: null },
    carrierRequirementRows.length ? supabase.from("rfx_rfi_carrier_requirements").insert(carrierRequirementRows).select("id") : { data: [], error: null },
    crossborderRows.length ? supabase.from("rfx_rfi_crossborder_details").insert(crossborderRows).select("id") : { data: [], error: null },
    attachmentRows.length ? supabase.from("rfx_rfi_attachments").insert(attachmentRows).select("id") : { data: [], error: null },
    exceptionRows.length ? supabase.from("rfx_rfi_exception_notes").insert(exceptionRows).select("id") : { data: [], error: null }
  ]);
  for (const result of structuredInserts) {
    if (result.error) throw result.error;
  }

  const sideEffects = await Promise.all([
    supabase.from("rfx_projects").update({ status: submitting ? "rfi_submitted" : "rfi_in_progress", updated_at: now }).eq("id", projectId),
    submitting
      ? supabase.from("rfx_rfi_magic_links").update({ submitted_at: now, updated_at: now }).eq("id", context.link.id)
      : supabase.from("rfx_rfi_magic_links").update({ updated_at: now }).eq("id", context.link.id),
    supabase.from("rfx_process_audit").insert({
      owner_user_id: owner.owner_user_id,
      owner_email: owner.owner_email,
      project_id: projectId,
      actor_email: cleanEmail(context.project.customer_contact_email),
      action: submitting ? "customer_rfi_submitted" : "customer_rfi_saved",
      entity_type: "rfx_rfi_submissions",
      entity_id: submissionId,
      summary: submitting ? "Customer submitted RFI" : "Customer saved RFI draft",
      metadata: {
        lanes: laneRows.length,
        origins: originRows.length,
        destinations: destinationRows.length,
        business_rules: businessRuleRows.length,
        service_requirements: serviceRequirementRows.length,
        carrier_requirements: carrierRequirementRows.length,
        crossborder_details: crossborderRows.length,
        attachments: attachmentRows.length,
        exception_notes: exceptionRows.length,
        completeness_score: normalized.completeness_score
      }
    })
  ]);
  for (const result of sideEffects) {
    if (result.error) throw result.error;
  }

  return {
    saved: true,
    submitted: submitting,
    row: submissionResult.data,
    origins: originRows.length,
    destinations: destinationRows.length,
    lanes: laneRows.length,
    business_rules: businessRuleRows.length,
    service_requirements: serviceRequirementRows.length,
    carrier_requirements: carrierRequirementRows.length,
    crossborder_details: crossborderRows.length,
    attachments: attachmentRows.length,
    exception_notes: exceptionRows.length,
    validation_issues: normalized.issues,
    completeness_score: normalized.completeness_score
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const supabase = getClient();
    const body = await request.json().catch(() => ({}));
    if (body.action === "bid_support_reply") {
      const result = await bidSupportReply(supabase, body);
      if (result.status) {
        const { status, ...payload } = result;
        return jsonResponse(payload, status as number);
      }
      return jsonResponse(result);
    }
    if (body.action === "public_bid_room_board") {
      return jsonResponse(await publicBidRoomBoard(supabase, body));
    }
    if (body.action === "public_bid_room_request_invite") {
      const result = await publicBidRoomInviteRequest(supabase, body);
      if (result.status) {
        const { status, ...payload } = result;
        return jsonResponse(payload, status as number);
      }
      return jsonResponse(result);
    }
    if (body.action === "public_bid_room_find_invitations") {
      const result = await publicBidRoomFindInvitations(supabase, body);
      if (result.status) {
        const { status, ...payload } = result;
        return jsonResponse(payload, status as number);
      }
      return jsonResponse(result);
    }

    if (body.action === "get_customer_rfi") {
      return jsonResponse(await getCustomerRfi(supabase, body.token));
    }

    if (body.action === "save_customer_rfi") {
      return jsonResponse(await saveCustomerRfi(supabase, body, false));
    }

    if (body.action === "submit_customer_rfi") {
      return jsonResponse(await saveCustomerRfi(supabase, body, true));
    }

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
          bid_rate_staging_id,
          currency,
          weekly_capacity,
          transit_days,
          valid_through,
          notes,
          commercial_model,
          marksman_margin_pct,
          carrier_share_pct,
          best_alternative_offered,
          alternative_equipment,
          alternative_units,
          alternative_notes,
          equipment_available,
          current_unit_location,
          deadhead_distance,
          deadhead_unit,
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
          rfx_events(id,owner_user_id,owner_email,rfx_id,name,customer,event_type,status,due_date,bid_visibility_mode,notes,source_rfx_process_project_id,source_rfx_package_id,source_rfx_package_name,rfx_master_package),
      rfx_lanes(*)
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
        .select("id,bid_rate,currency,weekly_capacity,transit_days,valid_through,commercial_model,marksman_margin_pct,carrier_share_pct,best_alternative_offered,alternative_equipment,alternative_units,equipment_available,current_unit_location,deadhead_distance,deadhead_unit,eta_pickup,eta_delivery,responded_at,updated_at,vendors(vendor_name,domain)")
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
              valid_through,
              notes,
              commercial_model,
              marksman_margin_pct,
              carrier_share_pct,
              best_alternative_offered,
              alternative_equipment,
              alternative_units,
              alternative_notes,
              equipment_available,
              current_unit_location,
              deadhead_distance,
              deadhead_unit,
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
              rfx_events!inner(id,owner_email,rfx_id,name,customer,event_type,status,due_date,bid_visibility_mode,source_rfx_process_project_id,source_rfx_package_id,source_rfx_package_name,rfx_master_package),
              rfx_lanes(*)
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
              logistics_model,
              operation_criteria,
              business_rules,
              service_specifications,
              other_notes,
              notes,
              rfx_events!inner(id,owner_email,rfx_id,name,customer,event_type,status,due_date,bid_visibility_mode,source_rfx_process_project_id,source_rfx_package_id,source_rfx_package_name,rfx_master_package)
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
      const invitationIdsForEvent = [
        cleanText(result.data.id),
        ...(invitedResult.data || [])
          .filter((row) => cleanText(row.rfx_event_id) === cleanText(result.data.rfx_event_id))
          .map((row) => cleanText(row.id))
      ].filter(Boolean);
      const segmentConfirmations = await listSegmentConfirmations(supabase, invitationIdsForEvent);

      return jsonResponse({
        invitation: result.data,
        live_board: liveBoardFromRows(result.data, peersResult.data || []),
        carrier_book: carrierBusinessBook(result.data, invitedResult.data || [], openLanesResult.data || []),
        bid_history: bidHistory,
        segment_confirmations: segmentConfirmations
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

    if (body.action === "save_segment_confirmations") {
      return jsonResponse(await saveSegmentConfirmations(supabase, token, body));
    }

    if (body.action === "submit_bid") {
      const bidRate = strictBidNumber(body.bid_rate, "Bid rate", { required: true });
      const mirrorEnabled = cleanBoolean(body.mirror_account_enabled) === true;
      const equipmentAvailable = cleanBoolean(body.equipment_available);
      const deadheadDistance = strictNonNegativeBidNumber(body.deadhead_distance, "Deadhead distance");
      const deadheadUnit = deadheadDistance !== null ? normalizeDeadheadUnit(body.deadhead_unit) || "mi" : null;
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
          valid_through,
          commercial_model,
          equipment_available,
          current_unit_location,
          deadhead_distance,
          deadhead_unit,
          responded_at,
          notes,
          vendors(vendor_name,domain,primary_email),
          rfx_events(id,owner_user_id,owner_email,rfx_id,name,customer),
          rfx_lanes(*)
        `)
        .eq("invitation_token", token)
        .single();
      if (invitationResult.error) throw invitationResult.error;
      const previousBidRate = cleanNumber(invitationResult.data.bid_rate);
      const revisionType = bestFinal ? "best_final" : previousBidRate !== null ? "revision" : "initial";
      const commercialModel = normalizeCommercialModel(body.commercial_model) || "direct_cost_plus";
      const marksmanMarginPct = commercialModel === "direct_cost_plus"
        ? strictOptionalPercentWithDefault(body.marksman_margin_pct, "Suggested margin to share", 2, 5, DEFAULT_COMMERCIAL_SHARE_PCT)
        : commercialModel === "xbf_buy_sell"
          ? strictOptionalPercentWithDefault(body.marksman_margin_pct, "Suggested XBF buy-sell margin", XBF_BUY_SELL_MIN_MARKUP_PCT, XBF_BUY_SELL_MAX_MARKUP_PCT, XBF_BUY_SELL_DEFAULT_MARKUP_PCT)
        : null;
      const carrierSharePct = commercialModel === "carrier_share"
        ? strictOptionalPercentWithDefault(body.carrier_share_pct, "Carrier invoice share", 2, 5, DEFAULT_COMMERCIAL_SHARE_PCT)
        : null;
      const revisionLabel = revisionType === "best_final"
        ? "Best and final"
        : revisionType === "revision"
          ? "Quote revision"
          : "Initial quote";
      const now = new Date().toISOString();

      const patch = {
        invitation_status: "quoted",
        bid_rate: bidRate,
        currency: strictCurrencyCode(body.currency),
        weekly_capacity: strictBidNumber(body.weekly_capacity, "Weekly capacity"),
        transit_days: strictBidNumber(body.transit_days, "Transit days"),
        valid_through: strictDateOnly(body.valid_through, "Valid through"),
        commercial_model: commercialModel,
        marksman_margin_pct: marksmanMarginPct,
        carrier_share_pct: carrierSharePct,
        best_alternative_offered: cleanBoolean(body.best_alternative_offered) === true,
        alternative_equipment: cleanText(body.alternative_equipment),
        alternative_units: strictBidNumber(body.alternative_units, "Alternative units"),
        alternative_notes: cleanText(body.alternative_notes),
        equipment_available: equipmentAvailable,
        current_unit_location: cleanText(body.current_unit_location),
        deadhead_distance: deadheadDistance,
        deadhead_unit: deadheadUnit,
        unit_details: cleanText(body.unit_details),
        eta_pickup: cleanTimestamp(body.eta_pickup),
        eta_delivery: cleanTimestamp(body.eta_delivery),
        mirror_account_enabled: mirrorEnabled,
        availability_validation_status: availabilityValidationStatus(body.availability_validation_status, mirrorEnabled),
        availability_validation_notes: cleanText(body.availability_validation_notes),
        notes: cleanText(body.notes),
        response_source: "carrier_portal",
        responded_at: now,
        updated_at: now
      };

      const result = await supabase
        .from("rfx_lane_vendors")
        .update(patch)
        .eq("id", invitationResult.data.id)
        .select("id,invitation_status,bid_rate,bid_rate_staging_id,bid_rate_staged_at,currency,weekly_capacity,transit_days,valid_through,commercial_model,marksman_margin_pct,carrier_share_pct,best_alternative_offered,alternative_equipment,alternative_units,alternative_notes,equipment_available,current_unit_location,deadhead_distance,deadhead_unit,unit_details,eta_pickup,eta_delivery,mirror_account_enabled,availability_validation_status,availability_validation_notes,notes,responded_at")
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
      const ratewareCapture = await ensureBidRateStagingRow(
        supabase,
        invitationResult.data as Record<string, unknown>,
        result.data as Record<string, unknown>,
        revisionType,
        now
      );
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
            patch.valid_through ? `valid through ${patch.valid_through}` : null,
            patch.commercial_model ? `model ${patch.commercial_model}` : null,
            equipmentAvailable === null ? null : `available ${equipmentAvailable ? "yes" : "no"}`,
            patch.deadhead_distance !== null ? `deadhead ${patch.deadhead_distance} ${patch.deadhead_unit || "mi"}` : null,
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
              valid_through: cleanDate(invitationResult.data.valid_through),
              commercial_model: cleanText(invitationResult.data.commercial_model),
              equipment_available: cleanBoolean(invitationResult.data.equipment_available),
              current_unit_location: cleanText(invitationResult.data.current_unit_location),
              deadhead_distance: cleanNumber(invitationResult.data.deadhead_distance),
              deadhead_unit: cleanText(invitationResult.data.deadhead_unit),
              responded_at: invitationResult.data.responded_at || null
            },
            after: {
              bid_rate: bidRate,
              currency: patch.currency,
              weekly_capacity: patch.weekly_capacity,
              transit_days: patch.transit_days,
              valid_through: patch.valid_through,
              commercial_model: patch.commercial_model,
              equipment_available: patch.equipment_available,
              current_unit_location: patch.current_unit_location,
              deadhead_distance: patch.deadhead_distance,
              deadhead_unit: patch.deadhead_unit,
              responded_at: patch.responded_at
            }
          }
        });
        if (historyResult.error) throw historyResult.error;
      }
      return jsonResponse({ row: result.data, rateware_capture: ratewareCapture });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    return jsonResponse({ error: error.message }, 400);
  }
});
