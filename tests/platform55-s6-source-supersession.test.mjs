import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  P2_S6_SOURCE_PATHS,
  loadP2S6SourceSupersession,
  validateHistoricalSourceParity,
  validateP2S6SourceSupersession,
  validateP2S6SourceGitState,
} from "../tools/platform55-s6-source-supersession.mjs";

const sha = (character) => character.repeat(40);

const validRecord = () => ({
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

test("accepts only the exact local S6 source supersession contract", () => {
  const record = validRecord();
  assert.equal(validateP2S6SourceSupersession(record), record);

  for (const mutate of [
    (copy) => { copy.verdict = "GO"; },
    (copy) => { copy.release_credit = "accepted"; },
    (copy) => { copy.product_candidate_sha = sha("0"); },
    (copy) => { copy.source_paths.push("src/extra.js"); copy.source_blobs["src/extra.js"] = sha("9"); },
    (copy) => { copy.source_paths = copy.source_paths.slice(1); delete copy.source_blobs[P2_S6_SOURCE_PATHS[0]]; },
    (copy) => { copy.source_blobs[P2_S6_SOURCE_PATHS[0]] = "fabricated"; },
  ]) {
    const copy = structuredClone(record);
    mutate(copy);
    assert.throws(() => validateP2S6SourceSupersession(copy));
  }
});

test("preserves historical subject anchors while accepting exact S6 head blobs", () => {
  const record = validRecord();
  const paths = ["src/unchanged.js", ...P2_S6_SOURCE_PATHS.slice(0, 2)];
  const manifestBlobs = Object.fromEntries(paths.map((path, index) => [path, sha(String(index + 6))]));
  const subjectBlobs = paths.map((path) => manifestBlobs[path]);
  const currentBlobs = [manifestBlobs[paths[0]], record.source_blobs[paths[1]], record.source_blobs[paths[2]]];

  assert.equal(validateHistoricalSourceParity({
    sourcePaths: paths,
    manifestBlobs,
    subjectBlobs,
    currentBlobs,
    workingBlobs: currentBlobs,
    supersession: record,
  }), manifestBlobs);

  const wrongSubject = [...subjectBlobs];
  wrongSubject[0] = sha("0");
  assert.throws(() => validateHistoricalSourceParity({ sourcePaths: paths, manifestBlobs, subjectBlobs: wrongSubject, currentBlobs, workingBlobs: currentBlobs, supersession: record }), /historical subject/);

  const dirtyWorking = [...currentBlobs];
  dirtyWorking[0] = sha("0");
  assert.throws(() => validateHistoricalSourceParity({ sourcePaths: paths, manifestBlobs, subjectBlobs, currentBlobs, workingBlobs: dirtyWorking, supersession: record }), /working tree/);

  const unapprovedCurrent = [...currentBlobs];
  unapprovedCurrent[0] = sha("0");
  assert.throws(() => validateHistoricalSourceParity({ sourcePaths: paths, manifestBlobs, subjectBlobs, currentBlobs: unapprovedCurrent, workingBlobs: unapprovedCurrent, supersession: record }), /unapproved current drift/);

  const wrongApprovedBlob = [...currentBlobs];
  wrongApprovedBlob[1] = sha("0");
  assert.throws(() => validateHistoricalSourceParity({ sourcePaths: paths, manifestBlobs, subjectBlobs, currentBlobs: wrongApprovedBlob, workingBlobs: wrongApprovedBlob, supersession: record }), /supersession blob mismatch/);
});

test("binds the checked-in supersession to the exact product candidate and current source blobs", () => {
  const record = loadP2S6SourceSupersession();
  assert.equal(record.product_candidate_sha, "31ca1105865570acd575ae17eeb25c236df45c7c");
  assert.equal(validateP2S6SourceGitState(process.cwd(), record), record);
});

test("validates the certified source blobs in a squash-only repository without historical candidate objects", (t) => {
  const record = loadP2S6SourceSupersession();
  const root = mkdtempSync(join(tmpdir(), "rateware-p2-s6-squash-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const git = (args, options = {}) => execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();

  git(["init"]);
  git(["config", "user.name", "Rateware test"]);
  git(["config", "user.email", "rateware-test@example.invalid"]);
  git(["config", "core.autocrlf", "false"]);
  for (const path of P2_S6_SOURCE_PATHS) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    const bytes = execFileSync("git", ["cat-file", "blob", record.source_blobs[path]], { encoding: null });
    writeFileSync(target, bytes);
  }
  git(["add", "."]);
  git(["commit", "--no-gpg-sign", "-m", "squash-only source tree"]);

  assert.throws(
    () => git(["cat-file", "-e", `${record.product_candidate_sha}^{commit}`]),
    /Command failed/,
  );
  assert.equal(validateP2S6SourceGitState(root, record), record);
});
