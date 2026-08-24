import { pathToFileURL } from "node:url";

export const P3V2_VIEWPORTS = Object.freeze([
  Object.freeze([1440, 900]),
  Object.freeze([1024, 768]),
  Object.freeze([390, 844]),
]);

export const P3V2_SOURCE_PATHS = Object.freeze([
  "upload-center.html",
  "upload-history.html",
  "staging-review.html",
  "src/platform55-visual-parity.css",
]);

export const P3V2_SPECS = Object.freeze([
  Object.freeze({
    route: "upload-center.html",
    states: Object.freeze(["loaded", "empty", "validation-error", "upload-error"]),
    referencePath: "docs/platform55-visual-parity/baseline/reference-operator-console-1920.png",
  }),
  Object.freeze({
    route: "upload-history.html",
    states: Object.freeze(["loaded", "empty", "loading", "processing-error"]),
    referencePath: "docs/platform55-visual-parity/baseline/reference-runtime-jobs-1920.png",
  }),
  Object.freeze({
    route: "staging-review.html",
    states: Object.freeze(["loaded", "loading", "empty", "review-required", "error"]),
    referencePath: "docs/platform55-visual-parity/baseline/reference-readiness-1920.png",
  }),
]);

export const P3V2_CAPTURE_MATRIX = Object.freeze(P3V2_SPECS.flatMap((spec) => (
  spec.states.flatMap((state) => P3V2_VIEWPORTS.map((viewport) => Object.freeze({
    route: spec.route,
    state,
    viewport,
  })))
)));

const ERROR_CHANNELS = Object.freeze([
  "console_errors",
  "http_errors",
  "page_errors",
  "request_errors",
  "external_requests",
  "mutation_attempts",
]);

