import assert from "node:assert/strict";
import test from "node:test";
import {
  P3V1_CAPTURE_MATRIX,
  P3V1_SOURCE_PATHS,
  P3V1_SPECS,
  validateP3V1Capture,
  validateP3V1Manifest,
} from "../tools/platform55-p3v-v1-browser-certification.mjs";
import { evaluateVisualParityScore } from "../tools/platform55-visual-parity-contract.mjs";

const sha256 = "a".repeat(64);
const sha1 = "b".repeat(40);
const sourceBlobs = Object.fromEntries(P3V1_SOURCE_PATHS.map((path) => [path, sha1]));
const baseCapture = Object.freeze({
  route: "app.html",
  state: "data",
  viewport: [1440, 900],
  access_model: "authenticated",
  fixture: "qa_state:data",
  reference_path: P3V1_SPECS[0].referencePath,
  reference_sha256: sha256,
  file: "app-data-1440x900.png",
  visible_ids: P3V1_SPECS[0].requiredIds,
  page_heading_visible: true,
  state_surface_visible: true,
  primary_actions_visible: true,
  page_overflow: false,
  table_overflow_owned: true,
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
  screenshot_width: 1440,
  screenshot_height: 900,
  source_blobs: sourceBlobs,
});

const captureFor = ({ route, state, viewport }) => {
  const spec = P3V1_SPECS.find((candidate) => candidate.route === route);
  return {
    ...baseCapture,
    route,
    state,
    viewport,
    fixture: `qa_state:${state}`,
    reference_path: spec.referencePath,
    file: `${route.replace(/\.html$/, "")}-${state}-${viewport.join("x")}.png`,
    screenshot_width: viewport[0],
    screenshot_height: viewport[1],
    visible_ids: [...spec.requiredIds],
  };
};

test("P3-V1 exposes exactly 18 immutable route/state/viewport captures", () => {
  assert.equal(P3V1_SPECS.length, 2);
  assert.equal(P3V1_CAPTURE_MATRIX.length, 18);
  assert.equal(new Set(P3V1_CAPTURE_MATRIX.map(({ route, state, viewport }) => `${route}:${state}:${viewport.join("x")}`)).size, 18);
  assert.deepEqual(P3V1_CAPTURE_MATRIX.filter(({ route }) => route === "app.html").map(({ state }) => state), [
    "data", "data", "data", "loading", "loading", "loading", "empty", "empty", "empty", "error", "error", "error",
  ]);
});

test("a complete capture passes", () => {
  assert.deepEqual(validateP3V1Capture(baseCapture), { ok: true, errors: [] });
});

test("each route, geometry, state, visibility, and accessibility failure rejects", () => {
  const mutations = [
    ["route", { route: "settings.html" }],
    ["state", { state: "unknown" }],
    ["viewport", { viewport: [800, 600] }],
    ["access", { access_model: "public" }],
    ["fixture", { fixture: "live" }],
    ["reference path", { reference_path: "source://untracked" }],
    ["reference hash", { reference_sha256: "bad" }],
    ["file", { file: "capture.png" }],
    ["overflow", { page_overflow: true }],
    ["visible", { visible_ids: baseCapture.visible_ids.slice(1) }],
    ["heading", { page_heading_visible: false }],
    ["state surface", { state_surface_visible: false }],
    ["primary actions", { primary_actions_visible: false }],
    ["table containment", { table_overflow_owned: false }],
    ["name", { unnamed_controls: ["button#unnamed"] }],
    ["contrast", { contrast_failures: [{ selector: ".bad", ratio: 1, threshold: 4.5 }] }],
    ["focus cycle", { focus_cycle_pass: false }],
    ["focus restore", { focus_restore_pass: false }],
    ["screenshot", { screenshot_sha256: "source://capture.png" }],
    ["screenshot blob", { screenshot_git_blob: "bad" }],
    ["screenshot bytes", { screenshot_byte_length: 0 }],
    ["screenshot width", { screenshot_width: 1024 }],
    ["screenshot height", { screenshot_height: 768 }],
    ["source", { source_blobs: { ...sourceBlobs, "app.html": "bad" } }],
  ];
  for (const [label, mutation] of mutations) {
    assert.equal(validateP3V1Capture({ ...baseCapture, ...mutation }).ok, false, label);
  }
});

test("each error channel is required, array-shaped, and empty", () => {
  for (const name of ["console_errors", "http_errors", "page_errors", "request_errors", "external_requests", "mutation_attempts"]) {
    assert.equal(validateP3V1Capture({ ...baseCapture, [name]: ["failure"] }).ok, false, `${name} nonzero`);
    assert.equal(validateP3V1Capture({ ...baseCapture, [name]: null }).ok, false, `${name} not an array`);
  }
});

test("manifest validation rejects omissions, duplicates, drift, and malformed identity", () => {
  const captures = P3V1_CAPTURE_MATRIX.map(captureFor);
  const manifest = {
    schema_version: 1,
    product_sha: "c".repeat(40),
    product_tree: "d".repeat(40),
    source_blobs: sourceBlobs,
    captures,
  };
  assert.deepEqual(validateP3V1Manifest(manifest), { ok: true, errors: [] });
  for (const [label, mutation] of [
    ["missing", { captures: captures.slice(1) }],
    ["duplicate", { captures: [...captures.slice(1), captures[1]] }],
    ["candidate", { product_sha: "bad" }],
    ["tree", { product_tree: sha256 }],
    ["top source", { source_blobs: { ...sourceBlobs, "rateware.html": "bad" } }],
    ["capture source drift", { captures: captures.map((capture, index) => index ? capture : { ...capture, source_blobs: { ...sourceBlobs, "rateware.html": "e".repeat(40) } }) }],
  ]) {
    assert.equal(validateP3V1Manifest({ ...manifest, ...mutation }).ok, false, label);
  }
});

test("an apparent passing total cannot hide a failed accessibility dimension", () => {
  const result = evaluateVisualParityScore({
    dimensions: {
      shell_frame: 20,
      interior_hierarchy: 25,
      visual_system: 20,
      components_states: 20,
      responsive_accessibility: 11,
    },
    viewports: [[1440, 900], [1024, 768], [390, 844]],
    states: ["loaded", "error"],
    required_states: ["loaded", "error"],
    reviewer_verdict: "GO",
    reference_sha256: sha256,
    screenshot_sha256: sha256,
    candidate_sha: sha1,
  });
  assert.equal(result.total, 96);
  assert.equal(result.status, "blocked");
  assert.ok(result.errors.includes("responsive_accessibility:minimum"));
});
