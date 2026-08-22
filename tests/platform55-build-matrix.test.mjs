import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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
  "reference_asset",
  "source_state_identity",
  "source_duplicate_count",
  "desktop_applicability",
  "tablet_applicability",
  "mobile_applicability",
  "mapping_status",
  "target_route",
  "target_component",
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

const attributes = readFileSync(".gitattributes", "utf8");
assert.match(attributes, /^docs\/platform55-shell-route-map\.csv text eol=lf$/m);
assert.match(attributes, /^docs\/platform55-surface-inventory\.csv text eol=lf$/m);

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();
}

assert.equal(
  sha256("docs/platform55-shell-route-map.csv"),
  "5F74349DD63368B1CDAC516EB9502AF1AFA6EEBE4C912BD5C76E7CC524AD5F53"
);
assert.equal(
  sha256("docs/platform55-surface-inventory.csv"),
  "A96476872DB5DC6430C75A81346295041BF595B54E7FECCF549A489F10FEE490"
);

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

if (process.platform === "win32") {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "rateware-platform55-junction-"));
  const candidateRoot = join(fixtureRoot, "candidate");
  const outsideRoot = join(fixtureRoot, "outside");
  const junctionPath = join(candidateRoot, "ancestor-link");
  const escapedMatrix = join(junctionPath, "nested", "escaped-matrix.csv");

  try {
    mkdirSync(join(candidateRoot, "tools"), { recursive: true });
    mkdirSync(join(outsideRoot, "nested"), { recursive: true });
    copyFileSync(
      "tools/platform55-build12-inventory.ps1",
      join(candidateRoot, "tools", "platform55-build12-inventory.ps1")
    );
    symlinkSync(outsideRoot, junctionPath, "junction");

    assert.throws(
      () => execFileSync("powershell.exe", [
        "-NoProfile",
        "-File",
        join(candidateRoot, "tools", "platform55-build12-inventory.ps1"),
        "-ArchivePath",
        resolve("package.json"),
        "-MatrixPath",
        escapedMatrix,
        "-SourcePath",
        join(candidateRoot, "source.json")
      ], { encoding: "utf8", stdio: "pipe" }),
      (error) => {
        assert.match(String(error.stderr), /reparse point/i);
        return true;
      },
      "an ancestor junction must be rejected before archive validation"
    );
    assert.equal(existsSync(join(outsideRoot, "nested", "escaped-matrix.csv")), false);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

const sourceText = readFileSync("docs/platform55-build12-source.json", "utf8");
const source = JSON.parse(sourceText);
assert.equal(
  sourceText,
  `${JSON.stringify(source, null, 2).replace(/\n/g, "\r\n")}\r\n`,
  "source metadata must use the canonical CRLF JSON form under PowerShell 5.1 and 7"
);
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
  const [
    build,
    ordinal,
    state,
    nameOrRoute,
    width,
    height,
    manifest,
    renderPlan,
    referenceAsset,
    sourceStateIdentity,
    sourceDuplicateCount,
    desktopApplicability,
    tabletApplicability,
    mobileApplicability,
    status,
    targetRoute,
    targetComponent,
    disposition,
    evidence
  ] = row;
  assert.ok(Object.hasOwn(byBuild, build), `Unexpected build ${build}`);
  byBuild[build] += 1;
  assert.match(ordinal, /^\d+$/);
  assert.ok(state.trim(), `${build}/${ordinal} is missing state`);
  assert.ok(nameOrRoute.trim(), `${build}/${ordinal} is missing name_or_route`);
  assert.match(width, /^\d+$/);
  assert.match(height, /^\d+$/);
  assert.ok(manifest.startsWith(`${build}/`));
  assert.ok(renderPlan.startsWith(`${build}/`));
  assert.match(referenceAsset, new RegExp(`^${build}/(?!index\\.html$)[^/]+\\.html$`));
  assert.equal(sourceStateIdentity, `${build}|${state}|${nameOrRoute}|${width}|${height}`);
  assert.match(sourceDuplicateCount, /^[1-9]\d*$/);
  assert.ok(["yes", "no", "unspecified"].includes(desktopApplicability));
  assert.ok(["yes", "no", "unspecified"].includes(tabletApplicability));
  assert.ok(["yes", "no", "unspecified"].includes(mobileApplicability));
  if (width === "0") {
    assert.deepEqual(
      [desktopApplicability, tabletApplicability, mobileApplicability],
      ["unspecified", "unspecified", "unspecified"]
    );
  } else {
    assert.equal([desktopApplicability, tabletApplicability, mobileApplicability].filter((value) => value === "yes").length, 1);
    assert.equal(mobileApplicability, Number(width) <= 900 ? "yes" : "no");
    assert.equal(tabletApplicability, Number(width) > 900 && Number(width) <= 1320 ? "yes" : "no");
    assert.equal(desktopApplicability, Number(width) > 1320 ? "yes" : "no");
  }
  assert.equal(status, "not_started");
  assert.equal(targetRoute, "");
  assert.equal(targetComponent, "");
  assert.equal(disposition, "");
  assert.equal(evidence, "");
  assert.equal(ordinalKeys.has(`${build}:${ordinal}`), false, `Duplicate ordinal ${build}:${ordinal}`);
  ordinalKeys.add(`${build}:${ordinal}`);
}

