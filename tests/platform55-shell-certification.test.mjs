import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifestPath = "docs/release/evidence/2026-08-23-p2-s6-reference-disposition.json";
const geometryBaselinePath = "docs/release/evidence/2026-08-23-p2-s6-geometry-baseline.json";
const evidencePointer = manifestPath;
const expectedArchiveSha256 = "CF2CED85E95DFB33BB7410BF73ACE22CB95090CE649747DF60BF2920E808C16A";
const expectedManifestCanonicalSha256 = "9ab99144515a3c120dcd4b99521efa709a9db089c577a371610130c52821467f";
const expectedGeometryBaselineCanonicalSha256 = "9f88ad27e79f790c9590bb6832f2761b35523e614c0e6c2a142936190a09178a";
const sourceColumns = [
  "build", "ordinal", "state", "name_or_route", "width", "height", "source_manifest", "source_render_plan",
  "reference_asset", "source_state_identity", "source_duplicate_count", "desktop_applicability", "tablet_applicability", "mobile_applicability",
];
const mappingColumns = ["mapping_status", "target_route", "target_component", "disposition", "evidence"];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field.length === 0) quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) throw new Error("Unterminated quoted CSV field");
  if (field.length || row.length) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  const header = rows.shift();
  assert.ok(header?.length, "matrix header is required");
  assert.ok(rows.every((entry) => entry.length === header.length), "matrix rows must match the header width");
  return rows.map((entry) => Object.fromEntries(header.map((key, index) => [key, entry[index]])));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function project(rows, columns) {
  return rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
}

assert.ok(existsSync(resolve(root, manifestPath)), `${manifestPath} must exist`);
const manifest = JSON.parse(readFileSync(resolve(root, manifestPath), "utf8"));
const matrix = parseCsv(readFileSync(resolve(root, "docs/platform55-shell-build-matrix.csv"), "utf8"));
const source = JSON.parse(readFileSync(resolve(root, "docs/platform55-build12-source.json"), "utf8"));
const geometryBaseline = JSON.parse(readFileSync(resolve(root, geometryBaselinePath), "utf8"));

assert.equal(manifest.schema_version, 1);
assert.equal(manifest.decision, "reference_only_no_implementation_credit");
assert.equal(manifest.source_archive_sha256, expectedArchiveSha256);
assert.equal(source.sha256, expectedArchiveSha256);
assert.equal(manifest.total_states, 1150);
assert.equal(manifest.preserved_resolved_count, 22);
assert.equal(manifest.reference_only_count, 1128);
assert.equal(matrix.length, 1150);

const manifestForDigest = structuredClone(manifest);
delete manifestForDigest.canonical_sha256;
assert.equal(digest(manifestForDigest), expectedManifestCanonicalSha256, "manifest canonical digest must remain pinned");
assert.equal(manifest.canonical_sha256, expectedManifestCanonicalSha256);

const keys = matrix.map((row) => `${row.build}:${row.ordinal}:${row.source_state_identity}`);
assert.equal(new Set(keys).size, 1150, "all Build state identities must be unique at the matrix-row level");
assert.equal(digest(project(matrix, sourceColumns)), manifest.source_projection_sha256, "all immutable Build source columns must remain pinned");

const preservedKeys = new Set(manifest.preserved_resolved_keys);
assert.equal(preservedKeys.size, 22);
const preservedRows = matrix.filter((row) => preservedKeys.has(`${row.build}:${row.ordinal}:${row.source_state_identity}`));
const referenceRows = matrix.filter((row) => !preservedKeys.has(`${row.build}:${row.ordinal}:${row.source_state_identity}`));
assert.equal(preservedRows.length, 22);
assert.equal(referenceRows.length, 1128);
assert.equal(digest(project(preservedRows, [...sourceColumns, ...mappingColumns])), manifest.preserved_projection_sha256);
assert.equal(digest(project(referenceRows, [...sourceColumns, ...mappingColumns])), manifest.reference_projection_sha256);

for (const row of referenceRows) {
  assert.equal(row.mapping_status, "dispositioned", `${row.build}:${row.ordinal} must be dispositioned`);
  assert.equal(row.target_route, "", `${row.build}:${row.ordinal} must not invent a target route`);
  assert.equal(row.target_component, "", `${row.build}:${row.ordinal} must not invent a target component`);
  assert.equal(row.disposition, "reference_only", `${row.build}:${row.ordinal} must remain reference-only`);
  assert.equal(row.evidence, evidencePointer, `${row.build}:${row.ordinal} must use the exact S6 disposition evidence`);
}

const counts = {};
for (const row of referenceRows) counts[row.build] = (counts[row.build] || 0) + 1;
assert.deepEqual(counts, manifest.reference_rows_by_build);
assert.ok(manifest.guardrails.includes("does_not_claim_feature_implementation"));
assert.ok(manifest.guardrails.includes("future_expansion_must_replace_reference_only_with_reviewed_evidence"));

const geometryProjection = {
  candidate_sha: geometryBaseline.candidate_sha,
  all_route_smoke: geometryBaseline.all_route_smoke.map(({ route, shell_variant, geometry }) => ({ route, shell_variant, geometry })),
  captures: geometryBaseline.captures.map(({ kind, domain, state, route, viewport, geometry }) => ({ kind, domain, state, route, viewport, geometry })),
};
assert.equal(geometryBaseline.candidate_sha, "858f8102cb3b5c7ce74955b00e7ac357b6511cdf");
assert.equal(geometryBaseline.all_route_smoke.length, 29);
assert.equal(geometryBaseline.captures.length, 42);
assert.equal(digest(geometryProjection), expectedGeometryBaselineCanonicalSha256, "accepted S5 geometry projection must remain pinned");
assert.equal(JSON.stringify(geometryBaseline).includes("http://127.0.0.1:"), false, "geometry baseline must not contain nondeterministic local ports");

console.log("Platform55 S6 reference disposition contract passed: 22 prior decisions preserved; 1,128 references retained without implementation credit.");
