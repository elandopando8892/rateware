import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const BOUNDARY_MARKER = "RATEWARE_OPERATE_QA_BOUNDARY";
const MIME = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
});

const authBoundary = `// ${BOUNDARY_MARKER}: authentication fixture
import { mountPlatform55Shell } from "./platform55-shell.js";
const session = Object.freeze({
  token: "qa-read-only-token",
  user: Object.freeze({ given_name: "QA", family_name: "Reviewer", email: "qa@local.invalid" }),
  access: Object.freeze({ claims: Object.freeze({}), roles: Object.freeze(["qa-reviewer"]), permissions: Object.freeze([]) })
});
export async function requirePrivatePage() { return session; }
export async function ensureSignedIn() { return session; }
export async function canUse() { return true; }
export async function applyPermissionState(selector) {
  document.querySelectorAll(selector).forEach((element) => {
    element.disabled = false;
    element.classList.remove("permission-disabled");
  });
  return true;
}
export function initAuthControls() {
  mountPlatform55Shell({ pageKey: document.body.dataset.platform55Page, user: session.user, accessContext: session.access });
  const status = document.querySelector("#auth-status");
  if (status) status.textContent = "Deterministic local QA session";
  document.querySelector("#auth-button")?.classList.add("hidden");
}
export async function authenticatedFetch() { throw new Error("QA boundary blocks network requests"); }
`;

const uploadBoundary = `// ${BOUNDARY_MARKER}: upload data fixture
const state = () => new URLSearchParams(window.location.search).get("qa_state") || "loaded";
const fail = () => { if (state() === "error") throw new Error("Deterministic upload evidence error"); };
const blocked = () => { throw new Error("QA boundary blocks mutations"); };
export async function fetchUploadHistory() {
  fail();
  return [{ id: "00000000-0000-4000-8000-000000000101", source_filename: "lane-quote.xlsx", document_type: "xlsx", status: "staged", created_at: "2026-08-21T12:00:00Z", vendor: "Northstar Carrier", rfx: "RFQ-2026-081", staged_rows: 12, approved_rows: 0, rejected_rows: 0 }];
}
export async function fetchUploadStagedRows() { fail(); return []; }
export async function getUploadSourceUrl() { blocked(); }
export async function listInterpretationMemory() { fail(); return []; }
export async function uploadRawFile() { blocked(); }
export async function bulkImportUploadTemplate() { blocked(); }
export async function archiveUpload() { blocked(); }
export async function removeUpload() { blocked(); }
export async function createInterpretationMemory() { blocked(); }
export async function interpretUpload() { blocked(); }
`;

const stagingBoundary = `// ${BOUNDARY_MARKER}: staging data fixture
const state = () => new URLSearchParams(window.location.search).get("qa_state") || "loaded";
const fail = () => { if (state() === "error") throw new Error("Deterministic staging evidence error"); };
const blocked = () => { throw new Error("QA boundary blocks mutations"); };
const row = Object.freeze({ id: "00000000-0000-4000-8000-000000000201", raw_upload_id: "00000000-0000-4000-8000-000000000101", status: "pending_review", vendor_id: "00000000-0000-4000-8000-000000000301", vendor_name: "Northstar Carrier", source_filename: "lane-quote.xlsx", origin: "Monterrey, NL", destination: "Laredo, TX", operation: "D2D Export", service: "One Way", equipment: "Dry Van 53", currency: "USD", all_in_rate: 2500, weekly_capacity: 8, confidence: 0.96, quote_date: "2026-08-21", valid_through: "2026-09-30", created_at: "2026-08-21T12:00:00Z", validation_flags: [] });
export async function fetchStagingPage() { fail(); return { rows: [row], total: 1, has_more: false }; }
export async function fetchStagingRows() { fail(); return [row]; }
export async function fetchStagingDetail() { fail(); return row; }
export async function fetchStagingFilterValues() { fail(); return { values: [], total: 0, database_count: 0, hard_limit_reached: false, limit: 5000 }; }
export async function fetchStagingOptions() { fail(); return { vendors: [], locations: [], equipment: [], operations: [], services: [] }; }
export async function searchStagingLocations() { fail(); return []; }
export async function saveLocationAlias() { blocked(); }
export async function updateStagingRow() { blocked(); }
export async function bulkUpdateStagingRows() { blocked(); }
export async function renormalizeStagingRows() { blocked(); }
export async function matchStagingVendors() { blocked(); }
export async function matchStagingVendorsByFilter() { blocked(); }
export async function enrichStagingLocationZips() { blocked(); }
export async function archiveStagingRows() { blocked(); }
export async function removeStagingRows() { blocked(); }
export async function archiveStagingRowsByFilter() { blocked(); }
export async function removeStagingRowsByFilter() { blocked(); }
export async function updateStagingRowsByFilter() { blocked(); }
`;

