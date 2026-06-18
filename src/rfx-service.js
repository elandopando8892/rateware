import { callRatewareApi } from "./rateware-api.js";

export async function fetchRfxEvents() {
  return (await callRatewareApi("list_rfx_events")).rows;
}

export async function createRfxEvent(event) {
  return (await callRatewareApi("create_rfx_event", { event })).row;
}

export async function updateRfxEvent(id, patch) {
  return (await callRatewareApi("update_rfx_event", { id, patch })).row;
}

export async function importRfxLanes(eventId, rows) {
  return await callRatewareApi("import_rfx_lanes", { event_id: eventId, rows });
}

export async function fetchRfxDetail(eventId) {
  return await callRatewareApi("list_rfx_detail", { event_id: eventId });
}

export async function autoShortlistRfxLane(laneId, limit = 10) {
  return await callRatewareApi("auto_shortlist_rfx_lane", { lane_id: laneId, limit });
}

export async function shortlistRfxLaneVendors(laneId, vendorIds = []) {
  return await callRatewareApi("shortlist_rfx_lane_vendors", { lane_id: laneId, vendor_ids: vendorIds });
}

export async function inviteRfxLaneVendors(ids = []) {
  return await callRatewareApi("invite_rfx_lane_vendors", { ids });
}

export async function updateRfxBid(id, patch) {
  return (await callRatewareApi("update_rfx_bid", { id, patch })).row;
}

export async function archiveRfxLaneVendors(ids = []) {
  return await callRatewareApi("archive_rfx_lane_vendors", { ids });
}