assert.deepEqual(byBuild, EXPECTED_STATES_BY_BUILD);
assert.equal(ordinalKeys.size, 1150);

const sourceIdentityIndex = EXPECTED_COLUMNS.indexOf("source_state_identity");
const duplicateCountIndex = EXPECTED_COLUMNS.indexOf("source_duplicate_count");
const ordinalIndex = EXPECTED_COLUMNS.indexOf("ordinal");
const sourceIdentityGroups = new Map();
for (const row of rows) {
  const key = row[sourceIdentityIndex];
  const group = sourceIdentityGroups.get(key) ?? [];
  group.push(row);
  sourceIdentityGroups.set(key, group);
}
const duplicateGroups = [...sourceIdentityGroups.entries()].filter(([, group]) => group.length > 1);
assert.deepEqual(
  duplicateGroups.map(([identity, group]) => ({
    identity,
    ordinals: group.map((row) => Number(row[ordinalIndex])).sort((left, right) => left - right)
  })),
  [{
    identity: "build_11|control-testing|#control-testing|0|0",
    ordinals: [22, 59]
  }]
);
for (const [, group] of sourceIdentityGroups) {
  for (const row of group) assert.equal(Number(row[duplicateCountIndex]), group.length);
}

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
  "planned_test",
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
  assert.match(route.planned_test, /^tests\/.+\.test\.mjs$/);
  const testExists = existsSync(route.planned_test);
  assert.ok(route.platform55_surfaces);
  assert.ok(new Set(["not_started", "contract_ready", "implemented", "verified", "dispositioned"]).has(route.status));
  if (testExists) {
    assert.notEqual(route.status, "not_started", `${route.planned_test} is already real but remains marked as not_started`);
  }
  if (route.status === "not_started") assert.equal(route.evidence, "");
  else assert.ok(route.evidence.trim(), `${route.route} ${route.status} status requires evidence`);
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

const readinessPlanFiles = [
  "docs/superpowers/plans/2026-08-21-rateware-platform55-shell-p2-s2-operate.md",
  "docs/superpowers/plans/2026-08-21-rateware-platform55-shell-p2-s3-procurement.md",
  "docs/superpowers/plans/2026-08-21-rateware-platform55-shell-p2-s4-network-service.md",
  "docs/superpowers/plans/2026-08-21-rateware-platform55-shell-p2-s5-intelligence-admin.md",
  "docs/superpowers/plans/2026-08-21-rateware-platform55-shell-p2-s6-certification-release.md"
];
for (const planFile of readinessPlanFiles) {
  const plan = readFileSync(planFile, "utf8");
  assert.doesNotMatch(plan, /docs\/release\/production-readiness\.json/);
  assert.match(plan, /docs\/release\/production-readiness-ledger\.json/);
}

const sprintZeroPlan = readFileSync(
  "docs/superpowers/plans/2026-08-21-rateware-platform55-shell-p2-s0-contract.md",
  "utf8"
);
assert.doesNotMatch(sprintZeroPlan, /reject[^\n]*duplicate state identity within a build/i);
assert.match(sprintZeroPlan, /build_11\|control-testing\|#control-testing\|0\|0/);
assert.match(sprintZeroPlan, /ordinals? `22` and `59`/i);
assert.match(sprintZeroPlan, /planned_test/);
assert.doesNotMatch(sprintZeroPlan, /verification_test/);
