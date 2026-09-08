import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MATRIX_PATH = resolve(ROOT, "docs/platform55-visual-parity/p3v-route-matrix.csv");
const PLAN_PATH = resolve(ROOT, "docs/superpowers/plans/2026-09-07-rateware-platform55-p3v6-aggregate.md");
const EVIDENCE_ROOT = resolve(ROOT, "docs/platform55-visual-parity/evidence/p3v6");

const EXPECTED_ROUTES = Object.freeze([
  "app.html", "upload-center.html", "upload-history.html", "staging-review.html", "rateware.html",
  "business-intelligence.html", "growth-hacking.html", "vendors.html", "shipper-crm.html", "rfx-process.html",
  "rfx-events.html", "ratebook.html", "outreach.html", "vendor-support.html", "vendor-improvement.html",
  "provider-service.html", "provider-onboarding.html", "provider-gmail.html", "provider-communications.html",
  "settings.html", "interpretation-memory.html", "catalog-workbench.html", "bid-room-board.html", "carrier-profile.html",
  "customer-rfi.html", "index.html", "ratebook-carrier.html", "rfx-bid.html", "shipper-profile.html",
]);

const PUBLIC_ROUTES = new Set([
  "bid-room-board.html", "carrier-profile.html", "customer-rfi.html", "index.html", "ratebook-carrier.html", "rfx-bid.html", "shipper-profile.html",
]);

const P3V5_ROUTES = new Set([
  "business-intelligence.html", "growth-hacking.html", "settings.html", "interpretation-memory.html", "catalog-workbench.html",
  "bid-room-board.html", "carrier-profile.html", "customer-rfi.html", "index.html", "ratebook-carrier.html", "rfx-bid.html", "shipper-profile.html",
]);

function parseCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const keys = header.split(",");
  return lines.map((line) => {
    const values = [];
    let value = "";
    let quoted = false;
    for (const char of line) {
      if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { values.push(value); value = ""; }
      else value += char;
    }
    values.push(value);
    return Object.fromEntries(keys.map((key, index) => [key, values[index] ?? ""]));
  });
}

const [matrixText, planText] = await Promise.all([
  readFile(MATRIX_PATH, "utf8"),
  readFile(PLAN_PATH, "utf8"),
]);
const matrix = parseCsv(matrixText);

test("P3-V6 owns the exact 29-route aggregate", () => {
  assert.equal(matrix.length, EXPECTED_ROUTES.length, "route matrix must remain a 29-route inventory");
  assert.deepEqual(matrix.map((row) => row.route), EXPECTED_ROUTES, "route order is the pinned aggregate order");
  assert.equal(new Set(matrix.map((row) => row.route)).size, EXPECTED_ROUTES.length, "route matrix must not duplicate routes");
  assert.match(planText, /P3.?V6 Aggregate Convergence/i);
  for (const route of EXPECTED_ROUTES) assert.match(planText, new RegExp(`\\b${route.replace(".", "\\.")}\\b`), `${route} must be named in the plan`);
});

test("P3-V6 preserves tenant/public shell boundaries", async () => {
  for (const route of EXPECTED_ROUTES) {
    const html = await readFile(resolve(ROOT, route), "utf8");
    assert.match(html, /data-platform55-shell="(?:tenant|public|entry)"/, `${route} must declare a shell variant`);
    assert.match(html, /data-platform55-page="[^"]+"/, `${route} must declare a page key`);
    assert.match(html, /data-platform55-page-content|data-platform55-public-app|data-platform55-entry-app/, `${route} must expose a shared page-content host`);
    assert.match(html, /platform55-tokens\.css/, `${route} must use the shared token layer`);
    if (PUBLIC_ROUTES.has(route)) {
      assert.match(html, new RegExp(`data-platform55-shell="${route === "index.html" ? "entry" : "public"}"`), `${route} must use public/entry shell`);
      assert.doesNotMatch(html, /data-platform55-sidebar|data-platform55-topbar/, `${route} must not expose tenant shell hosts`);
    } else {
      assert.match(html, /data-platform55-shell="tenant"/, `${route} must use tenant shell`);
      assert.match(html, /data-platform55-sidebar/, `${route} must expose tenant navigation host`);
      assert.match(html, /data-platform55-topbar/, `${route} must expose tenant topbar host`);
    }
  }
});

test("P3-V6 keeps P3-V5 boundaries and all matrix rows dispositioned", async () => {
  for (const route of P3V5_ROUTES) {
    const html = await readFile(resolve(ROOT, route), "utf8");
    assert.match(html, /p55-v5-page/, `${route} must retain P3-V5 visual marker`);
    assert.match(html, /data-p3v5-family="(?:intelligence|administration|public|entry)"/, `${route} must retain P3-V5 family marker`);
    assert.match(html, /data-p3v5-boundary=/, `${route} must retain a visible operational boundary`);
  }
  for (const row of matrix) {
    assert.ok(row.parity_status, `${row.route} must have an explicit parity status`);
    assert.ok(row.verification, `${row.route} must have an explicit verification disposition`);
    assert.ok(existsSync(resolve(ROOT, row.route)), `${row.route} must exist in the checkout`);
  }
});

test("P3-V6 plan preserves governed non-mutation scope", () => {
  assert.match(planText, /No enviar invitaciones, emails, WhatsApp, mensajes ni bids/);
  assert.match(planText, /No insertar, actualizar, archivar ni eliminar datos de negocio/);
  assert.match(planText, /No cambiar la migración Kinde → Supabase/);
  assert.match(planText, /revisión independiente/i);
});

test("P3-V6 evidence is immutable and SHA-bound", async () => {
  const candidates = (await readdir(EVIDENCE_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^[0-9a-f]{40}$/.test(entry.name))
    .map((entry) => entry.name);
  assert.ok(candidates.length, "P3-V6 must publish a SHA-named evidence package");
  const candidateSha = candidates.sort().at(-1);
  const manifestPath = resolve(EVIDENCE_ROOT, candidateSha, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.candidate_sha, candidateSha);
  assert.equal(manifest.route_count, 29);
  assert.equal(manifest.capture_count, 261);
  assert.deepEqual(manifest.browser.failures, []);
  assert.equal(execFileSync("git", ["-C", ROOT, "rev-parse", `${candidateSha}^{tree}`], { encoding: "utf8" }).trim(), manifest.candidate_tree);
  for (const [path, expectedBlob] of Object.entries(manifest.source_blobs)) {
    assert.equal(execFileSync("git", ["-C", ROOT, "rev-parse", `${candidateSha}:${path}`], { encoding: "utf8" }).trim(), expectedBlob, `${path} must remain bound to candidate SHA`);
  }
});
