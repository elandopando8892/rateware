import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const subject = "6917246927a6a13e82abf9e1e84b00b27f172ab7";
const evidenceHead = "23584f218d094a622608c813715247cf16190375";
const manifestObjectSha256 = "ca17e2c5faa9a0d08dfdd662f101bf96fe1aee8ce93f93e2dfb6becba9c61845";
const directory = `docs/platform55-evidence/p2-s3/${subject}`;
const routes = [
  "vendors",
  "rfx-events",
  "rfx-process",
  "ratebook",
  "outreach",
  "carrier-profile",
  "rfx-bid",
  "bid-room-board",
  "customer-rfi",
  "ratebook-carrier"
];
const states = ["loaded", "error", "lifecycle"];
const viewports = ["1440x900", "1024x768", "390x844"];
const tenantRoutes = new Set(routes.slice(0, 5));
const publicRoutes = new Set(routes.slice(5));
const expectedCaptureMetadata = new Map(routes.flatMap((route) => states.flatMap((state) => viewports.map((viewport) => [
  `${route}-${state}-${viewport}.png`,
  { route: `${route}.html`, state, viewport, kind: tenantRoutes.has(route) ? "tenant" : "public" }
]))));
const sourcePaths = [
  "vendors.html",
  "rfx-events.html",
  "rfx-process.html",
  "ratebook.html",
  "outreach.html",
  "carrier-profile.html",
  "rfx-bid.html",
  "bid-room-board.html",
  "customer-rfi.html",
  "ratebook-carrier.html",
  "src/vendors.js",
  "src/rfx-events.js",
  "src/rfx-process.js",
  "src/ratebook.js",
  "src/outreach.js",
  "src/carrier-profile.js",
  "src/rfx-bid.js",
  "src/bid-room-board.js",
  "src/customer-rfi.js",
  "src/ratebook-carrier.js",
  "src/platform55-shell.js",
  "src/platform55-shell.css",
  "src/platform55-procurement.css",
  "src/platform55-public-shell.css",
  "tools/platform55-procurement-evidence-server.mjs"
];

function expectedFiles() {
  return routes.flatMap((route) => states.flatMap((state) => viewports.map((viewport) => `${route}-${state}-${viewport}.png`))).sort();
}

function validateManifestShape(manifest) {
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.subject_sha, subject);
  assert.deepEqual(manifest.routes, routes);
  assert.deepEqual(manifest.states, states);
  assert.deepEqual(manifest.viewports, viewports);
  assert.deepEqual(Object.keys(manifest.source_git_blobs), sourcePaths);
  assert.equal(manifest.captures.length, 90);
  assert.deepEqual(manifest.captures.map((capture) => capture.file).sort(), expectedFiles());
  for (const capture of manifest.captures) {
    const expected = expectedCaptureMetadata.get(capture.file);
    assert.ok(expected, `${capture.file} known capture tuple`);
    assert.ok(tenantRoutes.has(expected.route.slice(0, -5)) || publicRoutes.has(expected.route.slice(0, -5)), `${capture.file} route kind`);
    assert.equal(capture.route, expected.route, `${capture.file} route identity`);
    assert.equal(capture.kind, expected.kind, `${capture.file} route kind`);
    assert.equal(capture.shell, expected.kind, `${capture.file} shell kind`);
    assert.equal(capture.state, expected.state, `${capture.file} state identity`);
    assert.equal(capture.qa_state, expected.state === "lifecycle" ? "loaded" : expected.state, `${capture.file} QA state`);
    assert.equal(capture.viewport, expected.viewport, `${capture.file} viewport identity`);
    assert.equal(capture.exact_viewport, true, `${capture.file} viewport`);
    assert.equal(capture.source_frame, capture.viewport, `${capture.file} source frame`);
    assert.equal(capture.canvas_normalized, false, `${capture.file} must not need canvas padding`);
    assert.equal(capture.document_overflow, false, `${capture.file} overflow`);
    assert.equal(capture.state_visible, true, `${capture.file} visible state`);
    assert.match(capture.state_marker, /\S/, `${capture.file} state marker`);
    assert.match(capture.state_selector, /\S/, `${capture.file} state selector`);
    assert.ok(capture.layout_stability_samples >= 3, `${capture.file} stable layout`);
    assert.ok(capture.state_intersection_ratio >= (capture.state === "lifecycle" ? 0.7 : capture.state === "error" ? 0.4 : 0.2), `${capture.file} state intersection`);
    if (expected.kind === "tenant") assert.equal(capture.active_routes, 1, `${capture.file} active tenant route`);
    if (expected.kind === "public") assert.equal(capture.private_controls, 0, `${capture.file} public isolation`);
    assert.match(capture.sha256, /^[0-9a-f]{64}$/);
  }
  assert.equal(createHash("sha256").update(JSON.stringify(manifest)).digest("hex"), manifestObjectSha256);
}

