import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const P3V2_PRODUCTION = Object.freeze({
  recordPath: "docs/release/evidence/2026-08-25-p3v2-production-closure.json",
  reportPath: "docs/release/evidence/2026-08-25-p3v2-production-closure.md",
  reviewedHead: "99fbd18e469763ff90d346135bd1e7fda9b417d6",
  reviewedTree: "82e053ac9979b8ec86430708870a79346fd70202",
  releaseSha: "f329b3c580ba9a7c3bf9f7836d2af4986f946f3f",
  releaseTree: "82e053ac9979b8ec86430708870a79346fd70202",
  previewDeploymentId: "dpl_FBGrPFCAkVfCRac5vgSuswsHgnL4",
  productionDeploymentId: "dpl_AvCeNfRhG3T5YzgehByP53h7Kcnc",
  productionDeploymentUrl: "rateware-bdto3t0uq-elandopando8892s-projects.vercel.app",
  productionAlias: "rateware.vercel.app",
  recordSha256: "8c5bb6d5499808b2280ef30e249ae688d71e6581d89ea82e32b7222ca7abbabb",
  reportSha256: "7b7696dde6949f8071c5936b0174887629a2d6327251b02be74dde2f097921db",
});

const ROUTES = new Map([
  ["upload-center", { path: "/upload-center", heading: "Upload Center" }],
  ["source-files", { path: "/upload-history", heading: "Upload History" }],
  ["review-queue", { path: "/staging-review", heading: "Staging Review" }],
]);

function exactObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((descriptor) => !("value" in descriptor))) throw new Error(`${label} must contain data properties only`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} fields mismatch`);
  return value;
}

const normalizedSha256 = (value) => createHash("sha256").update(String(value).replace(/\r\n/g, "\n"), "utf8").digest("hex");
const git = (root, args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

export function loadP3V2ProductionClosure(rootDir) {
  const root = resolve(rootDir);
  const recordBytes = readFileSync(resolve(root, P3V2_PRODUCTION.recordPath), "utf8");
  return {
    record: JSON.parse(recordBytes),
    recordBytes,
    recordSha256: normalizedSha256(recordBytes),
    report: readFileSync(resolve(root, P3V2_PRODUCTION.reportPath), "utf8"),
  };
}

export function validateP3V2ProductionRecord(record) {
  exactObject(record, ["schema_version", "sprint", "mode", "environment", "reviewed_head", "release", "preview", "routes", "supabase", "boundaries", "formal_ledger", "p3v_progress", "verdict"], "production record");
  if (record.schema_version !== 1 || record.sprint !== "P3-V2" || record.mode !== "read_only" || record.environment !== "production") throw new Error("production record header mismatch");

  const reviewed = exactObject(record.reviewed_head, ["sha", "tree", "independent_verdict", "p0", "p1", "p2"], "reviewed head");
  if (reviewed.sha !== P3V2_PRODUCTION.reviewedHead || reviewed.tree !== P3V2_PRODUCTION.reviewedTree || reviewed.independent_verdict !== "GO" || reviewed.p0 !== 0 || reviewed.p1 !== 0 || reviewed.p2 !== 0) throw new Error("reviewed candidate identity or verdict mismatch");

  const release = exactObject(record.release, ["sha", "tree", "pr_number", "merged_at", "deployment_id", "deployment_url", "production_alias", "state", "source", "manual_promotion"], "release");
  if (release.sha !== P3V2_PRODUCTION.releaseSha || release.tree !== P3V2_PRODUCTION.releaseTree || release.tree !== reviewed.tree || release.pr_number !== 72 || release.merged_at !== "2026-08-25T17:24:39Z" || release.deployment_id !== P3V2_PRODUCTION.productionDeploymentId || release.deployment_url !== P3V2_PRODUCTION.productionDeploymentUrl || release.production_alias !== P3V2_PRODUCTION.productionAlias || release.state !== "READY" || release.source !== "git" || release.manual_promotion !== false) throw new Error("production release identity or boundary mismatch");

  const preview = exactObject(record.preview, ["head_sha", "deployment_id", "state", "authenticated_smoke", "kinde_callback_saved", "cors_origins_verified", "supabase_preview_check"], "preview");
  if (preview.head_sha !== P3V2_PRODUCTION.reviewedHead || preview.deployment_id !== P3V2_PRODUCTION.previewDeploymentId || preview.state !== "READY" || preview.authenticated_smoke !== true || preview.kinde_callback_saved !== true || preview.cors_origins_verified !== 13 || preview.supabase_preview_check !== "SKIPPED") throw new Error("preview verification mismatch");

  if (!Array.isArray(record.routes) || record.routes.length !== ROUTES.size) throw new Error("production route matrix must contain exactly three routes");
  const seen = new Set();
  for (const route of record.routes) {
    exactObject(route, ["id", "path", "heading", "authenticated", "tenant_context", "passed", "read_only", "console_errors", "console_warnings"], "production route");
    const expected = ROUTES.get(route.id);
    if (!expected || seen.has(route.id)) throw new Error("production route identity mismatch");
    seen.add(route.id);
    if (route.path !== expected.path || route.heading !== expected.heading || route.authenticated !== true || route.tenant_context !== true || route.passed !== true || route.read_only !== true || route.console_errors !== 0 || route.console_warnings !== 0) throw new Error(`production route evidence mismatch: ${route.id}`);
  }

  const supabase = exactObject(record.supabase, ["project_status", "default_branch", "persistent_preview_count", "persistent_preview_name", "second_preview_created", "mutation_authorized", "changed"], "Supabase evidence");
  if (supabase.project_status !== "ACTIVE_HEALTHY" || supabase.default_branch !== "main" || supabase.persistent_preview_count !== 1 || supabase.persistent_preview_name !== "fcm-gmail-staging" || supabase.second_preview_created !== false || supabase.mutation_authorized !== false || supabase.changed !== false) throw new Error("Supabase read-only boundary mismatch");

  const boundaryKeys = ["production_data_mutation", "upload_created", "row_approved", "mutating_control_activated", "supabase_changed", "manual_promotion"];
  const boundaries = exactObject(record.boundaries, boundaryKeys, "production boundaries");
  if (boundaryKeys.some((key) => boundaries[key] !== false)) throw new Error("production boundary violation");

  const formal = exactObject(record.formal_ledger, ["general", "p3", "changed"], "formal ledger");
  if (formal.general !== 83 || formal.p3 !== 0 || formal.changed !== false) throw new Error("formal release progress must remain unchanged");
  if (record.p3v_progress !== 40) throw new Error("P3-V2 visual progress mismatch");
  if (record.verdict !== "GO") throw new Error("production verdict must be GO");
  return record;
}

export function validateP3V2ProductionReport(report, recordBytes) {
  const digest = normalizedSha256(recordBytes);
  if (digest !== P3V2_PRODUCTION.recordSha256) throw new Error("production record canonical digest mismatch");
  if (normalizedSha256(report) !== P3V2_PRODUCTION.reportSha256) throw new Error("production report canonical digest mismatch");
  for (const marker of ["Verdict: GO", `Reviewed head: \`${P3V2_PRODUCTION.reviewedHead}\``, `Production release: \`${P3V2_PRODUCTION.releaseSha}\``, `Vercel deployment: \`${P3V2_PRODUCTION.productionDeploymentId}\``, `Production alias: \`${P3V2_PRODUCTION.productionAlias}\``, `Record SHA-256: \`${digest}\``, "No manual promotion occurred.", "Formal release progress remains General `83%`; P3 `0%`.", "P3-V visual parity remains `40%` after the three-route P3-V2 vertical."]) {
    if (!String(report).includes(marker)) throw new Error("production report identity, digest, or boundary mismatch");
  }
  return digest;
}

