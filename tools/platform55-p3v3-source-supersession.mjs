import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadP3V4SourceSupersession } from "./platform55-p3v4-source-supersession.mjs";

const SHA1 = /^[0-9a-f]{40}$/;

export const P3V3_SOURCE_SUPERSESSION_PATH = "docs/release/evidence/2026-09-07-p3v3-source-supersession.json";
export const P3V3_PRODUCT_CANDIDATE = "08ef68a63b5a16c9aa4a4e5c61816ec78fc2d52d";
export const P3V3_PRODUCT_TREE = "e737711b2859e0947dfbd0591c3e2d65311ffa47";
export const P3V3_PRODUCT_BASE = "59580828dc8bf8c26d6af82b8d5675f18806cb84";

export const P3V3_SOURCE_PATHS = Object.freeze([
  "vendors.html",
  "rfx-events.html",
  "rfx-process.html",
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
const normalizedDigest = (record) => {
  const { record_sha256: _recordSha, ...payload } = record;
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
};

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
  ) throw new Error("invalid P3-V3 source supersession contract");

  for (const path of P3V3_SOURCE_PATHS) {
    if (!validSha(record.source_blobs[path])) throw new Error(`invalid P3-V3 source supersession blob: ${path}`);
  }
  return record;
}

export function loadP3V3SourceSupersession(rootDir = process.cwd()) {
  const record = validateP3V3SourceSupersession(JSON.parse(readFileSync(resolve(rootDir, P3V3_SOURCE_SUPERSESSION_PATH), "utf8")));
  if (normalizedDigest(record) !== record.record_sha256) throw new Error("P3-V3 source supersession digest mismatch");
  if (
    record.product_candidate_sha !== P3V3_PRODUCT_CANDIDATE ||
    record.product_candidate_tree !== P3V3_PRODUCT_TREE ||
    record.product_base_sha !== P3V3_PRODUCT_BASE
  ) throw new Error("P3-V3 source supersession candidate identity mismatch");
  return record;
}

export function validateP3V3SourceGitState(rootDir, record = loadP3V3SourceSupersession(rootDir)) {
  validateP3V3SourceSupersession(record);
  const root = resolve(rootDir);
  const git = (args) => execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  let newerVisualSupersession = null;
  try { newerVisualSupersession = loadP3V4SourceSupersession(root); } catch { /* P3-V4 may not exist in historical fixtures. */ }
  for (const path of P3V3_SOURCE_PATHS) {
    const expected = record.source_blobs[path];
    const current = git(["hash-object", "--", path]);
    const allowedNewerVisualBlob = path === "src/platform55-visual-parity.css" && newerVisualSupersession?.source_blobs[path] === current;
    if (current !== expected && !allowedNewerVisualBlob) throw new Error(`P3-V3 current source blob mismatch: ${path}`);
  }
  return record;
}
