import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadP3V1SourceSupersession,
  validateP3V1SourceSupersession,
} from "./platform55-p3v1-source-supersession.mjs";
import {
  loadP3V2SourceSupersession,
  validateP3V2SourceSupersession,
} from "./platform55-p3v2-source-supersession.mjs";
import {
  loadP3V3SourceSupersession,
  validateP3V3SourceSupersession,
} from "./platform55-p3v3-source-supersession.mjs";

const SHA1 = /^[0-9a-f]{40}$/;

export const P2_S6_SOURCE_SUPERSESSION_PATH = "docs/release/evidence/2026-08-23-p2-s6-local-certification.json";
export const P2_S6_SOURCE_SUPERSESSION_SHA256 = "53fcacd4005c0070dc52499f506c255184fb2ea255dd9a325b27d8b27c34b71f";
export const P2_S6_PRODUCT_CANDIDATE = "31ca1105865570acd575ae17eeb25c236df45c7c";
export const P2_S6_PRODUCT_TREE = "1421417c0f737d8bbd4a420300812f11c38af628";
export const P2_S6_PRODUCT_BASE = "512c15679957abd5dcbfeee4afe3208d76edab92";

export const P2_S6_SOURCE_PATHS = Object.freeze([
  "src/platform55-shell.js",
  "src/platform55-shell.css",
  "src/platform55-public-shell.css",
  "src/provider-service-page.css",
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
  validateP2S6SourceSupersession(record);
  if (
    record.product_candidate_sha !== P2_S6_PRODUCT_CANDIDATE ||
    record.product_candidate_tree !== P2_S6_PRODUCT_TREE ||
    record.product_base_sha !== P2_S6_PRODUCT_BASE
  ) {
    throw new Error("P2-S6 source supersession candidate identity mismatch");
  }
  const root = resolve(rootDir);
  const git = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  for (const path of P2_S6_SOURCE_PATHS) {
    const expected = record.source_blobs[path];
    if (
      git(["rev-parse", `HEAD:${path}`]) !== expected ||
      git(["hash-object", "--", path]) !== expected
    ) {
      throw new Error(`P2-S6 current source blob mismatch: ${path}`);
    }
  }
  return record;
}

export function loadPlatform55SourceSupersessions(rootDir = process.cwd()) {
  return Object.freeze([
    loadP2S6SourceSupersession(rootDir),
    loadP3V1SourceSupersession(rootDir),
    loadP3V2SourceSupersession(rootDir),
    loadP3V3SourceSupersession(rootDir),
  ]);
}

export function validateHistoricalSourceParity({
  sourcePaths,
  manifestBlobs,
  subjectBlobs,
  currentBlobs,
  workingBlobs = currentBlobs,
  supersession,
}) {
  const supersessions = Array.isArray(supersession) ? supersession : [supersession];
  if (supersessions.length === 0) throw new Error("historical source parity requires source supersession contracts");
  for (const record of supersessions) {
    if (record?.sprint === "P2-S6") validateP2S6SourceSupersession(record);
    else if (record?.sprint === "P3-V1") validateP3V1SourceSupersession(record);
    else if (record?.sprint === "P3-V2") validateP3V2SourceSupersession(record);
    else if (record?.sprint === "P3-V3") validateP3V3SourceSupersession(record);
    else throw new Error("unknown source supersession contract");
  }
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
    const approvals = supersessions.filter((record) => record.source_paths.includes(path));
    if (approvals.length === 0) {
      throw new Error(`unapproved current drift: ${path}`);
    }
    const approval = approvals.find((record) => record.source_blobs[path] === currentBlob);
    if (!approval) {
      throw new Error(`supersession blob mismatch: ${path}`);
    }
  }
  return manifestBlobs;
}
