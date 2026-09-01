import { authenticatedFetch } from "./auth.js";
import { SUPABASE_URL } from "./config.js";

function stringifyApiError(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message || "";
  if (typeof value !== "object") return String(value);

  const nested = value.error || value.message || value.reason || value.description || value.detail || value.details || value.hint || value.cause;
  if (nested && nested !== value) {
    const message = stringifyApiError(nested);
    if (message) return message;
  }

  const parts = ["code", "type", "status", "name", "stage", "action", "incident_id", "incidentId"]
    .map((key) => value[key] ? `${key}: ${value[key]}` : "")
    .filter(Boolean);
  if (parts.length) return parts.join(" | ");

  return "";
}

function apiErrorMessage(data, text, status) {
  const parts = [data?.error, data?.cause, data?.details, data?.hint, data?.message]
    .map(stringifyApiError)
    .filter((value, index, values) => value && values.indexOf(value) === index);
  return parts.join(" | ")
    || stringifyApiError(data)
    || stringifyApiError(text)
    || `Rateware API request failed (${status})`;
}

export async function callRatewareFunction(functionName, action, payload = {}) {
  const endpoint = `${SUPABASE_URL}/functions/v1/${functionName}`;
  const body = JSON.stringify({ action, ...payload });
  const response = await authenticatedFetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${apiErrorMessage(data, text, response.status)}`);
    error.status = response.status;
    error.code = data?.code || data?.status || response.status;
    error.details = data?.details || "";
    error.hint = data?.hint || "";
    error.causeDetail = data?.cause || "";
    error.incidentId = data?.incident_id || response.headers.get("x-request-id") || "";
    error.action = data?.action || action;
    error.stage = data?.stage || "";
    if (typeof data?.enabled === "boolean") error.enabled = data.enabled;
    throw error;
  }
  return data;
}

export async function callRatewareApi(action, payload = {}) {
  return await callRatewareFunction("rateware-api", action, payload);
}
