import assert from "node:assert/strict";
import test from "node:test";
import {
  P3V3_PRODUCT_CANDIDATE,
  P3V3_SOURCE_PATHS,
  loadP3V3SourceSupersession,
  validateP3V3SourceGitState,
  validateP3V3SourceSupersession,
} from "../tools/platform55-p3v3-source-supersession.mjs";
import {
  loadPlatform55SourceSupersessions,
  validateHistoricalSourceParity,
} from "../tools/platform55-s6-source-supersession.mjs";

const sha = (character) => character.repeat(40);
const validRecord = () => ({
  schema_version: 1,
  sprint: "P3-V3",
  verdict: "LOCAL-GO",
  release_credit: "withheld",
  product_candidate_sha: sha("1"),
  product_candidate_tree: sha("2"),
  product_base_sha: sha("3"),
  source_paths: [...P3V3_SOURCE_PATHS],
  source_blobs: Object.fromEntries(P3V3_SOURCE_PATHS.map((path, index) => [path, String(index + 4).repeat(40)])),
});

test("accepts only the exact P3-V3 Procurement and Carrier Network supersession", () => {
  const record = validRecord();
  assert.equal(validateP3V3SourceSupersession(record), record);
  for (const mutate of [
    (copy) => { copy.sprint = "P3-V2"; },
    (copy) => { copy.verdict = "GO"; },
    (copy) => { copy.release_credit = "accepted"; },
    (copy) => { copy.product_candidate_sha = sha("0"); },
    (copy) => { copy.source_paths.reverse(); },
    (copy) => { copy.source_paths.push("carrier-profile.html"); copy.source_blobs["carrier-profile.html"] = sha("9"); },
    (copy) => { copy.source_blobs[P3V3_SOURCE_PATHS[0]] = "fabricated"; },
  ]) {
    const copy = structuredClone(record);
    mutate(copy);
    assert.throws(() => validateP3V3SourceSupersession(copy));
  }
});

test("accepts historical Procurement drift only for exact P3-V3 source blobs", () => {
  const record = validRecord();
  const historicalPaths = P3V3_SOURCE_PATHS.slice(0, 5);
  const historical = Object.fromEntries(historicalPaths.map((path, index) => [path, ["a", "b", "c", "d", "e"][index].repeat(40)]));
  const current = historicalPaths.map((path) => record.source_blobs[path]);
  const input = {
    sourcePaths: historicalPaths,
    manifestBlobs: historical,
    subjectBlobs: historicalPaths.map((path) => historical[path]),
    currentBlobs: current,
    workingBlobs: current,
    supersession: [record],
  };
  assert.equal(validateHistoricalSourceParity(input), historical);

  const wrong = structuredClone(record);
  wrong.source_blobs[historicalPaths[1]] = sha("f");
  assert.throws(() => validateHistoricalSourceParity({ ...input, supersession: [wrong] }), /supersession blob mismatch/);
});

test("binds the checked-in P3-V3 record to the frozen product and working tree", () => {
  const record = loadP3V3SourceSupersession();
  assert.equal(record.product_candidate_sha, P3V3_PRODUCT_CANDIDATE);
  assert.equal(validateP3V3SourceGitState(process.cwd(), record), record);
});

test("registers P3-V3 in the canonical Platform 55 supersession chain", () => {
  const records = loadPlatform55SourceSupersessions();
  assert.deepEqual(records.map(({ sprint }) => sprint), ["P2-S6", "P3-V1", "P3-V2", "P3-V3"]);
});
