import { callRatewareApi } from "./rateware-api.js";

export async function fetchStagingRows({ status = "pending_review" } = {}) {
  return (await callRatewareApi("list_staging", { status })).rows;
}

export async function fetchStagingOptions() {
  return await callRatewareApi("list_staging_options");
}

export async function updateStagingRow(id, patch) {
  return (await callRatewareApi("update_staging", { id, patch })).row;
}

export async function renormalizeStagingRows(ids = []) {
  return await callRatewareApi("renormalize_rate_rows", { ids });
}

export async function enrichStagingLocationZips(ids = []) {
  return await callRatewareApi("enrich_missing_location_zips", { ids });
}

export async function archiveStagingRows(ids = []) {
  return await callRatewareApi("archive_staging", { ids });
}

export async function removeStagingRows(ids = []) {
  return await callRatewareApi("remove_staging", { ids });
}
