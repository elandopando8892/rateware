import { callRatewareApi } from "./rateware-api.js";

export async function fetchVendors({ search = "", status = "", base_stage = "" } = {}) {
  return (await callRatewareApi("list_vendors", { search, status, base_stage })).rows;
}

export async function createVendor(vendor) {
  return (await callRatewareApi("create_vendor", { vendor })).row;
}

export async function updateVendor(id, patch) {
  return (await callRatewareApi("update_vendor", { id, patch })).row;
}

export async function importVendors(vendors) {
  return await callRatewareApi("import_vendors", { vendors });
}

export async function importVendorsFromGoogleSheet(url) {
  return await callRatewareApi("import_vendors_google_sheet", { url });
}

export async function bulkUpdateVendors(ids, patch) {
  return await callRatewareApi("bulk_update_vendors", { ids, patch });
}

export async function removeVendors(ids) {
  return await callRatewareApi("remove_vendors", { ids });
}

export async function fetchVendorSegments() {
  return (await callRatewareApi("list_vendor_segments")).rows;
}

export async function createVendorSegment(segment) {
  return (await callRatewareApi("create_vendor_segment", { segment })).row;
}

export async function deleteVendorSegment(id) {
  return (await callRatewareApi("delete_vendor_segment", { id })).row;
}
