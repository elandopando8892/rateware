import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parseRouteMatrix } from "../tools/platform55-visual-parity-contract.mjs";
import * as evidence from "../tools/platform55-p3v2-evidence.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const MATRIX = new URL("../docs/platform55-visual-parity/p3v-route-matrix.csv", import.meta.url);
const REVIEW = new URL(`../docs/platform55-visual-parity/evidence/p3v2/${evidence.P3V2_PRODUCT_SHA}/independent-review.md`, import.meta.url);
const rows = async () => parseRouteMatrix(await readFile(MATRIX, "utf8"));

test("binds P3-V2 to the exact squash release without requiring feature-commit ancestry", async () => {
  const git = (...args) => execFileSync("git", ["-C", ROOT, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  assert.equal(git("rev-parse", `${evidence.P3V2_FINAL_REVIEWED_HEAD}^{tree}`), evidence.P3V2_FINAL_REVIEWED_TREE);
  assert.equal(git("rev-parse", `${evidence.P3V2_PRODUCTION_RELEASE_SHA}^{tree}`), evidence.P3V2_PRODUCTION_RELEASE_TREE);
  assert.equal(evidence.P3V2_PRODUCTION_RELEASE_TREE, evidence.P3V2_FINAL_REVIEWED_TREE);
  execFileSync("git", ["-C", ROOT, "merge-base", "--is-ancestor", evidence.P3V2_PRODUCTION_RELEASE_SHA, "HEAD"], { stdio: "pipe" });
  assert.throws(
    () => execFileSync("git", ["-C", ROOT, "merge-base", "--is-ancestor", evidence.P3V2_FINAL_REVIEWED_HEAD, "HEAD"], { stdio: "pipe" }),
    /Command failed/,
    "the accepted squash path must not depend on feature-commit ancestry",
  );

  assert.deepEqual(
    evidence.validateP3V2ClosureAccreditation({ rootDir: ROOT, rows: await rows(), requireTracked: true }),
    { captures: 39, scores: { "upload-center.html": 92, "upload-history.html": 90, "staging-review.html": 93 }, routes: ["staging-review.html", "upload-center.html", "upload-history.html"] },
  );
});

test("accredits exactly the three independently reviewed P3-V2 routes", async () => {
  assert.deepEqual(
    evidence.validateP3V2ClosureAccreditation({ rootDir: ROOT, rows: await rows(), requireTracked: true }),
    { captures: 39, scores: { "upload-center.html": 92, "upload-history.html": 90, "staging-review.html": 93 }, routes: ["staging-review.html", "upload-center.html", "upload-history.html"] },
  );
});

test("rejects partial credit and vacuous P3-V2 summaries", async () => {
  for (const mutate of [
    (candidate) => { candidate.find((row) => row.route === "upload-center.html").parity_status = "unscored"; },
    (candidate) => { candidate.find((row) => row.route === "upload-history.html").gap_summary = evidence.P3V2_EVIDENCE_DIRECTORY; },
  ]) {
    const candidate = structuredClone(await rows());
    mutate(candidate);
    assert.throws(() => evidence.validateP3V2ClosureAccreditation({ rootDir: ROOT, rows: candidate, requireTracked: true }), /semantic accreditation|gap summary|reviewed routes/i);
  }
});

test("rejects noncanonical route sets and independent-review drift", async () => {
  const canonical = await rows();
  const extra = [...structuredClone(canonical), { ...structuredClone(canonical.at(-1)), route: "extra.html", page_key: "extra" }];
  assert.throws(() => evidence.validateP3V2ClosureAccreditation({ rootDir: ROOT, rows: extra, requireTracked: true }), /route matrix/i);
  const review = await readFile(REVIEW, "utf8");
  assert.throws(() => evidence.validateP3V2ClosureAccreditation({ rootDir: ROOT, rows: canonical, independentReview: review.replace("reviewer_verdict: GO", "reviewer_verdict: NO-GO"), requireTracked: true }), /independent review|digest|verdict/i);
});

test("rejects visual evidence drift through the P3-V2 closure gate", async () => {
  const loaded = evidence.loadP3V2Evidence(ROOT);
  const canonical = await rows();
  const drifted = structuredClone(loaded.manifest);
  drifted.captures[0].scroll_y = 1;
  assert.throws(() => evidence.validateP3V2ClosureAccreditation({ rootDir: ROOT, rows: canonical, ...loaded, manifest: drifted, requireTracked: true }), /manifest|scroll|geometry|digest/i);
  assert.throws(
    () => evidence.validateP3V2ClosureAccreditation({ rootDir: ROOT, rows: canonical, ...loaded, designReview: `${loaded.designReview}\nFABRICATED REVIEW DRIFT\n`, requireTracked: true }),
    /tracked file|exact tracked/i,
  );
  assert.throws(
    () => evidence.validateP3V2ClosureAccreditation({ rootDir: ROOT, rows: canonical, requireTracked: false }),
    /requires tracked evidence/i,
  );
});
