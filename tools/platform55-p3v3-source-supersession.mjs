import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHA1 = /^[0-9a-f]{40}$/;

export const P3V3_SOURCE_SUPERSESSION_PATH = "docs/release/evidence/2026-08-25-p3-v3-local-prototype.json";
export const P3V3_SOURCE_SUPERSESSION_SHA256 = "46a1d17c760ad4cba6be1fe0a8123c826b65ffaa7bc49fec83b035565cab11f7";
export const P3V3_PRODUCT_CANDIDATE = "5c3c1b54d3ad7c6a572c7a49f0e85faa4ed32d19";
export const P3V3_PRODUCT_TREE = "f40dec5d3288ac271177c9348bf4c343f6e5702b";
export const P3V3_PRODUCT_BASE = "f329b3c580ba9a7c3bf9f7836d2af4986f946f3f";

export const P3V3_SOURCE_PATHS = Object.freeze([
  "vendors.html",
  "rfx-process.html",
  "rfx-events.html",
  "ratebook.html",
  "outreach.html",
  "src/platform55-visual-parity.css",
]);

const sameArray = (left, right) => (
  Array.isArray(left) &&
  left.length === right.length &&
  left.every((value, index) => value === right[index])
);

const validSha = (value) => typeof value === "string" && SHA1.test(value) && value !== "0".repeat(40);

export function validateP3V3SourceSupersession(record) {
  if (
    !record ||
    record.schema_version !== 1 ||
    record.sprint !== "P3-V3" ||
    record.verdict !== "LOCAL-GO" ||
    record.release_credit !== "withheld" ||
    !validSha(record.product_candidate_sha) ||
    !validSha(record.product_candidate_tree) ||
    !validSha(record.product_base_sha) ||
    !sameArray(record.source_paths, P3V3_SOURCE_PATHS) ||
    !record.source_blobs ||
    !sameArray(Object.keys(record.source_blobs), P3V3_SOURCE_PATHS)
  ) {
    throw new Error("invalid P3-V3 source supersession contract");
  }

  for (const path of P3V3_SOURCE_PATHS) {
    if (!validSha(record.source_blobs[path])) {
      throw new Error(`invalid P3-V3 source supersession blob: ${path}`);
    }
  }
  return record;
}

export function loadP3V3SourceSupersession(rootDir = process.cwd()) {
  const bytes = readFileSync(resolve(rootDir, P3V3_SOURCE_SUPERSESSION_PATH));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== P3V3_SOURCE_SUPERSESSION_SHA256) {
    throw new Error("P3-V3 source supersession digest mismatch");
  }
  const record = validateP3V3SourceSupersession(JSON.parse(bytes.toString("utf8")));
  if (
    record.product_candidate_sha !== P3V3_PRODUCT_CANDIDATE ||
    record.product_candidate_tree !== P3V3_PRODUCT_TREE ||
    record.product_base_sha !== P3V3_PRODUCT_BASE
  ) {
    throw new Error("P3-V3 source supersession candidate identity mismatch");
  }
  return record;
}

export function validateP3V3SourceGitState(rootDir, record = loadP3V3SourceSupersession(rootDir)) {
  validateP3V3SourceSupersession(record);
  const root = resolve(rootDir);
  const git = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  if (
    git(["rev-parse", `${record.product_candidate_sha}^{tree}`]) !== record.product_candidate_tree ||
    git(["rev-parse", `${record.product_candidate_sha}^`]) !== record.product_base_sha
  ) {
    throw new Error("P3-V3 candidate graph mismatch");
  }
  for (const path of P3V3_SOURCE_PATHS) {
    const expected = record.source_blobs[path];
    if (
      git(["rev-parse", `${record.product_candidate_sha}:${path}`]) !== expected ||
      git(["hash-object", "--", path]) !== expected
    ) {
      throw new Error(`P3-V3 current source blob mismatch: ${path}`);
    }
  }
  return record;
}
