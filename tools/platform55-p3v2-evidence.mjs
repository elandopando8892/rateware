import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { P3V2_SOURCE_PATHS, P3V2_SPECS, validateP3V2Manifest } from "./platform55-p3v-v2-browser-certification.mjs";
import { validateP3V2SourceGitState } from "./platform55-p3v2-source-supersession.mjs";
import { evaluateVisualParityScore } from "./platform55-visual-parity-contract.mjs";

export const P3V2_PRODUCT_SHA = "c4009df2f27b7e286ad8d9607a5a2ded7c40635b";
export const P3V2_PRODUCT_TREE = "2b481c63034739faf47422f0b3a340e74b32423e";
export const P3V2_MANIFEST_SHA256 = "b6746221a96c2338fc8af264fc31f4ef4478565d16f7435dc2a0144c82c3d67c";
export const P3V2_EVIDENCE_DIRECTORY = `docs/platform55-visual-parity/evidence/p3v2/${P3V2_PRODUCT_SHA}`;
const EXPECTED_SCORES = Object.freeze({ "upload-center.html": 92, "upload-history.html": 90, "staging-review.html": 93 });
const REPRESENTATIVE = Object.freeze({ "upload-center.html": "upload-center-loaded-1440x900.png", "upload-history.html": "upload-history-loaded-1440x900.png", "staging-review.html": "staging-review-loaded-1440x900.png" });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (root, args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const inside = (root, candidate) => { const value = relative(root, candidate); return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value)); };
function parseScores(body) {
  if (typeof body !== "string") throw new Error("P3-V2 design review must be text");
  const records = [...body.matchAll(/```json\s*([\s\S]*?)```/g)].map((match) => JSON.parse(match[1]));
  if (records.length !== 3 || new Set(records.map(({ route }) => route)).size !== 3) throw new Error("P3-V2 design review must contain exactly three route score records");
  return records;
}
export function loadP3V2Evidence(rootDir = process.cwd()) {
  const evidenceDirectory = resolve(rootDir, P3V2_EVIDENCE_DIRECTORY);
  return { manifest: JSON.parse(readFileSync(resolve(evidenceDirectory, "manifest.json"), "utf8")), designReview: readFileSync(resolve(evidenceDirectory, "design-review.md"), "utf8"), evidenceDirectory };
}
export function validateP3V2Evidence({ rootDir = process.cwd(), manifest, designReview, evidenceDirectory = resolve(rootDir, P3V2_EVIDENCE_DIRECTORY), requireTracked = false }) {
  const root = resolve(rootDir); const directory = resolve(evidenceDirectory); const checked = validateP3V2Manifest(manifest);
  if (!checked.ok) throw new Error(`invalid P3-V2 manifest: ${checked.errors.join(", ")}`);
  if (manifest.product_sha !== P3V2_PRODUCT_SHA || manifest.product_tree !== P3V2_PRODUCT_TREE) throw new Error("P3-V2 product candidate identity mismatch");
  if (sha256(JSON.stringify(manifest)) !== P3V2_MANIFEST_SHA256) throw new Error("P3-V2 manifest digest mismatch");
  const source = validateP3V2SourceGitState(root);
  for (const path of P3V2_SOURCE_PATHS) { const expected = manifest.source_blobs[path]; if (source.source_blobs[path] !== expected || git(root, ["rev-parse", `${P3V2_PRODUCT_SHA}:${path}`]) !== expected || git(root, ["rev-parse", `HEAD:${path}`]) !== expected) throw new Error(`P3-V2 source blob mismatch: ${path}`); }
  for (const capture of manifest.captures) {
    const spec = P3V2_SPECS.find(({ route }) => route === capture.route); const target = resolve(directory, capture.file);
    if (!inside(directory, target)) throw new Error(`P3-V2 screenshot escaped evidence directory: ${capture.file}`);
    const bytes = readFileSync(target);
    if (bytes.length !== capture.screenshot_byte_length || sha256(bytes) !== capture.screenshot_sha256 || bytes.readUInt32BE(16) !== capture.screenshot_width || bytes.readUInt32BE(20) !== capture.screenshot_height || git(root, ["hash-object", "--no-filters", "--", target]) !== capture.screenshot_git_blob) throw new Error(`P3-V2 screenshot drift: ${capture.file}`);
    const reference = resolve(root, spec.referencePath); if (!inside(root, reference) || sha256(readFileSync(reference)) !== capture.reference_sha256) throw new Error(`P3-V2 reference drift: ${capture.reference_path}`);
    if (requireTracked) { const tracked = relative(root, target).replaceAll("\\", "/"); if (git(root, ["rev-parse", `HEAD:${tracked}`]) !== capture.screenshot_git_blob) throw new Error(`P3-V2 screenshot is not tracked exactly: ${capture.file}`); }
  }
  const scores = {};
  for (const record of parseScores(designReview)) {
    const { route, ...input } = record; if (!(route in EXPECTED_SCORES)) throw new Error(`P3-V2 score route is unknown: ${route}`);
    if (input.candidate_sha !== P3V2_PRODUCT_SHA || input.candidate_sha !== manifest.product_sha) throw new Error(`P3-V2 score candidate identity mismatch: ${route}`);
    const representative = manifest.captures.find(({ file }) => file === REPRESENTATIVE[route]); if (!representative || representative.reference_sha256 !== input.reference_sha256 || representative.screenshot_sha256 !== input.screenshot_sha256) throw new Error(`P3-V2 score evidence mismatch: ${route}`);
    const result = evaluateVisualParityScore(input); if (result.status !== "accepted" || result.total !== EXPECTED_SCORES[route]) throw new Error(`P3-V2 score is not accepted: ${route}`); scores[route] = result.total;
  }
  if (!designReview.includes(P3V2_PRODUCT_SHA) || !designReview.includes(P3V2_PRODUCT_TREE) || !/39\/39/.test(designReview)) throw new Error("P3-V2 design review identity or coverage mismatch");
  if (requireTracked) {
    const trackedManifest = JSON.parse(readFileSync(resolve(root, P3V2_EVIDENCE_DIRECTORY, "manifest.json"), "utf8")); if (!isDeepStrictEqual(manifest, trackedManifest)) throw new Error("P3-V2 evaluated manifest is not the exact tracked manifest");
    for (const file of ["manifest.json", "design-review.md"]) { const path = `${P3V2_EVIDENCE_DIRECTORY}/${file}`; if (git(root, ["hash-object", "--", resolve(root, path)]) !== git(root, ["rev-parse", `HEAD:${path}`])) throw new Error(`P3-V2 evidence file is not tracked exactly: ${file}`); }
    if (designReview !== readFileSync(resolve(root, P3V2_EVIDENCE_DIRECTORY, "design-review.md"), "utf8")) throw new Error("P3-V2 evaluated design review is not the exact tracked file");
  }
  return Object.freeze({ captures: manifest.captures.length, scores: Object.freeze(scores) });
}
