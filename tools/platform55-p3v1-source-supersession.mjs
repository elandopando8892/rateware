import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHA1 = /^[0-9a-f]{40}$/;

export const P3V1_SOURCE_SUPERSESSION_PATH = "docs/release/evidence/2026-08-23-p3v1-source-supersession.json";
export const P3V1_SOURCE_SUPERSESSION_SHA256 = "adb838ab22a7f75a571da70a68b49a36d1b302c2420292f993cce11b5e99e527";
export const P3V1_PRODUCT_CANDIDATE = "5cfe55e6a8693d9e3acd32f0ad4093165b7739c2";
export const P3V1_PRODUCT_TREE = "78131c49e6aaff4e685c632afc8f28e7768ee0bf";
export const P3V1_PRODUCT_BASE = "df04136db139fd37ff9b19fe981a45f9158f620d";

export const P3V1_SOURCE_PATHS = Object.freeze([
  "app.html",
  "rateware.html",
  "src/platform55-command-center.css",
  "src/platform55-operate.css",
  "src/platform55-visual-parity.css",
]);

const sameArray = (left, right) => (
  Array.isArray(left) &&
  left.length === right.length &&
  left.every((value, index) => value === right[index])
);
const validSha = (value) => typeof value === "string" && SHA1.test(value) && value !== "0".repeat(40);

export function validateP3V1SourceSupersession(record) {
  if (
    !record ||
    record.schema_version !== 1 ||
    record.sprint !== "P3-V1" ||
    record.verdict !== "LOCAL-GO" ||
    record.release_credit !== "withheld" ||
    !validSha(record.product_candidate_sha) ||
    !validSha(record.product_candidate_tree) ||
    !validSha(record.product_base_sha) ||
    !sameArray(record.source_paths, P3V1_SOURCE_PATHS) ||
    !record.source_blobs ||
    !sameArray(Object.keys(record.source_blobs), P3V1_SOURCE_PATHS)
  ) throw new Error("invalid P3-V1 source supersession contract");

  for (const path of P3V1_SOURCE_PATHS) {
    if (!validSha(record.source_blobs[path])) throw new Error(`invalid P3-V1 source supersession blob: ${path}`);
  }
  return record;
}

export function loadP3V1SourceSupersession(rootDir = process.cwd()) {
  const bytes = readFileSync(resolve(rootDir, P3V1_SOURCE_SUPERSESSION_PATH));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== P3V1_SOURCE_SUPERSESSION_SHA256) throw new Error("P3-V1 source supersession digest mismatch");
  const record = validateP3V1SourceSupersession(JSON.parse(bytes.toString("utf8")));
  if (
    record.product_candidate_sha !== P3V1_PRODUCT_CANDIDATE ||
    record.product_candidate_tree !== P3V1_PRODUCT_TREE ||
    record.product_base_sha !== P3V1_PRODUCT_BASE
  ) throw new Error("P3-V1 source supersession candidate identity mismatch");
  return record;
}

export function validateP3V1SourceGitState(rootDir, record = loadP3V1SourceSupersession(rootDir)) {
  validateP3V1SourceSupersession(record);
  if (
    record.product_candidate_sha !== P3V1_PRODUCT_CANDIDATE ||
    record.product_candidate_tree !== P3V1_PRODUCT_TREE ||
    record.product_base_sha !== P3V1_PRODUCT_BASE
  ) throw new Error("P3-V1 source supersession candidate identity mismatch");
  const root = resolve(rootDir);
  const git = (args) => execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  for (const path of P3V1_SOURCE_PATHS) {
    const expected = record.source_blobs[path];
    if (git(["rev-parse", `HEAD:${path}`]) !== expected || git(["hash-object", "--", path]) !== expected) {
      throw new Error(`P3-V1 current source blob mismatch: ${path}`);
    }
  }
  return record;
}
