import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHA1 = /^[0-9a-f]{40}$/;

export const P3V2_SOURCE_SUPERSESSION_PATH = "docs/release/evidence/2026-08-24-p3v2-source-supersession.json";
export const P3V2_SOURCE_SUPERSESSION_SHA256 = "a9cdcc3bed96be1a5dc89ca706f078877ab3b70e0e5841384e14a34f4996af19";
export const P3V2_PRODUCT_CANDIDATE = "c4009df2f27b7e286ad8d9607a5a2ded7c40635b";
export const P3V2_PRODUCT_TREE = "2b481c63034739faf47422f0b3a340e74b32423e";
export const P3V2_PRODUCT_BASE = "7b76ba36dae4e0fa26e1b6605b6bb398581051e5";

export const P3V2_SOURCE_PATHS = Object.freeze([
  "upload-center.html",
  "upload-history.html",
  "staging-review.html",
  "src/platform55-visual-parity.css",
]);

const sameArray = (left, right) => (
  Array.isArray(left) &&
  left.length === right.length &&
  left.every((value, index) => value === right[index])
);
const validSha = (value) => typeof value === "string" && SHA1.test(value) && value !== "0".repeat(40);
const normalizedDigest = (record) => createHash("sha256").update(JSON.stringify(record)).digest("hex");

export function validateP3V2SourceSupersession(record) {
  if (
    !record ||
    record.schema_version !== 1 ||
    record.sprint !== "P3-V2" ||
    record.verdict !== "LOCAL-GO" ||
    record.release_credit !== "withheld" ||
    !validSha(record.product_candidate_sha) ||
    !validSha(record.product_candidate_tree) ||
    !validSha(record.product_base_sha) ||
    !sameArray(record.source_paths, P3V2_SOURCE_PATHS) ||
    !record.source_blobs ||
    !sameArray(Object.keys(record.source_blobs), P3V2_SOURCE_PATHS)
  ) throw new Error("invalid P3-V2 source supersession contract");

  for (const path of P3V2_SOURCE_PATHS) {
    if (!validSha(record.source_blobs[path])) throw new Error(`invalid P3-V2 source supersession blob: ${path}`);
  }
  return record;
}

export function loadP3V2SourceSupersession(rootDir = process.cwd()) {
  const record = validateP3V2SourceSupersession(JSON.parse(readFileSync(resolve(rootDir, P3V2_SOURCE_SUPERSESSION_PATH), "utf8")));
  if (normalizedDigest(record) !== P3V2_SOURCE_SUPERSESSION_SHA256) throw new Error("P3-V2 source supersession digest mismatch");
  if (
    record.product_candidate_sha !== P3V2_PRODUCT_CANDIDATE ||
    record.product_candidate_tree !== P3V2_PRODUCT_TREE ||
    record.product_base_sha !== P3V2_PRODUCT_BASE
  ) throw new Error("P3-V2 source supersession candidate identity mismatch");
  return record;
}

export function validateP3V2SourceGitState(rootDir, record = loadP3V2SourceSupersession(rootDir), { requireCurrent = true } = {}) {
  validateP3V2SourceSupersession(record);
  if (
    record.product_candidate_sha !== P3V2_PRODUCT_CANDIDATE ||
    record.product_candidate_tree !== P3V2_PRODUCT_TREE ||
    record.product_base_sha !== P3V2_PRODUCT_BASE
  ) throw new Error("P3-V2 source supersession candidate identity mismatch");

  const root = resolve(rootDir);
  const git = (args) => execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  for (const path of P3V2_SOURCE_PATHS) {
    const expected = record.source_blobs[path];
    if (git(["rev-parse", `${record.product_candidate_sha}:${path}`]) !== expected) {
      throw new Error(`P3-V2 candidate source blob mismatch: ${path}`);
    }
    if (requireCurrent && (git(["rev-parse", `HEAD:${path}`]) !== expected || git(["hash-object", "--", path]) !== expected)) {
      throw new Error(`P3-V2 current source blob mismatch: ${path}`);
    }
  }
  return record;
}
