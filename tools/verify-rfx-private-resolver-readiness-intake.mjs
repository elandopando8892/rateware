import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const path = resolve(root, "docs/rfx-private-resolver-readiness-intake.json");
const raw = await readFile(path, "utf8");
const intake = JSON.parse(raw);
const requiredRoles = ["technical_reviewer", "release_approver", "security_owner", "platform_owner", "monitoring_owner", "rollback_owner", "product_owner"];
const requiredEvidence = ["secret_custody", "network_controls", "monitoring_alerts", "rollback_rehearsal", "environment_isolation", "four_eyes_review", "production_authorization"];

assert.equal(intake.contractVersion, "rateware.private-resolver.readiness-intake.v1");
assert.equal(intake.intakeVersion, "beta-9.9");
assert.match(intake.parentReview.candidateSha, /^[0-9a-f]{40}$/);
execFileSync("git", ["merge-base", "--is-ancestor", intake.parentReview.candidateSha, "HEAD"], { cwd:root, stdio:"ignore" });
assert.deepEqual(intake.roles.map((role) => role.id).sort(), [...requiredRoles].sort());
assert.deepEqual(intake.evidenceRequests.map((item) => item.id).sort(), [...requiredEvidence].sort());
assert.equal(new Set(intake.roles.map((role) => role.id)).size, requiredRoles.length);
assert.equal(new Set(intake.evidenceRequests.map((item) => item.id)).size, requiredEvidence.length);
assert.ok(intake.roles.every((role) => role.required === true && role.assignment === null));
assert.ok(intake.evidenceRequests.every((item) => item.status === "MISSING"));
assert.ok(intake.evidenceRequests.every((item) => item.evidenceRef === null && item.capturedAt === null && item.containsSecretValues === false));
assert.ok(intake.evidenceRequests.every((item) => requiredRoles.includes(item.ownerRoleId)));

const env = intake.environmentPlan;
assert.equal(env.desiredClass, "staging");
assert.equal(env.selected, false);
for (const key of ["strategy", "projectRef", "gitEnvironment", "region"]) assert.equal(env[key], null);
assert.equal(env.billingAcknowledged, false);
assert.equal(env.fixtureDataOnly, true);
assert.equal(env.productionDataAllowed, false);

const assignedRoles = intake.roles.filter((role) => role.assignment !== null).length;
const verifiedEvidence = intake.evidenceRequests.filter((item) => item.status === "VERIFIED").length;
const openItems = (intake.roles.length - assignedRoles) + (intake.evidenceRequests.length - verifiedEvidence) + (env.selected ? 0 : 1);
assert.equal(intake.decision.assignedRoles, assignedRoles);
assert.equal(intake.decision.verifiedEvidence, verifiedEvidence);
assert.equal(intake.decision.openItems, openItems);
assert.equal(openItems, 15);
assert.equal(intake.decision.status, "INTAKE_INCOMPLETE");
assert.equal(intake.decision.stagingRehearsalReady, false);
assert.equal(intake.decision.stagingRehearsalAuthorized, false);
assert.equal(intake.decision.productionReleaseReady, false);
assert.equal(intake.decision.productionApproved, false);
assert.ok(Object.values(intake.safety).every((value) => value === false));
assert.doesNotMatch(raw, /"(?:secretValue|accessToken|serviceRoleKey|password)"\s*:/i);

console.log(JSON.stringify({
  status: "PASS",
  intakeVersion: intake.intakeVersion,
  candidateSha: intake.parentReview.candidateSha,
  assignedRoles,
  verifiedEvidence,
  environmentSelected: env.selected,
  openItems,
  decision: intake.decision.status,
  stagingRehearsalAuthorized: false,
  productionApproved: false,
  externalEffects: false
}, null, 2));
