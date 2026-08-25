import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { P3V2_SOURCE_PATHS, P3V2_SPECS, validateP3V2Manifest } from "./platform55-p3v-v2-browser-certification.mjs";
import { validateP3V2SourceGitState } from "./platform55-p3v2-source-supersession.mjs";
import { evaluateVisualParityScore, validateRouteMatrix } from "./platform55-visual-parity-contract.mjs";

export const P3V2_PRODUCT_SHA = "cfe0ddb198d4bf9bf2e93654a7a3e05f0ba606f7";
export const P3V2_PRODUCT_TREE = "0d8c548d03dbf76f219f0969cddc94edff941b5c";
export const P3V2_MANIFEST_SHA256 = "01feeb5e4ffa093417b1378ea238445b989d0b4f8e5626ca0ac35fdfa0977ec1";
export const P3V2_EVIDENCE_DIRECTORY = `docs/platform55-visual-parity/evidence/p3v2/${P3V2_PRODUCT_SHA}`;
export const P3V2_REVIEWED_EVIDENCE_SHA = "e3e1c0bc0c89d76e4c8d595e4054a749164b2eff";
export const P3V2_REVIEWED_EVIDENCE_TREE = "b427f06631a6df017036adc119f3cb2f07b8901f";
export const P3V2_FINAL_REVIEWED_HEAD = "99fbd18e469763ff90d346135bd1e7fda9b417d6";
export const P3V2_FINAL_REVIEWED_TREE = "82e053ac9979b8ec86430708870a79346fd70202";
export const P3V2_PRODUCTION_RELEASE_SHA = "f329b3c580ba9a7c3bf9f7836d2af4986f946f3f";
export const P3V2_PRODUCTION_RELEASE_TREE = "82e053ac9979b8ec86430708870a79346fd70202";
export const P3V2_INDEPENDENT_REVIEW_PATH = `${P3V2_EVIDENCE_DIRECTORY}/independent-review.md`;
const P3V2_INDEPENDENT_REVIEW_SHA256 = "aad4dec4b6aeb4b45fb8cc7ed9613d1c1691eeee2b25a5f0fdbe9c87d5631182";
const EXPECTED_SCORES = Object.freeze({ "upload-center.html": 92, "upload-history.html": 90, "staging-review.html": 93 });
const REPRESENTATIVE = Object.freeze({ "upload-center.html": "upload-center-loaded-1440x900.png", "upload-history.html": "upload-history-loaded-1440x900.png", "staging-review.html": "staging-review-loaded-1440x900.png" });
const ACCREDITED_ROUTES = Object.freeze({
  "upload-center.html": Object.freeze({ label: "Upload Center", score: 92, detail: "governed import hierarchy remains viewport-grounded" }),
  "upload-history.html": Object.freeze({ label: "Source Files", score: 90, detail: "heading, provenance, and state evidence remain visible at all certified viewports" }),
  "staging-review.html": Object.freeze({ label: "Review Queue", score: 93, detail: "review scopes and human-approval boundaries remain explicit" }),
});
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (root, args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const inside = (root, candidate) => { const value = relative(root, candidate); return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value)); };
const exactReviewField = (body, name) => {
  const matches = [...body.matchAll(new RegExp(`^${name}:\\s*(.+)$`, "gm"))];
  if (matches.length !== 1) throw new Error(`P3-V2 independent review field mismatch: ${name}`);
  return matches[0][1].trim();
};
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

