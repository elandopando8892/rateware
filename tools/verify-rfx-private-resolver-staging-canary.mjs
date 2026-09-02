import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const [raw, fixture, canaryScript, operatorScript] = await Promise.all([
  read("docs/rfx-private-resolver-staging-canary.json"),
  read("supabase/staging/marksman-loads-private-resolver-fixture.sql"),
  read("tools/run-rfx-private-resolver-staging-canary.mjs"),
  read("tools/configure-rfx-private-resolver-staging.ps1"),
]);
const receipt = JSON.parse(raw);

assert.equal(receipt.contractVersion, "rateware.private-resolver.staging-canary.v1");
assert.equal(receipt.canaryVersion, "beta-10.2");
assert.equal(receipt.authorization.paidBranchAuthorized, true);
assert.equal(receipt.authorization.stagingMutationAuthorized, true);
assert.equal(receipt.authorization.productionAuthorized, false);
assert.match(receipt.candidate.sourceSha, /^[0-9a-f]{40}$/);
assert.match(receipt.candidate.deploymentBaseSha, /^[0-9a-f]{40}$/);
assert.match(receipt.candidate.functionBundleSha256, /^[0-9a-f]{64}$/);
execFileSync("git", ["merge-base", "--is-ancestor", receipt.candidate.sourceSha, "HEAD"], { cwd:root, stdio:"ignore" });

assert.equal(receipt.target.branchName, "marksman-loads-staging");
assert.equal(receipt.target.persistent, true);
assert.equal(receipt.target.withProductionData, false);
assert.equal(receipt.target.previewProjectStatus, "ACTIVE_HEALTHY");
assert.equal(receipt.target.controlPlaneWorkflowStatus, "MIGRATIONS_FAILED_AUTO_PATH");
assert.equal(receipt.target.manualResolverPath, "VERIFIED");
assert.equal(receipt.githubEnvironment.name, "Staging");
assert.equal(receipt.githubEnvironment.allowedBranch, "codex/marksman-loads-private-resolver-10-2");

assert.equal(receipt.automaticMigrationFailure.preserved, true);
assert.equal(receipt.automaticMigrationFailure.sqlState, "42P10");
assert.equal(receipt.automaticMigrationFailure.productionTouched, false);
assert.equal(receipt.fixtureSchema.fixtureOnly, true);
assert.equal(receipt.fixtureSchema.bidRows, 0);
assert.equal(receipt.fixtureSchema.resolverMigrations.length, 4);
assert.deepEqual(receipt.isolation.retainedFunctions, ["rfx-private-resolver"]);
assert.equal(receipt.isolation.inheritedFunctionsRemoved, 33);
assert.equal(receipt.isolation.schedulerPresent, false);
assert.equal(receipt.isolation.requestBodyColumns, 0);

assert.equal(receipt.canary.status, "PASSED");
assert.equal(receipt.canary.ledgerRows, 1);
assert.equal(receipt.canary.persistedReplay, "PASSED");
assert.equal(receipt.canary.liveExecution, "BLOCKED");
assert.equal(receipt.canary.tampering, "BLOCKED");
assert.equal(receipt.canary.killSwitch, "VERIFIED");
assert.equal(receipt.canary.finalCanaryState, "DISABLED");
assert.equal(receipt.releaseControls.secretCustodyVerified, true);
assert.equal(receipt.releaseControls.rollbackRehearsed, true);
assert.equal(receipt.releaseControls.productionApproved, false);
assert.equal(receipt.decision.status, "REMOTE_STAGING_CANARY_PASSED_PRODUCTION_BLOCKED");
assert.equal(receipt.decision.productionReady, false);
assert.ok(Object.values(receipt.businessEffects).every((value) => value === false));

assert.match(fixture, /Never apply this file to production/i);
assert.match(fixture, /STAGING FIXTURE CARRIER/);
assert.doesNotMatch(fixture, /@(?:gmail|hotmail|outlook|yahoo)\./i);
assert.match(canaryScript, /LIVE_EXECUTION_DISABLED/);
assert.match(canaryScript, /CANARY_EXECUTION_DISABLED/);
assert.match(operatorScript, /finalCanaryState = "disabled"/);
assert.doesNotMatch(raw + fixture + canaryScript + operatorScript, /eyJ[A-Za-z0-9_-]{40,}/);
assert.doesNotMatch(raw + fixture + canaryScript + operatorScript, /postgres(?:ql)?:\/\/[^\s]+@/i);

console.log(JSON.stringify({
  status:"PASS",
  canary:receipt.canaryVersion,
  target:{name:receipt.target.branchName,ref:receipt.target.branchProjectRef,persistent:true,withProductionData:false},
  schema:{fixtureOnly:true,bids:0,ledgerRows:1},
  function:{name:"rfx-private-resolver",version:receipt.candidate.functionVersion},
  controls:{replay:"passed",tampering:"blocked",liveExecution:"blocked",killSwitch:"verified_and_disabled"},
  decision:receipt.decision.status,
  productionApproved:false,
  externalBusinessEffects:false,
}, null, 2));
