import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const raw = await readFile(resolve(root, "docs/rfx-private-resolver-staging-activation.json"), "utf8");
const activation = JSON.parse(raw);
const gateIds = [
  "user_sprint_authorization", "candidate_provenance", "local_rehearsal", "branching_capability",
  "dedicated_staging_target", "billing_acknowledgement", "github_staging_environment",
  "named_release_owners", "secret_and_network_custody", "monitoring_and_rollback_owners",
];

assert.equal(activation.contractVersion, "rateware.private-resolver.staging-activation.v1");
assert.equal(activation.activationVersion, "beta-10.1");
assert.equal(activation.authorization.authorizedScope, "sprint_10_1_readiness_inventory_and_staging_design");
assert.equal(activation.authorization.paidResourceCreationAuthorized, false);
assert.equal(activation.authorization.productionAuthorized, false);
assert.equal(activation.authorization.remoteMutationAuthorized, false);
assert.match(activation.candidate.sha, /^[0-9a-f]{40}$/);
execFileSync("git", ["merge-base", "--is-ancestor", activation.candidate.sha, "HEAD"], { cwd:root, stdio:"ignore" });

assert.equal(activation.discovery.parentProject.classification, "PRODUCTION_EXISTING");
assert.equal(activation.discovery.linkedProject, false);
assert.equal(activation.discovery.githubStagingEnvironmentObserved, false);
assert.equal(activation.discovery.secretCustodyVerified, false);
assert.deepEqual(activation.discovery.githubEnvironments, ["Preview", "Production"]);
assert.equal(activation.discovery.branches.length, 2);
assert.equal(activation.discovery.branches.find((branch) => branch.name === "fcm-gmail-staging")?.suitability, "REJECTED_PURPOSE_AND_BRANCH_MISMATCH");
assert.equal(activation.discovery.branches.find((branch) => branch.name === "main")?.suitability, "REJECTED_PRODUCTION_DEFAULT");

assert.equal(activation.targetDesign.desiredName, "marksman-loads-staging");
assert.equal(activation.targetDesign.fixtureDataOnly, true);
assert.equal(activation.targetDesign.cloneProductionData, false);
assert.equal(activation.targetDesign.selected, false);
assert.equal(activation.targetDesign.projectRef, null);
assert.equal(activation.targetDesign.billingAcknowledged, false);
assert.equal(activation.targetDesign.githubEnvironment, null);

assert.deepEqual(activation.gates.map((gate) => gate.id), gateIds);
assert.equal(new Set(activation.gates.map((gate) => gate.id)).size, gateIds.length);
const verified = activation.gates.filter((gate) => gate.status === "VERIFIED");
const blocked = activation.gates.filter((gate) => gate.status === "BLOCKED");
assert.equal(verified.length, 4);
assert.equal(blocked.length, 6);
assert.ok(verified.every((gate) => typeof gate.evidenceRef === "string" && gate.evidenceRef.length > 0));
assert.ok(blocked.every((gate) => gate.evidenceRef === null));
assert.deepEqual(activation.decision, {
  status:"ACTIVATION_PREPARED_TARGET_NOT_SELECTED",
  verifiedGates:4,
  blockedGates:6,
  remoteCanaryReady:false,
  stagingTargetSelected:false,
  stagingCreated:false,
  productionApproved:false,
});
assert.ok(Object.values(activation.safety).every((value) => value === false));
assert.doesNotMatch(raw, /service[_-]?role.{0,20}[=:].{0,20}[A-Za-z0-9_-]{20,}/i);
assert.doesNotMatch(raw, /access[_-]?token.{0,20}[=:].{0,20}[A-Za-z0-9_-]{20,}/i);

console.log(JSON.stringify({
  status:"PASS",
  activation:activation.activationVersion,
  authorization:"SPRINT_PREPARATION_ONLY",
  inventory:{ projectsObserved:1, branchesObserved:2, suitableReusableTargets:0, githubStagingEnvironment:false },
  target:{ name:activation.targetDesign.desiredName, selected:false, created:false, fixtureOnly:true },
  gates:{ verified:verified.length, blocked:blocked.length },
  decision:activation.decision.status,
  remoteCanaryReady:false,
  productionApproved:false,
  externalEffects:false,
}, null, 2));