export function validateP3V2ClosureAccreditation({
  rootDir = process.cwd(), rows, manifest, designReview, evidenceDirectory,
  independentReview = readFileSync(resolve(rootDir, P3V2_INDEPENDENT_REVIEW_PATH), "utf8"),
  requireTracked = true,
}) {
  const root = resolve(rootDir);
  if (requireTracked !== true) throw new Error("P3-V2 closure accreditation requires tracked evidence");
  if (!Array.isArray(rows)) throw new Error("P3-V2 semantic accreditation requires route rows");
  const routeResult = validateRouteMatrix(rows, { rootDir: root });
  if (!routeResult.ok) throw new Error(`P3-V2 route matrix accreditation mismatch: ${routeResult.errors.join(", ")}`);
  const loaded = loadP3V2Evidence(root);
  const evidenceResult = validateP3V2Evidence({
    rootDir: root,
    manifest: manifest ?? loaded.manifest,
    designReview: designReview ?? loaded.designReview,
    evidenceDirectory: evidenceDirectory ?? loaded.evidenceDirectory,
    requireTracked,
  });
  const normalizedReview = independentReview.replace(/\r\n/g, "\n");
  if (sha256(normalizedReview) !== P3V2_INDEPENDENT_REVIEW_SHA256) throw new Error("P3-V2 independent review digest mismatch");
  if (
    exactReviewField(normalizedReview, "reviewed_product_sha") !== P3V2_PRODUCT_SHA ||
    exactReviewField(normalizedReview, "reviewed_product_tree") !== P3V2_PRODUCT_TREE ||
    exactReviewField(normalizedReview, "reviewed_evidence_sha") !== P3V2_REVIEWED_EVIDENCE_SHA ||
    exactReviewField(normalizedReview, "reviewed_evidence_tree") !== P3V2_REVIEWED_EVIDENCE_TREE ||
    exactReviewField(normalizedReview, "reviewer_verdict") !== "GO" ||
    exactReviewField(normalizedReview, "p0") !== "0" || exactReviewField(normalizedReview, "p1") !== "0" || exactReviewField(normalizedReview, "p2") !== "0" ||
    !/Capture matrix:\s*`39\/39`/.test(normalizedReview) || !/Upload Center .*`92\/100`/.test(normalizedReview) ||
    !/Source Files .*`90\/100`/.test(normalizedReview) || !/Review Queue .*`93\/100`/.test(normalizedReview)
  ) throw new Error("P3-V2 independent review verdict or evidence mismatch");
  if (requireTracked) {
    const trackedBody = readFileSync(resolve(root, P3V2_INDEPENDENT_REVIEW_PATH), "utf8");
    if (independentReview !== trackedBody) throw new Error("P3-V2 independent review is not the exact tracked body");
    git(root, ["ls-files", "--error-unmatch", "--", P3V2_INDEPENDENT_REVIEW_PATH]);
    if (git(root, ["hash-object", "--", P3V2_INDEPENDENT_REVIEW_PATH]) !== git(root, ["rev-parse", `HEAD:${P3V2_INDEPENDENT_REVIEW_PATH}`])) throw new Error("P3-V2 independent review is not tracked exactly");
    git(root, ["merge-base", "--is-ancestor", P3V2_PRODUCTION_RELEASE_SHA, "HEAD"]);
    if (
      git(root, ["rev-parse", `${P3V2_PRODUCTION_RELEASE_SHA}^{tree}`]) !== P3V2_PRODUCTION_RELEASE_TREE ||
      P3V2_PRODUCTION_RELEASE_TREE !== P3V2_FINAL_REVIEWED_TREE
    ) throw new Error("P3-V2 reviewed and released tree mismatch");
  }
  const accepted = rows.filter((row) => row?.parity_status === "accepted");
  const expectedRoutes = Object.keys(ACCREDITED_ROUTES).sort();
  const p3v2Accepted = accepted.filter((row) => row.p3v_wave === "P3-V2");
  if (p3v2Accepted.length !== 3 || JSON.stringify(p3v2Accepted.map((row) => row.route).sort()) !== JSON.stringify(expectedRoutes)) throw new Error("P3-V2 semantic accreditation requires exactly the reviewed routes");
  for (const [route, expected] of Object.entries(ACCREDITED_ROUTES)) {
    const row = rows.find((candidate) => candidate.route === route);
    const expectedSummary = `Accepted from ${P3V2_EVIDENCE_DIRECTORY}: 39/39 matrix reproduced, independent GO, and ${expected.label} score ${expected.score}/100; ${expected.detail}`;
    if (!row || row.parity_status !== "accepted" || row.verification !== "accepted" || row.p3v_wave !== "P3-V2" || row.current_baseline !== `${P3V2_EVIDENCE_DIRECTORY}/${REPRESENTATIVE[route]}` || row.gap_summary !== expectedSummary) throw new Error(`P3-V2 gap summary or semantic accreditation mismatch: ${route}`);
  }
  return Object.freeze({ captures: evidenceResult.captures, scores: evidenceResult.scores, routes: Object.freeze(expectedRoutes) });
}
