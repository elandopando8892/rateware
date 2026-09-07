import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SHA1 = /^[0-9a-f]{40}$/;

export const P3V4_SOURCE_SUPERSESSION_PATH = "docs/release/evidence/2026-09-07-p3v4-source-supersession.json";
export const P3V4_SOURCE_PATHS = Object.freeze([
  "shipper-crm.html",
  "vendor-support.html",
  "vendor-improvement.html",
  "provider-service.html",
  "provider-onboarding.html",
  "provider-gmail.html",
  "provider-communications.html",
  "src/platform55-visual-parity.css",
  "src/platform55-network-service.css",
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
const gitAt = (root, args) => execFileSync("git", ["-C", root, ...args], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
}).trim();

export function validateP3V4SourceSupersession(record) {
  if (
    !record ||
    record.schema_version !== 1 ||
    record.sprint !== "P3-V4" ||
    record.verdict !== "LOCAL-GO" ||
    record.release_credit !== "withheld" ||
    !validSha(record.product_candidate_sha) ||
    !validSha(record.product_candidate_tree) ||
    !validSha(record.product_base_sha) ||
    !sameArray(record.source_paths, P3V4_SOURCE_PATHS) ||
    !record.source_blobs ||
    !sameArray(Object.keys(record.source_blobs), P3V4_SOURCE_PATHS)
  ) throw new Error("invalid P3-V4 source supersession contract");

  for (const path of P3V4_SOURCE_PATHS) {
    if (!validSha(record.source_blobs[path])) throw new Error(`invalid P3-V4 source supersession blob: ${path}`);
  }
  return record;
}

export function loadP3V4SourceSupersession(rootDir = process.cwd()) {
  const root = resolve(rootDir);
  const record = validateP3V4SourceSupersession(JSON.parse(readFileSync(resolve(root, P3V4_SOURCE_SUPERSESSION_PATH), "utf8")));
  if (normalizedDigest(record) !== record.record_sha256) throw new Error("P3-V4 source supersession digest mismatch");
  if (gitAt(root, ["cat-file", "-e", `${record.product_candidate_sha}^{commit}`])) throw new Error("P3-V4 candidate commit missing");
  if (gitAt(root, ["rev-parse", `${record.product_candidate_sha}^{tree}`]) !== record.product_candidate_tree) throw new Error("P3-V4 candidate tree mismatch");
  try {
    execFileSync("git", ["-C", root, "merge-base", "--is-ancestor", record.product_base_sha, record.product_candidate_sha], { stdio: "ignore" });
  } catch {
    throw new Error("P3-V4 candidate base is not an ancestor");
  }
  return record;
}

export function validateP3V4SourceGitState(rootDir, record = loadP3V4SourceSupersession(rootDir)) {
  validateP3V4SourceSupersession(record);
  const root = resolve(rootDir);
  for (const path of P3V4_SOURCE_PATHS) {
    const expected = record.source_blobs[path];
    if (gitAt(root, ["rev-parse", `${record.product_candidate_sha}:${path}`]) !== expected) throw new Error(`P3-V4 candidate source blob mismatch: ${path}`);
    if (gitAt(root, ["hash-object", "--", path]) !== expected) throw new Error(`P3-V4 current source blob mismatch: ${path}`);
  }
  return record;
}

export function writeP3V4SourceSupersession(rootDir = process.cwd()) {
  const root = resolve(rootDir);
  const candidate = gitAt(root, ["rev-parse", "HEAD"]);
  const record = {
    schema_version: 1,
    sprint: "P3-V4",
    verdict: "LOCAL-GO",
    release_credit: "withheld",
    product_candidate_sha: candidate,
    product_candidate_tree: gitAt(root, ["rev-parse", `${candidate}^{tree}`]),
    product_base_sha: gitAt(root, ["rev-parse", `${candidate}^`]),
    source_paths: [...P3V4_SOURCE_PATHS],
    source_blobs: Object.fromEntries(P3V4_SOURCE_PATHS.map((path) => [path, gitAt(root, ["rev-parse", `${candidate}:${path}`])])),
  };
  record.record_sha256 = normalizedDigest(record);
  writeFileSync(resolve(root, P3V4_SOURCE_SUPERSESSION_PATH), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

if (process.argv.includes("--write")) {
  const record = writeP3V4SourceSupersession();
  process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
}
