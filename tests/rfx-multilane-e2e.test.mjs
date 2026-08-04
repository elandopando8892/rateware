import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bidTemplateSourceRows,
  canonicalLaneStatus,
  currentEventBookRows,
  eventInvitedLaneRows,
  reconcileBidTemplateUploadRows
} from "../src/rfx-bid-lane-scope.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const event = { id: "event-a" };
const invitation = { rfx_events: event };
const statusOf = (row) => canonicalLaneStatus(row);

function laneRow(laneId, token, extra = {}) {
  return {
    rfx_event_id: event.id,
    rfx_lane_id: laneId,
    invitation_token: token,
    participation_status: "invited",
    event: { id: event.id },
    lane: { id: laneId, lane_number: Number(laneId.replace("lane-", "")) },
    ...extra
  };
}

const initialBook = {
  invited: [
    laneRow("lane-1", "token-1"),
    laneRow("lane-2", "token-2"),
    { ...laneRow("foreign-lane", "foreign-token"), rfx_event_id: "event-b", event: { id: "event-b" } }
  ]
};

assert.deepEqual(
  currentEventBookRows(initialBook, event).map((row) => row.rfx_lane_id),
  ["lane-1", "lane-2"],
  "Initial event scope must include every invited lane and exclude other events."
);

const expandedBook = {
  invited: [
    ...initialBook.invited,
    laneRow("lane-3", "token-3")
  ]
};

const portalRows = eventInvitedLaneRows(expandedBook, invitation);
assert.equal(portalRows.length, 3, "Portal must expose the two initial lanes plus the lane appended later.");
assert.equal(new Set(portalRows.map((row) => row.rfx_lane_id)).size, 3, "Each event lane must appear once.");
assert.ok(portalRows.every((row) => row.invitation_token), "Every portal lane must have its own invitation token.");

const xlsxRows = bidTemplateSourceRows(expandedBook, invitation, statusOf);
assert.deepEqual(
  xlsxRows.map((row) => row.rfx_lane_id).sort(),
  ["lane-1", "lane-2", "lane-3"],
  "Bid Tools and XLSX must use all active invited lanes, including appended lanes."
);

const declinedBook = {
  invited: expandedBook.invited.map((row) => row.rfx_lane_id === "lane-2"
    ? { ...row, participation_status: "declined" }
    : row)
};
assert.deepEqual(
  bidTemplateSourceRows(declinedBook, invitation, statusOf).map((row) => row.rfx_lane_id).sort(),
  ["lane-1", "lane-3"],
  "A lane explicitly declined by the carrier must not remain actionable in Bid Tools or XLSX."
);

const allowedTemplateRows = xlsxRows.map((row) => ({
  invitation_token: row.invitation_token,
  rfx_id: "RFx-A",
  event_name: "Master package",
  lane_number: row.lane.lane_number,
  origin: `Canonical origin ${row.lane.lane_number}`,
  destination: `Canonical destination ${row.lane.lane_number}`,
  equipment: "Truck Trailer",
  service: "One Way",
  target_currency: "USD"
}));
const reconciledTemplate = reconcileBidTemplateUploadRows([
  { invitation_token: "token-1", origin: "Edited readonly origin", all_in_rate: "2900", submit_this_lane: true },
  { invitation_token: "token-2", all_in_rate: "3100", submit_this_lane: true }
], allowedTemplateRows);
assert.equal(reconciledTemplate.coverage.active, 3, "XLSX reconciliation must use the complete active RFx lane scope.");
assert.equal(reconciledTemplate.coverage.matched, 2, "XLSX reconciliation must report each matched active lane.");
assert.equal(reconciledTemplate.coverage.missing, 1, "XLSX reconciliation must report active lanes omitted from the uploaded workbook.");
assert.equal(reconciledTemplate.rows[0].origin, "Canonical origin 1", "Readonly lane context must come from Rateware, not edited spreadsheet text.");
assert.equal(reconciledTemplate.rows[0].all_in_rate, "2900", "Carrier-editable bid values must survive reconciliation.");

const unsafeTemplate = reconcileBidTemplateUploadRows([
  { invitation_token: "token-1", submit_this_lane: true },
  { invitation_token: "token-1", submit_this_lane: true },
  { invitation_token: "stale-token", submit_this_lane: true },
  { invitation_token: "", submit_this_lane: true }
], allowedTemplateRows);
assert.equal(unsafeTemplate.coverage.duplicate, 2, "Every duplicated token row must be blocked before submission.");
assert.equal(unsafeTemplate.coverage.stale, 1, "Tokens outside the active RFx must be identified as stale.");
assert.ok(unsafeTemplate.rows.slice(0, 2).every((row) => row.scope_errors.some((error) => error.includes("Duplicate"))), "Duplicate rows must carry an actionable validation error.");
assert.match(unsafeTemplate.rows[2].scope_errors.join(" "), /not active in the current RFx/, "A stale template token must require a fresh download.");
assert.match(unsafeTemplate.rows[3].scope_errors.join(" "), /Missing invitation token/, "Rows without a token must never be submitted.");

assert.equal(canonicalLaneStatus({ is_invited: true }), "invited", "A new lane invitation starts as invited.");
assert.equal(
  canonicalLaneStatus({ is_invited: true }, { total: 6, complete: 6 }),
  "agreed",
  "A fully answered fit without exceptions becomes agreed."
);
assert.equal(
  canonicalLaneStatus({ is_invited: true }, { total: 6, complete: 6, exceptions: 1 }),
  "exception",
  "Any fit exception must remain visible for procurement review."
);
assert.equal(
  canonicalLaneStatus({ is_invited: true, participation_status: "declined" }, { total: 6, complete: 6 }),
  "rejected",
  "Historical declined rows must be displayed through the canonical rejected state."
);
assert.equal(
  canonicalLaneStatus({ is_invited: true, bid_rate: 2900 }, { total: 6, complete: 6, exceptions: 1 }),
  "quoted",
  "An active quote must outrank fit state."
);
assert.equal(
  canonicalLaneStatus({ is_invited: true, participation_status: "withdrawn", bid_rate: 2900 }),
  "withdrawn",
  "A withdrawn offer must not fall back to quoted even if historical rate data remains."
);
assert.equal(
  canonicalLaneStatus({ is_invited: true, award_status: "awarded", participation_status: "withdrawn", bid_rate: 2900 }),
  "awarded",
  "A final award must outrank every participation and fit state."
);
assert.equal(
  canonicalLaneStatus({ is_invited: true, award_status: "not_awarded", bid_rate: 2900 }),
  "not_awarded",
  "A final not-awarded result must outrank the historical quote."
);
assert.equal(
  canonicalLaneStatus({ is_invited: true, award_role: "backup", bid_rate: 2900 }),
  "backup",
  "Backup remains an explicit closeout outcome without being confused with quoted."
);

const portalSource = fs.readFileSync(path.join(root, "src", "rfx-bid.js"), "utf8");
assert.match(portalSource, /bidTemplateSourceRows\(carrierBook, invitation, bookStatus\)/, "XLSX generation must use the shared event-lane scope.");
assert.match(portalSource, /isBidToolsEligibleRow\(row, \(candidate\) => bookStatus\(candidate, packagePayload\)\)/, "Quick Bid Tools must use the shared eligibility rule with route-level fit context.");

console.log("rfx-multilane-e2e.test.mjs passed");