export function validateP3V2ProductionGitState(rootDir) {
  const root = resolve(rootDir);
  git(root, ["cat-file", "-e", `${P3V2_PRODUCTION.releaseSha}^{commit}`]);
  if (git(root, ["rev-parse", `${P3V2_PRODUCTION.releaseSha}^{tree}`]) !== P3V2_PRODUCTION.releaseTree || P3V2_PRODUCTION.releaseTree !== P3V2_PRODUCTION.reviewedTree) throw new Error("production release tree mismatch");
  git(root, ["merge-base", "--is-ancestor", P3V2_PRODUCTION.releaseSha, "HEAD"]);
  for (const [path, expected] of [[P3V2_PRODUCTION.recordPath, P3V2_PRODUCTION.recordSha256], [P3V2_PRODUCTION.reportPath, P3V2_PRODUCTION.reportSha256]]) {
    git(root, ["ls-files", "--error-unmatch", "--", path]);
    const indexedBlob = git(root, ["rev-parse", `:${path}`]);
    const indexedBytes = execFileSync("git", ["-C", root, "cat-file", "blob", indexedBlob], { encoding: "utf8" });
    const workingBytes = readFileSync(resolve(root, path), "utf8");
    if (normalizedSha256(indexedBytes) !== expected || normalizedSha256(workingBytes) !== expected) throw new Error(`production closure artifact drift: ${path}`);
  }
  return { release: P3V2_PRODUCTION.releaseSha, tree: P3V2_PRODUCTION.releaseTree };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const loaded = loadP3V2ProductionClosure(root);
  validateP3V2ProductionRecord(loaded.record);
  validateP3V2ProductionReport(loaded.report, loaded.recordBytes);
  validateP3V2ProductionGitState(root);
  console.log(`Platform55 P3-V2 production closure PASS: ${loaded.recordSha256}`);
}
