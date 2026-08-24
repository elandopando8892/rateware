import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  P3V1_EVIDENCE_DIRECTORY,
  loadP3V1Evidence,
  validateP3V1Evidence,
} from "../tools/platform55-p3v1-evidence.mjs";

test("accepts the exact P3-V1 product-addressed visual evidence", () => {
  const evidence = loadP3V1Evidence();
  const result = validateP3V1Evidence({ ...evidence, rootDir: process.cwd(), requireTracked: true });
  assert.equal(result.captures, 18);
  assert.deepEqual(result.scores, { "app.html": 91, "rateware.html": 90 });
});

test("rejects screenshot byte, source blob, viewport, state, score, and candidate drift", (t) => {
  const evidence = loadP3V1Evidence();

  const temporary = mkdtempSync(join(tmpdir(), "rateware-p3v1-evidence-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  cpSync(P3V1_EVIDENCE_DIRECTORY, temporary, { recursive: true });
  const screenshot = join(temporary, evidence.manifest.captures[0].file);
  const bytes = readFileSync(screenshot);
  bytes[bytes.length - 1] ^= 1;
  writeFileSync(screenshot, bytes);
  assert.throws(() => validateP3V1Evidence({ ...evidence, rootDir: process.cwd(), evidenceDirectory: temporary }), /screenshot/i);

  const sourceDrift = structuredClone(evidence.manifest);
  sourceDrift.source_blobs["app.html"] = "0".repeat(40);
  assert.throws(() => validateP3V1Evidence({ ...evidence, rootDir: process.cwd(), manifest: sourceDrift }), /source/i);

  const viewportDrift = structuredClone(evidence.manifest);
  viewportDrift.captures[0].viewport = [1280, 720];
  assert.throws(() => validateP3V1Evidence({ ...evidence, rootDir: process.cwd(), manifest: viewportDrift }), /viewport|matrix/i);

  const stateDrift = structuredClone(evidence.manifest);
  stateDrift.captures[0].state = "unknown";
  assert.throws(() => validateP3V1Evidence({ ...evidence, rootDir: process.cwd(), manifest: stateDrift }), /state|matrix/i);

  const scoreDrift = evidence.designReview.replace('"shell_frame":18', '"shell_frame":1');
  assert.throws(() => validateP3V1Evidence({ ...evidence, rootDir: process.cwd(), designReview: scoreDrift }), /score|accepted/i);

  const candidateDrift = structuredClone(evidence.manifest);
  candidateDrift.product_sha = "f".repeat(40);
  assert.throws(() => validateP3V1Evidence({ ...evidence, rootDir: process.cwd(), manifest: candidateDrift }), /candidate|product/i);

  const scoreCandidateDrift = evidence.designReview.replaceAll(
    `"candidate_sha":"${evidence.manifest.product_sha}"`,
    `"candidate_sha":"${"f".repeat(40)}"`,
  );
  assert.throws(
    () => validateP3V1Evidence({ ...evidence, rootDir: process.cwd(), designReview: scoreCandidateDrift, requireTracked: true }),
    /candidate|product/i,
  );
});

test("binds the evaluated design review to the tracked file bytes", () => {
  const evidence = loadP3V1Evidence();
  assert.throws(
    () => validateP3V1Evidence({ ...evidence, rootDir: process.cwd(), designReview: `${evidence.designReview}\n`, requireTracked: true }),
    /tracked|exact/i,
  );
});
