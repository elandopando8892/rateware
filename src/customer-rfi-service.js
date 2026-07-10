import { SUPABASE_URL } from "./config.js";
import { apiErrorMessage } from "./error-copy.js";

const PUBLIC_RFI_ENDPOINT = `${SUPABASE_URL}/functions/v1/rfx-bid-api`;

async function callPublicRfiApi(action, payload = {}) {
  const response = await fetch(PUBLIC_RFI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(apiErrorMessage(data));
  return data;
}

export async function fetchCustomerRfi(token) {
  return await callPublicRfiApi("get_customer_rfi", { token });
}

export async function saveCustomerRfi(token, rfi) {
  return await callPublicRfiApi("save_customer_rfi", { token, rfi });
}

export async function submitCustomerRfi(token, rfi) {
  return await callPublicRfiApi("submit_customer_rfi", { token, rfi });
}
