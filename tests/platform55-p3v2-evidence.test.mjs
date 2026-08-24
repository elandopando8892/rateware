import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { P3V2_EVIDENCE_DIRECTORY, loadP3V2Evidence, validateP3V2Evidence } from "../tools/platform55-p3v2-evidence.mjs";
test("accepts the complete product-addressed P3-V2 evidence", () => { const evidence = loadP3V2Evidence(); assert.deepEqual(validateP3V2Evidence({ ...evidence, rootDir: process.cwd() }), { captures: 39, scores: { "upload-center.html": 92, "upload-history.html": 90, "staging-review.html": 93 } }); });
test("rejects screenshot, candidate, matrix, source, and score drift", (t) => {
  const evidence = loadP3V2Evidence(); const temporary = mkdtempSync(join(tmpdir(), "rateware-p3v2-evidence-")); t.after(() => rmSync(temporary, { recursive: true, force: true })); cpSync(P3V2_EVIDENCE_DIRECTORY, temporary, { recursive: true });
  const screenshot = join(temporary, evidence.manifest.captures[0].file); const bytes = readFileSync(screenshot); bytes[bytes.length - 1] ^= 1; writeFileSync(screenshot, bytes); assert.throws(() => validateP3V2Evidence({ ...evidence, rootDir: process.cwd(), evidenceDirectory: temporary }), /screenshot/i);
  for (const [mutate, pattern] of [[(m) => { m.product_sha = "f".repeat(40); }, /candidate|product/i], [(m) => { m.captures[0].state = "unknown"; }, /state|matrix/i], [(m) => { m.captures[0].viewport = [800, 600]; }, /viewport|matrix/i], [(m) => { m.source_blobs["upload-center.html"] = "f".repeat(40); }, /source/i]]) { const manifest = structuredClone(evidence.manifest); mutate(manifest); assert.throws(() => validateP3V2Evidence({ ...evidence, rootDir: process.cwd(), manifest }), pattern); }
  assert.throws(() => validateP3V2Evidence({ ...evidence, rootDir: process.cwd(), designReview: evidence.designReview.replace('"shell_frame":19', '"shell_frame":1') }), /score|accepted/i); assert.throws(() => validateP3V2Evidence({ ...evidence, rootDir: process.cwd(), designReview: evidence.designReview.replaceAll(evidence.manifest.product_sha, "f".repeat(40)) }), /candidate|identity/i);
});
test("tracked mode binds manifest and review to repository bytes", () => { const evidence = loadP3V2Evidence(); assert.throws(() => validateP3V2Evidence({ ...evidence, rootDir: process.cwd(), designReview: `${evidence.designReview}\n`, requireTracked: true }), /tracked|exact|not in 'HEAD'/i); });
