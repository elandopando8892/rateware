import { getKindeToken } from "./auth.js";
import { SUPABASE_URL } from "./config.js";

export async function syncRatewareCatalog() {
  const token = await getKindeToken();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-rateware-catalog`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Catalog sync failed.");
  return data;
}
