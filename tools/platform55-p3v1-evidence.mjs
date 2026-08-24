import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  P3V1_SOURCE_PATHS,
  P3V1_SPECS,
  validateP3V1Manifest,
} from "./platform55-p3v-v1-browser-certification.mjs";
import { evaluateVisualParityScore } from "./platform55-visual-parity-contract.mjs";

export const P3V1_PRODUCT_SHA = "e962b54ee1ed049b0c020fd8278f48711105477e";
export const P3V1_PRODUCT_TREE = "db331c5d482e629df24feb5e02697066ecf2282f";
export const P3V1_EVIDENCE_DIRECTORY = `docs/platform55-visual-parity/evidence/p3v1/${P3V1_PRODUCT_SHA}`;

const EXPECTED_SCORES = Object.freeze({ "app.html": 91, "rateware.html": 90 });
const REPRESENTATIVE = Object.freeze({
  "app.html": "app-data-1440x900.png",
  "rateware.html": "rateware-loaded-1440x900.png",
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inside = (root, candidate) => {
  const value = relative(root, candidate);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
};
const git = (root, args) => execFileSync("git", ["-C", root, ...args], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
}).trim();

function parseScoreRecords(body) {
  if (typeof body !== "string") throw new Error("P3-V1 design review must be text");
  const records = [...body.matchAll(/```json\s*([\s\S]*?)```/g)].map((match) => JSON.parse(match[1]));
  if (records.length !== 2 || new Set(records.map((record) => record.route)).size !== 2) {
    throw new Error("P3-V1 design review must contain exactly two route score records");
  }
  return records;
}

export function loadP3V1Evidence(rootDir = process.cwd()) {
  const root = resolve(rootDir);
  const directory = resolve(root, P3V1_EVIDENCE_DIRECTORY);
  return {
    manifest: JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8")),
    designReview: readFileSync(resolve(directory, "design-review.md"), "utf8"),
    evidenceDirectory: directory,
  };
}

export function validateP3V1Evidence({
  rootDir = process.cwd(),
  manifest,
  designReview,
  evidenceDirectory = resolve(rootDir, P3V1_EVIDENCE_DIRECTORY),
  requireTracked = false,
}) {
  const root = resolve(rootDir);
  const directory = resolve(evidenceDirectory);
  const manifestResult = validateP3V1Manifest(manifest);
  if (!manifestResult.ok) throw new Error(`invalid P3-V1 manifest: ${manifestResult.errors.join(", ")}`);
  if (manifest.product_sha !== P3V1_PRODUCT_SHA || manifest.product_tree !== P3V1_PRODUCT_TREE) {
    throw new Error("P3-V1 product candidate identity mismatch");
  }

  for (const path of P3V1_SOURCE_PATHS) {
    const expected = manifest.source_blobs[path];
    if (git(root, ["rev-parse", `${P3V1_PRODUCT_SHA}:${path}`]) !== expected || git(root, ["hash-object", "--", path]) !== expected) {
      throw new Error(`P3-V1 source blob mismatch: ${path}`);
    }
  }

  for (const capture of manifest.captures) {
    const spec = P3V1_SPECS.find((candidate) => candidate.route === capture.route);
    const target = resolve(directory, capture.file);
    if (!inside(directory, target)) throw new Error(`P3-V1 screenshot escaped evidence directory: ${capture.file}`);
    const bytes = readFileSync(target);
    if (
      bytes.length !== capture.screenshot_byte_length ||
      sha256(bytes) !== capture.screenshot_sha256 ||
      bytes.readUInt32BE(16) !== capture.screenshot_width ||
      bytes.readUInt32BE(20) !== capture.screenshot_height ||
      git(root, ["hash-object", "--no-filters", "--", target]) !== capture.screenshot_git_blob
    ) throw new Error(`P3-V1 screenshot drift: ${capture.file}`);

    const reference = resolve(root, spec.referencePath);
    if (!inside(root, reference) || sha256(readFileSync(reference)) !== capture.reference_sha256) {
      throw new Error(`P3-V1 reference drift: ${capture.reference_path}`);
    }

    if (requireTracked) {
      const trackedPath = relative(root, target).replaceAll("\\", "/");
      if (git(root, ["rev-parse", `HEAD:${trackedPath}`]) !== capture.screenshot_git_blob) {
        throw new Error(`P3-V1 screenshot is not tracked exactly: ${capture.file}`);
      }
    }
  }

  const scoreRecords = parseScoreRecords(designReview);
  const scores = {};
  for (const record of scoreRecords) {
    const { route, ...scoreInput } = record;
    if (!(route in EXPECTED_SCORES)) throw new Error(`P3-V1 score route is unknown: ${route}`);
    if (scoreInput.candidate_sha !== manifest.product_sha || scoreInput.candidate_sha !== P3V1_PRODUCT_SHA) {
      throw new Error(`P3-V1 score candidate identity mismatch: ${route}`);
    }
    const representative = manifest.captures.find((capture) => capture.file === REPRESENTATIVE[route]);
    if (!representative || scoreInput.reference_sha256 !== representative.reference_sha256 || scoreInput.screenshot_sha256 !== representative.screenshot_sha256) {
      throw new Error(`P3-V1 score evidence mismatch: ${route}`);
    }
    const result = evaluateVisualParityScore(scoreInput);
    if (result.status !== "accepted" || result.total !== EXPECTED_SCORES[route]) {
      throw new Error(`P3-V1 score is not accepted: ${route}`);
    }
    scores[route] = result.total;
  }
  if (Object.keys(scores).length !== 2 || !designReview.includes(P3V1_PRODUCT_SHA) || !designReview.includes(P3V1_PRODUCT_TREE) || !/18\/18/.test(designReview)) {
    throw new Error("P3-V1 design review identity or coverage mismatch");
  }

  if (requireTracked) {
    for (const file of ["manifest.json", "design-review.md"]) {
      const path = `${P3V1_EVIDENCE_DIRECTORY}/${file}`;
      git(root, ["cat-file", "-e", `HEAD:${path}`]);
      if (git(root, ["hash-object", "--", resolve(root, path)]) !== git(root, ["rev-parse", `HEAD:${path}`])) {
        throw new Error(`P3-V1 evidence file is not tracked exactly: ${file}`);
      }
    }
    if (designReview !== readFileSync(resolve(root, P3V1_EVIDENCE_DIRECTORY, "design-review.md"), "utf8")) {
      throw new Error("P3-V1 evaluated design review is not the exact tracked file");
    }
  }
  return Object.freeze({ captures: manifest.captures.length, scores: Object.freeze(scores) });
}
