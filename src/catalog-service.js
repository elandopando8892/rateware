import { getKindeToken } from "./auth.js";
import { SUPABASE_URL } from "./config.js";

export async function syncRatewareCatalog(mode = "core") {
  const token = await getKindeToken();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-rateware-catalog`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ mode })
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }

  if (!response.ok) {
    throw new Error(data.error || `Catalog sync failed with HTTP ${response.status}.`);
  }
  return data;
}
