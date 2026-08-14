import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildOperationsHandoffPreview, buildOperationsHandoffPreviews } from "../src/operations-handoff.js";

const readyDetail = {
  project: {
    id: "project-1",
    title: "Acme Northbound",
    customer_id: "customer-1",
    customer_name: "Acme",
    target_start_date: "2026-09-01",
    linked_rfx_event_id: "event-1"
  },
  packages: [{
    id: "package-1",
    demand_snapshot_id: "snapshot-1",
    linked_rfx_event_id: "event-1",
    rfx_package_lanes: [{ id: "package-line-1", demand_lane_id: "lane-1" }]
  }],
  demand_snapshots: [{
    id: "snapshot-1",
    rfx_demand_lanes: [{
      id: "lane-1",
      lane_key: "NLDO-LRD-53",
      origin: "Nuevo Laredo, TM",
      origin_city: "Nuevo Laredo",
      origin_state: "TM",
      origin_country: "MX",
      destination: "Laredo, TX",
      destination_city: "Laredo",
      destination_state: "TX",
      destination_country: "US",
      operating_segment: "crossborder",
      operation_type: "D2D",
      service_type: "One Way",
      equipment_type: "53 Dry Van",
      weekly_volume: 5,
      frequency: "weekly"
    }]
  }],
  award_packages: [{
    id: "award-1",
    rfx_package_id: "package-1",
    linked_rfx_event_id: "event-1",
    scenario_name: "Primary award",
    scenario_type: "best_value",
    status: "approved",
    updated_at: "2026-08-13T12:00:00.000Z",
    implementation_checklist: { commercial_award_reviewed: true, manual_fleet_rocket_entry_required: true },
    rfx_award_package_lanes: [{
      id: "award-line-1",
      lane_id: "lane-1",
      awarded_carrier_id: "carrier-1",
      backup_carrier_id: "carrier-2",
      awarded_rate: "3150",
      currency: "USD",
      awarded_capacity: "5",
      service_requirements: { tracking: "GPS" },
      accessorials: { detention: "contract" },
      accepted_exceptions: ["Pickup appointment pending"],
      implementation_notes: "Manual Fleet Rocket setup",
      status: "approved"
    }]
  }]
};

const ready = buildOperationsHandoffPreview(readyDetail, "award-1");
assert.equal(ready.readiness.status, "ready");
assert.deepEqual(ready.readiness.missing_fields, []);
assert.equal(ready.payload.schema_version, "rateware.operations_handoff.v1");
assert.equal(ready.payload.mode, "observation_only");
assert.equal(ready.payload.target_system, "fleet_rocket");
assert.equal(ready.payload.dispatch_authorized, false);
assert.equal(ready.payload.tracking_execution_authorized, false);
assert.equal(ready.payload.writeback_authorized, false);
assert.equal(ready.payload.manual_entry_required, true);
assert.equal(ready.payload.references.rfx_event_id, "event-1");
assert.equal(ready.payload.references.demand_snapshot_id, "snapshot-1");
assert.deepEqual(ready.payload.award.implementation_checklist, {
  commercial_award_reviewed: true,
  manual_fleet_rocket_entry_required: true
});
assert.equal(ready.payload.lanes[0].route.origin.city, "Nuevo Laredo");
assert.equal(ready.payload.lanes[0].route.destination.city, "Laredo");
assert.equal(ready.payload.lanes[0].award.rate, 3150);
assert.equal(ready.payload.lanes[0].award.weekly_capacity, 5);
assert.match(ready.filename, /^acme-northbound-primary-award-fleet-rocket-handoff\.json$/);
assert.equal(buildOperationsHandoffPreviews(readyDetail).length, 1);

const emptyAward = structuredClone(readyDetail);
emptyAward.award_packages[0].status = "draft";
emptyAward.award_packages[0].rfx_award_package_lanes = [];
const emptyPreview = buildOperationsHandoffPreview(emptyAward, "award-1");
assert.equal(emptyPreview.readiness.status, "blocked");
assert.ok(emptyPreview.readiness.missing_fields.includes("award.status:approved_or_implementation_ready"));
assert.ok(emptyPreview.readiness.missing_fields.includes("lanes:at_least_one_award_line"));

const unresolvedLane = structuredClone(readyDetail);
unresolvedLane.award_packages[0].rfx_award_package_lanes[0].lane_id = "unknown-lane";
const unresolvedPreview = buildOperationsHandoffPreview(unresolvedLane, "award-1");
assert.equal(unresolvedPreview.readiness.status, "blocked");
assert.ok(unresolvedPreview.readiness.missing_fields.includes("lanes[0].lane_id:unresolved"));
assert.equal(unresolvedPreview.payload.lanes[0].route, null);
assert.equal(unresolvedPreview.payload.lanes[0].operating_requirements, null);

