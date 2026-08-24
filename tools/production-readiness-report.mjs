import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  P2_S4_CLOSURE,
  P2_S4_ROUTES,
  P2_S4_SEMANTIC_ROWS,
  validateP2S4EvidenceFiles,
  validateP2S4Manifest,
} from "./platform55-network-service-evidence.mjs";
import {
  P2_S5_CLOSURE,
  validateP2S5IndependentReviewBody,
  validateP2S5Manifest,
  validateP2S5SurfaceCandidateBody,
  validateP2S5SurfaceReconciliation,
} from "./platform55-intelligence-admin-evidence.mjs";
import {
  loadPlatform55SourceSupersessions,
  validateHistoricalSourceParity,
  validateP2S6SourceGitState,
} from "./platform55-s6-source-supersession.mjs";

export const P2_S6_CLOSURE = Object.freeze({
  plan: "docs/superpowers/plans/2026-08-21-rateware-platform55-shell-p2-s6-certification-release.md",
  implementation: "docs/release/evidence/2026-08-23-p2-s6-local-certification.md",
  independentReview: "docs/release/evidence/2026-08-21-p2-s6-independent-review.md",
  reviewedClosure: "4bc7498805dc313c49ec7917dff8f454b0642303",
  reviewedClosureTree: "d5c4c460cc3aa690c500e91a3063423e4c332471",
  releaseMerge: "7a146765ac38bd18a320f32f7e3ed7a7f13c8da7",
  releaseTree: "f044987b224c54578a0ee19db398f612d67e4b76",
  releaseParent: "2ea24dfdcb31df5aa8152c8e8f232fffd34720c8",
  productCandidate: "31ca1105865570acd575ae17eeb25c236df45c7c",
  productTree: "1421417c0f737d8bbd4a420300812f11c38af628",
  productParent: "512c15679957abd5dcbfeee4afe3208d76edab92",
  base: "858f8102cb3b5c7ce74955b00e7ac357b6511cdf",
  manifestSha256: "862d00305774a9627d278a86a5b57b9b1b9fe92d619a641291bcd7e996af5fd4",
  reviewSha256: "1f307cdb83ec63312a524749d72e17c89fdd935559b348b52bcdcdfb618b3733",
  closurePaths: Object.freeze([
    "docs/release/evidence/2026-08-23-p2-s6-local-certification.json",
    "docs/release/evidence/2026-08-23-p2-s6-local-certification.md",
    "tests/platform55-s6-source-supersession.test.mjs",
    "tools/platform55-s6-source-supersession.mjs",
  ]),
  automatedSuite: Object.freeze([
    "npm test PASS on exact P2-S6 closure head 4bc7498805dc313c49ec7917dff8f454b0642303",
    "node tools/platform55-s6-browser-certification.mjs PASS on product candidate 31ca1105865570acd575ae17eeb25c236df45c7c with 29 routes, 42 captures, 3,312 contrast samples, minimum 4.521, 0 missing names, 0 contrast failures, and focus cycles/restoration",
    "npm run validate:action-contract PASS on exact P2-S6 closure head 4bc7498805dc313c49ec7917dff8f454b0642303 with 401 contract, 399 discovered, 0 errors and 1 pre-existing warning",
    "npm audit --audit-level=low PASS on exact P2-S6 closure head 4bc7498805dc313c49ec7917dff8f454b0642303 with 0 vulnerabilities",
    "node --test tests/platform55-s6-source-supersession.test.mjs PASS with 6 of 6 exact source blobs",
  ]),
});

export const P2_S6_PRODUCTION_CLOSURE = Object.freeze({
  record: "docs/release/evidence/2026-08-21-p2-s6-production-smoke-monitoring.json",
  report: "docs/release/evidence/2026-08-21-p2-s6-production-smoke-monitoring.md",
  releaseSha: "7a146765ac38bd18a320f32f7e3ed7a7f13c8da7",
  releaseTree: "f044987b224c54578a0ee19db398f612d67e4b76",
  deploymentId: "dpl_3P6nWwoaqUeDktTMi7HifGG6XAwk",
  deploymentUrl: "rateware-gk93pxg5n-elandopando8892s-projects.vercel.app",
  productionAlias: "rateware.vercel.app",
  productionSmoke: "Production smoke PASS on release 7a146765ac38bd18a320f32f7e3ed7a7f13c8da7 across 7 routes and 3 viewports",
  monitoring: "T+0/T+5/T+15 production monitoring PASS with 0 runtime errors and 0 unexpected writes",
  deployment: "Vercel production deployment dpl_3P6nWwoaqUeDktTMi7HifGG6XAwk READY at rateware.vercel.app",
  previewSmoke: "Authenticated PR #68 preview smoke PASS before squash merge",
});

const P2_S6_PRODUCTION_ROUTES = new Map([
  ["command-center", { path: "/app", shell: "tenant", heading: "Command Center", authenticated: true, activeRoutes: 1 }],
  ["operate", { path: "/rateware", shell: "tenant", heading: "Rateware", authenticated: true, activeRoutes: 1 }],
  ["procurement", { path: "/rfx-events", shell: "tenant", heading: "Bid Room", authenticated: true, activeRoutes: 1 }],
  ["network-service", { path: "/provider-service", shell: "tenant", heading: "Provider Service", authenticated: true, activeRoutes: 1 }],
  ["intelligence", { path: "/business-intelligence?view=brief", shell: "tenant", heading: "Analyze", authenticated: true, activeRoutes: 1 }],
  ["administration", { path: "/settings?view=governance", shell: "tenant", heading: "Settings", authenticated: true, activeRoutes: 1 }],
  ["public-carrier", { path: "/carrier-profile", shell: "public", heading: "Se requiere liga de perfil", authenticated: false, activeRoutes: 0 }],
]);

