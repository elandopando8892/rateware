import { callRatewareApi } from "./rateware-api.js";

export async function fetchRatebooks(options = {}) {
  return callRatewareApi("list_ratebooks", options);
}

export async function fetchRatebookHealth() {
  return callRatewareApi("get_ratebook_health");
}

export async function fetchRatebook(ratebookId) {
  return callRatewareApi("get_ratebook", { ratebook_id: ratebookId });
}

export async function fetchRatebookRouteDetail(ratebookId, sourceDemandLaneId) {
  return callRatewareApi("get_ratebook_route_detail", {
    ratebook_id: ratebookId,
    source_demand_lane_id: sourceDemandLaneId,
  });
}

export async function fetchRatebookRouteQuotes(ratebookId, packageLaneId) {
  return callRatewareApi("get_ratebook_route_quotes", {
    ratebook_id: ratebookId,
    package_lane_id: packageLaneId,
  });
}

export async function updateRatebookQuoteReview(ratebookId, quoteId, review) {
  return callRatewareApi("update_ratebook_quote_review", {
    ratebook_id: ratebookId,
    quote_id: quoteId,
    ...review,
  });
}

export async function fetchRatebookCarriers(ratebookId, options = {}) {
  return callRatewareApi("list_ratebook_carriers", {
    ratebook_id: ratebookId,
    ...options,
  });
}

export async function shareRatebookWithCarriers(ratebookId, vendorIds) {
  return callRatewareApi("share_ratebook_with_carriers", {
    ratebook_id: ratebookId,
    vendor_ids: vendorIds,
    app_origin: window.location.origin,
  });
}

export async function queueRatebookDistribution(ratebookId, vendorIds) {
  return callRatewareApi("queue_ratebook_distribution", {
    ratebook_id: ratebookId,
    vendor_ids: vendorIds,
    app_origin: window.location.origin,
  });
}

export async function sendRatebookDistribution(ratebookId, messageIds) {
  return callRatewareApi("send_ratebook_distribution", {
    ratebook_id: ratebookId,
    ids: messageIds,
    confirmed: true,
    confirmation_action: "send_outreach_messages",
  });
}

export async function publishRatebook(ratebookId) {
  return callRatewareApi("publish_ratebook", { ratebook_id: ratebookId });
}

export async function archiveRatebook(ratebookId) {
  return callRatewareApi("archive_ratebook", { ratebook_id: ratebookId });
}

export async function createRatebookRevision(ratebookId) {
  return callRatewareApi("create_ratebook_revision", { ratebook_id: ratebookId });
}

export async function fetchRatebookAudit(ratebookId) {
  return callRatewareApi("get_ratebook_audit", { ratebook_id: ratebookId });
}
