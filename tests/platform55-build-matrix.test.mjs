import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const EXPECTED_HASH = "CF2CED85E95DFB33BB7410BF73ACE22CB95090CE649747DF60BF2920E808C16A";
const EXPECTED_COLUMNS = [
  "build",
  "ordinal",
  "state",
  "name_or_route",
  "width",
  "height",
  "source_manifest",
  "source_render_plan",
  "mapping_status",
  "target_route",
  "disposition",
  "evidence"
];
const EXPECTED_STATES_BY_BUILD = Object.freeze({
  build_01: 61,
  build_02: 61,
  build_03: 68,
  build_04: 76,
  build_05: 82,
  build_06: 90,
  build_07: 96,
  build_08: 104,
  build_09: 116,
  build_10: 124,
  build_11: 132,
  build_12: 140
});

function parseCsv(text) {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("Unclosed CSV quote");
  if (field.length > 0 || record.length > 0) {
    record.push(field.replace(/\r$/, ""));
    records.push(record);
  }
  return records;
}

const source = JSON.parse(readFileSync("docs/platform55-build12-source.json", "utf8"));
const records = parseCsv(readFileSync("docs/platform55-shell-build-matrix.csv", "utf8"));
const [header, ...rows] = records;

assert.equal(source.sha256, EXPECTED_HASH);
assert.equal(source.archive_entries, 3239);
assert.equal(source.render_states, 1150);
assert.deepEqual(source.states_by_build, EXPECTED_STATES_BY_BUILD);
assert.deepEqual(header, EXPECTED_COLUMNS);
assert.equal(rows.length, 1150);
assert.ok(rows.every((row) => row.length === EXPECTED_COLUMNS.length));

const byBuild = Object.fromEntries(Object.keys(EXPECTED_STATES_BY_BUILD).map((build) => [build, 0]));
const ordinalKeys = new Set();
for (const row of rows) {
  const [build, ordinal, state, nameOrRoute, width, height, manifest, renderPlan, status, target, disposition, evidence] = row;
  assert.ok(Object.hasOwn(byBuild, build), `Unexpected build ${build}`);
  byBuild[build] += 1;
  assert.match(ordinal, /^\d+$/);
  assert.ok(state.trim(), `${build}/${ordinal} is missing state`);
  assert.ok(nameOrRoute.trim(), `${build}/${ordinal} is missing name_or_route`);
  assert.match(width, /^\d+$/);
  assert.match(height, /^\d+$/);
  assert.ok(manifest.startsWith(`${build}/`));
  assert.ok(renderPlan.startsWith(`${build}/`));
  assert.equal(status, "not_started");
  assert.equal(target, "");
  assert.equal(disposition, "");
  assert.equal(evidence, "");
  assert.equal(ordinalKeys.has(`${build}:${ordinal}`), false, `Duplicate ordinal ${build}:${ordinal}`);
  ordinalKeys.add(`${build}:${ordinal}`);
}

assert.deepEqual(byBuild, EXPECTED_STATES_BY_BUILD);
assert.equal(ordinalKeys.size, 1150);