function sha(value, length) {
  return typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`, "i").test(value);
}

function ownDataRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.values(descriptors).some((descriptor) => !("value" in descriptor))) return null;
    return descriptors;
  } catch {
    return null;
  }
}

function dataValue(descriptors, name) {
  return descriptors?.[name] && "value" in descriptors[name] ? descriptors[name].value : undefined;
}

function viewportKey(viewport) {
  return Array.isArray(viewport) && viewport.length === 2 ? `${viewport[0]}x${viewport[1]}` : "invalid";
}

function captureKey(record) {
  return `${record?.route}:${record?.state}:${viewportKey(record?.viewport)}`;
}

function validSourceBlobs(value) {
  const descriptors = ownDataRecord(value);
  if (!descriptors) return false;
  const keys = Object.keys(descriptors).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...P3V2_SOURCE_PATHS].sort())) return false;
  return keys.every((path) => sha(dataValue(descriptors, path), 40));
}

function result(errors) {
  const unique = Object.freeze([...new Set(errors)]);
  return Object.freeze({ ok: unique.length === 0, errors: unique });
}

export function validateP3V2Capture(record) {
  const errors = [];
  const descriptors = ownDataRecord(record);
  if (!descriptors) return result(["record:object"]);
  const route = dataValue(descriptors, "route");
  const state = dataValue(descriptors, "state");
  const viewport = dataValue(descriptors, "viewport");
  const spec = P3V2_SPECS.find((candidate) => candidate.route === route);
  if (!spec) errors.push("route:unknown");
  if (!spec?.states.includes(state)) errors.push("state:unknown");
  if (!P3V2_VIEWPORTS.some((candidate) => viewportKey(candidate) === viewportKey(viewport))) errors.push("viewport:unknown");
  if (dataValue(descriptors, "access_model") !== "authenticated") errors.push("access_model");
  if (dataValue(descriptors, "fixture") !== `qa_state:${state}`) errors.push("fixture");
  if (dataValue(descriptors, "reference_path") !== spec?.referencePath) errors.push("reference:path");
  if (!sha(dataValue(descriptors, "reference_sha256"), 64)) errors.push("reference:sha256");
  if (dataValue(descriptors, "file") !== `${String(route || "").replace(/\.html$/, "")}-${state}-${viewportKey(viewport)}.png`) errors.push("screenshot:path");
  for (const [field, code] of [
    ["page_heading_visible", "heading:hidden"],
    ["state_surface_visible", "state_surface:hidden"],
    ["state_surface_intersects_viewport", "state_surface:outside_viewport"],
    ["source_retention_visible", "source_retention:hidden"],
    ["internal_overflow_contained", "layout:internal_overflow"],
    ["focus_cycle_pass", "a11y:focus_cycle"],
    ["focus_restore_pass", "a11y:focus_restore"],
  ]) if (dataValue(descriptors, field) !== true) errors.push(code);
  if (route === "upload-history.html" && state === "loaded" && dataValue(descriptors, "source_filename_visible") !== true) errors.push("source_filename:hidden");
  if (route === "staging-review.html" && dataValue(descriptors, "selection_scopes_distinct") !== true) errors.push("selection_scopes:not_distinct");
  if (dataValue(descriptors, "page_overflow") !== false) errors.push("layout:page_overflow");
  for (const [field, code] of [["unnamed_controls", "a11y:unnamed_controls"], ["contrast_failures", "a11y:contrast"]]) {
    const entries = dataValue(descriptors, field);
    if (!Array.isArray(entries) || entries.length) errors.push(code);
  }
  for (const field of ERROR_CHANNELS) {
    const entries = dataValue(descriptors, field);
    if (!Array.isArray(entries) || entries.length) errors.push(`${field}:nonzero`);
  }
  if (!sha(dataValue(descriptors, "screenshot_sha256"), 64)) errors.push("screenshot:sha256");
  if (!sha(dataValue(descriptors, "screenshot_git_blob"), 40)) errors.push("screenshot:git_blob");
  if (!Number.isSafeInteger(dataValue(descriptors, "screenshot_byte_length")) || dataValue(descriptors, "screenshot_byte_length") <= 0) errors.push("screenshot:byte_length");
  if (dataValue(descriptors, "screenshot_width") !== viewport?.[0] || dataValue(descriptors, "screenshot_height") !== viewport?.[1]) errors.push("screenshot:dimensions");
  if (!validSourceBlobs(dataValue(descriptors, "source_blobs"))) errors.push("source:blobs");
  return result(errors);
}

export function validateP3V2Manifest(manifest) {
  const errors = [];
  const descriptors = ownDataRecord(manifest);
  if (!descriptors) return result(["manifest:object"]);
  if (dataValue(descriptors, "schema_version") !== 1) errors.push("schema_version");
  if (!sha(dataValue(descriptors, "product_sha"), 40)) errors.push("product_sha");
  if (!sha(dataValue(descriptors, "product_tree"), 40)) errors.push("product_tree");
  const sourceBlobs = dataValue(descriptors, "source_blobs");
  if (!validSourceBlobs(sourceBlobs)) errors.push("source_blobs");
  const expected = new Set(P3V2_CAPTURE_MATRIX.map(captureKey));
  const captures = dataValue(descriptors, "captures");
  if (!Array.isArray(captures) || captures.length !== expected.size) errors.push("captures:count");
  const observed = new Set();
  for (const [index, capture] of (Array.isArray(captures) ? captures : []).entries()) {
    for (const error of validateP3V2Capture(capture).errors) errors.push(`capture:${index}:${error}`);
    const key = captureKey(capture);
    if (!expected.has(key)) errors.push(`capture:${index}:matrix`);
    if (observed.has(key)) errors.push(`capture:${index}:duplicate`);
    observed.add(key);
    if (JSON.stringify(capture?.source_blobs) !== JSON.stringify(sourceBlobs)) errors.push(`capture:${index}:source_drift`);
  }
  for (const key of expected) if (!observed.has(key)) errors.push(`capture:${key}:missing`);
  return result(errors);
}

async function runCli() {
  throw new Error("P3-V2 browser runner is not implemented yet");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runCli();
