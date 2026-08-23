import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  EXPECTED_P2_S5_MANIFEST_SHA256,
  EXPECTED_P2_S5_SUBJECT,
  P2_S5_SURFACE_CANDIDATE,
  validateP2S5Evidence,
  validateP2S5Manifest,
  validateP2S5SurfaceCandidateBody,
  validateP2S5SurfaceReconciliation
} from "../tools/platform55-intelligence-admin-evidence.mjs";

const manifestPath = `docs/platform55-evidence/p2-s5/${EXPECTED_P2_S5_SUBJECT}/manifest.json`;
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

test("anchors the exact 36-capture Intelligence and Administration matrix", async () => {
  assert.equal(EXPECTED_P2_S5_SUBJECT, "b78f73fbcba8cad7720bf329f9d65bd20746a147");
  assert.equal(EXPECTED_P2_S5_MANIFEST_SHA256, "8320e6294aacd3af527b02cd2973b0ce4971a2ea67c3737f6838e4c67cfbda77");
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
    "docs/release/evidence/2026-08-22-p2-s4-semantic-closure.json",
    P2_S5_SURFACE_CANDIDATE.path,
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

test("accepts only the exact content-addressed P2-S5 surface candidate", async () => {
  const reviewBody = await readFile(P2_S5_SURFACE_CANDIDATE.path, "utf8");
  const review = validateP2S5SurfaceCandidateBody(reviewBody, { requireGo: false });
  const surfaceText = await readFile("docs/platform55-surface-inventory.csv", "utf8");
  const routeText = await readFile("docs/platform55-shell-route-map.csv", "utf8");
  const result = validateP2S5SurfaceReconciliation(surfaceText, routeText, review);
  assert.equal(result.surfaceCount, 56);
  assert.equal(result.routeCount, 6);
  assert.equal(review.verdict, "PENDING-INDEPENDENT-REVIEW");
  assert.equal(review.semantic_credit, "withheld");

  const genericEvidence = surfaceText.replace(
    `${P2_S5_SURFACE_CANDIDATE.path}#platform-reliability`,
    "P2-S5 maps platform-reliability to settings.html under the approved Platform55 shell migration design",
  );
  assert.throws(
    () => validateP2S5SurfaceReconciliation(genericEvidence, routeText, review),
    /content-addressed review evidence/i,
  );

  const inventedTarget = structuredClone(review);
  inventedTarget.mappings.find((mapping) => mapping.page_id === "platform-reliability").target_route = "index.html";
  assert.throws(
    () => validateP2S5SurfaceReconciliation(surfaceText, routeText, inventedTarget),
    /surface review mismatch/i,
  );
});
