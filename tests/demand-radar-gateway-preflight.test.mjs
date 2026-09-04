import assert from "node:assert/strict";

import {
  evaluateDemandRadarGatewayPreflight,
  DEMAND_RADAR_ACTION_CONTRACT_PATH,
  RATEWARE_PRODUCTION_PROJECT_REF,
} from "../tools/demand-radar-gateway-preflight.mjs";

const base = {
  gatewayFunctionPresent: true,
  actionContractPresent: true,
  workingTreeClean: true,
  productionReadsAuthorized: true,
  gatewayWritesEnabled: false,
  writesEnabled: false,
  productionWritesAuthorized: false,
  actualSha: "abc123",
  expectedSha: "abc123",
};

const url = (ref) => `https://${ref}.supabase.co/functions/v1/demand-radar-shipper-crm-gateway`;

assert.equal(DEMAND_RADAR_ACTION_CONTRACT_PATH, "supabase/functions/_shared/action-contract-demand-radar-gateway.mjs");

const missingAuthorization = evaluateDemandRadarGatewayPreflight({
  ...base,
  targetProjectRef: RATEWARE_PRODUCTION_PROJECT_REF,
  endpoint: url(RATEWARE_PRODUCTION_PROJECT_REF),
  productionReadsAuthorized: false,
});
assert.equal(missingAuthorization.ok, false);
assert.ok(missingAuthorization.blockers.includes("production_read_authorized"));

const mismatch = evaluateDemandRadarGatewayPreflight({
  ...base,
  targetProjectRef: "ratewarestage123",
  endpoint: url("otherstage456"),
});
assert.equal(mismatch.ok, false);
assert.ok(mismatch.blockers.includes("existing_rateware_only"));
assert.ok(mismatch.blockers.includes("endpoint_matches_target"));

const writesOpen = evaluateDemandRadarGatewayPreflight({
  ...base,
  targetProjectRef: RATEWARE_PRODUCTION_PROJECT_REF,
  endpoint: url(RATEWARE_PRODUCTION_PROJECT_REF),
  writesEnabled: true,
});
assert.equal(writesOpen.ok, false);
assert.ok(writesOpen.blockers.includes("writes_locked"));

const ready = evaluateDemandRadarGatewayPreflight({
  ...base,
  targetProjectRef: RATEWARE_PRODUCTION_PROJECT_REF,
  endpoint: url(RATEWARE_PRODUCTION_PROJECT_REF),
});
assert.equal(ready.ok, true);
assert.deepEqual(ready.blockers, []);
assert.equal(ready.externalWrites, 0);
assert.equal(ready.newCloudProjects, 0);
assert.equal(ready.additionalFixedMonthlyCostUsd, 0);

console.log("Demand Radar gateway preflight tests passed.");