export function validateP2S6ProductionRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("production record must be an object");
  if (record.schema_version !== 1 || record.mode !== "read_only" || record.environment !== "production") throw new Error("production record header mismatch");
  const release = record.release || {};
  if (release.sha !== P2_S6_PRODUCTION_CLOSURE.releaseSha || release.tree !== P2_S6_PRODUCTION_CLOSURE.releaseTree) throw new Error("release SHA/tree mismatch");
  if (release.deployment_id !== P2_S6_PRODUCTION_CLOSURE.deploymentId || release.deployment_url !== P2_S6_PRODUCTION_CLOSURE.deploymentUrl || release.production_alias !== P2_S6_PRODUCTION_CLOSURE.productionAlias) throw new Error("production deployment identity mismatch");
  if (release.state !== "READY") throw new Error("deployment state must be READY");
  if (release.manual_promotion !== false) throw new Error("manual promotion must remain false");

  if (!Array.isArray(record.routes) || record.routes.length !== P2_S6_PRODUCTION_ROUTES.size) throw new Error("production route matrix must contain 7 routes");
  const seenRoutes = new Set();
  for (const route of record.routes) {
    const expected = P2_S6_PRODUCTION_ROUTES.get(route?.id);
    if (!expected || seenRoutes.has(route.id) || route.shell !== expected.shell) throw new Error("production route identity mismatch");
    seenRoutes.add(route.id);
    if (
      route.path !== expected.path || route.heading !== expected.heading ||
      route.main_landmarks !== 1 || route.active_routes !== expected.activeRoutes ||
      route.authenticated !== expected.authenticated
    ) throw new Error(`route evidence mismatch: ${route.id}`);
    if (route.passed !== true || route.overflow !== false) throw new Error(`route failure: ${route.id}`);
    if (route.console_errors !== 0) throw new Error(`console error: ${route.id}`);
  }

  const responsive = record.responsive || {};
  const exactViewports = ["1440x900", "1024x768", "390x844"];
  if (!Array.isArray(responsive.viewports) || responsive.viewports.join(",") !== exactViewports.join(",")) throw new Error("missing viewport certification");
  if (responsive.mobile_navigation !== true || responsive.focus_trap !== true || responsive.focus_restoration !== true || responsive.viewport_overflow !== 0) throw new Error("responsive interaction certification mismatch");
  const expectedTables = [["operate", 1], ["procurement", 8]];
  if (
    responsive.routes_per_viewport !== 7 ||
    !Array.isArray(responsive.table_checks) || responsive.table_checks.length !== expectedTables.length ||
    expectedTables.some(([route, tables], index) => responsive.table_checks[index]?.route !== route || responsive.table_checks[index]?.tables !== tables || responsive.table_checks[index]?.viewport_overflow !== false) ||
    !Array.isArray(responsive.dialogs) || responsive.dialogs.join(",") !== "global-search,notifications"
  ) throw new Error("responsive coverage mismatch");

  if (!Array.isArray(record.monitoring) || record.monitoring.length !== 3) throw new Error("monitoring must contain T+0, T+5 and T+15");
  const expectedCheckpoints = ["T+0", "T+5", "T+15"];
  const observedTimes = record.monitoring.map((checkpoint, index) => {
    if (checkpoint?.checkpoint !== expectedCheckpoints[index]) throw new Error("monitoring checkpoint identity mismatch");
    if (checkpoint.deployment_ready !== true) throw new Error("deployment state must remain READY");
    if (checkpoint.alias_sha !== P2_S6_PRODUCTION_CLOSURE.releaseSha || checkpoint.production_alias !== P2_S6_PRODUCTION_CLOSURE.productionAlias) throw new Error("monitoring alias SHA mismatch");
    if (checkpoint.runtime_errors !== 0) throw new Error("runtime error detected during monitoring");
    if (checkpoint.client_errors !== 0) throw new Error("client error detected during monitoring");
    if (checkpoint.http_4xx_5xx !== 0 || checkpoint.routes_available !== P2_S6_PRODUCTION_ROUTES.size) throw new Error("route availability or HTTP status mismatch");
    if (checkpoint.unexpected_writes !== 0) throw new Error("unexpected write detected during monitoring");
    const timestamp = Date.parse(checkpoint.observed_at);
    if (!Number.isFinite(timestamp)) throw new Error("monitoring timestamp invalid");
    return timestamp;
  });
  if (!(observedTimes[0] < observedTimes[1] && observedTimes[1] < observedTimes[2])) throw new Error("monitoring order mismatch");
  if (observedTimes[1] - observedTimes[0] < 5 * 60_000 || observedTimes[2] - observedTimes[0] < 15 * 60_000) throw new Error("short monitoring window");

  const supabase = record.supabase || {};
  if (supabase.project_status !== "ACTIVE_HEALTHY" || supabase.persistent_preview_count !== 1) throw new Error("Supabase read-only status mismatch");
  if (supabase.unexpected_writes !== 0) throw new Error("unexpected write detected in Supabase aggregates");
  if (supabase.mutation_authorized !== false) throw new Error("mutation authorization must remain false");
  const aggregateKeys = ["raw_uploads_created", "rate_staging_created", "rate_staging_updated", "rfx_events_created", "rfx_events_updated"];
  if (!supabase.aggregate_checks || aggregateKeys.some((key) => supabase.aggregate_checks[key] !== 0)) throw new Error("unexpected write detected in aggregate checks");
  const boundaryKeys = ["production_data_mutation", "upload_created", "row_approved", "supabase_changed", "manual_promotion"];
  if (!record.boundaries || boundaryKeys.some((key) => record.boundaries[key] !== false)) throw new Error("production boundary violation");
  if (record.verdict !== "GO") throw new Error("production verdict must be GO");
  return record;
}

const IDS = ["P0", "P1", "P2", "P3", "P4", "P5"];
const WEIGHTS = { P0: 4, P1: 9, P2: 7, P3: 7, P4: 6, P5: 4 };
const GATES = [[10, "scope"], [25, "evidence_plan"], [55, "implementation"], [70, "automated_suite"], [85, "independent_review"], [93, "preview_smoke"], [97, "deployment"], [100, "production_smoke"], [100, "monitoring"]];
const FILE_EVIDENCE_KEYS = new Set(["scope", "evidence_plan", "implementation", "independent_review"]);
const P2_S2_CLOSURE = Object.freeze({
  implementation: "docs/release/evidence/2026-08-21-p2-s2-operate.md",
  independentReview: "docs/release/evidence/2026-08-21-p2-s2-independent-review.md",
  manifest: "docs/platform55-evidence/p2-s2/60eb7f341a09f6d65f4344b8606a9779c339712c/manifest.json",
  reviewedHead: "18955d06443d3532823da6725eda90041b15b2e8",
  visualSubject: "60eb7f341a09f6d65f4344b8606a9779c339712c",
  reviewSha256: "377f90847ce2fb9ecb7e707159c8036a9dc040edc624d6c620e70c909c48ee5c",
  automatedSuite: Object.freeze([
    "npm test PASS on exact closure head 18955d06443d3532823da6725eda90041b15b2e8",
    "npm run validate:action-contract PASS with 0 errors and 1 pre-existing warning",
    "npm audit --audit-level=low PASS with 0 vulnerabilities",
    "node tests/platform55-operate-evidence-server.test.mjs PASS with 24 of 24 actual-route captures"
  ])
});
const P2_S3_CLOSURE = Object.freeze({
  plan: "docs/superpowers/plans/2026-08-21-rateware-platform55-shell-p2-s3-procurement.md",
  implementation: "docs/release/evidence/2026-08-21-p2-s3-procurement.md",
  manifest: "docs/platform55-evidence/p2-s3/6917246927a6a13e82abf9e1e84b00b27f172ab7/manifest.json",
  evidenceHead: "23584f218d094a622608c813715247cf16190375",
  visualSubject: "6917246927a6a13e82abf9e1e84b00b27f172ab7",
  manifestObjectSha256: "012f11a9237f9caa54ec45ce45aaa012eac540a2b1b03723a9a192a3079a1eb2",
  automatedSuite: Object.freeze([
    "npm test PASS on exact Procurement evidence head 23584f218d094a622608c813715247cf16190375",
    "npm run test:platform55:procurement PASS with 90 of 90 actual-route captures"
  ])
});
const P2_S3_TENANT_ROUTES = new Set(["vendors.html", "rfx-events.html", "rfx-process.html", "ratebook.html", "outreach.html"]);
const P2_S3_PUBLIC_ROUTES = new Set(["carrier-profile.html", "rfx-bid.html", "bid-room-board.html", "customer-rfi.html", "ratebook-carrier.html"]);
const P2_S3_ROUTES = ["vendors", "rfx-events", "rfx-process", "ratebook", "outreach", "carrier-profile", "rfx-bid", "bid-room-board", "customer-rfi", "ratebook-carrier"];
export const P2_S4_SEMANTIC_CANDIDATE = Object.freeze({
  path: "docs/release/evidence/2026-08-22-p2-s4-semantic-closure.json",
  sha256: "69360116570fceafce4a4e33870d443ff645a0617221469e0e886e1a02fafde0",
  candidateParent: "93a6fc8517bf3edfb298af64a0d0e7a9d4f3621f",
});
const P2_S3_STATES = ["loaded", "error", "lifecycle"];
const P2_S3_VIEWPORTS = ["1440x900", "1024x768", "390x844"];
const P2_S3_SOURCE_PATHS = [
  "vendors.html", "rfx-events.html", "rfx-process.html", "ratebook.html", "outreach.html",
  "carrier-profile.html", "rfx-bid.html", "bid-room-board.html", "customer-rfi.html", "ratebook-carrier.html",
  "src/vendors.js", "src/rfx-events.js", "src/rfx-process.js", "src/ratebook.js", "src/outreach.js",
  "src/carrier-profile.js", "src/rfx-bid.js", "src/bid-room-board.js", "src/customer-rfi.js", "src/ratebook-carrier.js",
  "src/platform55-shell.js", "src/platform55-shell.css", "src/platform55-procurement.css", "src/platform55-public-shell.css",
  "tools/platform55-procurement-evidence-server.mjs"
];
const P2_S3_CAPTURE_MATRIX = new Map(P2_S3_ROUTES.flatMap((route) => P2_S3_STATES.flatMap((state) => P2_S3_VIEWPORTS.map((viewport) => [
  `${route}-${state}-${viewport}.png`,
  {
    route: `${route}.html`,
    state,
    viewport,
    kind: P2_S3_TENANT_ROUTES.has(`${route}.html`) ? "tenant" : "public"
  }
]))));

