import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const P3V1_PRODUCTION = Object.freeze({
  recordPath: "docs/release/evidence/2026-08-24-p3v1-production-closure.json",
  reportPath: "docs/release/evidence/2026-08-24-p3v1-production-closure.md",
  reviewedHead: "93db2a40d9e93ceb5c0e70453fbc83f85dcd89e5",
  reviewedTree: "740868975bf855415e577019415d76cb826d6d48",
  releaseSha: "209e40a3764716af165064e00b359068442a6d4d",
  releaseTree: "740868975bf855415e577019415d76cb826d6d48",
  previewDeploymentId: "dpl_8jta5akwoWc4sutLpgu5SuEzJ8fy",
  productionDeploymentId: "dpl_GR34Gm4xAtvWkRgyNRJ1eZHFL45y",
  productionDeploymentUrl: "rateware-1cb673wzm-elandopando8892s-projects.vercel.app",
  productionAlias: "rateware.vercel.app",
});

const ROUTES = new Map([
  ["command-center", {
    path: "/app",
    heading: "Command Center",
    approved_rates: 55767,
  }],
  ["rateware", {
    path: "/rateware",
    heading: "Rateware",
    approved_rates: 55767,
    loaded_rows: 100,
    carriers: 28,
    markets: 19,
    avg_all_in_rate: 5517.01,
    critical_cells: 2,
    visible_cells: 63,
  }],
]);

function exactObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((descriptor) => !("value" in descriptor))) {
    throw new Error(`${label} must contain data properties only`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} fields mismatch`);
  }
  return value;
}

function normalizedSha256(value) {
  return createHash("sha256").update(String(value).replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

function git(rootDir, args) {
  return execFileSync("git", ["-C", rootDir, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function loadP3V1ProductionClosure(rootDir) {
  const root = resolve(rootDir);
  const recordBytes = readFileSync(resolve(root, P3V1_PRODUCTION.recordPath), "utf8");
  const report = readFileSync(resolve(root, P3V1_PRODUCTION.reportPath), "utf8");
  return {
    record: JSON.parse(recordBytes),
    recordBytes,
    recordSha256: normalizedSha256(recordBytes),
    report,
  };
}

export function validateP3V1ProductionRecord(record) {
  exactObject(record, [
    "schema_version", "sprint", "mode", "environment", "reviewed_head", "release", "preview",
    "routes", "supabase", "boundaries", "formal_ledger", "p3v_progress", "verdict",
  ], "production record");
  if (record.schema_version !== 1 || record.sprint !== "P3-V1" || record.mode !== "read_only" || record.environment !== "production") {
    throw new Error("production record header mismatch");
  }

  const reviewed = exactObject(record.reviewed_head, ["sha", "tree", "independent_verdict", "p0", "p1", "p2"], "reviewed head");
  if (
    reviewed.sha !== P3V1_PRODUCTION.reviewedHead || reviewed.tree !== P3V1_PRODUCTION.reviewedTree ||
    reviewed.independent_verdict !== "GO" || reviewed.p0 !== 0 || reviewed.p1 !== 0 || reviewed.p2 !== 0
  ) throw new Error("reviewed candidate identity or verdict mismatch");

  const release = exactObject(record.release, [
    "sha", "tree", "pr_number", "merged_at", "deployment_id", "deployment_url", "production_alias", "state", "source", "manual_promotion",
  ], "release");
  if (
    release.sha !== P3V1_PRODUCTION.releaseSha || release.tree !== P3V1_PRODUCTION.releaseTree ||
    release.tree !== reviewed.tree || release.pr_number !== 70 || release.merged_at !== "2026-08-24T12:39:37Z" ||
    release.deployment_id !== P3V1_PRODUCTION.productionDeploymentId || release.deployment_url !== P3V1_PRODUCTION.productionDeploymentUrl ||
    release.production_alias !== P3V1_PRODUCTION.productionAlias || release.state !== "READY" || release.source !== "git" ||
    release.manual_promotion !== false
  ) throw new Error("production release identity or boundary mismatch");

  const preview = exactObject(record.preview, [
    "head_sha", "deployment_id", "state", "authenticated_smoke", "kinde_callback_saved", "cors_origins_verified", "supabase_preview_check",
  ], "preview");
  if (
    preview.head_sha !== P3V1_PRODUCTION.reviewedHead || preview.deployment_id !== P3V1_PRODUCTION.previewDeploymentId ||
    preview.state !== "READY" || preview.authenticated_smoke !== true || preview.kinde_callback_saved !== true ||
    preview.cors_origins_verified !== 11 || preview.supabase_preview_check !== "SKIPPED"
  ) throw new Error("preview verification mismatch");

  if (!Array.isArray(record.routes) || record.routes.length !== ROUTES.size) throw new Error("production route matrix must contain exactly two routes");
  const seen = new Set();
  for (const route of record.routes) {
    exactObject(route, [
      "id", "path", "heading", "authenticated", "passed", "console_errors", "console_warnings",
      "approved_rates", "loaded_rows", "carriers", "markets", "avg_all_in_rate", "critical_cells", "visible_cells",
    ], "production route");
    const expected = ROUTES.get(route.id);
    if (!expected || seen.has(route.id)) throw new Error("production route identity mismatch");
    seen.add(route.id);
    for (const [key, value] of Object.entries(expected)) {
      if (route[key] !== value) throw new Error(`production route evidence mismatch: ${route.id}.${key}`);
    }
    const optionalKeys = ["loaded_rows", "carriers", "markets", "avg_all_in_rate", "critical_cells", "visible_cells"];
    for (const key of optionalKeys) {
      if (!(key in expected) && route[key] !== null) throw new Error(`unexpected route metric: ${route.id}.${key}`);
    }
    if (route.authenticated !== true || route.passed !== true || route.console_errors !== 0 || route.console_warnings !== 0) {
      throw new Error(`production route failed: ${route.id}`);
    }
  }

  const supabase = exactObject(record.supabase, [
    "project_status", "default_branch", "persistent_preview_count", "persistent_preview_name", "second_preview_created", "mutation_authorized", "changed",
  ], "Supabase evidence");
  if (
    supabase.project_status !== "ACTIVE_HEALTHY" || supabase.default_branch !== "main" ||
    supabase.persistent_preview_count !== 1 || supabase.persistent_preview_name !== "fcm-gmail-staging" ||
    supabase.second_preview_created !== false || supabase.mutation_authorized !== false || supabase.changed !== false
  ) throw new Error("Supabase read-only boundary mismatch");

  const boundaryKeys = [
    "production_data_mutation", "upload_created", "row_approved", "mutating_control_activated", "supabase_changed", "manual_promotion",
  ];
  const boundaries = exactObject(record.boundaries, boundaryKeys, "production boundaries");
  if (boundaryKeys.some((key) => boundaries[key] !== false)) throw new Error("production boundary violation");

  const formal = exactObject(record.formal_ledger, ["general", "p3", "changed"], "formal ledger");
  if (formal.general !== 83 || formal.p3 !== 0 || formal.changed !== false) throw new Error("formal release progress must remain unchanged");
  if (record.p3v_progress !== 25) throw new Error("P3-V1 visual progress mismatch");
  if (record.verdict !== "GO") throw new Error("production verdict must be GO");
  return record;
}

export function validateP3V1ProductionReport(report, recordBytes) {
  const digest = normalizedSha256(recordBytes);
  const markers = [
    "Verdict: GO",
    `Reviewed head: \`${P3V1_PRODUCTION.reviewedHead}\``,
    `Production release: \`${P3V1_PRODUCTION.releaseSha}\``,
    `Vercel deployment: \`${P3V1_PRODUCTION.productionDeploymentId}\``,
    `Production alias: \`${P3V1_PRODUCTION.productionAlias}\``,
    `Record SHA-256: \`${digest}\``,
    "No manual promotion occurred.",
    "Formal release progress remains General `83%`; P3 `0%`.",
    "P3-V visual parity remains `25%` after the two-route P3-V1 vertical.",
  ];
  if (markers.some((marker) => !String(report).includes(marker))) throw new Error("production report identity, digest, or boundary mismatch");
  return digest;
}

export function validateP3V1ProductionGitState(rootDir) {
  const root = resolve(rootDir);
  git(root, ["cat-file", "-e", `${P3V1_PRODUCTION.releaseSha}^{commit}`]);
  if (git(root, ["rev-parse", `${P3V1_PRODUCTION.releaseSha}^{tree}`]) !== P3V1_PRODUCTION.releaseTree) {
    throw new Error("production release tree mismatch");
  }
  if (P3V1_PRODUCTION.releaseTree !== P3V1_PRODUCTION.reviewedTree) throw new Error("reviewed and released trees differ");
  git(root, ["merge-base", "--is-ancestor", P3V1_PRODUCTION.releaseSha, "HEAD"]);
  return { release: P3V1_PRODUCTION.releaseSha, tree: P3V1_PRODUCTION.releaseTree };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const loaded = loadP3V1ProductionClosure(root);
  validateP3V1ProductionRecord(loaded.record);
  validateP3V1ProductionReport(loaded.report, loaded.recordBytes);
  validateP3V1ProductionGitState(root);
  console.log(`Platform55 P3-V1 production closure PASS: ${loaded.recordSha256}`);
}
