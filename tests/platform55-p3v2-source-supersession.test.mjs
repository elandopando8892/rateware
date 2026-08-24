import assert from "node:assert/strict";
import test from "node:test";
import {
  P3V2_SOURCE_PATHS,
  loadP3V2SourceSupersession,
  validateP3V2SourceGitState,
  validateP3V2SourceSupersession,
} from "../tools/platform55-p3v2-source-supersession.mjs";
import { validateHistoricalSourceParity } from "../tools/platform55-s6-source-supersession.mjs";

const sha = (character) => character.repeat(40);
const validRecord = () => ({
  schema_version: 1,
  sprint: "P3-V2",
  verdict: "LOCAL-GO",
  release_credit: "withheld",
  product_candidate_sha: sha("1"),
  product_candidate_tree: sha("2"),
  product_base_sha: sha("3"),
  source_paths: [...P3V2_SOURCE_PATHS],
  source_blobs: Object.fromEntries(P3V2_SOURCE_PATHS.map((path, index) => [path, String(index + 4).repeat(40)])),
});

test("accepts only the exact P3-V2 governed Operate source supersession", () => {
  const record = validRecord();
  assert.equal(validateP3V2SourceSupersession(record), record);
  for (const mutate of [
    (copy) => { copy.sprint = "P3-V1"; },
    (copy) => { copy.verdict = "GO"; },
    (copy) => { copy.release_credit = "accepted"; },
    (copy) => { copy.product_candidate_sha = sha("0"); },
    (copy) => { copy.source_paths.reverse(); },
    (copy) => { copy.source_paths.push("rateware.html"); copy.source_blobs["rateware.html"] = sha("9"); },
    (copy) => { copy.source_blobs[P3V2_SOURCE_PATHS[0]] = "fabricated"; },
  ]) {
    const copy = structuredClone(record);
    mutate(copy);
    assert.throws(() => validateP3V2SourceSupersession(copy));
  }
});

test("accepts P3-V2 drift only for its exact source blobs", () => {
  const record = validRecord();
  const historicalCharacters = ["7", "8", "9", "b"];
  const historical = Object.fromEntries(P3V2_SOURCE_PATHS.map((path, index) => [path, historicalCharacters[index].repeat(40)]));
  const current = P3V2_SOURCE_PATHS.map((path) => record.source_blobs[path]);
  const input = {
    sourcePaths: [...P3V2_SOURCE_PATHS],
    manifestBlobs: historical,
    subjectBlobs: P3V2_SOURCE_PATHS.map((path) => historical[path]),
    currentBlobs: current,
    workingBlobs: current,
    supersession: [record],
  };
  assert.equal(validateHistoricalSourceParity(input), historical);

  const wrong = structuredClone(record);
  wrong.source_blobs[P3V2_SOURCE_PATHS[1]] = sha("f");
  assert.throws(() => validateHistoricalSourceParity({ ...input, supersession: [wrong] }), /supersession blob mismatch/);

  const dirty = [...current];
  dirty[2] = sha("f");
  assert.throws(() => validateHistoricalSourceParity({ ...input, workingBlobs: dirty }), /working tree source drift/);
});

test("binds the checked-in P3-V2 record to the frozen product and working tree", () => {
  const record = loadP3V2SourceSupersession();
  assert.equal(record.product_candidate_sha, "f9574630f7cde73b9521db553860270960ff418d");
  assert.equal(validateP3V2SourceGitState(process.cwd(), record), record);
});