export function validateP2S3Manifest(manifest) {
  const sourceBlobs = manifest?.source_git_blobs && Object.keys(manifest.source_git_blobs);
  const captureFiles = manifest?.captures?.map((capture) => capture.file).sort();
  if (
    manifest?.schema_version !== 1 ||
    manifest.subject_sha !== P2_S3_CLOSURE.visualSubject ||
    JSON.stringify(manifest.routes) !== JSON.stringify(P2_S3_ROUTES) ||
    JSON.stringify(manifest.states) !== JSON.stringify(P2_S3_STATES) ||
    JSON.stringify(manifest.viewports) !== JSON.stringify(P2_S3_VIEWPORTS) ||
    manifest.captures?.length !== 90 ||
    JSON.stringify(sourceBlobs) !== JSON.stringify(P2_S3_SOURCE_PATHS) ||
    JSON.stringify(captureFiles) !== JSON.stringify([...P2_S3_CAPTURE_MATRIX.keys()].sort())
  ) {
    throw new Error("P2-S3 visual manifest must contain the exact 10 x 3 x 3 matrix and 25 source blobs");
  }
  if (manifest.captures.some((capture) => {
    const expected = P2_S3_CAPTURE_MATRIX.get(capture.file);
    const tenant = expected?.kind === "tenant";
    const publicRoute = expected?.kind === "public";
    return (
      !expected ||
      capture.route !== expected.route ||
      capture.kind !== expected.kind ||
      capture.shell !== expected.kind ||
      capture.state !== expected.state ||
      capture.qa_state !== (expected.state === "lifecycle" ? "loaded" : expected.state) ||
      capture.viewport !== expected.viewport ||
      capture.exact_viewport !== true ||
      capture.document_overflow !== false ||
      capture.state_visible !== true ||
      capture.layout_stability_samples !== 3 ||
      capture.canvas_normalized !== false ||
      capture.source_frame !== capture.viewport ||
      (!tenant && !publicRoute) ||
      (tenant && capture.active_routes !== 1) ||
      (publicRoute && capture.private_controls !== 0)
    );
  })) {
    throw new Error("P2-S3 visual manifest must prove stable exact viewports and public isolation");
  }
  if (manifest.captures.some((capture) => (
    capture.route === "customer-rfi.html" &&
    capture.state === "error" &&
    (
      capture.state_selector !== "#customer-rfi-message" ||
      capture.state_marker !== "Deterministic Customer RFI evidence error" ||
      capture.state_intersection_ratio !== 1
    )
  ))) {
    throw new Error("P2-S3 Customer RFI error target must be the fully visible status element");
  }
  const manifestDigest = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  if (manifestDigest !== P2_S3_CLOSURE.manifestObjectSha256) {
    throw new Error("P2-S3 visual manifest digest mismatch");
  }
  return manifest;
}

export function validateP2S3SourceBlobParity(manifestBlobs, currentBlobs, workingBlobs = currentBlobs, supersession = loadPlatform55SourceSupersessions()) {
  if (!manifestBlobs || currentBlobs?.length !== P2_S3_SOURCE_PATHS.length || workingBlobs?.length !== P2_S3_SOURCE_PATHS.length) {
    throw new Error("P2-S3 source blob parity requires all 25 source paths");
  }
  return validateHistoricalSourceParity({
    sourcePaths: P2_S3_SOURCE_PATHS,
    manifestBlobs,
    subjectBlobs: P2_S3_SOURCE_PATHS.map((path) => manifestBlobs[path]),
    currentBlobs,
    workingBlobs,
    supersession,
  });
}

const isInside = (root, candidate) => {
  const path = relative(root, candidate);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
};

const validateEvidence = (sprint, rootDir) => {
  for (const [key, entries] of Object.entries(sprint.evidence || {})) {
    if (!Array.isArray(entries) || entries.length === 0 || entries.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
      throw new Error(`${sprint.id} ${key} evidence must contain non-empty strings`);
    }
    for (const entry of entries) {
      const value = entry.trim();
      if (FILE_EVIDENCE_KEYS.has(key)) {
        const root = realpathSync(resolve(rootDir));
        if (isAbsolute(value)) throw new Error(`${sprint.id} ${key} evidence must be a relative path inside the evaluated checkout: ${value}`);
        const candidate = resolve(root, value);
        if (!isInside(root, candidate)) throw new Error(`${sprint.id} ${key} evidence is outside the evaluated checkout: ${value}`);
        if (!existsSync(candidate)) throw new Error(`${sprint.id} ${key} evidence file does not exist: ${value}`);
        if (!statSync(candidate).isFile()) throw new Error(`${sprint.id} ${key} evidence must be a regular file: ${value}`);
        if (!isInside(root, realpathSync(candidate))) throw new Error(`${sprint.id} ${key} evidence is outside the evaluated checkout: ${value}`);
      }
    }
  }
};

const hasEvidence = (evidence, key) => Array.isArray(evidence?.[key]) && evidence[key].length > 0;

const requireText = (text, pattern, message) => {
  if (!pattern.test(text)) throw new Error(message);
};

const P2_BUILD_MATRIX_COLUMNS = Object.freeze([
  "build", "ordinal", "state", "name_or_route", "width", "height", "source_manifest", "source_render_plan",
  "reference_asset", "source_state_identity", "source_duplicate_count", "desktop_applicability", "tablet_applicability",
  "mobile_applicability", "mapping_status", "target_route", "target_component", "disposition", "evidence",
]);
const P2_BUILD_MATRIX_COUNTS = Object.freeze({
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
  build_12: 140,
});
const P2_ROUTE_MAP_COLUMNS = Object.freeze([
  "route", "page_key", "access", "shell_variant", "owner_sprint", "module_script", "planned_test",
  "platform55_surfaces", "status", "evidence",
]);
const P2_ROUTE_MAP_COUNT = 29;

const parseCsv = (text) => {
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
  if (!header?.length || rows.some((entry) => entry.length !== header.length)) {
    throw new Error("CSV evidence has an invalid row width");
  }
  return {
    header,
    records: rows.map((entry) => Object.fromEntries(header.map((key, index) => [key, entry[index]]))),
  };
};

const nonEmptyText = (value) => typeof value === "string" && value.trim().length > 0;
const visibleText = (value) => nonEmptyText(value) && !/[\p{Cc}\p{Cf}]/u.test(value);

