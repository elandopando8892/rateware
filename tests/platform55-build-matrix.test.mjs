import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

const internalRoutes = new Set([
  "app.html",
  "business-intelligence.html",
  "catalog-workbench.html",
  "growth-hacking.html",
  "interpretation-memory.html",
  "outreach.html",
  "provider-communications.html",
  "provider-gmail.html",
  "provider-onboarding.html",
  "provider-service.html",
  "ratebook.html",
  "rateware.html",
  "rfx-events.html",
  "rfx-process.html",
  "settings.html",
  "shipper-crm.html",
  "staging-review.html",
  "upload-center.html",
  "upload-history.html",
  "vendor-improvement.html",
  "vendor-support.html",
  "vendors.html"
]);
const publicRoutes = new Set([
  "bid-room-board.html",
  "carrier-profile.html",
  "customer-rfi.html",
  "index.html",
  "ratebook-carrier.html",
  "rfx-bid.html",
  "shipper-profile.html"
]);
const expectedRoutes = new Set([...internalRoutes, ...publicRoutes]);

assert.equal(internalRoutes.size, 22);
assert.equal(publicRoutes.size, 7);
assert.equal(expectedRoutes.size, 29);

const trackedRootHtml = execFileSync("git", ["ls-files", "*.html"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter((entry) => entry && !entry.includes("/"))
  .sort();
assert.deepEqual(trackedRootHtml, [...expectedRoutes].sort());

function recordsToObjects(csvText) {
  const [csvHeader, ...csvRows] = parseCsv(csvText);
  return {
    header: csvHeader,
    rows: csvRows.map((row) => Object.fromEntries(csvHeader.map((column, index) => [column, row[index]])))
  };
}

const routeMap = recordsToObjects(readFileSync("docs/platform55-shell-route-map.csv", "utf8"));
assert.deepEqual(routeMap.header, [
  "route",
  "page_key",
  "access",
  "shell_variant",
  "owner_sprint",
  "module_script",
  "primary_test",
  "platform55_surfaces",
  "status",
  "evidence"
]);
assert.equal(routeMap.rows.length, 29);
assert.deepEqual(routeMap.rows.map((row) => row.route).sort(), [...expectedRoutes].sort());
assert.equal(new Set(routeMap.rows.map((row) => row.route)).size, 29);
assert.equal(new Set(routeMap.rows.map((row) => row.page_key)).size, 29);
for (const route of routeMap.rows) {
  assert.match(route.owner_sprint, /^P2-S[1-5]$/);
  assert.match(route.module_script, /^src\/.+\.js$/);
  assert.match(route.primary_test, /^tests\/.+\.test\.mjs$/);
  assert.ok(route.platform55_surfaces);
  assert.equal(route.status, "not_started");
  assert.equal(route.evidence, "");
  if (internalRoutes.has(route.route)) {
    assert.equal(route.access, "authenticated");
    assert.equal(route.shell_variant, "tenant");
  } else if (route.route === "index.html") {
    assert.equal(route.access, "public_entry");
    assert.equal(route.shell_variant, "entry");
  } else {
    assert.equal(route.access, "public");
    assert.equal(route.shell_variant, "public");
  }
}

const surfaceInventory = recordsToObjects(readFileSync("docs/platform55-surface-inventory.csv", "utf8"));
assert.deepEqual(surfaceInventory.header.slice(-4), [
  "p2_owner_sprint",
  "p2_target_route",
  "p2_disposition",
  "p2_evidence"
]);
assert.equal(surfaceInventory.rows.length, 95);
assert.equal(new Set(surfaceInventory.rows.map((row) => row.page_id)).size, 95);
const allowedDispositions = new Set([
  "implement",
  "shared_surface",
  "superseded",
  "reference_only",
  "out_of_scope_public"
]);
for (const surface of surfaceInventory.rows) {
  assert.match(surface.p2_owner_sprint, /^P2-S[1-5]$/);
  assert.ok(expectedRoutes.has(surface.p2_target_route));
  assert.ok(allowedDispositions.has(surface.p2_disposition));
  assert.ok(surface.p2_evidence.trim());
  const route = routeMap.rows.find((candidate) => candidate.route === surface.p2_target_route);
  assert.ok(
    route.platform55_surfaces.split(";").includes(surface.page_id),
    `${surface.page_id} is missing from ${surface.p2_target_route}`
  );
}
