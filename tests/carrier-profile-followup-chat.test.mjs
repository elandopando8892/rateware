import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// A carrier's follow-up on a support ticket used to reach no one: it was saved
// on the ticket and nothing else. It must land in the ticket's Bid Room thread
// (flagged for a reply) and be relayed to the same Google Chat thread, and a
// failed notice must never turn a saved follow-up into an error.
const source = readFileSync(new URL("../supabase/functions/carrier-profile-api/index.ts", import.meta.url), "utf8");

assert.match(source, /import \{ syncBidRoomMessageToGoogleChat \} from "\.\.\/_shared\/bid-room-google-chat\.ts";/);

const notify = source.slice(source.indexOf("async function notifyTeamOfFollowup("), source.indexOf("function logFollowupNoticeError("));
assert.ok(notify.length > 0, "notifyTeamOfFollowup must exist");
assert.match(notify, /objectRecord\(ticket\.metadata\)\.google_chat_thread_id/, "reply in the thread the ticket was mirrored to");
assert.match(notify, /\.eq\("owner_email", request\.owner_email\)/, "the thread must belong to the link's owner");
assert.match(notify, /\.eq\("vendor_id", vendor\.id\)/, "the thread must belong to this carrier");
assert.match(notify, /\.neq\("status", "archived"\)/, "archived threads are not reused");
assert.match(notify, /sender_role: "carrier"/, "the follow-up is the carrier speaking");
assert.match(notify, /needs_reply: true/, "the thread must be flagged for a reply");
assert.match(notify, /syncBidRoomMessageToGoogleChat\(supabase, thread,/, "the message must be relayed to Google Chat");
assert.match(notify, /if \(sync\.status === "error"\) console\.error\(/, "a rejected post must show up in the logs too");

const followup = source.slice(source.indexOf('action === "add_ticket_followup"'), source.indexOf("Unsupported carrier profile action"));
const savedAt = followup.indexOf("if (update.error) throw update.error;");
const noticeAt = followup.indexOf("notifyTeamOfFollowup(");
assert.ok(savedAt > 0 && noticeAt > savedAt, "the follow-up must be saved before the team is notified");
assert.match(followup, /notifyTeamOfFollowup\([^)]*\)\.catch\(logFollowupNoticeError\)/, "a failed notice must not fail the save");
assert.match(source, /console\.error\("carrier-profile-api follow-up notice failed:/, "a failed notice must be visible in the logs");

console.log("Carrier profile follow-up notice tests passed (ticket thread, carrier message, saved first, failures logged).");
