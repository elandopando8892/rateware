import { getKindeToken } from "./auth.js";
import { SUPABASE_URL } from "./config.js";

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
    throw new Error(data.error || data.message || text || `Rateware API request failed (${response.status})`);
  }
  return data;
}
