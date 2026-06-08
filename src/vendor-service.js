import { callRatewareApi } from "./rateware-api.js";

export async function fetchVendors({ search = "", status = "" } = {}) {
  return (await callRatewareApi("list_vendors", { search, status })).rows;
}

export async function createVendor(vendor) {
  return (await callRatewareApi("create_vendor", { vendor })).row;
}

export async function importVendors(vendors) {
  return await callRatewareApi("import_vendors", { vendors });
}

export async function bulkUpdateVendors(ids, patch) {
  return await callRatewareApi("bulk_update_vendors", { ids, patch });
}
