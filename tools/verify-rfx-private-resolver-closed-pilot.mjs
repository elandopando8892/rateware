import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const [raw, runbook, health, healthWrapper, disable, controlsSql, evidenceSql] = await Promise.all([
  read("docs/rfx-private-resolver-closed-pilot.json"),
  read("docs/rfx-private-resolver-closed-pilot-runbook.md"),
  read("tools/check-rfx-private-resolver-staging-health.mjs"),
  read("tools/run-rfx-private-resolver-staging-health.ps1"),
  read("tools/disable-rfx-private-resolver-staging.ps1"),
  read("supabase/staging/marksman-loads-private-resolver-closed-pilot.sql"),
  read("supabase/staging/marksman-loads-private-resolver-evidence.sql"),
]);
const receipt = JSON.parse(raw);

assert.equal(receipt.contractVersion, "rateware.private-resolver.closed-pilot.v1");
assert.equal(receipt.pilotVersion, "beta-10.4");
assert.equal(receipt.authorization.productionAuthorized, false);
assert.equal(receipt.authorization.realBusinessEffectsAuthorized, false);
assert.equal(receipt.target.branchName, "marksman-loads-staging");
assert.equal(receipt.target.gitBranch, "codex/marksman-loads-private-resolver-10-4");
assert.equal(receipt.target.persistent, true);
assert.equal(receipt.target.withProductionData, false);
assert.deepEqual(receipt.target.retainedFunctions, ["rfx-private-resolver"]);

assert.equal(receipt.networkControls.currentState, "RESTRICTED_CURRENT_OPERATOR_HOST");
assert.equal(receipt.networkControls.openIpv4Present, false);
assert.equal(receipt.networkControls.openIpv6Present, false);
assert.equal(receipt.networkControls.currentOperatorHostAllowed, true);
assert.equal(receipt.networkControls.cidrRecordedInEvidence, false);
assert.equal(receipt.networkControls.resolverVerifiedAfterRestriction, true);

assert.equal(receipt.monitoring.ownerRole, "AUTHORIZED_MARKSMAN_LOADS_ADMIN");
assert.equal(receipt.monitoring.cadenceMinutesDuringPilot, 15);
assert.equal(receipt.monitoring.namedHumanRequiredForProduction, true);
assert.equal(receipt.monitoring.processingExpired, 0);
assert.equal(receipt.monitoring.failed24h, 0);
assert.equal(receipt.monitoring.sensitivePayloadStored, false);
assert.equal(receipt.monitoring.externalExecutionPossible, false);

assert.equal(receipt.canary.status, "PASSED");
assert.equal(receipt.canary.persistedReplay, "PASSED");
assert.equal(receipt.canary.tampering, "BLOCKED");
assert.equal(receipt.canary.liveExecution, "BLOCKED");
assert.equal(receipt.canary.finalCanaryState, "DISABLED");
assert.equal(receipt.canary.bidRows, 0);
assert.equal(receipt.releaseControls.productionApproved, false);
assert.equal(receipt.releaseControls.releaseReadyForProduction, false);
assert.equal(receipt.decision.closedPilotReady, true);
assert.equal(receipt.decision.productionReady, false);
assert.ok(Object.values(receipt.businessEffects).every((value) => value === false));

assert.match(runbook, /every 15 minutes/i);
assert.match(runbook, /processingExpired > 0/);
assert.match(runbook, /zero bid rows/i);
assert.match(health, /get_rfx_private_resolver_ledger_health/);
assert.match(health, /releaseReady, false/);
assert.match(healthWrapper, /branches get/);
assert.match(disable, /RATEWARE_PRIVATE_RESOLVER_CANARY_ENABLED=false/);
assert.match(controlsSql, /Never add this file to supabase\/migrations/i);
assert.match(controlsSql, /production_approved = false/i);
assert.match(evidenceSql, /closed_pilot_controls/i);
assert.doesNotMatch(raw + runbook + health + healthWrapper + disable + controlsSql + evidenceSql, /eyJ[A-Za-z0-9_-]{40,}/);
assert.doesNotMatch(raw + runbook + health + healthWrapper + disable + controlsSql + evidenceSql, /postgres(?:ql)?:\/\/[^\s]+@/i);

console.log(JSON.stringify({
  status:"PASS",
  version:receipt.pilotVersion,
  target:{name:receipt.target.branchName,persistent:true,withProductionData:false},
  network:"restricted_current_operator_host",
  monitoring:{ownerRole:receipt.monitoring.ownerRole,cadenceMinutes:15,health:"passed"},
  canary:{replay:"passed",tampering:"blocked",liveExecution:"blocked",finalState:"disabled",bids:0},
  decision:receipt.decision.status,
  productionApproved:false,
  externalBusinessEffects:false,
}, null, 2));
