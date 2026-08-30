import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/rfx-events.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../rfx-events.html", import.meta.url), "utf8");

assert.match(source, /let reviewedDraftMessageIds = new Set\(\);/, "Delivery review should track messages reviewed in the current session");
assert.match(source, /function draftWasReviewed\(message\)[\s\S]+reviewedDraftMessageIds\.has\(String\(message\?\.id \|\| ""\)\)/, "Release readiness should resolve from the reviewed-message set");
assert.match(source, /function selectedSendableDraftIds[\s\S]+selectableEmailDrafts\(selectedDraftRows\(rows\)\)\.filter\(draftWasReviewed\)/, "Bulk email release should include only reviewed drafts");
assert.match(source, /function selectedWhatsappDraftIds[\s\S]+selectableWhatsappDrafts\(selectedDraftRows\(rows\)\)\.filter\(draftWasReviewed\)/, "Bulk WhatsApp release should include only reviewed drafts");
assert.match(source, /const reviewed = draftWasReviewed\(message\);[\s\S]+data-rfx-review-draft/, "Each queue row should render its reviewed state");
assert.match(source, /reviewedDraftMessageIds\.add\(activeDraftReviewId\);[\s\S]+renderDraftQueue\(\);/, "Opening Review should complete the local review checkpoint");
assert.match(source, /if \(checkbox\.checked[\s\S]+!reviewedDraftMessageIds\.has\(String\(id\)\)\)[\s\S]+Review this carrier message before selecting it for release\./, "Selection should reject release candidates that have not been reviewed");
assert.match(source, /if \(!draftWasReviewed\(row\)\)[\s\S]+Review this carrier message before sending\./, "Single-message email release should require review");
assert.match(source, /if \(!draftWasReviewed\(row\)\)[\s\S]+Review this carrier message before sending it through WhatsApp\./, "Single-message WhatsApp release should require review");
assert.match(html, /id="rfx-draft-review-progress"/, "Delivery Queue should expose review progress next to the release promise");

console.log("RFx Launch E2E certification contracts passed.");
