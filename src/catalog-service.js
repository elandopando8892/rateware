import { getKindeToken } from "./auth.js";
import { SUPABASE_URL } from "./config.js";
import { callRatewareApi } from "./rateware-api.js";

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

export async function fetchCatalogValues(category = "") {
  return (await callRatewareApi("list_catalog_values", { category })).rows;
}

export async function saveCatalogValue(catalogValue) {
  return (await callRatewareApi("save_catalog_value", { catalog_value: catalogValue })).row;
}

export async function archiveCatalogValue(id) {
  return (await callRatewareApi("archive_catalog_value", { id })).row;
}

export async function fetchLocationCatalogValues(filters = {}) {
  return (await callRatewareApi("list_location_catalog_values", filters)).rows;
}

export async function saveLocationCatalogValue(locationValue) {
  return (await callRatewareApi("save_location_catalog_value", { location_value: locationValue })).row;
}

export async function archiveLocationCatalogValue(id) {
  return (await callRatewareApi("archive_location_catalog_value", { id })).row;
}
