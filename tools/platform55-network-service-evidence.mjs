import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const P2_S4_CLOSURE = Object.freeze({
  plan: "docs/superpowers/plans/2026-08-21-rateware-platform55-shell-p2-s4-network-service.md",
  implementation: "docs/release/evidence/2026-08-21-p2-s4-network-service.md",
  manifest: "docs/platform55-evidence/p2-s4/77f2bbb0b62846ea110792227b6ce51d9370ac9c/manifest.json",
  subject: "77f2bbb0b62846ea110792227b6ce51d9370ac9c",
  evidenceHead: "d337c5aa17717c51fa87af8ee44433d99f2ff2d7",
  gateHead: "524b7a450c6b01f894b5bc9ec249ecad262a58d6",
  independentReview: "docs/release/evidence/2026-08-22-p2-s4-independent-review.json",
  independentReviewSha256: "cb945b0f1bd521fcf7adadf9473162c9bb2f337bda3b8f8e508ca8649f41b6f2",
  reviewedHead: "70152b4ba5e48a290b33cc3c316ef42b82fb551a",
  reviewBase: "a15fef8636a725d5c127f0ff64f26445fc82e8f4",
  referenceArchiveSha256: "cf2ced85e95dfb33bb7410bf73ace22cb95090ce649747df60bf2920e808c16a",
  matrixSourceProjectionSha256: "26889f56d6f7dd2afb289b62abb044ac955cc7607ee5236c3c1f5023f4f601fb",
  routeMapSha256: "7f541d3a539fdf6eae92b1a448c5d5e6ed94ba05f46fee6562ab2f797210c60f",
  manifestObjectSha256: "3dc18d8c47e1d1e0c55670d18a3ac2f56f3d9eea7dcb033d4834d0e698d37291",
  automatedSuite: Object.freeze([
    "npm run test:platform55:network-service PASS with 48 of 48 actual-route captures",
    "npm run test:provider-service PASS with 37 files and 197 tests",
    "npm test PASS on exact P2-S4 gate head 524b7a450c6b01f894b5bc9ec249ecad262a58d6",
    "npm run validate:action-contract PASS with 0 errors and 1 pre-existing warning",
    "npm audit --audit-level=low PASS with 0 vulnerabilities",
  ]),
});

export const P2_S4_SEMANTIC_ROWS = Object.freeze([
  Object.freeze({ build: "build_05", ordinal: "5516", state: "onboarding", reference_asset: "build_05/rateware_procurement_carrier_network_build_v05.html" }),
  Object.freeze({ build: "build_05", ordinal: "5521", state: "onboarding-workflow", reference_asset: "build_05/rateware_procurement_carrier_network_build_v05.html" }),
  Object.freeze({ build: "build_07", ordinal: "14", state: "communications", reference_asset: "build_07/rateware_operations_execution_build_v07.html" }),
  Object.freeze({ build: "build_07", ordinal: "49", state: "communications-thread", reference_asset: "build_07/rateware_operations_execution_build_v07.html" }),
  Object.freeze({ build: "build_10", ordinal: "25", state: "support", reference_asset: "build_10/rateware_integrations_ecosystem_platform_operations_build_v10.html" }),
  Object.freeze({ build: "build_10", ordinal: "27", state: "connection-wizard", reference_asset: "build_10/rateware_integrations_ecosystem_platform_operations_build_v10.html" }),
  Object.freeze({ build: "build_10", ordinal: "44", state: "gmail-connection", reference_asset: "build_10/rateware_integrations_ecosystem_platform_operations_build_v10.html" }),
  Object.freeze({ build: "build_10", ordinal: "67", state: "support-cases", reference_asset: "build_10/rateware_integrations_ecosystem_platform_operations_build_v10.html" }),
  Object.freeze({ build: "build_11", ordinal: "20", state: "vendor-risk", reference_asset: "build_11/rateware_security_compliance_enterprise_governance_build_v11.html" }),
  Object.freeze({ build: "build_12", ordinal: "14", state: "onboarding", reference_asset: "build_12/rateware_experience_configuration_release_readiness_build_v12.html" }),
  Object.freeze({ build: "build_12", ordinal: "23", state: "support", reference_asset: "build_12/rateware_experience_configuration_release_readiness_build_v12.html" }),
  Object.freeze({ build: "build_12", ordinal: "81", state: "support-center", reference_asset: "build_12/rateware_experience_configuration_release_readiness_build_v12.html" }),
  Object.freeze({ build: "build_12", ordinal: "82", state: "support-case", reference_asset: "build_12/rateware_experience_configuration_release_readiness_build_v12.html" }),
]);

