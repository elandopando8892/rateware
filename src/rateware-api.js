import { getKindeToken } from "./auth.js";
import { SUPABASE_URL } from "./config.js";

function stringifyApiError(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message || "";
  if (typeof value !== "object") return String(value);

  const nested = value.error || value.message || value.details || value.hint;
  if (nested && nested !== value) {
    const message = stringifyApiError(nested);
    if (message) return message;
  }

  const parts = ["code", "type", "status", "name"]
    .map((key) => value[key] ? `${key}: ${value[key]}` : "")
    .filter(Boolean);
  if (parts.length) return parts.join(" | ");

  try {
    const json = JSON.stringify(value);
    return json === "{}" ? "" : json;
  } catch {
    return "";
  }
}

function apiErrorMessage(data, text, status) {
  return stringifyApiError(data?.error)
    || stringifyApiError(data?.message)
    || stringifyApiError(data)
    || stringifyApiError(text)
    || `Rateware API request failed (${status})`;
}

export async function callRatewareApi(action, payload = {}) {
  const token = await getKindeToken();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/rateware-api`, {
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
    throw new Error(apiErrorMessage(data, text, response.status));
  }
  return data;
}
