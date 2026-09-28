/**
 * What a carrier's Bid Room may see of the event chat. Threads and messages
 * come out of the team's tables whole; these keep what the carrier's page
 * shows (type, title, author, text, date) and leave out everything else:
 * - the team's internal note, assignment and resolution on a thread;
 * - the workspace key, the team's own addresses, and any carrier's email
 *   (group threads are shared with every carrier of the event or lane);
 * - Google Chat identifiers;
 * - the lane's internal fields (incumbent carrier, notes and the like).
 */

const text = (value) => {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
};

const record = (value) => {
  const item = Array.isArray(value) ? value[0] : value;
  return item && typeof item === "object" ? item : null;
};

// The team posts under its workspace key or an address when no name is given,
// and messages mirrored from Google Chat carry the Google user id (users/…).
const privateName = (name) => !name || name.includes("@") || /^(org:|users\/)/i.test(name);

export function carrierChatThread(thread) {
  const vendor = record(thread?.vendors);
  const lane = record(thread?.rfx_lanes);
  return {
    id: thread?.id ?? null,
    thread_type: text(thread?.thread_type),
    title: text(thread?.title),
    rfx_event_id: thread?.rfx_event_id ?? null,
    rfx_lane_id: thread?.rfx_lane_id ?? null,
    vendor_id: thread?.vendor_id ?? null,
    status: text(thread?.status),
    created_at: thread?.created_at ?? null,
    updated_at: thread?.updated_at ?? null,
    vendors: vendor ? { vendor_name: text(vendor.vendor_name), domain: text(vendor.domain) } : null,
    rfx_lanes: lane ? { lane_number: lane.lane_number ?? null, origin: text(lane.origin), destination: text(lane.destination) } : null,
  };
}

// A message copied in from the team's Google Chat space belongs to a thread only
// when it was written in that thread's own Google Chat conversation. The sync
// used to drop the space's other conversations (other events, other carriers'
// private threads, the team's own chat) into the event's shared thread.
export function belongsToThread(thread, message) {
  const meta = record(message?.metadata);
  if (text(meta?.source) !== "google_chat_inbound") return true;
  const own = text(thread?.google_chat_thread_name);
  return Boolean(own) && text(meta?.google_chat_thread_name) === own;
}

export function carrierChatMessage(message) {
  const role = text(message?.sender_role)?.toLowerCase() || null;
  const vendor = record(message?.vendors);
  const name = text(message?.sender_name);
  return {
    id: message?.id ?? null,
    created_at: message?.created_at ?? null,
    thread_id: message?.thread_id ?? null,
    rfx_lane_id: message?.rfx_lane_id ?? null,
    vendor_id: message?.vendor_id ?? null,
    sender_role: role,
    sender_name: role === "carrier" ? name || text(vendor?.vendor_name) || "Carrier" : privateName(name) ? "MARKSMAN" : name,
    body: text(message?.body),
    vendors: vendor ? { vendor_name: text(vendor.vendor_name), domain: text(vendor.domain) } : null,
  };
}