export function validateP2S4SemanticClosureBody(review, { requireGo = true } = {}) {
  if (typeof review !== "string") throw new Error("P2-S4 semantic closure body must be text");
  const normalized = review.replace(/\r\n/g, "\n");
  const digest = createHash("sha256").update(normalized).digest("hex");
  if (digest !== P2_S4_SEMANTIC_CANDIDATE.sha256) {
    throw new Error("P2-S4 semantic closure body digest mismatch");
  }

  let record;
  try {
    record = JSON.parse(normalized);
  } catch {
    throw new Error("P2-S4 semantic closure body must be valid JSON");
  }
  if (
    !record ||
    typeof record !== "object" ||
    Array.isArray(record) ||
    record.schema_version !== 2 ||
    record.candidate_parent_sha !== P2_S4_SEMANTIC_CANDIDATE.candidateParent ||
    record.reference_archive_sha256 !== P2_S4_CLOSURE.referenceArchiveSha256 ||
    record.matrix_source_projection_sha256 !== P2_S4_CLOSURE.matrixSourceProjectionSha256 ||
    record.route_map_sha256 !== P2_S4_CLOSURE.routeMapSha256 ||
    record.review_mode !== "candidate-awaiting-independent-detached-review" ||
    !Array.isArray(record.mappings) ||
    record.mappings.length !== P2_S4_SEMANTIC_ROWS.length
  ) {
    throw new Error("P2-S4 semantic closure metadata mismatch");
  }

  const pending = record.verdict === "PENDING-INDEPENDENT-REVIEW" && record.semantic_credit === "withheld";
  const accepted = record.verdict === "GO" && record.semantic_credit === "accepted";
  if (!pending && !accepted) throw new Error("P2-S4 semantic closure verdict and semantic credit are inconsistent");
  if (requireGo && !accepted) throw new Error("P2-S4 semantic closure requires independent GO");
  const independent = record.independent_review;
  if (!independent || typeof independent !== "object" || Array.isArray(independent)) {
    throw new Error("P2-S4 semantic closure requires independent review metadata");
  }
  if (pending && (
    independent.verdict !== "PENDING" ||
    independent.reviewed_sha !== "" ||
    independent.reviewer_task !== "" ||
    independent.worktree_detached !== false ||
    independent.worktree_clean !== false
  )) {
    throw new Error("P2-S4 pending semantic closure contains fabricated independent review evidence");
  }
  if (accepted && (
    independent.verdict !== "GO" ||
    !/^[0-9a-f]{40}$/.test(independent.reviewed_sha) ||
    !visibleText(independent.reviewer_task) ||
    independent.worktree_detached !== true ||
    independent.worktree_clean !== true
  )) {
    throw new Error("P2-S4 accepted semantic closure requires exact detached independent review evidence");
  }

  const seen = new Set();
  const rationales = new Set();
  const nonImplementation = new Set(["reference_only", "superseded", "out_of_scope_public"]);
  for (const expected of P2_S4_SEMANTIC_ROWS) {
    const key = `${expected.build}:${expected.ordinal}`;
    const matches = record.mappings.filter((mapping) => `${mapping?.build}:${mapping?.ordinal}` === key);
    if (matches.length !== 1 || seen.has(key)) throw new Error(`P2-S4 semantic closure must contain exactly one ${key} mapping`);
    seen.add(key);
    const mapping = matches[0];
    if (mapping.state !== expected.state || mapping.reference_asset !== expected.reference_asset) {
      throw new Error(`P2-S4 semantic closure reference mismatch: ${key}`);
    }
    if (!visibleText(mapping.rationale) || rationales.has(mapping.rationale.trim())) {
      throw new Error(`P2-S4 semantic closure requires a unique visible rationale: ${key}`);
    }
    rationales.add(mapping.rationale.trim());
    if (mapping.evidence !== P2_S4_SEMANTIC_CANDIDATE.path) {
      throw new Error(`P2-S4 semantic closure evidence mismatch: ${key}`);
    }
    const executable = mapping.disposition === "implement" || mapping.disposition === "shared_surface";
    if (executable) {
      if (
        mapping.mapping_status !== "verified" ||
        !visibleText(mapping.target_route) ||
        !visibleText(mapping.target_component)
      ) {
        throw new Error(`P2-S4 ${mapping.disposition} requires exact route, component, and evidence: ${key}`);
      }
    } else if (nonImplementation.has(mapping.disposition)) {
      if (mapping.mapping_status !== "dispositioned" || mapping.target_route !== "" || mapping.target_component !== "") {
        throw new Error(`P2-S4 non-implementation disposition must not claim an executable target: ${key}`);
      }
    } else {
      throw new Error(`P2-S4 semantic closure disposition is invalid: ${key}`);
    }
  }
  return record;
}

export function validateP2S4IndependentReviewRecord(record, semanticRecord, { requireGo = true } = {}) {
  if (
    !record ||
    typeof record !== "object" ||
    Array.isArray(record) ||
    !semanticRecord ||
    typeof semanticRecord !== "object" ||
    Array.isArray(semanticRecord) ||
    !Array.isArray(record.mappings) ||
    !Array.isArray(semanticRecord.mappings) ||
    record.mappings.length !== P2_S4_SEMANTIC_ROWS.length ||
    semanticRecord.mappings.length !== P2_S4_SEMANTIC_ROWS.length
  ) {
    throw new Error("P2-S4 independent review requires the exact semantic candidate mappings");
  }

  const accepted = record.verdict === "GO" && record.semantic_credit === "accepted";
  const withheld = record.verdict === "NO-GO" && record.semantic_credit === "withheld";
  if (!accepted && !withheld) throw new Error("P2-S4 independent review verdict and semantic credit are inconsistent");
  if (requireGo && !accepted) throw new Error("P2-S4 independent review must record GO with accepted semantic credit");

  const seen = new Set();
  for (const expected of P2_S4_SEMANTIC_ROWS) {
    const key = `${expected.build}:${expected.ordinal}`;
    const matches = record.mappings.filter((mapping) => `${mapping?.build}:${mapping?.ordinal}` === key);
    const semanticMatches = semanticRecord.mappings.filter((mapping) => `${mapping?.build}:${mapping?.ordinal}` === key);
    if (matches.length !== 1 || semanticMatches.length !== 1 || seen.has(key)) {
      throw new Error(`P2-S4 independent review must contain exactly one ${key} mapping`);
    }
    seen.add(key);
    const mapping = matches[0];
    const semantic = semanticMatches[0];
    if (
      mapping.state !== expected.state ||
      mapping.reference_asset !== expected.reference_asset ||
      semantic.state !== expected.state ||
      semantic.reference_asset !== expected.reference_asset
    ) {
      throw new Error(`P2-S4 independent review reference mismatch: ${key}`);
    }

    if (accepted && (
      mapping.result !== "accepted" ||
      mapping.matrix_status !== semantic.mapping_status ||
      mapping.target_route !== semantic.target_route ||
      mapping.target_component !== semantic.target_component ||
      mapping.disposition !== semantic.disposition ||
      mapping.rationale !== semantic.rationale ||
      mapping.evidence !== semantic.evidence
    )) {
      throw new Error(`P2-S4 independent review semantic decision mismatch: ${key}`);
    }
    if (withheld && (
      mapping.result !== "withheld" ||
      mapping.matrix_status !== "not_started" ||
      mapping.target_route !== "" ||
      mapping.target_component !== "" ||
      mapping.evidence !== ""
    )) {
      throw new Error(`P2-S4 withheld review mapping is inconsistent: ${key}`);
    }
  }

  if (withheld && (!Array.isArray(record.findings) || record.findings.length < 1 || record.findings.some((finding) => !visibleText(finding)))) {
    throw new Error("P2-S4 NO-GO review must contain findings");
  }
  if (accepted && (!Array.isArray(record.findings) || record.findings.some((finding) => !visibleText(finding)))) {
    throw new Error("P2-S4 GO review findings must be an array of visible text");
  }
  return record;
}

export function validateP2S4IndependentReviewBody(review, { requireGo = true, semanticRecord } = {}) {
  if (typeof review !== "string") throw new Error("P2-S4 independent review body must be text");
  const normalized = review.replace(/\r\n/g, "\n");
  const digest = createHash("sha256").update(normalized).digest("hex");
  if (digest !== P2_S4_CLOSURE.independentReviewSha256) {
    throw new Error("P2-S4 independent review body digest mismatch");
  }

  let record;
  try {
    record = JSON.parse(normalized);
  } catch {
    throw new Error("P2-S4 independent review body must be valid JSON");
  }
  if (
    record?.schema_version !== 2 ||
    record.reviewed_sha !== P2_S4_CLOSURE.reviewedHead ||
    record.base_sha !== P2_S4_CLOSURE.reviewBase ||
    record.visual_subject !== P2_S4_CLOSURE.subject ||
    record.evidence_head !== P2_S4_CLOSURE.evidenceHead ||
    record.full_gate_head !== P2_S4_CLOSURE.gateHead ||
    record.review_mode !== "independent-detached-read-only" ||
    record.worktree_detached !== true ||
    record.worktree_clean !== true ||
    record.reviewer_task !== P2_S4_CLOSURE.reviewerTask ||
    record.semantic_candidate !== P2_S4_SEMANTIC_CANDIDATE.path ||
    record.semantic_candidate_sha256 !== P2_S4_SEMANTIC_CANDIDATE.sha256 ||
    record.reference_archive_sha256 !== P2_S4_CLOSURE.referenceArchiveSha256 ||
    !Array.isArray(record.mappings) ||
    record.mappings.length !== P2_S4_SEMANTIC_ROWS.length
  ) {
    throw new Error("P2-S4 independent review metadata mismatch");
  }

  return validateP2S4IndependentReviewRecord(record, semanticRecord, { requireGo });
}

