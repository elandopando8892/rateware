import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const path = resolve(root, "docs/rfx-private-resolver-local-rehearsal.json");
const raw = await readFile(path, "utf8");
const rehearsal = JSON.parse(raw);
const localIds = [
  "candidate_provenance",
  "resolver_unit_suite",
  "disposable_postgres_preflight",
  "edge_typescript_check",
  "durable_rate_limit_proof",
  "kill_switch_fail_closed",
];
const remoteIds = ["provider_monitoring", "remote_rollback", "remote_staging_canary"];

assert.equal(rehearsal.contractVersion, "rateware.private-resolver.local-rehearsal.v1");
assert.equal(rehearsal.rehearsalVersion, "beta-10.0");
assert.equal(rehearsal.visibility, "internal_release_evidence");
assert.match(rehearsal.candidate.sha, /^[0-9a-f]{40}$/);
execFileSync("git", ["merge-base", "--is-ancestor", rehearsal.candidate.sha, "HEAD"], { cwd:root, stdio:"ignore" });
assert.equal(rehearsal.candidate.environmentClass, "local_disposable_only");
assert.equal(rehearsal.candidate.remoteTarget, null);
assert.equal(rehearsal.candidate.rollbackTarget, null);
assert.equal(rehearsal.candidate.fixtureDataOnly, true);

const steps = rehearsal.steps || [];
assert.equal(new Set(steps.map((step) => step.id)).size, localIds.length + remoteIds.length);
assert.deepEqual(steps.filter((step) => step.scope === "LOCAL").map((step) => step.id), localIds);
assert.deepEqual(steps.filter((step) => step.scope === "REMOTE").map((step) => step.id), remoteIds);
const local = steps.filter((step) => step.scope === "LOCAL");
const remote = steps.filter((step) => step.scope === "REMOTE");
assert.ok(local.every((step) => step.status === "VERIFIED_LOCAL" && typeof step.evidenceRef === "string" && step.evidenceRef.length > 0));
assert.ok(remote.every((step) => step.status === "BLOCKED_REMOTE" && step.evidenceRef === null));

assert.deepEqual(rehearsal.decision, {
  status:"LOCAL_REHEARSAL_COMPLETE_REMOTE_BLOCKED",
  localSteps:6,
  localStepsVerified:6,
  remoteSteps:3,
  remoteStepsBlocked:3,
  killSwitchVerifiedLocally:true,
  remoteRollbackRehearsed:false,
  stagingRehearsalAuthorized:false,
  releaseReady:false,
  productionApproved:false,
});
assert.ok(Object.values(rehearsal.safety).every((value) => value === false));
assert.doesNotMatch(raw, /service[_-]?role.{0,20}[=:].{0,20}[A-Za-z0-9_-]{20,}/i);
assert.doesNotMatch(raw, /shared[_-]?secret.{0,20}[=:].{0,20}[A-Za-z0-9_-]{20,}/i);

console.log(JSON.stringify({
  status:"PASS",
  rehearsal:rehearsal.rehearsalVersion,
  candidateSha:rehearsal.candidate.sha,
  local:{ steps:local.length, verified:local.length, killSwitch:"fail_closed_verified" },
  remote:{ steps:remote.length, blocked:remote.length, rollbackTarget:null },
  decision:rehearsal.decision.status,
  stagingRehearsalAuthorized:false,
  productionApproved:false,
  externalEffects:false,
}, null, 2));
