import { callRatewareApi } from "./rateware-api.js";

export async function askCarrierIntelligence(message) {
  return await callRatewareApi("carrier_intelligence_chat", { message });
}

export async function fetchCarrierRecommendations(config) {
  return await callRatewareApi("carrier_recommendations", { config });
}

export async function fetchBusinessIntelligencePivot(config) {
  return await callRatewareApi("business_intelligence_pivot", { config });
}

export async function fetchBusinessIntelligenceDrilldown(config, cell) {
  return await callRatewareApi("business_intelligence_drilldown", { config, cell });
}

export async function fetchBusinessIntelligenceGeoDensity(config) {
  return await callRatewareApi("business_intelligence_geo_density", { config });
}

export async function promoteCarrierRecommendations(ids = []) {
  return await callRatewareApi("bulk_update_vendors", { ids, patch: { base_stage: "procurement", status: "active" } });
}