const ratewareBoundary = `// ${BOUNDARY_MARKER}: approved-rate data fixture
const state = () => new URLSearchParams(window.location.search).get("qa_state") || "loaded";
const fail = () => { if (state() === "error") throw new Error("Deterministic Rateware evidence error"); };
const blocked = () => { throw new Error("QA boundary blocks mutations"); };
const row = Object.freeze({ id: "00000000-0000-4000-8000-000000000401", raw_upload_id: "00000000-0000-4000-8000-000000000101", status: "approved", vendor_id: "00000000-0000-4000-8000-000000000301", vendor_name: "Northstar Carrier", source_filename: "lane-quote.xlsx", origin: "Monterrey, NL", destination: "Laredo, TX", operation: "D2D Export", service: "One Way", equipment: "Dry Van 53", currency: "USD", all_in_rate: 2500, weekly_capacity: 8, quote_date: "2026-08-21", valid_through: "2026-09-30", approved_at: "2026-08-21T13:00:00Z" });
export async function fetchApprovedRatewarePage() { fail(); return { rows: [row], total: 1, has_more: false }; }
export async function fetchApprovedRateware() { fail(); return [row]; }
export async function fetchRatewareFilterValues() { fail(); return { values: [], total: 0, database_count: 0, hard_limit_reached: false, limit: 1000 }; }
export async function fetchRatewareAudit() { fail(); return []; }
export async function fetchApprovedRatewareDetail() { fail(); return row; }
export async function fetchRatewareRowsByIds() { fail(); return [row]; }
export async function fetchRatewareOptions() { fail(); return { vendors: [], locations: [], equipment: [], operations: [], services: [] }; }
export async function searchRatewareLocations() { fail(); return []; }
export async function fetchRatewareBookVersions() { fail(); return []; }
export async function fetchRatewareBookVersion() { fail(); return null; }
export async function saveLocationAlias() { blocked(); }
export async function updateApprovedRatewareRow() { blocked(); }
export async function bulkUpdateApprovedRatewareRows() { blocked(); }
export async function updateApprovedRatewareByFilter() { blocked(); }
export async function renormalizeApprovedRatewareRows() { blocked(); }
export async function matchApprovedRatewareVendors() { blocked(); }
export async function matchApprovedRatewareVendorsByFilter() { blocked(); }
export async function enrichApprovedRatewareLocationZips() { blocked(); }
export async function returnApprovedRatesToStaging() { blocked(); }
export async function archiveApprovedRatewareByFilter() { blocked(); }
export async function removeApprovedRatewareByFilter() { blocked(); }
export async function createRatewareBookVersion() { blocked(); }
`;

const vendorBoundary = `// ${BOUNDARY_MARKER}: vendor data fixture
export async function fetchVendors() { return [{ id: "00000000-0000-4000-8000-000000000301", vendor_name: "Northstar Carrier", status: "active" }]; }
`;

const BOUNDARIES = new Map([
  ["/src/auth.js", authBoundary],
  ["/src/upload-service.js", uploadBoundary],
  ["/src/staging-service.js", stagingBoundary],
  ["/src/rateware-service.js", ratewareBoundary],
  ["/src/vendor-service.js", vendorBoundary]
]);

function isInside(root, candidate) {
  const value = relative(root, candidate);
  return value !== ".." && !value.startsWith(`..${sep}`) && !value.startsWith(`..${sep}`) && !value.includes(`..${sep}`);
}

export async function startOperateEvidenceServer({ rootDir = process.cwd(), port = 0 } = {}) {
  const root = await realpath(resolve(rootDir));
  const server = createServer(async (request, response) => {
    try {
      if (!new Set(["GET", "HEAD"]).has(request.method || "")) {
        response.writeHead(405, { Allow: "GET, HEAD", "Cache-Control": "no-store" });
        response.end();
        return;
      }

      const url = new URL(request.url || "/", "http://127.0.0.1");
      const boundary = BOUNDARIES.get(url.pathname);
      if (boundary) {
        response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store", "X-Rateware-QA-Boundary": "true" });
        response.end(request.method === "HEAD" ? undefined : boundary);
        return;
      }

      const relativePath = decodeURIComponent(url.pathname === "/" ? "/upload-center.html" : url.pathname).replace(/^\/+/, "");
      const candidate = resolve(root, relativePath);
      if (!isInside(root, candidate)) throw Object.assign(new Error("outside root"), { status: 404 });
      const realCandidate = await realpath(candidate);
      if (!isInside(root, realCandidate) || !(await stat(realCandidate)).isFile()) throw Object.assign(new Error("not a file"), { status: 404 });
      const body = await readFile(realCandidate);
      response.writeHead(200, { "Content-Type": MIME[extname(realCandidate).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      response.writeHead(Number(error?.status || (error?.code === "ENOENT" ? 404 : 500)), { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      response.end("Not found");
    }
  });

  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    close: () => new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()))
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const instance = await startOperateEvidenceServer({ rootDir: process.argv[2] || process.cwd(), port: Number(process.argv[3] || 4174) });
  process.stdout.write(`${instance.origin}\n`);
}
