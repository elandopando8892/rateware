import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const matrixPath = resolve(root, "docs/platform55-shell-build-matrix.csv");
const manifestPath = resolve(root, "docs/release/evidence/2026-08-23-p2-s6-reference-disposition.json");
const evidencePointer = "docs/release/evidence/2026-08-23-p2-s6-reference-disposition.json";
const expectedArchiveSha256 = "CF2CED85E95DFB33BB7410BF73ACE22CB95090CE649747DF60BF2920E808C16A";
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
  if (!header?.length || rows.some((entry) => entry.length !== header.length)) throw new Error("Build matrix schema mismatch");
  return { header, rows: rows.map((entry) => Object.fromEntries(header.map((key, index) => [key, entry[index]]))) };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function project(rows, columns) {
  return rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
}

function quote(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

const { header, rows } = parseCsv(readFileSync(matrixPath, "utf8"));
const source = JSON.parse(readFileSync(resolve(root, "docs/platform55-build12-source.json"), "utf8"));
if (rows.length !== 1150 || new Set(rows.map((row) => row.build)).size !== 12) throw new Error("Expected the complete 12-Build, 1,150-row matrix");
if (source.sha256 !== expectedArchiveSha256) throw new Error("Build 12 source archive digest mismatch");

const preservedRows = rows.filter((row) => row.mapping_status !== "not_started");
const referenceRows = rows.filter((row) => row.mapping_status === "not_started");
if (preservedRows.length !== 22 || referenceRows.length !== 1128) throw new Error("Expected 22 prior decisions and 1,128 unresolved references");
for (const row of referenceRows) {
  if (row.target_route || row.target_component || row.disposition || row.evidence) throw new Error(`${row.build}:${row.ordinal} has unexpected pre-existing mapping data`);
  row.mapping_status = "dispositioned";
  row.disposition = "reference_only";
  row.evidence = evidencePointer;
}

const referenceRowsByBuild = {};
for (const row of referenceRows) referenceRowsByBuild[row.build] = (referenceRowsByBuild[row.build] || 0) + 1;
const keyFor = (row) => `${row.build}:${row.ordinal}:${row.source_state_identity}`;
const manifest = {
  schema_version: 1,
  evidence_kind: "platform55_s6_reference_disposition",
  baseline_head: "858f8102cb3b5c7ce74955b00e7ac357b6511cdf",
  source_archive_sha256: expectedArchiveSha256,
  decision: "reference_only_no_implementation_credit",
  rationale: "Rows without a previously reviewed executable mapping remain frozen Platform 55 reference identities for future expansion; this S6 disposition does not claim that their features exist in Rateware.",
  total_builds: 12,
  total_states: rows.length,
  preserved_resolved_count: preservedRows.length,
  reference_only_count: referenceRows.length,
  reference_rows_by_build: referenceRowsByBuild,
  preserved_resolved_keys: preservedRows.map(keyFor),
  source_projection_sha256: digest(project(rows, sourceColumns)),
  preserved_projection_sha256: digest(project(preservedRows, [...sourceColumns, ...mappingColumns])),
  reference_projection_sha256: digest(project(referenceRows, [...sourceColumns, ...mappingColumns])),
  matrix_projection_sha256: digest(project(rows, [...sourceColumns, ...mappingColumns])),
  guardrails: [
    "does_not_claim_feature_implementation",
    "does_not_create_routes_components_or_runtime_behavior",
    "preserves_all_source_state_identities",
    "future_expansion_must_replace_reference_only_with_reviewed_evidence",
  ],
};
manifest.canonical_sha256 = digest(manifest);

const csv = `${header.map(quote).join(",")}\n${rows.map((row) => header.map((column) => quote(row[column])).join(",")).join("\n")}\n`;
writeFileSync(matrixPath, csv, "utf8");
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ manifest: evidencePointer, canonical_sha256: manifest.canonical_sha256, reference_only: referenceRows.length })}\n`);
