import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const BOUNDARY = "RATEWARE_INTELLIGENCE_ADMIN_QA_BOUNDARY";
const MIME = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
});

const shared = `// ${BOUNDARY}: deterministic, read-only QA helpers
const qaState = () => new URLSearchParams(window.location.search).get("qa_state") || "loaded";
const fail = (label) => { if (qaState() === "error") throw new Error(\`Deterministic \${label} evidence error\`); };
const blocked = () => { throw new Error("QA boundary blocks mutations"); };
`;

const authBoundary = `${shared}
import { mountPlatform55Shell } from "./platform55-shell.js";
const session = Object.freeze({ token: "qa-read-only-token", user: Object.freeze({ given_name: "QA", family_name: "Reviewer", email: "qa@local.invalid" }), access: Object.freeze({ roles: Object.freeze(["qa-reviewer"]), permissions: Object.freeze([]), claims: Object.freeze({}) }) });
export async function requirePrivatePage() { return session; }
export async function ensureSignedIn() { return session; }
export async function canUse() { return true; }
export async function applyPermissionState(selector) { if (selector) document.querySelectorAll(selector).forEach((element) => { element.disabled = false; element.classList.remove("permission-disabled"); }); return true; }
export function initAuthControls() {
  if (document.body.dataset.platform55Shell === "tenant") mountPlatform55Shell({ pageKey: document.body.dataset.platform55Page, user: session.user, accessContext: session.access });
  const status = document.querySelector("#auth-status");
  if (status) {
    status.dataset.authState = qaState() === "signed-out" ? "signed-out" : "authenticated";
    status.textContent = qaState() === "signed-out" ? "Signed out · public preview only" : "Deterministic local QA session";
  }
  document.querySelector("#auth-button")?.classList.toggle("hidden", qaState() !== "signed-out");
}
export async function getKindeClient() { return Object.freeze({ login: blocked, logout: blocked }); }
export async function authenticatedFetch() { throw new Error("QA boundary blocks network requests"); }
`;

const intelligenceBoundary = `${shared}
const geo = Object.freeze({
  metric: "transactions", level: "market", data_as_of: "2026-08-22",
  summary: Object.freeze({ transactions: 18, carriers: 3, zones: 2, missing_geo: 0 }),
  points: Object.freeze([
    Object.freeze({ key: "monterrey-origin", label: "Monterrey", market: "Monterrey", state: "NL", country: "MX", region: "North Mexico", flow: "origin", level: "market", lat: 25.6866, lng: -100.3161, transactions: 11, carriers: 2, avg_all_in: 3150, currency: "USD" }),
    Object.freeze({ key: "laredo-destination", label: "Laredo", market: "Laredo", state: "TX", country: "US", region: "South Central", flow: "destination", level: "market", lat: 27.5306, lng: -99.4803, transactions: 7, carriers: 2, avg_all_in: 2980, currency: "USD" })
  ])
});
export async function fetchBusinessIntelligenceGeoDensity() { fail("geo intelligence"); return geo; }
export async function fetchBusinessIntelligencePivot() { fail("pivot"); return { rows: [], columns: [], summary: { transactions: 0 }, data_as_of: "2026-08-22" }; }
export async function fetchBusinessIntelligenceDrilldown() { fail("drilldown"); return { rows: [], summary: {}, data_as_of: "2026-08-22" }; }
export async function fetchCarrierRecommendations() { fail("recommendations"); return { rows: [], summary: {}, data_as_of: "2026-08-22" }; }
export async function askCarrierIntelligence() { fail("analyst"); return { answer: "QA evidence only", rows: [], data_gaps: [], proposed_actions: [], suggested_pivots: [], data_as_of: "2026-08-22" }; }
export const promoteCarrierRecommendations = blocked;
`;

