import assert from "node:assert/strict";
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
  assert.equal(EXPECTED_P2_S5_SUBJECT, "649c50f9402d96e4310f570eda471d5af432d3fc");
  assert.equal(EXPECTED_P2_S5_MANIFEST_SHA256, "5619a614472259f183c0d4d5d8de1cfc82fb7cc374dd5b1b31d6064922703f14");
  const result = validateP2S5Manifest(manifest);
  assert.equal(result.captureCount, 36);
  assert.equal(result.sourceCount, 19);
  const evidence = await validateP2S5Evidence({ rootDir: process.cwd() });
  assert.equal(evidence.captureCount, 36);
  assert.equal(evidence.sourceCount, 19);
  assert.equal(evidence.subject, EXPECTED_P2_S5_SUBJECT);
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