test("anchors the complete Procurement capture matrix to its immutable subject", async () => {
  const manifest = JSON.parse(await readFile(`${directory}/manifest.json`, "utf8"));
  validateManifestShape(manifest);

  for (const sourcePath of sourcePaths) {
    const subjectBlob = execFileSync("git", ["rev-parse", `${subject}:${sourcePath}`], { encoding: "utf8" }).trim();
    const currentBlob = execFileSync("git", ["rev-parse", `HEAD:${sourcePath}`], { encoding: "utf8" }).trim();
    assert.equal(manifest.source_git_blobs[sourcePath], subjectBlob, `${sourcePath} must match the immutable subject`);
    assert.equal(currentBlob, subjectBlob, `${sourcePath} must not drift after capture`);
  }

  const actualPngs = (await readdir(directory)).filter((file) => file.endsWith(".png")).sort();
  assert.deepEqual(actualPngs, expectedFiles());

  for (const evidencePath of [
    `${directory}/manifest.json`,
    ...manifest.captures.map((capture) => `${directory}/${capture.file}`)
  ]) {
    const evidenceBlob = execFileSync("git", ["rev-parse", `${evidenceHead}:${evidencePath}`], { encoding: "utf8" }).trim();
    const currentBlob = execFileSync("git", ["rev-parse", `HEAD:${evidencePath}`], { encoding: "utf8" }).trim();
    assert.equal(currentBlob, evidenceBlob, `${evidencePath} must remain anchored to the evidence HEAD`);
  }

  for (const capture of manifest.captures) {
    const capturePath = `${directory}/${capture.file}`;
    await access(capturePath);
    const png = await readFile(capturePath);
    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG", `${capture.file} format`);
    const dimensions = capture.file.match(/-(\d+)x(\d+)\.png$/);
    assert.ok(dimensions, `${capture.file} encoded dimensions`);
    assert.equal(png.readUInt32BE(16), Number(dimensions[1]), `${capture.file} width`);
    assert.equal(png.readUInt32BE(20), Number(dimensions[2]), `${capture.file} height`);
    assert.equal(createHash("sha256").update(png).digest("hex"), capture.sha256, `${capture.file} hash`);
  }
});

test("rejects semantically fabricated Procurement evidence", async () => {
  const manifest = JSON.parse(await readFile(`${directory}/manifest.json`, "utf8"));
  for (const mutate of [
    (copy) => { copy.subject_sha = "0".repeat(40); },
    (copy) => { copy.captures = copy.captures.slice(1); },
    (copy) => { copy.captures.find((capture) => capture.kind === "public").private_controls = 1; },
    (copy) => { const capture = copy.captures.find((entry) => entry.kind === "public"); capture.kind = "unclassified"; capture.private_controls = 99; },
    (copy) => { copy.captures.find((capture) => capture.kind === "public").route = "vendors.html"; },
    (copy) => { copy.captures[0].state = "unclassified"; },
    (copy) => { copy.captures[0].state = "error"; },
    (copy) => { copy.captures[0].viewport = "390x844"; copy.captures[0].source_frame = "390x844"; },
    (copy) => { copy.captures[1].file = copy.captures[0].file; },
    (copy) => { copy.source_git_blobs[sourcePaths[0]] = "0".repeat(40); },
    (copy) => { copy.captures[0].sha256 = "0".repeat(64); },
    (copy) => { copy.captures[0].state_visible = false; },
    (copy) => { copy.captures[0].sha256 = "fabricated"; }
  ]) {
    const fabricated = structuredClone(manifest);
    mutate(fabricated);
    assert.throws(() => validateManifestShape(fabricated));
  }
});
