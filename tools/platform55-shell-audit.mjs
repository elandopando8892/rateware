import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_COLUMNS = Object.freeze({
  routes: ["route", "page_key", "access", "shell_variant", "owner_sprint", "module_script", "planned_test", "platform55_surfaces", "status", "evidence"],
  matrix: ["build", "ordinal", "state", "name_or_route", "width", "height", "source_manifest", "source_render_plan", "reference_asset", "source_state_identity", "source_duplicate_count", "desktop_applicability", "tablet_applicability", "mobile_applicability", "mapping_status", "target_route", "target_component", "disposition", "evidence"],
  surfaces: ["domain", "page_id", "surface", "current_state", "current_evidence", "target_sprint", "release_gate", "p2_owner_sprint", "p2_target_route", "p2_disposition", "p2_evidence"],
});
const ALLOWED_MATRIX_STATUS = new Set(["implemented", "verified", "dispositioned"]);
const ALLOWED_DISPOSITION = new Set(["implement", "implemented", "shared_surface", "superseded", "reference_only", "out_of_scope_public"]);
const LEGACY_MARKERS = Object.freeze([
  "SHELL_NAV_GROUPS", "PAGE_META", "initLegacySaasShell", "initCommandPalette", "initFocusMode", "initShellNavigation",
  "initShellHeader", "SHELL_NAV_COLLAPSED_KEY", "SHELL_FOCUS_MODE_KEY", ".side-nav", ".shell-layout", ".shell-quick-open",
  ".command-palette", ".shell-focus-toggle", ".shell-focus-mode", ".shell-nav-collapsed", ".shell-status-strip",
]);

function parseCsv(text, expected, label) {
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
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error(`${label} contains an unterminated quoted field`);
  if (field.length || row.length) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  const header = rows.shift();
  if (JSON.stringify(header) !== JSON.stringify(expected) || rows.some((entry) => entry.length !== header.length)) {
    throw new Error(`${label} schema mismatch`);
  }
  return rows.map((entry) => Object.fromEntries(header.map((key, index) => [key, entry[index]])));
}

function occurrences(text, marker) {
  let count = 0;
  let offset = 0;
  while ((offset = text.indexOf(marker, offset)) !== -1) {
    count += 1;
    offset += marker.length;
  }
  return count;
}

