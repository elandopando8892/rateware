import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  EXPECTED_P2_S5_MANIFEST_SHA256,
  EXPECTED_P2_S5_SUBJECT,
  validateP2S5Evidence,
  validateP2S5Manifest
} from "../tools/platform55-intelligence-admin-evidence.mjs";

const manifestPath = `docs/platform55-evidence/p2-s5/${EXPECTED_P2_S5_SUBJECT}/manifest.json`;
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

test("anchors the exact 36-capture Intelligence and Administration matrix", async () => {
  assert.equal(EXPECTED_P2_S5_SUBJECT, "36a8643e9eca319a5a4b931a6ec0d2272cee3e1b");
  assert.equal(EXPECTED_P2_S5_MANIFEST_SHA256, "1203446ce4d15aec7293b1cbc55487595d1fc68a81493ab978e7764bfa1122a4");
  const result = validateP2S5Manifest(manifest);
  assert.equal(result.captureCount, 36);
  assert.equal(result.sourceCount, 19);
  const evidence = await validateP2S5Evidence({ rootDir: process.cwd() });
  assert.equal(evidence.captureCount, 36);
  assert.equal(evidence.sourceCount, 19);
  assert.equal(evidence.subject, EXPECTED_P2_S5_SUBJECT);
  assert.equal(
    manifest.captures.every((capture) => capture.opposite_state_visible === false),
    true,
    "every capture must prove that its opposite state is not visible"
  );
});

test("pins content-addressed evidence JSON to LF in clean Windows worktrees", () => {
  for (const path of [
    manifestPath,
    "docs/release/evidence/2026-08-22-p2-s4-semantic-closure.json"
  ]) {
    assert.equal(
      execFileSync("git", ["check-attr", "eol", "--", path], { encoding: "utf8" }).trim(),
      `${path}: eol: lf`,
      `${path} must materialize byte-identically on Windows`
    );
  }
});

test("rejects fabricated or weakened Intelligence and Administration evidence", () => {
  const withConsoleError = structuredClone(manifest);
  withConsoleError.captures[0].console_errors = 1;
  assert.throws(() => validateP2S5Manifest(withConsoleError), /console_errors/);

  const duplicatedCapture = structuredClone(manifest);
  duplicatedCapture.captures[1] = structuredClone(duplicatedCapture.captures[0]);
  assert.throws(() => validateP2S5Manifest(duplicatedCapture), /capture matrix/);

  const sourceDrift = structuredClone(manifest);
  sourceDrift.source_git_blobs[Object.keys(sourceDrift.source_git_blobs)[0]] = "0".repeat(40);
  assert.throws(() => validateP2S5Manifest(sourceDrift), /source_git_blobs/);

  const hiddenState = structuredClone(manifest);
  hiddenState.captures[0].state_intersection_ratio = 0;
  assert.throws(() => validateP2S5Manifest(hiddenState), /state_intersection_ratio/);

  const publicLeak = structuredClone(manifest);
  const entryCapture = publicLeak.captures.find((capture) => capture.kind === "entry");
  entryCapture.private_controls = 1;
  assert.throws(() => validateP2S5Manifest(publicLeak), /private_controls/);

  const overlappingState = structuredClone(manifest);
  overlappingState.captures[0].opposite_state_visible = true;
  assert.throws(() => validateP2S5Manifest(overlappingState), /opposite_state_visible/);
});

test("binds all six S5 routes to the immutable browser evidence", async () => {
  const lines = (await readFile("docs/platform55-shell-route-map.csv", "utf8")).trim().split(/\r?\n/);
  const headers = lines.shift().split(",");
  const rows = lines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [headers[index], value])));
  const s5Rows = rows.filter((row) => row.owner_sprint === "P2-S5");
  assert.equal(s5Rows.length, 6);
  for (const row of s5Rows) {
    assert.equal(row.status, "verified", `${row.route} must be verified`);
    assert.equal(row.evidence, manifestPath, `${row.route} must cite the immutable manifest`);
  }
});
