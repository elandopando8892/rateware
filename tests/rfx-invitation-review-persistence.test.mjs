import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("../supabase/functions/rateware-api/index.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/outreach-service.js", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/rfx-events.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260830221500_rfx_invitation_review_audit_index.sql", import.meta.url), "utf8");

assert.match(service, /fetchInvitationWaveReviews[\s\S]+list_rfx_invitation_wave_reviews/, "UI service should load persisted RFx review checkpoints");
assert.match(service, /recordInvitationWaveReview[\s\S]+record_rfx_invitation_wave_review/, "UI service should append an explicit review checkpoint");
assert.match(api, /list_rfx_invitation_wave_reviews[\s\S]+requireOwnedRfxEvent[\s\S]+rfx_event_carrier_review/, "Review reads must remain scoped to an owned RFx and audit entity");
assert.match(api, /record_rfx_invitation_wave_review[\s\S]+rfx_lane_vendors[\s\S]+vendor_id[\s\S]+saas_audit_log/, "Review writes must require carrier participation before appending audit evidence");
assert.match(api, /rfx\.invitation_carrier\.reviewed[\s\S]+rfx\.invitation_carrier\.review_revoked/, "Audit history should support reviewed and revoked states");
assert.match(api, /contact_snapshot:[\s\S]+review_version: 1/, "Each checkpoint must preserve the approved contact snapshot and schema version");
assert.match(ui, /await persistInvitationWaveReview\(vendorId, true\)[\s\S]+Review saved\. Nothing was sent\./, "UI must wait for durable evidence before presenting a completed review");
assert.match(ui, /invitationWaveReviewLoadVersion[\s\S]+loadVersion !== invitationWaveReviewLoadVersion \|\| eventId !== selectedEventId/, "Late review-history responses must not leak into another RFx");
assert.match(ui, /Carrier CRM contact saved, but review was not saved\./, "Partial CRM success must not be misreported as a durable review");
assert.match(migration, /create index if not exists saas_audit_log_rfx_carrier_review_idx[\s\S]+entity_type = 'rfx_event_carrier_review'/, "Audit lookup should have an additive scoped index");

console.log("RFx invitation review persistence contracts passed.");