export function validateP2S4SemanticReconciliation(matrixText, reviewRecord, { rootDir = process.cwd(), routeMapText, requireGo = false } = {}) {
  const { header, records } = parseCsv(matrixText);
  if (JSON.stringify(header) !== JSON.stringify(P2_BUILD_MATRIX_COLUMNS) || records.length !== 1150) {
    throw new Error("P2-S4 semantic reconciliation requires the exact 1,150-row Build matrix schema");
  }
  const matrixKeys = new Set();
  const buildCounts = Object.fromEntries(Object.keys(P2_BUILD_MATRIX_COUNTS).map((build) => [build, 0]));
  for (const row of records) {
    const key = `${row.build}:${row.ordinal}`;
    if (
      !Object.hasOwn(P2_BUILD_MATRIX_COUNTS, row.build) ||
      !/^\d+$/.test(row.ordinal) ||
      matrixKeys.has(key) ||
      !nonEmptyText(row.state) ||
      !nonEmptyText(row.name_or_route) ||
      row.source_state_identity !== `${row.build}|${row.state}|${row.name_or_route}|${row.width}|${row.height}` ||
      !row.reference_asset.startsWith(`${row.build}/`) ||
      !row.reference_asset.endsWith(".html")
    ) {
      throw new Error(`P2-S4 Build matrix source identity mismatch: ${key}`);
    }
    matrixKeys.add(key);
    buildCounts[row.build] += 1;
  }
  if (Object.keys(P2_BUILD_MATRIX_COUNTS).some((build) => buildCounts[build] !== P2_BUILD_MATRIX_COUNTS[build])) {
    throw new Error("P2-S4 semantic reconciliation requires the canonical Build row distribution");
  }
  const sourceProjection = records.map((row) => P2_BUILD_MATRIX_COLUMNS.slice(0, 14).map((column) => row[column]));
  const sourceProjectionDigest = createHash("sha256").update(JSON.stringify(sourceProjection)).digest("hex");
  if (sourceProjectionDigest !== P2_S4_CLOSURE.matrixSourceProjectionSha256) {
    throw new Error("P2-S4 Build matrix source projection digest mismatch");
  }
  if (!Array.isArray(reviewRecord?.mappings) || reviewRecord.mappings.length !== P2_S4_SEMANTIC_ROWS.length) {
    throw new Error("P2-S4 semantic reconciliation requires the exact 13 review mappings");
  }
  const reviewKeys = new Set(reviewRecord.mappings.map((mapping) => `${mapping?.build}:${mapping?.ordinal}`));
  if (reviewKeys.size !== P2_S4_SEMANTIC_ROWS.length) throw new Error("P2-S4 semantic reconciliation contains duplicate review mappings");
  if (requireGo && (reviewRecord.verdict !== "GO" || reviewRecord.semantic_credit !== "accepted")) {
    throw new Error("P2-S4 semantic reconciliation requires independent GO with accepted semantic credit");
  }
  if (Object.hasOwn(reviewRecord, "verdict")) {
    const accepted = reviewRecord.verdict === "GO" && reviewRecord.semantic_credit === "accepted";
    const pending = reviewRecord.verdict === "PENDING-INDEPENDENT-REVIEW" && reviewRecord.semantic_credit === "withheld";
    if (!accepted && !pending) throw new Error("P2-S4 semantic reconciliation verdict and semantic credit are inconsistent");
  }

  const root = realpathSync(resolve(rootDir));
  const routeMapSource = routeMapText ?? readFileSync(resolve(root, "docs/platform55-shell-route-map.csv"), "utf8");
  const routeMapDigest = createHash("sha256").update(routeMapSource).digest("hex");
  if (routeMapDigest !== P2_S4_CLOSURE.routeMapSha256) {
    throw new Error("P2-S4 route map digest mismatch");
  }
  const routeMap = parseCsv(routeMapSource);
  if (JSON.stringify(routeMap.header) !== JSON.stringify(P2_ROUTE_MAP_COLUMNS) || routeMap.records.length !== P2_ROUTE_MAP_COUNT) {
    throw new Error("P2-S4 semantic reconciliation requires the canonical 29-row route map schema");
  }
  const routeRecords = routeMap.records;
  if (new Set(routeRecords.map((row) => row.route)).size !== P2_ROUTE_MAP_COUNT) {
    throw new Error("P2-S4 route map routes must be unique");
  }

  for (const expected of P2_S4_SEMANTIC_ROWS) {
    const key = `${expected.build}:${expected.ordinal}`;
    const rows = records.filter((row) => `${row.build}:${row.ordinal}` === key);
    if (rows.length !== 1) throw new Error(`${key} must appear exactly once in the Build matrix`);
    const row = rows[0];
    const mapping = reviewRecord.mappings.find((candidate) => `${candidate?.build}:${candidate?.ordinal}` === key);
    if (!mapping || mapping.state !== expected.state || mapping.reference_asset !== expected.reference_asset) {
      throw new Error(`${key} must match the pinned Build reference semantics`);
    }
    if (row.state !== expected.state || row.reference_asset !== expected.reference_asset) {
      throw new Error(`${key} Build matrix source identity mismatch`);
    }
    const mappingStatus = mapping.mapping_status ?? mapping.matrix_status;
    if (!mappingStatus) {
      throw new Error(`${key} must be implemented before P2-S4 semantic credit`);
    }
    const legacyImplemented = mappingStatus === "implemented" && !mapping.disposition;
    const disposition = legacyImplemented ? "implement" : mapping.disposition;
    const executable = disposition === "implement" || disposition === "shared_surface";
    const nonImplementation = new Set(["reference_only", "superseded", "out_of_scope_public"]);
    if (!executable && !nonImplementation.has(disposition)) {
      throw new Error(`${key} has an unsupported semantic disposition`);
    }
    if (!nonEmptyText(mapping.evidence)) {
      if (executable) throw new Error(`${key} ${disposition} requires exact route, component, and evidence`);
      throw new Error(`${key} non-implementation disposition requires exact evidence`);
    }
    if (!legacyImplemented && !nonEmptyText(mapping.rationale)) {
      throw new Error(`${key} semantic disposition requires a row-specific rationale`);
    }

    if (executable) {
      if (!nonEmptyText(mapping.target_route) || !nonEmptyText(mapping.target_component)) {
        throw new Error(`${key} ${disposition} requires exact route, component, and evidence`);
      }
      if (!legacyImplemented && mappingStatus !== "verified") {
        throw new Error(`${key} executable semantic mapping must be verified`);
      }
      if (legacyImplemented && mapping.result !== "accepted") {
        throw new Error(`${key} must have an accepted independent semantic mapping`);
      }
      const targetRoutes = routeRecords.filter((candidate) => candidate.route === mapping.target_route);
      const target = targetRoutes[0];
      const targetComponents = new Set((target?.platform55_surfaces || "").split(";").filter(Boolean));
      if (
        !P2_S4_ROUTES.includes(mapping.target_route) ||
        targetRoutes.length !== 1 ||
        target.owner_sprint !== "P2-S4" ||
        target.status !== "contract_ready" ||
        !targetComponents.has(mapping.target_component) ||
        !existsSync(resolve(root, mapping.target_route)) ||
        !statSync(resolve(root, mapping.target_route)).isFile()
      ) {
        throw new Error(`${key} must resolve to a real P2-S4 target route and declared component: ${mapping.target_route}`);
      }
    } else {
      if (mappingStatus !== "dispositioned") {
        throw new Error(`${key} non-implementation disposition must be dispositioned`);
      }
      if (mapping.target_route !== "" || mapping.target_component !== "") {
        throw new Error(`${key} non-implementation disposition must not claim an executable target`);
      }
    }

    const expectedRowDisposition = legacyImplemented ? "implemented" : disposition;
    if (
      row.mapping_status !== mappingStatus ||
      row.target_route !== mapping.target_route ||
      row.target_component !== mapping.target_component ||
      row.disposition !== expectedRowDisposition ||
      row.evidence !== mapping.evidence
    ) {
      throw new Error(`${key} Build matrix credit must exactly match the semantic review`);
    }
  }
  return reviewRecord;
}

export function validateP2S2ReviewBody(review) {
  if (typeof review !== "string") throw new Error("P2 independent review body must be text");
  const normalized = review.replace(/\r\n/g, "\n");
  const digest = createHash("sha256").update(normalized).digest("hex");
  if (digest !== P2_S2_CLOSURE.reviewSha256) {
    throw new Error("P2 independent review body digest mismatch");
  }
  return review;
}

