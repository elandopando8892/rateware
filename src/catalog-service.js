import { authenticatedFetch } from "./auth.js";
import { SUPABASE_URL } from "./config.js";
import { callRatewareApi } from "./rateware-api.js";
import { apiErrorMessage } from "./error-copy.js";

export async function syncRatewareCatalog(mode = "core") {
  const response = await authenticatedFetch(`${SUPABASE_URL}/functions/v1/sync-rateware-catalog`, {
    method: "POST",
    headers: {
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
    throw new Error(apiErrorMessage(data, text, `Catalog sync failed with HTTP ${response.status}.`));
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
  return (await callRatewareApi("archive_catalog_value", { id, confirmed: true, confirmation_action: "archive_catalog_value" })).row;
}

export async function fetchLocationCatalogValues(filters = {}) {
  return (await callRatewareApi("list_location_catalog_values", filters)).rows;
}

export async function saveLocationCatalogValue(locationValue) {
  return (await callRatewareApi("save_location_catalog_value", { location_value: locationValue })).row;
}

export async function archiveLocationCatalogValue(id) {
  return (await callRatewareApi("archive_location_catalog_value", { id, confirmed: true, confirmation_action: "archive_location_catalog_value" })).row;
}

export async function bulkImportCatalogValues({ importType, rows, fileName = "", sheetName = "" } = {}) {
  return await callRatewareApi("bulk_import_catalog_values", {
    import_type: importType,
    rows,
    file_name: fileName,
    sheet_name: sheetName
  });
}
