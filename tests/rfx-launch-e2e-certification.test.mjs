import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/rfx-events.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../rfx-events.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

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
assert.match(html, /id="rfx-wave-lifecycle"/, "Delivery Queue should expose the selected Invitation Wave lifecycle");
assert.match(html, /id="rfx-wave-readiness-summary"/, "Delivery Queue should keep release readiness visible beside carrier review");
assert.match(html, /id="rfx-continue-wave-review"[^>]+disabled/, "Continue review must begin disabled until a reviewable draft exists");
assert.match(source, /function renderInvitationWaveWorkspace\(rows = \[\], carrierRows = deliveryParticipationRows\)[\s\S]+Nothing sends without confirmation\./, "Invitation Wave should calculate review, blocker, release, delivery, and response readiness without implying automatic send");
assert.match(source, /continueWaveReviewButton\?\.addEventListener\("click"[\s\S]+!draftWasReviewed\(message\)[\s\S]+renderDraftQueue\(\)/, "Continue review should open the next unreviewed carrier message");
assert.match(source, /const orderedRows = \[\.\.\.rows\]\.sort[\s\S]+Needs attention[\s\S]+Ready for review[\s\S]+Archived history/, "Carrier review should surface attention items before release-ready rows and keep archived history separate");
assert.match(source, /document\.body\.classList\.toggle\("rfx-wave-review-active", nextView === "queue"\)/, "Message Queue should enter a focused wave-review layout without changing other Launch workspaces");
assert.match(html, /class="rfx-wave-advanced-filters"[\s\S]+<summary>All statuses<\/summary>/, "Detailed lifecycle filters should stay behind one compact status control");
assert.match(styles, /rfx-wave-review-active \.rfx-launch-workspace-tabs[\s\S]+rfx-wave-review-active \.rfx-delivery-view-tabs[\s\S]+display: none/, "Focused wave review should remove redundant workspace and delivery tab bands");
assert.match(styles, /rfx-wave-lifecycle-step > b[\s\S]+border-radius: 50%/, "Invitation Wave lifecycle should use the selected circular step treatment");
assert.match(html, /class="rfx-wave-shell-nav"[\s\S]+Home[\s\S]+Launch[\s\S]+Inbox[\s\S]+Rates[\s\S]+Network[\s\S]+Analytics[\s\S]+Admin/, "Focused Invitation Wave should use the selected Launch navigation shell");
assert.match(source, /deliveryParticipationRows\.slice\(0, 18\)[\s\S]+data-rfx-wave-carrier-select/, "Invitation Wave should show RFx carrier participants when no delivery drafts exist");
assert.match(source, /rfxOpenDeliveryQueueButton\?\.addEventListener[\s\S]+deliveryParticipationStatus = "all";[\s\S]+draftQueueTrackingStatus = "all";/, "Opening Invitation Wave should load the full RFx audience instead of an empty drafted-only subset");

console.log("RFx Launch E2E certification contracts passed.");
