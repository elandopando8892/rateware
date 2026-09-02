import assert from "node:assert/strict";

import {
  evaluateDemandRadarGatewayPreflight,
  RATEWARE_PRODUCTION_PROJECT_REF,
} from "../tools/demand-radar-gateway-preflight.mjs";

const base = {
  gatewayFunctionPresent: true,
  migrationPresent: true,
  actionContractPresent: true,
  workingTreeClean: true,
  writesEnabled: false,
  productionWritesAuthorized: false,
  actualSha: "abc123",
  expectedSha: "abc123",
};

const url = (ref) => `https://${ref}.supabase.co/functions/v1/demand-radar-shipper-crm-gateway`;

const production = evaluateDemandRadarGatewayPreflight({
  ...base,
  targetProjectRef: RATEWARE_PRODUCTION_PROJECT_REF,
  endpoint: url(RATEWARE_PRODUCTION_PROJECT_REF),
});
assert.equal(production.ok, false);
assert.ok(production.blockers.includes("target_non_production"));

const mismatch = evaluateDemandRadarGatewayPreflight({
  ...base,
  targetProjectRef: "ratewarestage123",
  endpoint: url("otherstage456"),
});
assert.equal(mismatch.ok, false);
assert.ok(mismatch.blockers.includes("endpoint_matches_target"));

const writesOpen = evaluateDemandRadarGatewayPreflight({
  ...base,
  targetProjectRef: "ratewarestage123",
  endpoint: url("ratewarestage123"),
  writesEnabled: true,
});
assert.equal(writesOpen.ok, false);
assert.ok(writesOpen.blockers.includes("writes_locked"));

const ready = evaluateDemandRadarGatewayPreflight({
  ...base,
  targetProjectRef: "ratewarestage123",
  endpoint: url("ratewarestage123"),
});
assert.equal(ready.ok, true);
assert.deepEqual(ready.blockers, []);
assert.equal(ready.externalWrites, 0);

console.log("Demand Radar gateway preflight tests passed.");

