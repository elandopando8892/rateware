import { callRatewareApi } from "./rateware-api.js";

export async function askCarrierIntelligence(message) {
  return await callRatewareApi("carrier_intelligence_chat", { message });
}

export async function promoteCarrierRecommendations(ids = []) {
  return await callRatewareApi("bulk_update_vendors", { ids, patch: { base_stage: "procurement", status: "active" } });
}