const growthBoundary = `${shared}
export async function loadGrowthDashboard() { fail("growth dashboard"); return { data_as_of: "2026-08-22", metrics: { shippers: 24, ready: 8, segments: 3, campaigns: 2, responses: 6, rfqs: 2, opportunities: 4 } }; }
export async function listGrowthSegments() { fail("growth segments"); return { rows: [] }; }
export async function listGrowthCampaigns() { fail("growth campaigns"); return { rows: [] }; }
export async function listGrowthResults() { fail("growth results"); return []; }
export async function getGrowthCampaign() { fail("growth campaign"); return { row: {}, members: [], messages: [], results: [] }; }
export async function previewGrowthSegment() { fail("growth preview"); return { rows: [], total: 0 }; }
export const archiveGrowthSegment = blocked;
export const convertGrowthResult = blocked;
export const exportGrowthCampaign = blocked;
export const importGrowthCsv = blocked;
export const recordGrowthResult = blocked;
export const refreshGrowthCampaignAudience = blocked;
export const restoreGrowthSegment = blocked;
export const runGrowthAiAction = blocked;
export const saveGrowthCampaign = blocked;
export const saveGrowthMessage = blocked;
export const saveGrowthSegment = blocked;
export const setGrowthCampaignStatus = blocked;
`;

const settingsBoundary = `${shared}
const settings = Object.freeze({
  profile: Object.freeze({ owner_email: "qa@local.invalid", full_name: "QA Reviewer" }),
  organization: Object.freeze({ org_name: "Rateware QA", legal_name: "Rateware QA" }),
  access: Object.freeze({ mode: "authenticated", label: "Review required", detail: "Role enforcement is intentionally not asserted by QA." }),
  onboarding: Object.freeze([]), audit: Object.freeze([]),
  gmail: Object.freeze({ rows: Object.freeze([]) }), google_chat: Object.freeze({ rows: Object.freeze([]) }), whatsapp: Object.freeze({ rows: Object.freeze([]) })
});
export async function fetchSaasSettings() { fail("settings"); return settings; }
export async function fetchObservabilityEvents() { fail("observability"); return { summary: { total: 1 }, events: [{ source: "rateware_api", severity: "info", state: "observed", message: "Read-only QA evidence", occurred_at: "2026-08-22T12:00:00Z" }] }; }
export async function fetchCatalogValues() { fail("settings catalogs"); return []; }
export async function fetchGmailConnections() { fail("gmail settings"); return { rows: [] }; }
export async function fetchGoogleChatConnections() { fail("chat settings"); return { rows: [] }; }
export async function fetchGoogleChatSpaces() { fail("chat spaces"); return { rows: [] }; }
export async function fetchWhatsappConnections() { fail("whatsapp settings"); return { rows: [] }; }
export async function fetchWhatsappTemplates() { fail("whatsapp templates"); return { rows: [] }; }
export const archiveCatalogValue = blocked;
export const disconnectGmailConnection = blocked;
export const disconnectGoogleChatConnection = blocked;
export const disconnectWhatsappBusinessConnection = blocked;
export const retryGoogleChatSync = blocked;
export const saveCatalogValue = blocked;
export const saveGoogleChatSettings = blocked;
export const saveWhatsappBusinessConnection = blocked;
export const startGmailOAuth = blocked;
export const startGoogleChatOAuth = blocked;
export const syncGmailBounces = blocked;
export const syncWhatsappTemplates = blocked;
export const testWhatsappBusinessConnection = blocked;
export const updateOnboardingTask = blocked;
export const updateSaasOrganization = blocked;
export const updateSaasProfile = blocked;
export const verifyWhatsappWebhook = blocked;
`;

const memoryBoundary = `${shared}
export async function listMemoryRules() { fail("memory rules"); return []; }
export async function listMemoryAudit() { fail("memory audit"); return []; }
export const archiveMemoryRules = blocked;
export const createMemoryRule = blocked;
export const simulateMemoryRule = blocked;
export const updateMemoryRule = blocked;
`;

const catalogBoundary = `${shared}
export async function fetchCatalogValues() { fail("catalog values"); return []; }
export async function fetchLocationCatalogValues() { fail("location catalog"); return []; }
export const archiveCatalogValue = blocked;
export const archiveLocationCatalogValue = blocked;
export const bulkImportCatalogValues = blocked;
export const saveCatalogValue = blocked;
export const saveLocationCatalogValue = blocked;
export const syncRatewareCatalog = blocked;
`;

