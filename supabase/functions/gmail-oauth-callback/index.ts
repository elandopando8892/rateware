import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/kinde.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const GMAIL_TOKEN_ENCRYPTION_KEY = Deno.env.get("GMAIL_TOKEN_ENCRYPTION_KEY");
const GMAIL_ALLOWED_SENDER = (Deno.env.get("GMAIL_ALLOWED_SENDER") || "sales@heymarksman.com").trim().toLowerCase();
const GOOGLE_CHAT_ALLOWED_ACCOUNT = (Deno.env.get("GOOGLE_CHAT_ALLOWED_ACCOUNT") || GMAIL_ALLOWED_SENDER).trim().toLowerCase();
const RATEWARE_APP_ORIGIN = (Deno.env.get("RATEWARE_APP_ORIGIN") || "https://rateware.vercel.app").replace(/\/$/, "");

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function redirectUri() {
  return Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI")
    || `${String(SUPABASE_URL || "").replace(/\/$/, "")}/functions/v1/gmail-oauth-callback`;
}

function redirectTo(path = "settings.html", params: Record<string, string> = {}) {
  const target = new URL(path || "settings.html", `${RATEWARE_APP_ORIGIN}/`);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders(), Location: target.toString() }
  });
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function base64ToJsonPayload(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return {};
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function importEncryptionKey() {
  if (!GMAIL_TOKEN_ENCRYPTION_KEY) throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(GMAIL_TOKEN_ENCRYPTION_KEY));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
}