const validateP2S2Closure = (sprint, rootDir) => {
  if (sprint.id !== "P2" || sprint.progress < 45) return;
  const evidence = sprint.evidence || {};
  if (!P2_S2_CLOSURE.automatedSuite.every((entry) => evidence.automated_suite?.includes(entry))) {
    throw new Error("P2 automated_suite must contain the exact P2-S2 closure gates");
  }
  if (!evidence.implementation?.includes(P2_S2_CLOSURE.implementation)) {
    throw new Error("P2 implementation must contain the exact P2-S2 closure evidence");
  }
  if (!evidence.independent_review?.includes(P2_S2_CLOSURE.independentReview)) {
    throw new Error("P2 independent_review must contain the exact P2-S2 review evidence");
  }
  if (sprint.verdicts?.independent_review !== "GO") {
    throw new Error("P2 requires independent_review GO for the P2-S2 closure");
  }

  const root = realpathSync(resolve(rootDir));
  const implementation = readFileSync(resolve(root, P2_S2_CLOSURE.implementation), "utf8");
  const review = readFileSync(resolve(root, P2_S2_CLOSURE.independentReview), "utf8");
  const manifest = JSON.parse(readFileSync(resolve(root, P2_S2_CLOSURE.manifest), "utf8"));
  validateP2S2ReviewBody(review);
  if (!implementation.includes(`Final candidate SHA: \`${P2_S2_CLOSURE.visualSubject}\``)) {
    throw new Error("P2 implementation evidence must name the immutable visual subject");
  }
  if (!implementation.includes(`Evidence closure HEAD reviewed independently: \`${P2_S2_CLOSURE.reviewedHead}\``)) {
    throw new Error("P2 implementation evidence must name the reviewed closure HEAD");
  }
  requireText(implementation, /Local implementation verdict:\s*GO/i, "P2 implementation evidence must record GO");
  requireText(review, /Verdict:\s*GO/i, "P2 independent review must record GO");
  requireText(review, new RegExp(P2_S2_CLOSURE.reviewedHead), "P2 independent review must name the reviewed closure HEAD");
  requireText(review, new RegExp(P2_S2_CLOSURE.visualSubject), "P2 independent review must name the immutable visual subject");
  requireText(review, /No push, pull-request mutation, preview, deployment, promotion, Supabase change/i, "P2 independent review must preserve local-only boundaries");
  if (manifest.schema_version !== 4 || manifest.subject_sha !== P2_S2_CLOSURE.visualSubject || manifest.captures?.length !== 24) {
    throw new Error("P2 visual manifest must be schema v4 with the exact subject and 24 captures");
  }
  if (manifest.captures.some((capture) => capture.console_errors !== 0 || capture.http_errors !== 0 || capture.state_visible !== true || capture.state_intersection_ratio < 0.8)) {
    throw new Error("P2 visual manifest must prove visible states with zero console and HTTP errors");
  }
  const sourcePaths = Object.keys(manifest.source_git_blobs || {});
  const gitBlobs = (revision) => execFileSync(
    "git",
    ["-C", root, "rev-parse", ...sourcePaths.map((path) => `${revision}:${path}`)],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim().split(/\r?\n/);
  const workingBlobs = execFileSync(
    "git",
    ["-C", root, "hash-object", "--", ...sourcePaths],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim().split(/\r?\n/);
  validateHistoricalSourceParity({
    sourcePaths,
    manifestBlobs: manifest.source_git_blobs,
    subjectBlobs: gitBlobs(P2_S2_CLOSURE.visualSubject),
    currentBlobs: gitBlobs("HEAD"),
    workingBlobs,
    supersession: loadPlatform55SourceSupersessions(root),
  });
};

export function validateP2S6IndependentReviewBody(body) {
  if (typeof body !== "string") throw new Error("P2-S6 independent review body must be text");
  const normalized = body.replace(/\r\n/g, "\n");
  const digest = createHash("sha256").update(normalized).digest("hex");
  if (digest !== P2_S6_CLOSURE.reviewSha256) throw new Error("P2-S6 independent review digest mismatch");

  requireText(normalized, /^Verdict:\s*GO$/im, "P2-S6 independent review verdict must be GO");
  requireText(normalized, new RegExp(P2_S6_CLOSURE.reviewedClosure, "i"), "P2-S6 independent review must name the exact reviewed closure");
  requireText(normalized, new RegExp(P2_S6_CLOSURE.productCandidate, "i"), "P2-S6 independent review must name the exact product candidate");
  requireText(normalized, new RegExp(P2_S6_CLOSURE.productTree, "i"), "P2-S6 independent review must name the exact product tree");
  requireText(normalized, new RegExp(P2_S6_CLOSURE.manifestSha256, "i"), "P2-S6 independent review must name the exact browser manifest");
  requireText(normalized, /Routes:\s*`29`/i, "P2-S6 independent review must cover all 29 routes");
  requireText(normalized, /Captures:\s*`42`/i, "P2-S6 independent review must cover all 42 captures");
  requireText(normalized, /Contrast samples:\s*`3312`/i, "P2-S6 independent review must record all contrast samples");
  requireText(normalized, /Minimum contrast:\s*`4\.521:1`/i, "P2-S6 independent review must preserve the minimum passing contrast");
  requireText(normalized, /Contrast failures:\s*`0`/i, "P2-S6 independent review must record zero contrast failures");
  requireText(normalized, /Missing accessible names:\s*`0`/i, "P2-S6 independent review must record zero missing accessible names");
  requireText(normalized, /P0:\s*`0`[\s\S]*P1:\s*`0`[\s\S]*P2:\s*`0`/i, "P2-S6 independent review must record zero material findings");
  requireText(normalized, /Focus cycles and restoration:\s*`PASS`/i, "P2-S6 independent review must prove focus cycles and restoration");
  requireText(normalized, /Accessible-name coverage:\s*`tenant`,\s*`public`,\s*and\s*`entry`/i, "P2-S6 independent review must cover accessible names on every shell kind");
  requireText(normalized, /Adversarial rejections:.*missing accessible name.*`1:1` contrast.*forward focus escape.*backward focus escape/i, "P2-S6 independent review must reject the prior accessibility false-PASS paths");
  requireText(normalized, /The review was read-only\. It performed no push, pull-request mutation, Vercel build, deployment, promotion, Kinde change, Supabase branch, migration, DDL, DML, secret change, upload, approval, or production-data mutation\./i, "P2-S6 independent review must preserve the local-only boundary");

  return Object.freeze({
    verdict: "GO",
    reviewedClosure: P2_S6_CLOSURE.reviewedClosure,
    productCandidate: P2_S6_CLOSURE.productCandidate,
    productTree: P2_S6_CLOSURE.productTree,
    manifestSha256: P2_S6_CLOSURE.manifestSha256,
    routes: 29,
    captures: 42,
    contrastSamples: 3312,
    minimumContrast: 4.521,
    missingNames: 0,
    contrastFailures: 0,
    p0: 0,
    p1: 0,
    p2: 0,
  });
}

const validateP2S3Closure = (sprint, rootDir) => {
  if (sprint.id !== "P2" || sprint.progress < 60) return;
  const evidence = sprint.evidence || {};
  if (!evidence.evidence_plan?.includes(P2_S3_CLOSURE.plan)) {
    throw new Error("P2 evidence_plan must contain the exact P2-S3 plan");
  }
  if (!evidence.implementation?.includes(P2_S3_CLOSURE.implementation)) {
    throw new Error("P2 implementation must contain the exact P2-S3 evidence");
  }
  if (!P2_S3_CLOSURE.automatedSuite.every((entry) => evidence.automated_suite?.includes(entry))) {
    throw new Error("P2 automated_suite must contain the exact P2-S3 gates");
  }

  const root = realpathSync(resolve(rootDir));
  const implementation = readFileSync(resolve(root, P2_S3_CLOSURE.implementation), "utf8");
  const manifestPath = resolve(root, P2_S3_CLOSURE.manifest);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  requireText(implementation, new RegExp(`Visual subject SHA:\\s*\\\`${P2_S3_CLOSURE.visualSubject}\\\``), "P2-S3 evidence must name the visual subject");
  requireText(implementation, new RegExp(`Evidence and full-gate HEAD:\\s*\\\`${P2_S3_CLOSURE.evidenceHead}\\\``), "P2-S3 evidence must name the full-gate HEAD");
  requireText(implementation, /90 of 90 actual-route captures/i, "P2-S3 evidence must record all 90 captures");
  requireText(implementation, /Local implementation verdict:\s*GO/i, "P2-S3 evidence must record local GO");
  requireText(implementation, /independent review.*pending/i, "P2-S3 evidence must keep independent review pending");
  requireText(implementation, /global Platform55 verdict:\s*NO-GO/i, "P2-S3 evidence must keep the global verdict NO-GO");
  requireText(implementation, /No push, PR metadata, preview, deployment, promotion, Supabase change/i, "P2-S3 evidence must preserve local-only boundaries");

  validateP2S3Manifest(manifest);
  const gitBlobs = (revision, paths) => execFileSync(
    "git",
    ["-C", root, "rev-parse", ...paths.map((path) => `${revision}:${path}`)],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  ).trim().split(/\r?\n/);
  const workingBlobs = (paths) => execFileSync(
    "git",
    ["-C", root, "hash-object", "--", ...paths],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  ).trim().split(/\r?\n/);
  const currentSourceBlobs = gitBlobs("HEAD", P2_S3_SOURCE_PATHS);
  validateP2S3SourceBlobParity(manifest.source_git_blobs, currentSourceBlobs, workingBlobs(P2_S3_SOURCE_PATHS));
  const evidenceDirectory = dirname(manifestPath);
  const evidencePaths = [
    P2_S3_CLOSURE.manifest,
    ...manifest.captures.map((capture) => `${P2_S3_CLOSURE.manifest.slice(0, P2_S3_CLOSURE.manifest.lastIndexOf("/") + 1)}${capture.file}`)
  ];
  const currentEvidenceBlobs = gitBlobs("HEAD", evidencePaths);
  const workingEvidenceBlobs = workingBlobs(evidencePaths);
  for (const [index, evidencePath] of evidencePaths.entries()) {
    if (workingEvidenceBlobs[index] !== currentEvidenceBlobs[index]) {
      throw new Error(`P2-S3 evidence working-tree drift: ${evidencePath}`);
    }
  }
  for (const capture of manifest.captures) {
    const png = readFileSync(resolve(evidenceDirectory, capture.file));
    const [, width, height] = capture.viewport.match(/^(\d+)x(\d+)$/) || [];
    if (
      png.subarray(1, 4).toString("ascii") !== "PNG" ||
      png.length !== capture.byte_length ||
      png.readUInt32BE(16) !== Number(width) ||
      png.readUInt32BE(20) !== Number(height) ||
      createHash("sha256").update(png).digest("hex") !== capture.sha256
    ) {
      throw new Error(`P2-S3 PNG integrity mismatch: ${capture.file}`);
    }
  }
};

const validateP2S4Closure = (sprint, rootDir) => {
  if (sprint.id !== "P2" || sprint.progress < 70) return;
  const evidence = sprint.evidence || {};
  if (!evidence.evidence_plan?.includes(P2_S4_CLOSURE.plan)) {
    throw new Error("P2-S4 evidence_plan must contain the exact Network and Service plan");
  }
  if (!evidence.implementation?.includes(P2_S4_CLOSURE.implementation)) {
    throw new Error("P2-S4 implementation must contain the exact Network and Service evidence");
  }
  if (!P2_S4_CLOSURE.automatedSuite.every((entry) => evidence.automated_suite?.includes(entry))) {
    throw new Error("P2-S4 automated_suite must contain the exact Network and Service gates");
  }
  if (!evidence.independent_review?.includes(P2_S4_SEMANTIC_CANDIDATE.path)) {
    throw new Error("P2-S4 independent review must contain the exact content-addressed semantic closure");
  }
  if (!evidence.independent_review?.includes(P2_S4_CLOSURE.independentReview)) {
    throw new Error("P2-S4 independent review must contain the exact accepted semantic review");
  }

  const root = realpathSync(resolve(rootDir));
  const implementation = readFileSync(resolve(root, P2_S4_CLOSURE.implementation), "utf8");
  const semanticClosure = readFileSync(resolve(root, P2_S4_SEMANTIC_CANDIDATE.path), "utf8");
  const independentReview = readFileSync(resolve(root, P2_S4_CLOSURE.independentReview), "utf8");
  const manifest = JSON.parse(readFileSync(resolve(root, P2_S4_CLOSURE.manifest), "utf8"));
  requireText(implementation, new RegExp(`Visual subject SHA:\\s*\\\`${P2_S4_CLOSURE.subject}\\\``), "P2-S4 evidence must name the visual subject");
  requireText(implementation, new RegExp(`Evidence artifact HEAD:\\s*\\\`${P2_S4_CLOSURE.evidenceHead}\\\``), "P2-S4 evidence must name the immutable evidence artifact HEAD");
  requireText(implementation, new RegExp(`Full-gate HEAD:\\s*\\\`${P2_S4_CLOSURE.gateHead}\\\``), "P2-S4 evidence must name the immutable full-gate HEAD");
  requireText(implementation, /48 of 48 actual-route captures/i, "P2-S4 evidence must record all 48 captures");
  requireText(implementation, /Local implementation verdict:\s*GO/i, "P2-S4 evidence must record local GO");
  requireText(implementation, /Build12 semantic equivalence credit:\s*withheld/i, "P2-S4 historical evidence must preserve the withheld semantic finding");
  const semanticRecord = validateP2S4SemanticClosureBody(semanticClosure, { requireGo: false });
  const reviewRecord = validateP2S4IndependentReviewBody(independentReview, { semanticRecord });
  validateP2S4SemanticReconciliation(
    readFileSync(resolve(root, "docs/platform55-shell-build-matrix.csv"), "utf8"),
    reviewRecord,
    { rootDir: root, requireGo: true },
  );
  requireText(implementation, /global Platform55 verdict:\s*NO-GO/i, "P2-S4 evidence must keep the global verdict NO-GO");
  requireText(implementation, /No push, PR metadata, preview, deployment, promotion, Supabase change/i, "P2-S4 evidence must preserve local-only boundaries");
  validateP2S4Manifest(manifest);
  validateP2S4EvidenceFiles(root, manifest);
};

const validateP2S5Closure = (sprint, rootDir) => {
  if (sprint.id !== "P2" || sprint.progress < 80) return;
  const evidence = sprint.evidence || {};
  if (!evidence.evidence_plan?.includes(P2_S5_CLOSURE.plan)) throw new Error("P2-S5 evidence_plan must contain the exact Intelligence and Administration plan");
  if (!evidence.implementation?.includes(P2_S5_CLOSURE.implementation)) throw new Error("P2-S5 implementation must contain the exact candidate evidence");
  if (!P2_S5_CLOSURE.automatedSuite.every((entry) => evidence.automated_suite?.includes(entry))) throw new Error("P2-S5 automated_suite must contain the exact detached review gates");
  if (!evidence.independent_review?.includes(P2_S5_CLOSURE.candidate) || !evidence.independent_review?.includes(P2_S5_CLOSURE.independentReview)) throw new Error("P2-S5 independent_review must contain the exact candidate and accepted review");

  const root = realpathSync(resolve(rootDir));
  const implementation = readFileSync(resolve(root, P2_S5_CLOSURE.implementation), "utf8");
  const candidateBody = readFileSync(resolve(root, P2_S5_CLOSURE.candidate), "utf8");
  const reviewBody = readFileSync(resolve(root, P2_S5_CLOSURE.independentReview), "utf8");
  const surfaceText = readFileSync(resolve(root, "docs/platform55-surface-inventory.csv"), "utf8");
  const routeText = readFileSync(resolve(root, "docs/platform55-shell-route-map.csv"), "utf8");
  const manifestPath = resolve(root, P2_S5_CLOSURE.manifest);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const candidate = validateP2S5SurfaceCandidateBody(candidateBody);
  const review = validateP2S5IndependentReviewBody(reviewBody, { candidateRecord: candidate });
  validateP2S5SurfaceReconciliation(surfaceText, routeText, candidate);
  validateP2S5Manifest(manifest);
  requireText(implementation, /36 actual-route captures/i, "P2-S5 evidence must record all 36 captures");
  requireText(implementation, /PENDING-INDEPENDENT-REVIEW/i, "P2-S5 historical candidate evidence must preserve its pending verdict");
  requireText(implementation, /created no push, pull request, Vercel build, Kinde change, Supabase branch/i, "P2-S5 evidence must preserve local-only boundaries");
  if (review.verdict !== "GO" || review.semantic_credit !== "accepted") throw new Error("P2-S5 independent review must accept semantic credit");

  const sourcePaths = Object.keys(manifest.source_git_blobs);
  const currentBlobs = sourcePaths.map((path) => execFileSync("git", ["-C", root, "rev-parse", `HEAD:${path}`], { encoding: "utf8" }).trim());
  const workingBlobs = sourcePaths.map((path) => execFileSync("git", ["-C", root, "hash-object", "--", path], { encoding: "utf8" }).trim());
  validateHistoricalSourceParity({
    sourcePaths,
    manifestBlobs: manifest.source_git_blobs,
    subjectBlobs: sourcePaths.map((path) => manifest.source_git_blobs[path]),
    currentBlobs,
    workingBlobs,
    supersession: loadPlatform55SourceSupersessions(root),
  });
  const evidenceDirectory = dirname(manifestPath);
  for (const capture of manifest.captures) {
    const bytes = readFileSync(resolve(evidenceDirectory, capture.file));
    const [width, height] = capture.viewport.split("x").map(Number);
    if (bytes.length !== capture.byte_length || createHash("sha256").update(bytes).digest("hex") !== capture.sha256 || bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height) {
      throw new Error(`P2-S5 capture drift: ${capture.file}`);
    }
  }
};

const validateP2S6Closure = (sprint, rootDir) => {
  if (sprint.id !== "P2" || sprint.progress < 85) return;
  const evidence = sprint.evidence || {};
  if (!evidence.evidence_plan?.includes(P2_S6_CLOSURE.plan)) throw new Error("P2-S6 evidence_plan must contain the exact certification plan");
  if (!evidence.implementation?.includes(P2_S6_CLOSURE.implementation)) throw new Error("P2-S6 implementation must contain the exact local certification evidence");
  if (!P2_S6_CLOSURE.automatedSuite.every((entry) => evidence.automated_suite?.includes(entry))) throw new Error("P2-S6 automated_suite must contain the exact closure and accessibility gates");
  if (!evidence.independent_review?.includes(P2_S6_CLOSURE.independentReview)) throw new Error("P2-S6 independent_review must contain the exact detached review evidence");

  const root = realpathSync(resolve(rootDir));
  const reviewBody = readFileSync(resolve(root, P2_S6_CLOSURE.independentReview), "utf8");
  validateP2S6IndependentReviewBody(reviewBody);
  execFileSync("git", ["-C", root, "merge-base", "--is-ancestor", P2_S6_CLOSURE.releaseMerge, "HEAD"]);
  if (execFileSync("git", ["-C", root, "rev-parse", `${P2_S6_CLOSURE.releaseMerge}^`], { encoding: "utf8" }).trim() !== P2_S6_CLOSURE.releaseParent) throw new Error("P2-S6 release parent mismatch");
  if (execFileSync("git", ["-C", root, "rev-parse", `${P2_S6_CLOSURE.releaseMerge}^{tree}`], { encoding: "utf8" }).trim() !== P2_S6_CLOSURE.releaseTree) throw new Error("P2-S6 release tree mismatch");
  validateP2S6SourceGitState(root);
};

const validateP2S6ProductionClosure = (sprint, rootDir) => {
  if (sprint.id !== "P2" || sprint.progress < 100) return;
  const evidence = sprint.evidence || {};
  if (!evidence.implementation?.includes(P2_S6_PRODUCTION_CLOSURE.record) || !evidence.implementation?.includes(P2_S6_PRODUCTION_CLOSURE.report)) throw new Error("P2-S6 production implementation evidence is incomplete");
  if (!evidence.preview_smoke?.includes(P2_S6_PRODUCTION_CLOSURE.previewSmoke)) throw new Error("P2-S6 production preview smoke is missing");
  if (!evidence.deployment?.includes(P2_S6_PRODUCTION_CLOSURE.deployment)) throw new Error("P2-S6 production deployment evidence is missing");
  if (!evidence.production_smoke?.includes(P2_S6_PRODUCTION_CLOSURE.productionSmoke)) throw new Error("P2-S6 production smoke evidence is missing");
  if (!evidence.monitoring?.includes(P2_S6_PRODUCTION_CLOSURE.monitoring)) throw new Error("P2-S6 production monitoring evidence is missing");
  if (sprint.verdicts?.production_release !== "GO") throw new Error("P2-S6 production release verdict must be GO");

  const root = realpathSync(resolve(rootDir));
  const recordBytes = readFileSync(resolve(root, P2_S6_PRODUCTION_CLOSURE.record));
  const record = validateP2S6ProductionRecord(JSON.parse(recordBytes.toString("utf8")));
  const reportBody = readFileSync(resolve(root, P2_S6_PRODUCTION_CLOSURE.report), "utf8");
  const recordSha256 = createHash("sha256").update(recordBytes).digest("hex");
  requireText(reportBody, new RegExp(P2_S6_PRODUCTION_CLOSURE.releaseSha, "i"), "P2-S6 production report must name the exact release SHA");
  requireText(reportBody, new RegExp(P2_S6_PRODUCTION_CLOSURE.deploymentId, "i"), "P2-S6 production report must name the exact deployment");
  requireText(reportBody, new RegExp(recordSha256, "i"), "P2-S6 production report must bind the exact machine record");
  requireText(reportBody, /Verdict:\s*GO/i, "P2-S6 production report must record GO");
  requireText(reportBody, /No manual promotion/i, "P2-S6 production report must preserve the no-manual-promotion boundary");
  return record;
};

export function validateLedger(ledger, { rootDir = process.cwd() } = {}) {
  if (ledger?.schema_version !== 1 || ledger?.baseline !== 63) throw new Error("invalid ledger header");
  if (!Array.isArray(ledger.sprints) || ledger.sprints.map((s) => s.id).join(",") !== IDS.join(",")) throw new Error("sprints must be P0-P5");
  for (const sprint of ledger.sprints) {
    if (!Number.isInteger(sprint.weight) || sprint.weight !== WEIGHTS[sprint.id]) throw new Error(`${sprint.id} weight must be ${WEIGHTS[sprint.id]}`);
    if (!Number.isInteger(sprint.progress) || sprint.progress < 0 || sprint.progress > 100) throw new Error(`${sprint.id} progress must be an integer from 0 to 100`);
    if (sprint.progress > 0 && Object.keys(sprint.evidence || {}).length === 0) throw new Error(`${sprint.id} requires evidence`);
    validateEvidence(sprint, rootDir);
    validateP2S2Closure(sprint, rootDir);
    validateP2S3Closure(sprint, rootDir);
    validateP2S4Closure(sprint, rootDir);
    validateP2S5Closure(sprint, rootDir);
    validateP2S6Closure(sprint, rootDir);
    validateP2S6ProductionClosure(sprint, rootDir);
    if (sprint.progress >= 85 && sprint.verdicts?.independent_review !== "GO") throw new Error(`${sprint.id} requires independent_review GO verdict`);
    for (const [threshold, key] of GATES) if (sprint.progress >= threshold && !hasEvidence(sprint.evidence, key)) throw new Error(`${sprint.id} requires ${key}`);
  }
  return ledger;
}

export function computeOverallProgress(ledger) {
  validateLedger(ledger);
  const earned = ledger.sprints.reduce((sum, sprint) => sum + sprint.weight * sprint.progress / 100, 0);
  const overall = ledger.baseline + earned;
  if (!Number.isFinite(overall) || overall < 0 || overall > 100) throw new Error("overall progress out of range");
  return Math.round(overall * 10) / 10;
}

export function formatProgressReport(ledger) {
  validateLedger(ledger);
  return [`General: ${computeOverallProgress(ledger)}%`, ...ledger.sprints.map((s) => `${s.id}: ${s.progress}%`)].join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2] || "docs/release/production-readiness-ledger.json";
  process.stdout.write(`${formatProgressReport(JSON.parse(readFileSync(path, "utf8")))}\n`);
}
