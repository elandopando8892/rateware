import assert from "node:assert/strict";
import test from "node:test";
import {
  P3V2_CAPTURE_MATRIX,
  P3V2_SOURCE_PATHS,
  P3V2_SPECS,
  validateP3V2Capture,
  validateP3V2Manifest,
} from "../tools/platform55-p3v-v2-browser-certification.mjs";

const sha256 = "a".repeat(64);
const sha1 = "b".repeat(40);
const sourceBlobs = Object.fromEntries(P3V2_SOURCE_PATHS.map((path) => [path, sha1]));

function captureFor({ route, state, viewport }) {
  const spec = P3V2_SPECS.find((candidate) => candidate.route === route);
  return {
    route,
    state,
    viewport: [...viewport],
    access_model: "authenticated",
    fixture: `qa_state:${state}`,
    reference_path: spec.referencePath,
    reference_sha256: sha256,
    file: `${route.replace(/\.html$/, "")}-${state}-${viewport.join("x")}.png`,
    page_heading_visible: true,
    page_heading_intersects_viewport: true,
    state_surface_visible: true,
    state_surface_intersects_viewport: true,
    source_retention_visible: true,
    source_retention_intersects_viewport: true,
    source_filename_visible: route !== "upload-history.html" || state !== "loaded" || true,
    selection_scopes_distinct: route !== "staging-review.html" || true,
    page_overflow: false,
    internal_overflow_contained: true,
    unnamed_controls: [],
    contrast_failures: [],
    focus_cycle_pass: true,
    focus_restore_pass: true,
    console_errors: [],
    http_errors: [],
    page_errors: [],
    request_errors: [],
    external_requests: [],
    mutation_attempts: [],
    screenshot_sha256: sha256,
    screenshot_git_blob: sha1,
    screenshot_byte_length: 100,
    screenshot_width: viewport[0],
    screenshot_height: viewport[1],
    source_blobs: sourceBlobs,
  };
}

test("P3-V2 exposes exactly 39 immutable route/state/viewport captures", () => {
  assert.equal(P3V2_SPECS.length, 3);
  assert.equal(P3V2_CAPTURE_MATRIX.length, 39);
  assert.equal(new Set(P3V2_CAPTURE_MATRIX.map(({ route, state, viewport }) => `${route}:${state}:${viewport.join("x")}`)).size, 39);
  assert.deepEqual(P3V2_SPECS.map(({ route, states }) => [route, [...states]]), [
    ["upload-center.html", ["loaded", "empty", "validation-error", "upload-error"]],
    ["upload-history.html", ["loaded", "empty", "loading", "processing-error"]],
    ["staging-review.html", ["loaded", "loading", "empty", "review-required", "error"]],
  ]);
});

test("a complete governed capture passes", () => {
  assert.deepEqual(validateP3V2Capture(captureFor(P3V2_CAPTURE_MATRIX[0])), { ok: true, errors: [] });
});

test("state, geometry, evidence, accessibility, and read-only drift reject", () => {
  const base = captureFor(P3V2_CAPTURE_MATRIX[0]);
  const mutations = [
    ["route", { route: "rateware.html" }],
    ["state", { state: "unknown" }],
    ["viewport", { viewport: [800, 600] }],
    ["fixture", { fixture: "live" }],
    ["file", { file: "capture.png" }],
    ["heading", { page_heading_visible: false }],
    ["heading intersection", { page_heading_intersects_viewport: false }],
    ["state", { state_surface_visible: false }],
    ["intersection", { state_surface_intersects_viewport: false }],
    ["source boundary", { source_retention_visible: false }],
    ["source boundary intersection", { source_retention_intersects_viewport: false }],
    ["overflow", { page_overflow: true }],
    ["internal overflow", { internal_overflow_contained: false }],
    ["name", { unnamed_controls: ["button#unnamed"] }],
    ["contrast", { contrast_failures: [{ selector: ".bad", ratio: 1, threshold: 4.5 }] }],
    ["focus", { focus_cycle_pass: false }],
    ["write", { mutation_attempts: ["POST /functions/v1/rateware-api"] }],
    ["external", { external_requests: ["https://example.com"] }],
    ["hash", { screenshot_sha256: "bad" }],
    ["bytes", { screenshot_byte_length: 0 }],
    ["dimensions", { screenshot_width: 1024 }],
    ["source drift", { source_blobs: { ...sourceBlobs, "upload-center.html": "bad" } }],
  ];
  for (const [label, mutation] of mutations) {
    assert.equal(validateP3V2Capture({ ...base, ...mutation }).ok, false, label);
  }
});

test("loaded Source Files requires a visible preserved filename", () => {
  const base = captureFor(P3V2_CAPTURE_MATRIX.find(({ route, state }) => route === "upload-history.html" && state === "loaded"));
  assert.equal(validateP3V2Capture({ ...base, source_filename_visible: false }).ok, false);
});

test("Review Queue requires distinct page and filtered-database scopes", () => {
  const base = captureFor(P3V2_CAPTURE_MATRIX.find(({ route, state }) => route === "staging-review.html" && state === "loaded"));
  assert.equal(validateP3V2Capture({ ...base, selection_scopes_distinct: false }).ok, false);
});

test("manifest rejects missing, duplicate, unknown, and source-drift captures", () => {
  const captures = P3V2_CAPTURE_MATRIX.map(captureFor);
  const manifest = {
    schema_version: 1,
    product_sha: "c".repeat(40),
    product_tree: "d".repeat(40),
    source_blobs: sourceBlobs,
    captures,
  };
  assert.deepEqual(validateP3V2Manifest(manifest), { ok: true, errors: [] });
  for (const [label, mutation] of [
    ["missing", { captures: captures.slice(1) }],
    ["duplicate", { captures: [...captures.slice(1), captures[1]] }],
    ["unknown", { captures: captures.map((capture, index) => index ? capture : { ...capture, state: "unknown" }) }],
    ["sha", { product_sha: "bad" }],
    ["tree", { product_tree: sha256 }],
    ["source", { source_blobs: { ...sourceBlobs, "staging-review.html": "bad" } }],
    ["capture source", { captures: captures.map((capture, index) => index ? capture : { ...capture, source_blobs: { ...sourceBlobs, "staging-review.html": "e".repeat(40) } }) }],
  ]) assert.equal(validateP3V2Manifest({ ...manifest, ...mutation }).ok, false, label);
});
