import assert from "node:assert/strict";
import test from "node:test";
import { fingerprint } from "../tools/action-contract-lib.mjs";
import {
  RELEASE_PREFLIGHT_CHECKS,
  validateCandidate,
  validatePreflightResult,
} from "../tools/release-preflight.mjs";

const sha = "9b2240ce8982e057f038198069ea3dfec99b245c";

test("release preflight binds execution to the exact checked-out candidate", () => {
  assert.equal(validateCandidate(sha, sha), sha);
  assert.throws(() => validateCandidate("main", sha), /exact 40-character Git SHA/);
  assert.throws(() => validateCandidate("f".repeat(40), sha), /does not match checked-out HEAD/);
});

test("authorization fingerprints are stable across Windows and Unix line endings", () => {
  const unix = "const body = `first\nsecond`;\nreturn body;\n";
  const windows = unix.replaceAll("\n", "\r\n");
  assert.equal(fingerprint(windows), fingerprint(unix));
});

test("release preflight requires every governed check and a clean tracked tree", () => {
  const passing = {
    schema_version: 1,
    mode: "release_preflight",
    candidate_sha: sha,
    tracked_tree_clean: true,
    checks: RELEASE_PREFLIGHT_CHECKS.map(({ id }) => ({ id, status: "pass", duration_ms: 1 })),
    verdict: "GO",
  };
  assert.equal(validatePreflightResult(passing), passing);
  assert.throws(() => validatePreflightResult({ ...passing, tracked_tree_clean: false }), /not clean/);
  assert.throws(() => validatePreflightResult({ ...passing, checks: passing.checks.slice(1) }), /incomplete/);
  assert.throws(() => validatePreflightResult({ ...passing, verdict: "NO_GO" }), /must be GO/);
});
