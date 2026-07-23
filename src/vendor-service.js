import { callRatewareApi } from "./rateware-api.js";

export async function fetchVendors({
  search = "",
  ids = [],
  status = "",
  base_stage = "",
  view = "all",
  channel = "",
  tag = "",
  coverage = "",
  lightweight = false,
  limit = 75,
  offset = 0
} = {}) {
  return await callRatewareApi("list_vendors", { search, ids, status, base_stage, view, channel, tag, coverage, lightweight, limit, offset });
}

export async function fetchVendorIntelligence(options = {}) {
  return await callRatewareApi("vendor_intelligence", { options });
}

export async function fetchVendorFunnel() {
  return await callRatewareApi("vendor_funnel");
}

export async function fetchVendorOnboardingGaps() {
  return await callRatewareApi("vendor_onboarding_gaps");
}

export async function importVendorOnboardingCorrections(vendors) {
  return await callRatewareApi("import_vendor_onboarding_corrections", { vendors });
}

function vendorMatchFilters(scope = "staging") {
  if (scope === "rateware") {
    return {
      mode: "rateware",
      quick_filter: "all",
      needs_vendor: true
    };
  }
  return {
    mode: "staging",
    status: "pending_review",
    review_filter: "needs-vendor",
    needs_vendor: true
  };
}

export async function matchVendorRateRowsByScope(scope = "staging", { dryRun = true, maxRows = undefined } = {}) {
  return await callRatewareApi("match_rate_vendors_by_filter", {
    filters: vendorMatchFilters(scope),
    dry_run: dryRun,
    max_rows: maxRows
  });
}

export async function applyVendorIntelligenceTags(ids = []) {
  return await callRatewareApi("apply_vendor_intelligence_tags", { ids });
}

export async function createVendor(vendor) {
  return (await callRatewareApi("create_vendor", { vendor })).row;
}

export async function updateVendor(id, patch) {
  return (await callRatewareApi("update_vendor", { id, patch })).row;
}

export async function uploadVendorLogo(vendorId, filePayload) {
  return await callRatewareApi("upload_vendor_logo", { vendor_id: vendorId, ...filePayload });
}

export async function createVendorProfileRequest(vendorId, { expiresInDays = 30 } = {}) {
  return await callRatewareApi("create_vendor_profile_request", {
    vendor_id: vendorId,
    expires_in_days: expiresInDays,
    origin: window.location.origin
  });
}

export async function importVendors(vendors) {
  return await callRatewareApi("import_vendors", { vendors });
}

export async function importVendorsFromGoogleSheet(url) {
  return await callRatewareApi("import_vendors_google_sheet", { url });
}

export async function bulkUpdateVendors(ids, patch) {
  return await callRatewareApi("bulk_update_vendors", { ids, patch, confirmed: true, confirmation_action: "bulk_update_vendors" });
}

export async function removeVendors(ids) {
  return await callRatewareApi("remove_vendors", { ids, confirmed: true, confirmation_action: "remove_vendors" });
}

export async function fetchVendorSegments({ segmentType = "" } = {}) {
  return (await callRatewareApi("list_vendor_segments", { segment_type: segmentType })).rows;
}

export async function createVendorSegment(segment) {
  return (await callRatewareApi("create_vendor_segment", { segment })).row;
}

export async function updateVendorSegment(id, segment) {
  return (await callRatewareApi("update_vendor_segment", { id, segment })).row;
}

export async function deleteVendorSegment(id, { segmentType = "" } = {}) {
  return (await callRatewareApi("delete_vendor_segment", {
    id,
    segment_type: segmentType,
    confirmed: true,
    confirmation_action: "delete_vendor_segment"
  })).row;
}

export async function fetchVendorSupportTickets(filters = {}) {
  return await callRatewareApi("list_vendor_support_tickets", filters);
}

export async function updateVendorSupportTicket(id, patch = {}) {
  return (await callRatewareApi("update_vendor_support_ticket", { id, ...patch })).row;
}
