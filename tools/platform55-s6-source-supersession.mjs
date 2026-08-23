import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHA1 = /^[0-9a-f]{40}$/;

export const P2_S6_SOURCE_SUPERSESSION_PATH = "docs/release/evidence/2026-08-23-p2-s6-local-certification.json";
export const P2_S6_SOURCE_SUPERSESSION_SHA256 = "27e3d9ee387796684f9d6a2d6992be24edeeb5daec132cacc6674570b14b2878";
export const P2_S6_PRODUCT_CANDIDATE = "9eec19fcb1ff45de204cb087a89d6a56bf256710";
export const P2_S6_PRODUCT_TREE = "6e3c91a9361b986db38b9b28bbf353db11a980f1";
export const P2_S6_PRODUCT_BASE = "858f8102cb3b5c7ce74955b00e7ac357b6511cdf";

export const P2_S6_SOURCE_PATHS = Object.freeze([
  "src/platform55-shell.js",
  "src/platform55-shell.css",
  "src/rateware.js",
  "src/staging-review.js",
]);

const sameArray = (left, right) => (
  Array.isArray(left) &&
  left.length === right.length &&
  left.every((value, index) => value === right[index])
);

const validSha = (value) => typeof value === "string" && SHA1.test(value) && value !== "0".repeat(40);

export function validateP2S6SourceSupersession(record) {
  if (
    !record ||
    record.schema_version !== 1 ||
    record.sprint !== "P2-S6" ||
    record.verdict !== "LOCAL-GO" ||
    record.release_credit !== "withheld" ||
    !validSha(record.product_candidate_sha) ||
    !validSha(record.product_candidate_tree) ||
    !validSha(record.product_base_sha) ||
    !sameArray(record.source_paths, P2_S6_SOURCE_PATHS) ||
    !record.source_blobs ||
    !sameArray(Object.keys(record.source_blobs), P2_S6_SOURCE_PATHS)
  ) {
    throw new Error("invalid P2-S6 source supersession contract");
  }

  for (const path of P2_S6_SOURCE_PATHS) {
    if (!validSha(record.source_blobs[path])) {
      throw new Error(`invalid P2-S6 source supersession blob: ${path}`);
    }
  }
  return record;
}

export function loadP2S6SourceSupersession(rootDir = process.cwd()) {
  const bytes = readFileSync(resolve(rootDir, P2_S6_SOURCE_SUPERSESSION_PATH));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== P2_S6_SOURCE_SUPERSESSION_SHA256) {
    throw new Error("P2-S6 source supersession digest mismatch");
  }
  const record = validateP2S6SourceSupersession(JSON.parse(bytes.toString("utf8")));
  if (
    record.product_candidate_sha !== P2_S6_PRODUCT_CANDIDATE ||
    record.product_candidate_tree !== P2_S6_PRODUCT_TREE ||
    record.product_base_sha !== P2_S6_PRODUCT_BASE
  ) {
    throw new Error("P2-S6 source supersession candidate identity mismatch");
  }
  return record;
}

export function validateP2S6SourceGitState(rootDir, record = loadP2S6SourceSupersession(rootDir)) {
  const root = resolve(rootDir);
  const git = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  if (git(["rev-parse", `${record.product_candidate_sha}^{tree}`]) !== record.product_candidate_tree) {
    throw new Error("P2-S6 product candidate tree mismatch");
  }
  if (git(["rev-parse", `${record.product_candidate_sha}^`]) !== record.product_base_sha) {
    throw new Error("P2-S6 product candidate base mismatch");
  }
  execFileSync("git", ["-C", root, "merge-base", "--is-ancestor", record.product_candidate_sha, "HEAD"], { stdio: "ignore" });
  for (const path of P2_S6_SOURCE_PATHS) {
    const expected = record.source_blobs[path];
    if (
      git(["rev-parse", `${record.product_candidate_sha}:${path}`]) !== expected ||
      git(["rev-parse", `HEAD:${path}`]) !== expected ||
      git(["hash-object", "--", path]) !== expected
    ) {
      throw new Error(`P2-S6 current source blob mismatch: ${path}`);
    }
  }
  return record;
}

export function validateHistoricalSourceParity({
  sourcePaths,
  manifestBlobs,
  subjectBlobs,
  currentBlobs,
  workingBlobs = currentBlobs,
  supersession,
}) {
  validateP2S6SourceSupersession(supersession);
  if (
    !Array.isArray(sourcePaths) ||
    !manifestBlobs ||
    subjectBlobs?.length !== sourcePaths.length ||
    currentBlobs?.length !== sourcePaths.length ||
    workingBlobs?.length !== sourcePaths.length
  ) {
    throw new Error("historical source parity requires aligned source inventories");
  }

  for (const [index, path] of sourcePaths.entries()) {
    const historicalBlob = manifestBlobs[path];
    const subjectBlob = subjectBlobs[index];
    const currentBlob = currentBlobs[index];
    const workingBlob = workingBlobs[index];
    if (!validSha(historicalBlob) || historicalBlob !== subjectBlob) {
      throw new Error(`historical subject blob mismatch: ${path}`);
    }
    if (workingBlob !== currentBlob) {
      throw new Error(`working tree source drift: ${path}`);
    }
    if (currentBlob === historicalBlob) continue;
    if (!P2_S6_SOURCE_PATHS.includes(path)) {
      throw new Error(`unapproved current drift: ${path}`);
    }
    if (supersession.source_blobs[path] !== currentBlob) {
      throw new Error(`P2-S6 supersession blob mismatch: ${path}`);
    }
  }
  return manifestBlobs;
}