async function encryptToken(value: string) {
  const key = await importEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ciphertext))}`;
}

async function fetchGoogleUserEmail(accessToken: string, idToken?: string) {
  const payload = idToken ? base64ToJsonPayload(idToken) as Record<string, unknown> : {};
  const idEmail = cleanText(payload.email)?.toLowerCase();
  if (idEmail) {
    return {
      email: idEmail,
      sub: cleanText(payload.sub)
    };
  }

  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error("Google userinfo lookup failed.");
  const profile = await response.json();
  return {
    email: cleanText(profile.email)?.toLowerCase(),
    sub: cleanText(profile.sub)
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  let stateRow: Record<string, unknown> | null = null;
  let stateProvider = "gmail";
  const supabase = getClient();

  try {
    const url = new URL(request.url);
    const code = cleanText(url.searchParams.get("code"));
    const state = cleanText(url.searchParams.get("state"));
    const oauthError = cleanText(url.searchParams.get("error"));
    if (oauthError) return redirectTo("settings.html", { gmail: "error", reason: oauthError });
    if (!code || !state) return redirectTo("settings.html", { gmail: "error", reason: "missing_code_or_state" });

    const gmailStateResult = await supabase
      .from("gmail_oauth_states")
      .select("*")
      .eq("state", state)
      .maybeSingle();
    if (gmailStateResult.error) throw gmailStateResult.error;
    stateRow = gmailStateResult.data || null;
    if (!stateRow) {
      const chatStateResult = await supabase
        .from("google_chat_oauth_states")
        .select("*")
        .eq("state", state)
        .maybeSingle();
      if (chatStateResult.error) throw chatStateResult.error;
      stateRow = chatStateResult.data || null;
      stateProvider = "google_chat";
    }
    const statusParam = stateProvider === "google_chat" ? "chat" : "gmail";
    if (!stateRow) return redirectTo("settings.html", { [statusParam]: "error", reason: "invalid_state" });
    if (stateRow.used_at) return redirectTo(cleanText(stateRow.redirect_after) || "settings.html", { [statusParam]: "error", reason: "state_already_used" });
    if (new Date(String(stateRow.expires_at)).getTime() < Date.now()) {
      return redirectTo(cleanText(stateRow.redirect_after) || "settings.html", { [statusParam]: "error", reason: "state_expired" });
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error("Google OAuth client is not configured.");

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code"
      })
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(cleanText(tokenData.error_description) || cleanText(tokenData.error) || "Google token exchange failed.");

    const accessToken = cleanText(tokenData.access_token);
    if (!accessToken) throw new Error("Google did not return an access token.");
    const googleUser = await fetchGoogleUserEmail(accessToken, cleanText(tokenData.id_token) || undefined);
    const expectedEmail = stateProvider === "google_chat"
      ? cleanText(stateRow.account_email)?.toLowerCase() || GOOGLE_CHAT_ALLOWED_ACCOUNT
      : cleanText(stateRow.mailbox_email)?.toLowerCase() || GMAIL_ALLOWED_SENDER;
    const requiredEmail = stateProvider === "google_chat" ? GOOGLE_CHAT_ALLOWED_ACCOUNT : GMAIL_ALLOWED_SENDER;
    if (googleUser.email !== expectedEmail || googleUser.email !== requiredEmail) {
      throw new Error(`Connected Google account must be ${requiredEmail}.`);
    }

    const connectionTable = stateProvider === "google_chat" ? "google_chat_connections" : "gmail_mailbox_connections";
    const accountColumn = stateProvider === "google_chat" ? "account_email" : "mailbox_email";
    const existing = await supabase
      .from(connectionTable)
      .select("refresh_token_encrypted")
      .eq("owner_email", stateRow.owner_email)
      .eq(accountColumn, expectedEmail)
      .maybeSingle();
    if (existing.error) throw existing.error;

    const accessTokenEncrypted = await encryptToken(accessToken);
    const refreshTokenEncrypted = tokenData.refresh_token
      ? await encryptToken(String(tokenData.refresh_token))
      : existing.data?.refresh_token_encrypted || null;
    if (!refreshTokenEncrypted) throw new Error("Google did not return a refresh token. Retry consent or revoke the app in Google and connect again.");

    const expiresIn = Number(tokenData.expires_in) || 3600;
    const connectionRow = stateProvider === "google_chat" ? {
        owner_user_id: stateRow.owner_user_id,
        owner_email: stateRow.owner_email,
        account_email: expectedEmail,
        provider: "google_chat",
        status: "connected",
        scopes: String(tokenData.scope || "").split(/\s+/).filter(Boolean),
        access_token_encrypted: accessTokenEncrypted,
        refresh_token_encrypted: refreshTokenEncrypted,
        token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        google_sub: googleUser.sub,
        last_error: null,
        updated_at: new Date().toISOString(),
        metadata: { token_type: tokenData.token_type || "Bearer" }
      } : {
        owner_user_id: stateRow.owner_user_id,
        owner_email: stateRow.owner_email,
        mailbox_email: expectedEmail,
        provider: "gmail",
        status: "connected",
        scopes: String(tokenData.scope || "").split(/\s+/).filter(Boolean),
        access_token_encrypted: accessTokenEncrypted,
        refresh_token_encrypted: refreshTokenEncrypted,
        token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        google_sub: googleUser.sub,
        last_error: null,
        updated_at: new Date().toISOString(),
        metadata: { token_type: tokenData.token_type || "Bearer" }
      };
    const connectionResult = await supabase
      .from(connectionTable)
      .upsert(connectionRow, { onConflict: stateProvider === "google_chat" ? "owner_email,account_email" : "owner_email,mailbox_email" });
    if (connectionResult.error) throw connectionResult.error;

    await supabase
      .from(stateProvider === "google_chat" ? "google_chat_oauth_states" : "gmail_oauth_states")
      .update({ used_at: new Date().toISOString() })
      .eq("state", state);

    return redirectTo(cleanText(stateRow.redirect_after) || "settings.html", { [statusParam]: "connected" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (stateProvider === "google_chat" && stateRow?.owner_email && stateRow?.account_email) {
      await supabase.from("google_chat_connections").upsert({
        owner_user_id: stateRow.owner_user_id,
        owner_email: stateRow.owner_email,
        account_email: stateRow.account_email,
        provider: "google_chat",
        status: "error",
        last_error: message,
        updated_at: new Date().toISOString()
      }, { onConflict: "owner_email,account_email" });
    } else if (stateRow?.owner_email && stateRow?.mailbox_email) {
      await supabase.from("gmail_mailbox_connections").upsert({
        owner_user_id: stateRow.owner_user_id,
        owner_email: stateRow.owner_email,
        mailbox_email: stateRow.mailbox_email,
        provider: "gmail",
        status: "error",
        last_error: message,
        updated_at: new Date().toISOString()
      }, { onConflict: "owner_email,mailbox_email" });
    }
    return redirectTo(cleanText(stateRow?.redirect_after) || "settings.html", { [stateProvider === "google_chat" ? "chat" : "gmail"]: "error", reason: message.slice(0, 120) });
  }
});