const ratewareBoundary = `${shared}
export async function fetchApprovedRatewarePage() { fail("approved rates"); return { rows: [], total: 0 }; }
export const updateApprovedRatewareRow = blocked;
`;

const stagingBoundary = `${shared}
export async function fetchStagingOptions() { fail("staging options"); return { locations: [] }; }
export async function fetchStagingPage() { fail("staging rows"); return { rows: [], total: 0 }; }
export const saveLocationAlias = blocked;
export const updateStagingRow = blocked;
`;

const xlsxBoundary = `// ${BOUNDARY}: local XLSX placeholder; evidence never parses uploads
export function read() { throw new Error("QA boundary blocks file parsing"); }
export const utils = Object.freeze({ sheet_to_json() { return []; } });
`;
const configBoundary = `// ${BOUNDARY}: local-only configuration\nexport const SUPABASE_URL = "";\nexport const SUPABASE_ANON_KEY = "qa-read-only";\n`;

const BOUNDARIES = new Map([
  ["/src/auth.js", authBoundary],
  ["/src/business-intelligence-service.js", intelligenceBoundary],
  ["/src/growth-service.js", growthBoundary],
  ["/src/settings-service.js", settingsBoundary],
  ["/src/memory-service.js", memoryBoundary],
  ["/src/catalog-service.js", catalogBoundary],
  ["/src/rateware-service.js", ratewareBoundary],
  ["/src/staging-service.js", stagingBoundary],
  ["/src/qa-xlsx.js", xlsxBoundary],
  ["/src/config.js", configBoundary]
]);

function inside(root, candidate) {
  const value = relative(root, candidate);
  return value !== ".." && !value.startsWith(`..${sep}`) && !value.includes(`..${sep}`);
}

function traversal(rawUrl) {
  try { return decodeURIComponent(String(rawUrl || "").split("?", 1)[0]).replace(/\\/g, "/").split("/").includes(".."); }
  catch { return true; }
}

export async function startIntelligenceAdminEvidenceServer({ rootDir = process.cwd(), port = 0 } = {}) {
  const root = await realpath(resolve(rootDir));
  const server = createServer(async (request, response) => {
    try {
      if (traversal(request.url)) throw Object.assign(new Error("path traversal"), { status: 404 });
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (!new Set(["GET", "HEAD"]).has(request.method || "")) { response.writeHead(405, { Allow: "GET, HEAD", "Cache-Control": "no-store" }); response.end(); return; }
      if (url.pathname === "/favicon.ico") { response.writeHead(204, { "Cache-Control": "no-store" }); response.end(); return; }
      const boundary = BOUNDARIES.get(url.pathname);
      if (boundary) { response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store", "X-Rateware-QA-Boundary": "true" }); response.end(request.method === "HEAD" ? undefined : boundary); return; }
      const relativePath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^\/+/, "");
      const candidate = resolve(root, relativePath);
      if (!inside(root, candidate)) throw Object.assign(new Error("outside root"), { status: 404 });
      const realCandidate = await realpath(candidate);
      if (!inside(root, realCandidate) || !(await stat(realCandidate)).isFile()) throw Object.assign(new Error("not a file"), { status: 404 });
      let body = await readFile(realCandidate);
      if (url.pathname === "/src/catalog-workbench.js") {
        body = Buffer.from(body.toString("utf8").replace('import * as XLSX from "https://esm.sh/xlsx@0.18.5";', 'import * as XLSX from "./qa-xlsx.js";'));
      }
      response.writeHead(200, { "Content-Type": MIME[extname(realCandidate).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store", ...(url.pathname === "/src/catalog-workbench.js" ? { "X-Rateware-QA-Boundary": "true" } : {}) });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      response.writeHead(Number(error?.status || (error?.code === "ENOENT" ? 404 : 500)), { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      response.end("Not found");
    }
  });
  await new Promise((accept, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", accept); });
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((accept, reject) => server.close((error) => error ? reject(error) : accept())) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const instance = await startIntelligenceAdminEvidenceServer({ rootDir: process.argv[2] || process.cwd(), port: Number(process.argv[3] || 4178) });
  process.stdout.write(`${instance.origin}\n`);
}
