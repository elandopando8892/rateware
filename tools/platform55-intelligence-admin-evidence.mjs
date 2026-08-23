import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

export const EXPECTED_P2_S5_SUBJECT = "b78f73fbcba8cad7720bf329f9d65bd20746a147";
export const EXPECTED_P2_S5_MANIFEST_SHA256 = "8320e6294aacd3af527b02cd2973b0ce4971a2ea67c3737f6838e4c67cfbda77";
export const P2_S5_SURFACE_CANDIDATE = Object.freeze({
  path: "docs/release/evidence/2026-08-23-p2-s5-surface-candidate.json",
  sha256: "14c2e99f21bfc4e3d9796df5179b84213d49efd876d176a45ac97522bad53852",
});

const VIEWPORTS = Object.freeze(["1440x900", "1024x768", "390x844"]);
const ROUTES = Object.freeze([
  Object.freeze({ route: "business-intelligence.html", slug: "business-intelligence", kind: "tenant", states: Object.freeze({ loaded: Object.freeze({ qa: "loaded", selector: "#bi-geo-status[data-tone='success']" }), error: Object.freeze({ qa: "error", selector: "#bi-geo-status[data-tone='error']" }) }) }),
  Object.freeze({ route: "growth-hacking.html", slug: "growth-hacking", kind: "tenant", states: Object.freeze({ loaded: Object.freeze({ qa: "loaded", selector: "#growth-global-status.success" }), error: Object.freeze({ qa: "error", selector: "#growth-global-status.error" }) }) }),
  Object.freeze({ route: "settings.html", slug: "settings", kind: "tenant", states: Object.freeze({ loaded: Object.freeze({ qa: "loaded", selector: "#settings-governance-status[data-tone]" }), error: Object.freeze({ qa: "error", selector: "#audit-log-body td" }) }) }),
  Object.freeze({ route: "interpretation-memory.html", slug: "interpretation-memory", kind: "tenant", states: Object.freeze({ loaded: Object.freeze({ qa: "loaded", selector: "#memory-table-status[data-tone='success']" }), error: Object.freeze({ qa: "error", selector: "#memory-table-status[data-tone='error']" }) }) }),
  Object.freeze({ route: "catalog-workbench.html", slug: "catalog-workbench", kind: "tenant", states: Object.freeze({ loaded: Object.freeze({ qa: "loaded", selector: "#catalog-workbench-status[data-tone='success']" }), error: Object.freeze({ qa: "error", selector: "#catalog-workbench-status[data-tone='error']" }) }) }),
  Object.freeze({ route: "index.html", slug: "index", kind: "entry", states: Object.freeze({ loaded: Object.freeze({ qa: "loaded", selector: "#auth-status[data-auth-state='authenticated']" }), "signed-out": Object.freeze({ qa: "signed-out", selector: "#auth-status[data-auth-state='signed-out']" }) }) })
]);
const SOURCE_BLOBS = Object.freeze({
  "business-intelligence.html": "862be0c095280813239c43540bc28fe49ea6d8e9",
  "growth-hacking.html": "594a3ac736497e66277e9c45964599854bb9e06b",
  "settings.html": "88a1449d6dcd78aa02fb1d80b702c5eeb325ada8",
  "interpretation-memory.html": "ef713653b14baf7dca88c247e306eca97f4a1469",
  "catalog-workbench.html": "6457ad076981c443acd0d25fcc4c357faa0d2b87",
  "index.html": "72e2f228efb7d4bd2703a1fc72ffb09889fd6c25",
  "src/business-intelligence.js": "38084169504aec07ce87b1870d543a8b7b825a7f",
  "src/growth-hacking.js": "94a12cdc438a70f4f3386a8d0f0a1555e1992d25",
  "src/settings.js": "c62791800ef846ceb867cbe3d547c0c924d2720f",
  "src/interpretation-memory.js": "8e6d6cde9b0f24d61d0f15884afb456cb775b0db",
  "src/catalog-workbench.js": "50e3b6f2188bb754572fe516c2b28ff9b2265cab",
  "src/landing.js": "504a346ededc3a67d29dad0d181e62adfa00c182",
  "src/platform55-shell.js": "4e42f52b2e77914ab9c26f9f1287925f18ba6ea2",
  "src/platform55-shell.css": "c641d1068f420da458eb46f1d5e8ed11e927378b",
  "src/platform55-public-shell.css": "f4d48af86f2fa12cb3a2b12127a99558fc5fadcd",
  "src/platform55-tokens.css": "9a88c93567b7318458dc42a11daead5e8a2ff0b5",
  "src/platform55-intelligence-admin.css": "f8806eecc823198945a051090c6f15b2a68f3c0b",
  "tools/platform55-intelligence-admin-evidence-server.mjs": "25fbecf6a904b142ffadc30d500291ce9798c74c",
  "tools/capture-platform55-intelligence-admin-evidence.mjs": "bd1dfa420f3159241bbbf0dcb083302b8854e395"
});
const SOURCE_PATHS = Object.freeze(Object.keys(SOURCE_BLOBS));
const MANIFEST_KEYS = Object.freeze(["schema_version", "subject_sha", "routes", "states_by_route", "viewports", "source_git_blobs", "capture_policy", "captures"]);
const CAPTURE_KEYS = Object.freeze([
  "file", "route", "kind", "shell", "state", "qa_state", "viewport", "source_frame", "canvas_normalized", "layout_stability_samples", "state_selector",
  "console_errors", "http_errors", "page_errors", "request_errors", "external_requests", "exact_viewport", "document_overflow", "content_width_ratio",
  "public_header_height_ratio", "public_brand_contrast_ratio", "state_visible", "opposite_state_visible", "state_intersection_ratio", "state_marker", "active_routes", "private_controls",
  "evidence_summaries", "governance_summaries", "demo_data_markers", "system_status", "focusable_count", "reduced_motion", "scroll_x", "overflow_candidates",
  "byte_length", "sha256"
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function sameKeys(value, expected) {
  return isRecord(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function exactArray(actual, expected, label) {
  if (!Array.isArray(actual) || actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} must match the exact frozen order`);
  }
}

function integer(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${label} must be an integer >= ${minimum}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseCsv(text) {
  if (typeof text !== "string" || text.length === 0) throw new Error("CSV evidence must be non-empty text");
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
  if (quoted) throw new Error("CSV evidence contains an unterminated quoted field");
  if (field.length > 0 || row.length > 0) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  const header = rows.shift();
  if (!header?.length || rows.some((entry) => entry.length !== header.length)) throw new Error("CSV evidence has an invalid row width");
  return rows.map((entry) => Object.fromEntries(header.map((key, index) => [key, entry[index]])));
}

function exactSurfaceRationale(mapping) {
  if (mapping.disposition === "implement") {
    return `${mapping.page_id} (${mapping.surface}) is implemented on ${mapping.target_route}; repository state ${mapping.current_state} is evidenced by ${mapping.current_evidence}.`;
  }
  if (mapping.disposition === "shared_surface") {
    return `${mapping.page_id} (${mapping.surface}) shares ${mapping.target_route}; repository state ${mapping.current_state} is evidenced by ${mapping.current_evidence}; no separate product surface is claimed.`;
  }
  return `${mapping.page_id} (${mapping.surface}) is reference-only at ${mapping.target_route}; repository state remains ${mapping.current_state} with evidence ${mapping.current_evidence}; no implementation credit is claimed.`;
}

export function validateP2S5SurfaceCandidateBody(body, { requireGo = false } = {}) {
  if (typeof body !== "string" || sha256(body) !== P2_S5_SURFACE_CANDIDATE.sha256) throw new Error("P2-S5 surface candidate digest mismatch");
  const record = JSON.parse(body);
  const keys = [
    "schema_version", "candidate_parent_sha", "visual_subject_sha", "visual_manifest", "visual_manifest_sha256",
    "reference_archive", "reference_archive_sha256", "route_map", "route_map_sha256", "surface_inventory",
    "surface_inventory_sha256", "review_mode", "verdict", "semantic_credit", "mappings",
  ];
  if (!sameKeys(record, keys)) throw new Error("P2-S5 surface candidate schema mismatch");
  if (record.schema_version !== 1 || record.candidate_parent_sha !== "4886e4a3ba0e73c0355c45bee2a274644cb66e26") throw new Error("P2-S5 candidate identity mismatch");
  if (record.visual_subject_sha !== EXPECTED_P2_S5_SUBJECT || record.visual_manifest_sha256 !== EXPECTED_P2_S5_MANIFEST_SHA256) throw new Error("P2-S5 visual evidence identity mismatch");
  if (record.visual_manifest !== `docs/platform55-evidence/p2-s5/${EXPECTED_P2_S5_SUBJECT}/manifest.json`) throw new Error("P2-S5 visual manifest path mismatch");
  if (record.reference_archive_sha256 !== "CF2CED85E95DFB33BB7410BF73ACE22CB95090CE649747DF60BF2920E808C16A") throw new Error("P2-S5 reference archive mismatch");
  if (record.route_map !== "docs/platform55-shell-route-map.csv" || record.route_map_sha256 !== "12b4db2c5718d96902bac145c041ca978c8778edddf7a268276ab72d7494fe11") throw new Error("P2-S5 route map mismatch");
  if (record.surface_inventory !== "docs/platform55-surface-inventory.csv" || record.surface_inventory_sha256 !== "147bdfc59bf00498d9725a416494b28f10ec1c6975f8b921b277a46273ff97d3") throw new Error("P2-S5 surface inventory mismatch");
  if (record.review_mode !== "candidate-awaiting-independent-detached-review" || record.verdict !== "PENDING-INDEPENDENT-REVIEW" || record.semantic_credit !== "withheld") throw new Error("P2-S5 candidate must withhold semantic credit");
  if (requireGo) throw new Error("P2-S5 candidate is not an independent GO review");
  if (!Array.isArray(record.mappings) || record.mappings.length !== 56) throw new Error("P2-S5 candidate must contain exactly 56 mappings");
  const mappingKeys = ["domain", "page_id", "surface", "current_state", "current_evidence", "target_route", "disposition", "mapping_status", "evidence", "rationale"];
  const seen = new Set();
  for (const mapping of record.mappings) {
    if (!sameKeys(mapping, mappingKeys) || !mappingKeys.every((key) => typeof mapping[key] === "string" && mapping[key].trim())) throw new Error("P2-S5 surface review mismatch");
    if (seen.has(mapping.page_id)) throw new Error("P2-S5 surface review contains duplicate page_id");
    seen.add(mapping.page_id);
    if (!["implement", "shared_surface", "reference_only"].includes(mapping.disposition)) throw new Error("P2-S5 surface review disposition is invalid");
    const expectedStatus = mapping.disposition === "reference_only" ? "dispositioned" : "verified";
    if (mapping.mapping_status !== expectedStatus || mapping.evidence !== P2_S5_SURFACE_CANDIDATE.path || mapping.rationale !== exactSurfaceRationale(mapping)) throw new Error("P2-S5 surface review mismatch");
  }
  return Object.freeze(record);
}

export function validateP2S5SurfaceReconciliation(surfaceText, routeText, record) {
  const surfaces = parseCsv(surfaceText);
  const routes = parseCsv(routeText);
  if (surfaces.length !== 95) throw new Error("surface inventory must contain exactly 95 rows");
  const s5Surfaces = surfaces.filter((row) => row.p2_owner_sprint === "P2-S5");
  const s5Routes = routes.filter((row) => row.owner_sprint === "P2-S5");
  if (s5Surfaces.length !== 56 || s5Routes.length !== 6) throw new Error("P2-S5 surface or route count mismatch");
  const mappings = new Map(record.mappings.map((mapping) => [mapping.page_id, mapping]));
  const routeIndex = new Map(s5Routes.map((route) => [route.route, route]));
  for (const row of s5Surfaces) {
    const mapping = mappings.get(row.page_id);
    const route = routeIndex.get(row.p2_target_route);
    if (!mapping || !route) throw new Error("P2-S5 surface review mismatch");
    for (const [mappingKey, rowKey] of [["domain", "domain"], ["surface", "surface"], ["current_state", "current_state"], ["current_evidence", "current_evidence"], ["target_route", "p2_target_route"], ["disposition", "p2_disposition"]]) {
      if (mapping[mappingKey] !== row[rowKey]) throw new Error("P2-S5 surface review mismatch");
    }
    if (row.p2_evidence !== `${P2_S5_SURFACE_CANDIDATE.path}#${row.page_id}`) throw new Error("P2-S5 surface inventory must use content-addressed review evidence");
    if (route.status !== "verified" || route.evidence !== `docs/platform55-evidence/p2-s5/${EXPECTED_P2_S5_SUBJECT}/manifest.json`) throw new Error("P2-S5 route evidence mismatch");
    if (!route.platform55_surfaces.split(";").includes(row.page_id)) throw new Error("P2-S5 route does not declare the mapped surface");
  }
  if (mappings.size !== s5Surfaces.length) throw new Error("P2-S5 surface review mismatch");
  return Object.freeze({ surfaceCount: s5Surfaces.length, routeCount: s5Routes.length });
}

function expectedCaptures() {
  const result = new Map();
  for (const route of ROUTES) {
    for (const [state, stateConfig] of Object.entries(route.states)) {
      for (const viewport of VIEWPORTS) {
        const identity = `${route.route}|${state}|${viewport}`;
        result.set(identity, Object.freeze({
          file: `${route.slug}-${state}-${viewport}.png`, route: route.route, kind: route.kind, shell: route.kind,
          state, qa_state: stateConfig.qa, viewport, source_frame: viewport, state_selector: stateConfig.selector
        }));
      }
    }
  }
  return result;
}

export function validateP2S5Manifest(manifest) {
  if (!sameKeys(manifest, MANIFEST_KEYS)) throw new Error("manifest must use the exact schema keys");
  if (manifest.schema_version !== 1) throw new Error("schema_version must be 1");
  if (manifest.subject_sha !== EXPECTED_P2_S5_SUBJECT) throw new Error("subject_sha mismatch");
  exactArray(manifest.routes, ROUTES.map(({ route }) => route), "routes");
  exactArray(manifest.viewports, VIEWPORTS, "viewports");
  if (manifest.capture_policy !== "actual routes; deterministic local-only read boundaries; mutations blocked; one fresh context per capture; no external requests") throw new Error("capture_policy mismatch");

  if (!isRecord(manifest.states_by_route) || Object.keys(manifest.states_by_route).length !== ROUTES.length) throw new Error("states_by_route mismatch");
  for (const route of ROUTES) exactArray(manifest.states_by_route[route.route], Object.keys(route.states), `states_by_route.${route.route}`);

  if (!sameKeys(manifest.source_git_blobs, SOURCE_PATHS)) throw new Error("source_git_blobs must match the exact source inventory");
  for (const [path, blob] of Object.entries(manifest.source_git_blobs)) {
    if (!SOURCE_PATHS.includes(path) || blob !== SOURCE_BLOBS[path]) throw new Error(`source_git_blobs.${path} is invalid`);
  }

  const expected = expectedCaptures();
  if (!Array.isArray(manifest.captures) || manifest.captures.length !== expected.size) throw new Error("capture matrix must contain exactly 36 records");
  const seen = new Set();
  for (const capture of manifest.captures) {
    if (!sameKeys(capture, CAPTURE_KEYS)) throw new Error("capture must use the exact schema keys");
    const identity = `${capture.route}|${capture.state}|${capture.viewport}`;
    const required = expected.get(identity);
    if (!required || seen.has(identity)) throw new Error(`capture matrix identity is invalid or duplicated: ${identity}`);
    seen.add(identity);
    for (const [key, value] of Object.entries(required)) if (capture[key] !== value) throw new Error(`${identity}.${key} mismatch`);
    if (capture.canvas_normalized !== false) throw new Error(`${identity}.canvas_normalized must be false`);
    integer(capture.layout_stability_samples, `${identity}.layout_stability_samples`, 3);
    for (const key of ["console_errors", "http_errors", "page_errors", "request_errors", "external_requests", "scroll_x"]) {
      if (capture[key] !== 0) throw new Error(`${identity}.${key} must be zero`);
    }
    if (capture.exact_viewport !== true || capture.document_overflow !== false || capture.state_visible !== true || capture.opposite_state_visible !== false || capture.reduced_motion !== true) throw new Error(`${identity}.opposite_state_visible browser state contract failed`);
    if (!Number.isFinite(capture.content_width_ratio) || capture.content_width_ratio < 0.75 || capture.content_width_ratio > 1) throw new Error(`${identity}.content_width_ratio is invalid`);
    if (!Number.isFinite(capture.state_intersection_ratio) || capture.state_intersection_ratio <= 0 || capture.state_intersection_ratio > 1) throw new Error(`${identity}.state_intersection_ratio is invalid`);
    if (typeof capture.state_marker !== "string" || !capture.state_marker.trim()) throw new Error(`${identity}.state_marker is empty`);
    integer(capture.focusable_count, `${identity}.focusable_count`, 1);
    for (const key of ["active_routes", "private_controls", "evidence_summaries", "governance_summaries", "demo_data_markers"]) integer(capture[key], `${identity}.${key}`);
    if (!Array.isArray(capture.overflow_candidates)) throw new Error(`${identity}.overflow_candidates must be an array`);
    if (typeof capture.system_status !== "string" || /unavailable/i.test(capture.system_status)) throw new Error(`${identity}.system_status is invalid`);
    if (capture.kind === "entry") {
      if (capture.active_routes !== 0 || capture.private_controls !== 0 || capture.demo_data_markers !== 1) throw new Error(`${identity}.private_controls entry isolation failed`);
      if (!(capture.public_header_height_ratio > 0 && capture.public_header_height_ratio <= 0.25) || capture.public_brand_contrast_ratio < 4.5) throw new Error(`${identity} public composition failed`);
    } else if (capture.active_routes !== 1 || capture.private_controls !== 0 || capture.demo_data_markers !== 0) {
      throw new Error(`${identity} tenant isolation failed`);
    }
    integer(capture.byte_length, `${identity}.byte_length`, 1);
    if (!/^[0-9a-f]{64}$/.test(capture.sha256)) throw new Error(`${identity}.sha256 is invalid`);
  }
  if (seen.size !== expected.size) throw new Error("capture matrix is incomplete");
  return Object.freeze({ subject: manifest.subject_sha, captureCount: seen.size, sourceCount: SOURCE_PATHS.length });
}

function inside(root, candidate) {
  const value = relative(root, candidate);
  return value !== ".." && !value.startsWith(`..${sep}`) && !value.includes(`..${sep}`);
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

export async function validateP2S5Evidence({ rootDir = process.cwd() } = {}) {
  const root = resolve(rootDir);
  const evidenceDirectory = resolve(root, `docs/platform55-evidence/p2-s5/${EXPECTED_P2_S5_SUBJECT}`);
  if (!inside(root, evidenceDirectory)) throw new Error("evidence directory escaped the checkout");
  const manifestPath = resolve(evidenceDirectory, "manifest.json");
  const manifestBytes = await readFile(manifestPath);
  if (sha256(manifestBytes) !== EXPECTED_P2_S5_MANIFEST_SHA256) throw new Error("manifest sha256 mismatch");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const result = validateP2S5Manifest(manifest);

  for (const [path, expectedBlob] of Object.entries(manifest.source_git_blobs)) {
    const candidate = resolve(root, path);
    if (!inside(root, candidate)) throw new Error(`source path escaped the checkout: ${path}`);
    if (git(root, ["rev-parse", `HEAD:${path}`]) !== expectedBlob) throw new Error(`HEAD source blob mismatch: ${path}`);
    if (git(root, ["hash-object", path]) !== expectedBlob) throw new Error(`working source blob mismatch: ${path}`);
  }

  for (const capture of manifest.captures) {
    const path = resolve(evidenceDirectory, capture.file);
    if (!inside(evidenceDirectory, path)) throw new Error(`capture path escaped evidence: ${capture.file}`);
    const bytes = await readFile(path);
    if (bytes.length !== capture.byte_length || sha256(bytes) !== capture.sha256) throw new Error(`capture bytes mismatch: ${capture.file}`);
    if (bytes.length < 24 || bytes.subarray(1, 4).toString("ascii") !== "PNG") throw new Error(`capture is not PNG: ${capture.file}`);
    const [width, height] = capture.viewport.split("x").map(Number);
    if (bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height) throw new Error(`capture dimensions mismatch: ${capture.file}`);
  }
  return result;
}