const incompleteCommercials = structuredClone(readyDetail);
Object.assign(incompleteCommercials.award_packages[0].rfx_award_package_lanes[0], {
  awarded_carrier_id: null,
  awarded_rate: 0,
  currency: null,
  awarded_capacity: -1
});
const incompletePreview = buildOperationsHandoffPreview(incompleteCommercials, "award-1");
assert.equal(incompletePreview.readiness.status, "blocked");
for (const field of [
  "lanes[0].awarded_carrier_id",
  "lanes[0].awarded_rate:positive",
  "lanes[0].currency",
  "lanes[0].awarded_capacity:positive"
]) assert.ok(incompletePreview.readiness.missing_fields.includes(field));

assert.throws(() => buildOperationsHandoffPreview(readyDetail, "missing-award"), /Award package not found/);

const duplicateAndMalformed = structuredClone(readyDetail);
duplicateAndMalformed.award_packages[0].rfx_award_package_lanes.push({
  ...duplicateAndMalformed.award_packages[0].rfx_award_package_lanes[0],
  awarded_rate: true,
  awarded_capacity: { value: 5 }
});
const duplicatePreview = buildOperationsHandoffPreview(duplicateAndMalformed, "award-1");
assert.equal(duplicatePreview.readiness.status, "blocked");
for (const field of [
  "lanes[1].award_line_id:duplicate",
  "lanes[1].lane_id:duplicate",
  "lanes[1].awarded_rate:positive",
  "lanes[1].awarded_capacity:positive"
]) assert.ok(duplicatePreview.readiness.missing_fields.includes(field));

const unresolvedPackage = structuredClone(readyDetail);
unresolvedPackage.award_packages[0].rfx_package_id = "unknown-package";
const unresolvedPackagePreview = buildOperationsHandoffPreview(unresolvedPackage, "award-1");
assert.equal(unresolvedPackagePreview.readiness.status, "blocked");
assert.ok(unresolvedPackagePreview.readiness.missing_fields.includes("references.rfx_package_id:unresolved"));

const crossSnapshot = structuredClone(readyDetail);
crossSnapshot.demand_snapshots.push({
  id: "snapshot-2",
  rfx_demand_lanes: [{
    ...crossSnapshot.demand_snapshots[0].rfx_demand_lanes[0],
    id: "lane-2",
    lane_key: "FOREIGN-SNAPSHOT"
  }]
});
crossSnapshot.award_packages[0].rfx_award_package_lanes[0].lane_id = "lane-2";
const crossSnapshotPreview = buildOperationsHandoffPreview(crossSnapshot, "award-1");
assert.equal(crossSnapshotPreview.readiness.status, "blocked");
assert.ok(crossSnapshotPreview.readiness.missing_fields.includes("lanes[0].lane_id:unresolved"));
assert.ok(crossSnapshotPreview.readiness.missing_fields.includes("lanes[0].lane_id:not_in_rfx_package"));
assert.equal(crossSnapshotPreview.payload.lanes[0].route, null);

const eventConflict = structuredClone(readyDetail);
eventConflict.award_packages[0].linked_rfx_event_id = "event-conflict";
const eventConflictPreview = buildOperationsHandoffPreview(eventConflict, "award-1");
assert.equal(eventConflictPreview.readiness.status, "blocked");
assert.equal(eventConflictPreview.payload.references.rfx_event_id, null);
assert.ok(eventConflictPreview.readiness.missing_fields.includes("references.rfx_event_id:conflict"));

const malformedStructures = structuredClone(readyDetail);
Object.assign(malformedStructures.award_packages[0].rfx_award_package_lanes[0], {
  service_requirements: "GPS required",
  accessorials: ["detention"],
  accepted_exceptions: "critical exception"
});
const malformedStructuresPreview = buildOperationsHandoffPreview(malformedStructures, "award-1");
assert.equal(malformedStructuresPreview.readiness.status, "blocked");
for (const field of [
  "lanes[0].service_requirements:object",
  "lanes[0].accessorials:object",
  "lanes[0].accepted_exceptions:array"
]) assert.ok(malformedStructuresPreview.readiness.missing_fields.includes(field));

const emptyChecklist = structuredClone(readyDetail);
emptyChecklist.award_packages[0].implementation_checklist = {};
const emptyChecklistPreview = buildOperationsHandoffPreview(emptyChecklist, "award-1");
assert.equal(emptyChecklistPreview.readiness.status, "blocked");
assert.ok(emptyChecklistPreview.readiness.missing_fields.includes("award.implementation_checklist:not_empty"));

const helperSource = readFileSync(new URL("../src/operations-handoff.js", import.meta.url), "utf8");
const clientSource = readFileSync(new URL("../src/rfx-process.js", import.meta.url), "utf8");
assert.doesNotMatch(helperSource, /fetch\(|callRatewareApi|\.insert\(|\.update\(/);
assert.match(clientSource, /function operationsHandoffPanel\(\)/);
assert.match(clientSource, /data-rfx-handoff-preview/);
assert.match(clientSource, /data-rfx-handoff-download/);
assert.match(clientSource, /No shipment or dispatch was created/);
assert.match(clientSource, /\$\{designPanel\(\)\}[\s\S]*\$\{operationsHandoffPanel\(\)\}/);

console.log("Operations handoff tests passed.");
