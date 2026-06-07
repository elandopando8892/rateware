import { getKindeToken } from "./auth.js";
import { SUPABASE_URL } from "./config.js";

async function callRatewareApi(action, payload = {}) {
  const token = await getKindeToken();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/rateware-api`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action, ...payload })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Rateware API request failed.");
  return data;
}

export async function fetchStagingRows({ status = "pending_review" } = {}) {
  return (await callRatewareApi("list_staging", { status })).rows;
}

export async function updateStagingRow(id, patch) {
  return (await callRatewareApi("update_staging", { id, patch })).row;
}
