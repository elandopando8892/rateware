import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const path = resolve(root, "docs/rfx-private-resolver-release-review.json");
const raw = await readFile(path, "utf8");
const review = JSON.parse(raw);
const requiredGateIds = [
  "candidate_provenance",
  "local_postgres_preflight",
  "secret_custody",
  "network_controls",
  "monitoring_owner",
  "rollback_rehearsal",
  "target_environment",
  "separation_of_duties",
  "production_authorization",
];

assert.equal(review.contractVersion, "rateware.private-resolver.release-review.v1");
assert.equal(review.reviewVersion, "beta-9.8");
assert.match(review.candidate.sha, /^[0-9a-f]{40}$/);
execFileSync("git", ["merge-base", "--is-ancestor", review.candidate.sha, "HEAD"], { cwd:root, stdio:"ignore" });
assert.deepEqual(review.gates.map((gate) => gate.id).sort(), [...requiredGateIds].sort());
assert.equal(new Set(review.gates.map((gate) => gate.id)).size, requiredGateIds.length);

const satisfied = review.gates.filter((gate) => gate.satisfiedForRelease === true);
const blocked = review.gates.filter((gate) => gate.satisfiedForRelease !== true);
assert.deepEqual(satisfied.map((gate) => gate.id), ["candidate_provenance", "local_postgres_preflight"]);
assert.equal(blocked.length, 7);
assert.ok(satisfied.every((gate) => typeof gate.evidenceRef === "string" && gate.evidenceRef.length > 0));
assert.ok(blocked.every((gate) => gate.assignee === null));
assert.ok(blocked.every((gate) => gate.evidenceRef === null));

const computedReady = review.gates.every((gate) => gate.satisfiedForRelease === true);
assert.equal(computedReady, false);
assert.equal(review.decision.status, "NO_GO");
assert.equal(review.decision.releaseReady, computedReady);
assert.equal(review.decision.authorizationRequested, false);
assert.equal(review.decision.productionApproved, false);
assert.equal(review.candidate.targetEnvironment, null);
assert.equal(review.separationOfDuties.technicalReviewer, null);
assert.equal(review.separationOfDuties.releaseApprover, null);
assert.equal(review.separationOfDuties.samePrincipalAllowed, false);
assert.ok(Object.values(review.safety).every((value) => value === false));
assert.doesNotMatch(raw, /service[_-]?role.{0,20}[=:].{0,20}[A-Za-z0-9_-]{20,}/i);
assert.doesNotMatch(raw, /shared[_-]?secret.{0,20}[=:].{0,20}[A-Za-z0-9_-]{20,}/i);

console.log(JSON.stringify({
  status: "PASS",
  reviewVersion: review.reviewVersion,
  candidateSha: review.candidate.sha,
  gates: review.gates.length,
  satisfied: satisfied.length,
  blocked: blocked.length,
  decision: review.decision.status,
  releaseReady: false,
  externalEffects: false,
}, null, 2));