export const P2_S4_ROUTES = Object.freeze([
  "shipper-crm.html",
  "shipper-profile.html",
  "vendor-support.html",
  "vendor-improvement.html",
  "provider-service.html",
  "provider-onboarding.html",
  "provider-gmail.html",
  "provider-communications.html",
]);

export const P2_S4_STATES_BY_ROUTE = Object.freeze({
  "shipper-crm.html": ["loaded", "error"],
  "shipper-profile.html": ["loaded", "signed-out"],
  "vendor-support.html": ["loaded", "error"],
  "vendor-improvement.html": ["loaded", "error"],
  "provider-service.html": ["loaded", "error"],
  "provider-onboarding.html": ["loaded", "error"],
  "provider-gmail.html": ["loaded", "error"],
  "provider-communications.html": ["loaded", "error"],
});

export const P2_S4_VIEWPORTS = Object.freeze(["1440x900", "1024x768", "390x844"]);

export const P2_S4_SOURCE_PATHS = Object.freeze([
  ...P2_S4_ROUTES,
  "src/shippers.js",
  "src/shipper-profile.js",
  "src/vendor-support.js",
  "src/vendor-improvement.js",
  "src/provider-service-page.js",
  "src/provider-onboarding-page.js",
  "src/provider-gmail-page.js",
  "src/provider-communications-page.js",
  "src/platform55-shell.js",
  "src/platform55-shell.css",
  "src/platform55-network-service.css",
  "src/platform55-public-shell.css",
  "tools/platform55-network-service-evidence-server.mjs",
]);

const PUBLIC_ROUTES = new Set(["shipper-profile.html"]);
const expectedCaptures = new Map(P2_S4_ROUTES.flatMap((route) => (
  P2_S4_STATES_BY_ROUTE[route].flatMap((state) => P2_S4_VIEWPORTS.map((viewport) => {
    const routeName = route.slice(0, -5);
    return [
      `${routeName}-${state}-${viewport}.png`,
      { route, state, viewport, kind: PUBLIC_ROUTES.has(route) ? "public" : "tenant" },
    ];
  }))
)));

const equalJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function validateP2S4Manifest(manifest) {
  const captureFiles = manifest?.captures?.map((capture) => capture.file).sort();
  if (
    manifest?.schema_version !== 2 ||
    manifest.subject_sha !== P2_S4_CLOSURE.subject ||
    !equalJson(manifest.routes, P2_S4_ROUTES) ||
    !equalJson(manifest.states_by_route, P2_S4_STATES_BY_ROUTE) ||
    !equalJson(manifest.viewports, P2_S4_VIEWPORTS) ||
    !equalJson(Object.keys(manifest.source_git_blobs || {}), P2_S4_SOURCE_PATHS) ||
    manifest.captures?.length !== 48 ||
    !equalJson(captureFiles, [...expectedCaptures.keys()].sort())
  ) {
    throw new Error("P2-S4 manifest must contain the exact 8 x 2 x 3 matrix and 21 source blobs");
  }

  for (const capture of manifest.captures) {
    const expected = expectedCaptures.get(capture.file);
    if (
      !expected ||
      capture.route !== expected.route ||
      capture.kind !== expected.kind ||
      capture.shell !== expected.kind ||
      capture.state !== expected.state ||
      capture.qa_state !== (expected.state === "signed-out" ? "loaded" : expected.state) ||
      capture.viewport !== expected.viewport ||
      capture.source_frame !== expected.viewport ||
      capture.exact_viewport !== true ||
      capture.canvas_normalized !== false ||
      capture.layout_stability_samples !== 3 ||
      capture.console_errors !== 0 ||
      capture.http_errors !== 0 ||
      capture.page_errors !== 0 ||
      capture.request_errors !== 0 ||
      capture.document_overflow !== false ||
      capture.content_width_ratio < 0.7 ||
      (expected.kind === "public" && (
        !Number.isFinite(capture.public_header_height_ratio) ||
        capture.public_header_height_ratio <= 0 ||
        capture.public_header_height_ratio > 0.25 ||
        !Number.isFinite(capture.public_brand_contrast_ratio) ||
        capture.public_brand_contrast_ratio < 4.5
      )) ||
      capture.state_visible !== true ||
      capture.state_intersection_ratio < 0.5 ||
      typeof capture.state_selector !== "string" || !/\S/.test(capture.state_selector) ||
      typeof capture.state_marker !== "string" || !/\S/.test(capture.state_marker) ||
      (expected.kind === "tenant" && capture.active_routes !== 1) ||
      (expected.kind === "public" && capture.private_controls !== 0) ||
      !Number.isInteger(capture.focusable_count) || capture.focusable_count < 1 ||
      capture.reduced_motion !== true ||
      capture.scroll_x !== 0 ||
      !Number.isInteger(capture.byte_length) || capture.byte_length < 1 ||
      !/^[0-9a-f]{64}$/.test(capture.sha256)
    ) {
      throw new Error(`P2-S4 capture metadata mismatch: ${capture.file}`);
    }
  }

  const manifestDigest = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  if (manifestDigest !== P2_S4_CLOSURE.manifestObjectSha256) {
    throw new Error("P2-S4 manifest digest mismatch");
  }
  return manifest;
}

