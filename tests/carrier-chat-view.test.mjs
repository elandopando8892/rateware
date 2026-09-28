// What a carrier's Bid Room receives of the event chat: what its page shows,
// never the team's notes, addresses or workspace keys, nor another carrier's email.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { carrierChatMessage, carrierChatThread } from "../supabase/functions/_shared/carrier-chat-view.mjs";

const thread = carrierChatThread({
  id: "t-1",
  owner_email: "org:org-a",
  rfx_event_id: "e-1",
  rfx_lane_id: "l-1",
  vendor_id: "v-1",
  thread_type: "carrier_private",
  title: "RFx01 | Private: Transportes Uno",
  status: "open",
  internal_note: "Negociar a la baja, el incumbente cobra 2,400",
  assigned_to: "ana@marksman.example",
  resolved_by: "org:org-a",
  communication_status: "needs_reply",
  google_chat_space: "spaces/AAA",
  google_chat_thread_key: "key-1",
  metadata: { source: "rateware_internal" },
  vendors: { vendor_name: "Transportes Uno", domain: "uno.mx" },
  rfx_lanes: [{ lane_number: 3, origin: "Monterrey", destination: "Laredo", incumbent_vendor: "Otro Carrier", target_rate: 2300, notes: "interno" }],
});
assert.deepEqual(Object.keys(thread).sort(), [
  "created_at", "id", "rfx_event_id", "rfx_lane_id", "rfx_lanes", "status", "thread_type", "title", "updated_at", "vendor_id", "vendors",
]);
assert.deepEqual(thread.rfx_lanes, { lane_number: 3, origin: "Monterrey", destination: "Laredo" }, "no incumbent carrier or lane notes");
const shown = JSON.stringify(thread);
for (const secret of ["Negociar", "ana@marksman", "org:org-a", "spaces/AAA", "Otro Carrier", "needs_reply"]) {
  assert.ok(!shown.includes(secret), `the thread leaks ${secret}`);
}

const team = carrierChatMessage({ id: "m-1", thread_id: "t-1", sender_role: "procurement", sender_name: "org:org-a", sender_email: "org:org-a", body: "¿Incluye el cruce?", google_chat_message_name: "spaces/AAA/messages/1", metadata: { source: "rateware_internal" } });
assert.equal(team.sender_name, "MARKSMAN", "the workspace key never shows as the author");
assert.ok(!("sender_email" in team) && !("google_chat_message_name" in team) && !("metadata" in team));
assert.equal(carrierChatMessage({ sender_role: "procurement", sender_name: "ana@marksman.example" }).sender_name, "MARKSMAN", "nor a team address");
assert.equal(carrierChatMessage({ sender_role: "procurement", sender_name: "Ana (MARKSMAN)" }).sender_name, "Ana (MARKSMAN)");
assert.equal(carrierChatMessage({ sender_role: "procurement", sender_name: "users/101284191944259113414" }).sender_name, "MARKSMAN", "nor a Google Chat user id");

const other = carrierChatMessage({ id: "m-2", sender_role: "carrier", sender_name: "Transportes Dos", sender_email: "ventas@dos.mx", body: "Sí incluye", vendors: { vendor_name: "Transportes Dos", domain: "dos.mx" } });
assert.equal(other.sender_name, "Transportes Dos");
assert.ok(!JSON.stringify(other).includes("ventas@dos.mx"), "a carrier's email never reaches another carrier in a group thread");
assert.equal(carrierChatMessage({ sender_role: "carrier", vendors: { vendor_name: "Tres" } }).sender_name, "Tres");

// The carrier API answers through these, both when listing and when posting.
const api = readFileSync(new URL("../supabase/functions/rfx-bid-api/index.ts", import.meta.url), "utf8");
assert.match(api, /\.\.\.carrierChatThread\(thread\),\s*messages: \(messagesByThread\.get\(String\(thread\.id\)\) \|\| \[\]\)\.map\(carrierChatMessage\)/);
assert.match(api, /thread: carrierChatThread\(thread\),\s*message: carrierChatMessage\(messageResult\.data\)/);

console.log("carrier chat view checks passed");
