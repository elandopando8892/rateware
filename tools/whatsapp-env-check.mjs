#!/usr/bin/env node

import { SUPABASE_URL } from "../src/config.js";

const requiredSecrets = [
  "WHATSAPP_PROVIDER",
  "WHATSAPP_CONNECTION_MODE",
  "WHATSAPP_GRAPH_API_VERSION",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
  "WHATSAPP_WABA_ID",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_TOKEN_ENCRYPTION_KEY",
  "WHATSAPP_INTERNAL_OWNER_EMAILS",
  "WHATSAPP_INTERNAL_USER_IDS",
  "WHATSAPP_GROUPS_ENABLED"
];

const token = (process.env.RATEWARE_API_BEARER || process.env.RATEWARE_E2E_KINDE_TOKEN || process.env.KINDE_TOKEN || "").trim();
const apiUrl = (process.env.RATEWARE_API_URL || `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/rateware-api`).trim();

function statusLine(name, ok, detail = "") {
  const marker = ok ? "ok" : "missing";
  console.log(`[${marker}] ${name}${detail ? ` - ${detail}` : ""}`);
}

function boolLabel(value) {
  return value ? "configured" : "missing";
}

function safeError(error) {
  const text = error instanceof Error ? error.message : String(error || "");
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/EA[A-Za-z0-9._~+/=-]{20,}/g, "[redacted]");
}

async function callRateware(action, payload = {}) {
  if (!token) throw new Error("RATEWARE_API_BEARER or RATEWARE_E2E_KINDE_TOKEN is required for API checks.");
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action, ...payload })
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!response.ok) {
    const message = data?.error?.message || data?.error || data?.message || text || `HTTP ${response.status}`;
    throw new Error(String(message));
  }
  return data;
}

console.log("Rateware WhatsApp Business configuration check");
console.log("Local environment names only. Secret values are never printed.");
console.log("");

const localMissing = [];
for (const name of requiredSecrets) {
  const present = Boolean(String(process.env[name] || "").trim());
  if (!present) localMissing.push(name);
  statusLine(name, present);
}

console.log("");
if (localMissing.length) {
  console.log("Local env check found missing names. This is acceptable when secrets are stored only in Supabase.");
}

if (!token) {
  console.log("");
  console.log("Skipping Rateware API checks. Set RATEWARE_API_BEARER to a current Kinde access token to validate production.");
  process.exit(0);
}

console.log("");
console.log(`Checking Rateware API: ${apiUrl}`);

try {
  const connections = await callRateware("list_whatsapp_connections");
  const row = connections?.rows?.[0] || {};
  statusLine("list_whatsapp_connections", true, `status=${row.status || "unknown"}, configured=${Boolean(row.configured)}`);
  statusLine("webhook verify token", Boolean(row.webhook_configured), boolLabel(row.webhook_configured));
  statusLine("webhook app secret", Boolean(row.app_secret_configured), boolLabel(row.app_secret_configured));
  statusLine("template cache", Number(row.template_count || 0) > 0, `${Number(row.template_count || 0)} template(s) cached`);
  if (row.display_phone_number) statusLine("sender phone", true, row.display_phone_number);
} catch (error) {
  statusLine("list_whatsapp_connections", false, safeError(error));
}

try {
  const result = await callRateware("test_whatsapp_business_connection");
  statusLine("test_whatsapp_business_connection", Boolean(result.ok), result.ok ? `${result.display_phone_number || "sender"} | ${result.verified_name || "verified name unavailable"} | ${result.quality_rating || "quality unavailable"}` : "not connected");
} catch (error) {
  statusLine("test_whatsapp_business_connection", false, safeError(error));
}

try {
  const result = await callRateware("list_whatsapp_phone_numbers");
  const phones = Array.isArray(result.rows) ? result.rows : [];
  statusLine("list_whatsapp_phone_numbers", true, `${phones.length} sender phone(s) returned`);
  for (const phone of phones.slice(0, 5)) {
    statusLine("phone", true, [phone.display_phone_number, phone.verified_name, phone.quality_rating].filter(Boolean).join(" | ") || "metadata returned");
  }
} catch (error) {
  statusLine("list_whatsapp_phone_numbers", false, safeError(error));
}

try {
  const result = await callRateware("sync_whatsapp_templates");
  statusLine("sync_whatsapp_templates", true, `${Number(result.synced || result.rows?.length || 0)} template(s) synced`);
} catch (error) {
  statusLine("sync_whatsapp_templates", false, safeError(error));
}

try {
  const result = await callRateware("verify_whatsapp_webhook");
  statusLine("verify_whatsapp_webhook", true, `endpoint=${result.endpoint || "returned"}, verify_token=${boolLabel(result.verify_token_configured)}, app_secret=${boolLabel(result.app_secret_configured)}`);
} catch (error) {
  statusLine("verify_whatsapp_webhook", false, safeError(error));
}