const gitLines = (root, args) => execFileSync(
  "git",
  ["-C", root, ...args],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
).trim().split(/\r?\n/);

export function validateP2S4EvidenceFiles(rootDir, manifest) {
  validateP2S4Manifest(manifest);
  const root = resolve(rootDir);
  const subjectBlobs = gitLines(root, ["rev-parse", ...P2_S4_SOURCE_PATHS.map((path) => `${P2_S4_CLOSURE.subject}:${path}`)]);
  const headBlobs = gitLines(root, ["rev-parse", ...P2_S4_SOURCE_PATHS.map((path) => `HEAD:${path}`)]);
  const workingBlobs = gitLines(root, ["hash-object", "--", ...P2_S4_SOURCE_PATHS]);
  for (const [index, sourcePath] of P2_S4_SOURCE_PATHS.entries()) {
    const manifestBlob = manifest.source_git_blobs[sourcePath];
    if (manifestBlob !== subjectBlobs[index] || manifestBlob !== headBlobs[index] || workingBlobs[index] !== headBlobs[index]) {
      throw new Error(`P2-S4 source blob mismatch: ${sourcePath}`);
    }
  }

  const evidenceDirectory = dirname(P2_S4_CLOSURE.manifest);
  const evidencePaths = [
    P2_S4_CLOSURE.manifest,
    ...manifest.captures.map((capture) => `${evidenceDirectory}/${capture.file}`),
  ];
  const headEvidenceBlobs = gitLines(root, ["rev-parse", ...evidencePaths.map((path) => `HEAD:${path}`)]);
  const workingEvidenceBlobs = gitLines(root, ["hash-object", "--", ...evidencePaths]);
  for (const [index, evidencePath] of evidencePaths.entries()) {
    if (workingEvidenceBlobs[index] !== headEvidenceBlobs[index]) {
      throw new Error(`P2-S4 evidence working-tree drift: ${evidencePath}`);
    }
  }

  for (const capture of manifest.captures) {
    const png = readFileSync(resolve(root, evidenceDirectory, capture.file));
    const [, width, height] = capture.viewport.match(/^(\d+)x(\d+)$/) || [];
    if (
      png.subarray(1, 4).toString("ascii") !== "PNG" ||
      png.length !== capture.byte_length ||
      png.readUInt32BE(16) !== Number(width) ||
      png.readUInt32BE(20) !== Number(height) ||
      createHash("sha256").update(png).digest("hex") !== capture.sha256
    ) {
      throw new Error(`P2-S4 PNG integrity mismatch: ${capture.file}`);
    }
  }
  return manifest;
}
