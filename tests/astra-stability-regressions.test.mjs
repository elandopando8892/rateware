import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { outreachEmailCandidates, targetChannelReadiness } from "../src/outreach-contact-readiness.js";

const rfxEventsSource = readFileSync(new URL("../src/rfx-events.js", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../supabase/functions/rateware-api/index.ts", import.meta.url), "utf8");
const generateDraftsSource = apiSource.slice(
  apiSource.indexOf('if (body.action === "generate_outreach_drafts")'),
  apiSource.indexOf('if (body.action === "create_outreach_campaign")') > apiSource.indexOf('if (body.action === "generate_outreach_drafts")')
    ? apiSource.indexOf('if (body.action === "create_outreach_campaign")')
    : apiSource.indexOf('if (body.action === "list_outreach_messages")')
);

test("Bid Room uses the production-stable full-lane and eager evidence behavior", () => {
  assert.doesNotMatch(rfxEventsSource, /laneRenderLimit|RFX_LANE_RENDER_PAGE_SIZE|data-rfx-lane-load-more/);
  assert.match(rfxEventsSource, /const lanes = visibleLanes\(\);[\s\S]{0,500}lanesBody\.innerHTML = lanes\.map/);
  assert.match(rfxEventsSource, /void loadRfxCarrierFitEvidence\(\{ force: eventChanged \|\| options\?\.force === true \}\)/);
  assert.match(rfxEventsSource, /data-workbench-view-button='outreach'[\s\S]{0,300}void loadRfxCarrierFitEvidence\(\)/);
});

test("draft preparation reads WhatsApp readiness without publishing to Meta", () => {
  assert.ok(generateDraftsSource.length > 1000, "generate_outreach_drafts source block should be located");
  assert.doesNotMatch(generateDraftsSource, /publishOutreachTemplateToWhatsapp\(/);
  assert.match(generateDraftsSource, /whatsappTemplateMapping\(/);
  assert.match(generateDraftsSource, /attempted: false/);
  assert.match(apiSource, /body\.action === "publish_outreach_template_to_whatsapp"[\s\S]{0,500}publishOutreachTemplateToWhatsapp\(/);
});

test("read-only Bid Room detail load does not create a chat thread", () => {
  const loadDetailSource = rfxEventsSource.slice(
    rfxEventsSource.indexOf("async function loadDetail"),
    rfxEventsSource.indexOf("function activateWorkbenchView")
  );
  assert.doesNotMatch(loadDetailSource, /ensureSelectedEventChatThread\(/);
  assert.match(rfxEventsSource, /rfxChatStartEventThread\?\.addEventListener\("click"[\s\S]{0,700}ensureSelectedEventChatThread\(selectedEventId, \{ force: true, silent: true \}\)/);
});

test("Gmail readiness selects the first valid primary or secondary contact", () => {
  assert.deepEqual(outreachEmailCandidates({
    primary_email: "",
    secondary_emails: ["SECONDARY@Carrier.com"]
  }), ["secondary@carrier.com"]);
  assert.deepEqual(outreachEmailCandidates({
    primary_email: "not-an-email",
    secondary_emails: ["valid@carrier.com", "valid@carrier.com"]
  }), ["valid@carrier.com"]);
  assert.deepEqual(targetChannelReadiness({
    invitation: { vendors: { primary_email: "bad", secondary_emails: ["backup@carrier.com"] } }
  }, "email"), {
    ready: true,
    contact: "backup@carrier.com",
    reason: ""
  });
  assert.equal(targetChannelReadiness({ invitation: { vendors: {} } }, "email").reason, "No valid primary or secondary email");
});

test("Message and Carrier Fit expose the selected contact or block reason", () => {
  assert.match(rfxEventsSource, /ready \? readiness\.contact : readiness\.reason/);
  assert.match(rfxEventsSource, /Selected contact: \$\{contactReadiness\.contact\}/);
  assert.match(rfxEventsSource, /vendor_email: targetChannelReadiness\(target, "email"\)\.contact/);
  assert.match(apiSource, /firstEligibleOutreachEmail\([\s\S]{0,300}vendorContactEmailCandidates\(vendor\)/);
});
