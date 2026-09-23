import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// contact_history has no updated_at column. The carrier profile's support log
// selected it anyway; PostgREST rejected the query, a swallowed catch turned
// that into an empty list, and every carrier saw "no support tickets" while
// adding a follow-up failed outright. Pin the query shape and the visibility.
const source = readFileSync(new URL("../supabase/functions/carrier-profile-api/index.ts", import.meta.url), "utf8");

const loader = source.slice(source.indexOf("async function loadSupportTickets("), source.indexOf("async function loadRequest("));
assert.match(loader, /from\("contact_history"\)/);
assert.doesNotMatch(loader, /updated_at/, "contact_history has no updated_at column");

const followup = source.slice(source.indexOf('action === "add_ticket_followup"'), source.indexOf('Unsupported carrier profile action'));
const historyUpdate = followup.slice(followup.indexOf('.from("contact_history")\n        .update('));
assert.ok(historyUpdate.length > 0, "the follow-up must update contact_history");
assert.doesNotMatch(historyUpdate.slice(0, historyUpdate.indexOf(".eq(\"id\", ticketId)")), /updated_at/, "the follow-up must not write updated_at");

assert.doesNotMatch(source, /loadSupportTickets\([^)]*\)\.catch\(\(\) => \[\]\)/, "a failing support log must be logged, not swallowed");
assert.match(source, /console\.error\("carrier-profile-api support tickets failed:/);

console.log("Carrier profile support log tests passed (no updated_at on contact_history, failures logged).");