function duplicateIds(html) {
  const counts = new Map();
  for (const match of html.matchAll(/\bid=["']([^"']+)["']/g)) counts.set(match[1], (counts.get(match[1]) || 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([id, count]) => ({ id, count })).sort((a, b) => a.id.localeCompare(b.id));
}

function evidencePaths(value) {
  return String(value || "")
    .split(";")
    .map((entry) => entry.split("#")[0].trim())
    .filter((entry) => /^(?:docs|tests|src|tools|output)\//.test(entry));
}

export function auditPlatform55Shell({ rootDir = process.cwd(), candidateSha } = {}) {
  const root = resolve(rootDir);
  const read = (path) => readFileSync(resolve(root, path), "utf8");
  const routes = parseCsv(read("docs/platform55-shell-route-map.csv"), EXPECTED_COLUMNS.routes, "route map");
  const matrix = parseCsv(read("docs/platform55-shell-build-matrix.csv"), EXPECTED_COLUMNS.matrix, "Build matrix");
  const surfaces = parseCsv(read("docs/platform55-surface-inventory.csv"), EXPECTED_COLUMNS.surfaces, "surface inventory");
  const rootHtml = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".html")).map((entry) => entry.name).sort();
  const routeNames = routes.map((row) => row.route).sort();
  const routeResults = [];
  const duplicateIdResults = [];
  const missingLandmarks = [];
  const publicPrivateControls = [];
  const missingModules = [];

  for (const route of routes) {
    const html = read(route.route);
    const bodyIdentity = new RegExp(`<body[^>]*data-platform55-shell=["']${route.shell_variant}["'][^>]*data-platform55-page=["']${route.page_key}["']`).test(html);
    const mainLandmarks = (html.match(/<main\b/g) || []).length;
    const tenantRoots = (html.match(/data-platform55-app/g) || []).length;
    const publicLeak = /data-platform55-sidebar|data-platform55-topbar|class=["'][^"']*rw-nav-link/.test(html);
    const duplicates = duplicateIds(html);
    const missing = route.module_script.split(";").filter(Boolean).filter((modulePath) => !html.includes(modulePath) || !existsSync(resolve(root, modulePath)));
    if (duplicates.length) duplicateIdResults.push({ route: route.route, ids: duplicates });
    if (mainLandmarks !== 1) missingLandmarks.push({ route: route.route, main_landmarks: mainLandmarks });
    if (route.shell_variant !== "tenant" && publicLeak) publicPrivateControls.push(route.route);
    if (missing.length) missingModules.push({ route: route.route, modules: missing });
    routeResults.push({
      route: route.route,
      page_key: route.page_key,
      shell_variant: route.shell_variant,
      body_identity: bodyIdentity,
      main_landmarks: mainLandmarks,
      shell_roots: route.shell_variant === "tenant" ? tenantRoots : Number(bodyIdentity),
      legacy_global_nav: /class=["'][^"']*(?:side-nav|nav-groups)/.test(html),
      private_controls_on_public: route.shell_variant === "tenant" ? false : publicLeak,
      missing_modules: missing,
    });
  }

  const auth = read("src/auth.js");
  const styles = read("src/styles.css");
  const legacySelectorCounts = Object.fromEntries(LEGACY_MARKERS.map((marker) => [
    marker,
    occurrences(marker.startsWith(".") ? styles : auth, marker),
  ]));

  const unresolvedMatrixRows = matrix
    .filter((row) => !ALLOWED_MATRIX_STATUS.has(row.mapping_status) || !ALLOWED_DISPOSITION.has(row.disposition) || !row.evidence.trim())
    .map((row) => `${row.build}:${row.ordinal}:${row.state}`);
  const invalidSurfaceRows = surfaces
    .filter((row) => !ALLOWED_DISPOSITION.has(row.p2_disposition) || !row.p2_evidence.trim() || !row.p2_target_route.trim())
    .map((row) => `${row.domain}:${row.page_id}`);
  const evidenceFiles = [...new Set([
    ...routes.flatMap((row) => evidencePaths(row.evidence)),
    ...matrix.flatMap((row) => evidencePaths(row.evidence)),
    ...surfaces.flatMap((row) => evidencePaths(row.p2_evidence)),
  ])].sort();
  const missingEvidenceFiles = evidenceFiles.filter((path) => !existsSync(resolve(root, path)));
  const errors = [];
  if (routes.length !== 29 || routes.filter((row) => row.shell_variant === "tenant").length !== 22 || routes.filter((row) => row.shell_variant !== "tenant").length !== 7) errors.push("route_count");
  if (JSON.stringify(rootHtml) !== JSON.stringify(routeNames)) errors.push("root_html_inventory");
  if (routeResults.some((row) => !row.body_identity || row.main_landmarks !== 1 || row.shell_roots !== 1 || row.legacy_global_nav || row.private_controls_on_public || row.missing_modules.length)) errors.push("route_adoption");
  if (duplicateIdResults.length) errors.push("duplicate_ids");
  if (Object.values(legacySelectorCounts).some((count) => count !== 0)) errors.push("legacy_shell_ownership");
  if (matrix.length !== 1150 || new Set(matrix.map((row) => row.build)).size !== 12 || unresolvedMatrixRows.length) errors.push("matrix_disposition");
  if (surfaces.length !== 95 || invalidSurfaceRows.length) errors.push("surface_disposition");
  if (missingEvidenceFiles.length) errors.push("missing_evidence_files");

  return {
    schema_version: 1,
    candidate_sha: candidateSha || execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    route_summary: {
      total: routes.length,
      tenant: routes.filter((row) => row.shell_variant === "tenant").length,
      public_or_entry: routes.filter((row) => row.shell_variant !== "tenant").length,
      adopted: routeResults.filter((row) => row.body_identity && row.main_landmarks === 1 && row.shell_roots === 1 && !row.legacy_global_nav && !row.private_controls_on_public && row.missing_modules.length === 0).length,
    },
    route_results: routeResults,
    duplicate_ids: duplicateIdResults,
    missing_landmarks: missingLandmarks,
    public_private_controls: publicPrivateControls,
    missing_modules: missingModules,
    legacy_selector_counts: legacySelectorCounts,
    matrix_summary: {
      builds: new Set(matrix.map((row) => row.build)).size,
      total: matrix.length,
      resolved: matrix.length - unresolvedMatrixRows.length,
      unresolved: unresolvedMatrixRows.length,
    },
    unresolved_matrix_rows: unresolvedMatrixRows,
    surface_summary: {
      total: surfaces.length,
      dispositioned: surfaces.length - invalidSurfaceRows.length,
      invalid: invalidSurfaceRows.length,
    },
    invalid_surface_rows: invalidSurfaceRows,
    evidence_file_summary: {
      checked: evidenceFiles.length,
      missing: missingEvidenceFiles.length,
    },
    missing_evidence_files: missingEvidenceFiles,
    errors,
    ok: errors.length === 0,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = auditPlatform55Shell();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
