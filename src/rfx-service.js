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

export async function archiveRfxEvent(id) {
  return (await callRatewareApi("archive_rfx_event", { id })).row;
}

export async function deleteRfxEvent(id) {
  return (await callRatewareApi("delete_rfx_event", { id })).removed;
}

export async function duplicateRfxEvent(id) {
  return await callRatewareApi("duplicate_rfx_event", { id });
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
  return await callRatewareApi("invite_rfx_lane_vendors", { ids, confirmed: true });
}

export async function updateRfxBid(id, patch) {
  return (await callRatewareApi("update_rfx_bid", { id, patch })).row;
}

export async function awardRfxLaneVendor(id, payload = {}) {
  return await callRatewareApi("award_rfx_lane_vendor", { id, ...payload });
}

export async function clearRfxAward(id) {
  return await callRatewareApi("clear_rfx_award", { id });
}

export async function closeoutAwardedRfxToRateware(eventId, options = {}) {
  return await callRatewareApi("closeout_awarded_rfx_to_rateware", { event_id: eventId, ...options });
}

export async function generateRfxAwardNotices(eventId, options = {}) {
  return await callRatewareApi("generate_rfx_award_notices", {
    event_id: eventId,
    app_origin: options.appOrigin || window.location.origin,
    sender_email: options.senderEmail || "",
    sender_label: options.senderLabel || ""
  });
}

export async function applyBidUpdateFromChat(payload = {}) {
  return await callRatewareApi("apply_bid_update_from_chat", payload);
}

export async function archiveRfxLaneVendors(ids = []) {
  return await callRatewareApi("archive_rfx_lane_vendors", { ids, confirmed: true });
}

export async function fetchBidRoomChat(eventId, filters = {}) {
  return await callRatewareApi("list_bid_room_chat", { rfx_event_id: eventId, ...filters });
}

export async function postBidRoomChatMessage(eventId, message) {
  return await callRatewareApi("post_bid_room_chat_message", { rfx_event_id: eventId, ...message });
}

export async function updateBidRoomChatThread(threadId, patch = {}) {
  return await callRatewareApi("update_bid_room_chat_thread", { thread_id: threadId, ...patch });
}

export async function syncBidRoomEventThread(eventId, options = {}) {
  return await callRatewareApi("sync_bid_room_event_thread", { rfx_event_id: eventId, ...options });
}
