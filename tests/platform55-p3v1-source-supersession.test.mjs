import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  P3V1_SOURCE_PATHS,
  loadP3V1SourceSupersession,
  validateP3V1SourceGitState,
  validateP3V1SourceSupersession,
} from "../tools/platform55-p3v1-source-supersession.mjs";
import {
  P2_S6_SOURCE_PATHS,
  validateHistoricalSourceParity,
  validateP2S6SourceSupersession,
} from "../tools/platform55-s6-source-supersession.mjs";

const sha = (character) => character.repeat(40);

const validP2 = () => ({
  schema_version: 1,
  sprint: "P2-S6",
  verdict: "LOCAL-GO",
  release_credit: "withheld",
  product_candidate_sha: sha("1"),
  product_candidate_tree: sha("2"),
  product_base_sha: sha("3"),
  source_paths: [...P2_S6_SOURCE_PATHS],
  source_blobs: Object.fromEntries(P2_S6_SOURCE_PATHS.map((path, index) => [path, String(index + 4).repeat(40)])),
});

const validP3 = () => ({
  schema_version: 1,
  sprint: "P3-V1",
  verdict: "LOCAL-GO",
  release_credit: "withheld",
  product_candidate_sha: sha("a"),
  product_candidate_tree: sha("b"),
  product_base_sha: sha("c"),
  source_paths: [...P3V1_SOURCE_PATHS],
  source_blobs: Object.fromEntries(P3V1_SOURCE_PATHS.map((path, index) => [path, String(index + 1).repeat(40)])),
});

test("accepts only the exact P3-V1 source supersession contract", () => {
  const record = validP3();
  assert.equal(validateP3V1SourceSupersession(record), record);
  for (const mutate of [
    (copy) => { copy.verdict = "GO"; },
    (copy) => { copy.release_credit = "accepted"; },
    (copy) => { copy.product_candidate_sha = sha("0"); },
    (copy) => { copy.source_paths.reverse(); },
    (copy) => { copy.source_paths.push("src/extra.css"); copy.source_blobs["src/extra.css"] = sha("d"); },
    (copy) => { copy.source_blobs[P3V1_SOURCE_PATHS[0]] = "fabricated"; },
  ]) {
    const copy = structuredClone(record);
    mutate(copy);
    assert.throws(() => validateP3V1SourceSupersession(copy));
  }
});

test("accepts exact P2 then P3 source blobs without weakening historical anchors", () => {
  const p2 = validP2();
  const p3 = validP3();
  assert.equal(validateP2S6SourceSupersession(p2), p2);
  const paths = ["src/unchanged.js", P2_S6_SOURCE_PATHS[0], P3V1_SOURCE_PATHS[0]];
  const manifestBlobs = Object.fromEntries(paths.map((path, index) => [path, String(index + 6).repeat(40)]));
  const currentBlobs = [manifestBlobs[paths[0]], p2.source_blobs[paths[1]], p3.source_blobs[paths[2]]];
  const input = {
    sourcePaths: paths,
    manifestBlobs,
    subjectBlobs: paths.map((path) => manifestBlobs[path]),
    currentBlobs,
    workingBlobs: currentBlobs,
    supersession: [p2, p3],
  };
  assert.equal(validateHistoricalSourceParity(input), manifestBlobs);

  const wrongP3 = structuredClone(p3);
  wrongP3.source_blobs[paths[2]] = sha("f");
  assert.throws(() => validateHistoricalSourceParity({ ...input, supersession: [p2, wrongP3] }), /supersession blob mismatch/);

  const dirty = [...currentBlobs];
  dirty[2] = sha("f");
  assert.throws(() => validateHistoricalSourceParity({ ...input, workingBlobs: dirty }), /working tree source drift/);
});

test("binds the checked-in P3-V1 record to the exact historical product candidate", () => {
  const record = loadP3V1SourceSupersession();
  assert.equal(record.product_candidate_sha, "5cfe55e6a8693d9e3acd32f0ad4093165b7739c2");
  assert.equal(record.source_paths.length, P3V1_SOURCE_PATHS.length);
});

test("validates the P3-V1 source blobs in a squash-only repository", (t) => {
  const record = loadP3V1SourceSupersession();
  const root = mkdtempSync(join(tmpdir(), "rateware-p3v1-squash-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (args) => execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  git(["init"]);
  git(["config", "user.name", "Rateware test"]);
  git(["config", "user.email", "rateware-test@example.invalid"]);
  git(["config", "core.autocrlf", "false"]);
  for (const path of P3V1_SOURCE_PATHS) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, execFileSync("git", ["cat-file", "blob", record.source_blobs[path]], { encoding: null }));
  }
  git(["add", "."]);
  git(["commit", "--no-gpg-sign", "-m", "squash-only P3-V1 source tree"]);
  assert.throws(() => git(["cat-file", "-e", `${record.product_candidate_sha}^{commit}`]), /Command failed/);
  assert.equal(validateP3V1SourceGitState(root, record), record);
});
