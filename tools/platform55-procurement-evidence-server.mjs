import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const BOUNDARY_MARKER = "RATEWARE_PROCUREMENT_QA_BOUNDARY";
const IMPORT_MARKER = "RATEWARE_PROCUREMENT_QA_IMPORT_BOUNDARY";
const MIME = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
});

const sharedFixture = `// ${BOUNDARY_MARKER}: deterministic fixture helpers
const qaState = () => new URLSearchParams(window.location.search).get("qa_state") || "loaded";
const fail = (label) => { if (qaState() === "error") throw new Error(\`Deterministic \${label} evidence error\`); };
const blocked = () => { throw new Error("QA boundary blocks mutations"); };
`;

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

const vendorBoundary = `${sharedFixture}
const vendor = Object.freeze({ id: "00000000-0000-4000-8000-000000000301", vendor_name: "Northstar Carrier", legal_name: "Northstar Carrier LLC", status: "active", base_stage: "sourcing", funnel_stage: "qualified", primary_email: "qa@local.invalid", preferred_channel: "email", tags: ["cross-border"], country: "MX" });
export async function fetchVendors() { fail("vendor"); return qaState() === "empty" ? { rows: [], total: 0 } : { rows: [vendor], total: 1 }; }
export async function fetchVendorSegments() { fail("vendor segment"); return []; }
export async function fetchVendorFunnel() { fail("vendor funnel"); return { rows: [], stages: [] }; }
export async function fetchVendorIntelligence() { fail("vendor intelligence"); return { rows: [], total: 0 }; }
export async function fetchVendorOnboardingGaps() { fail("vendor onboarding"); return []; }
export async function fetchVendorRelationshipActivity() { fail("vendor relationship"); return []; }
export async function fetchVendorSupportTickets() { fail("vendor support"); return []; }
export const applyVendorTemplateUpdates = blocked;
export const applyVendorIntelligenceTags = blocked;
export const bulkUpdateVendors = blocked;
export const createVendor = blocked;
export const createVendorSegment = blocked;
export const createVendorProfileRequest = blocked;
export const deleteVendorSegment = blocked;
export const consolidateExactVendorDuplicates = blocked;
export const importVendorOnboardingCorrections = blocked;
export const importVendorsFromGoogleSheet = blocked;
export const importVendors = blocked;
export const matchVendorRateRowsByScope = blocked;
export const removeVendors = blocked;
export const replaceBouncedVendorEmail = blocked;
export const updateVendor = blocked;
export const updateVendorSegment = blocked;
export const updateVendorSupportTicket = blocked;
export const uploadVendorLogo = blocked;
`;

const rfxBoundary = `${sharedFixture}
const rfx = Object.freeze({ id: "00000000-0000-4000-8000-000000000501", name: "Cross-border RFQ", status: "open", customer_name: "QA Shipper", lane_count: 1, created_at: "2026-08-21T12:00:00Z" });
export async function fetchRfxEvents() { fail("RFx"); return qaState() === "empty" ? [] : [rfx]; }
export async function fetchRfxDetail() { fail("RFx detail"); return { event: rfx, lanes: [], bids: [], lane_vendors: [], awards: [] }; }
export async function fetchRfxEventContext() { fail("RFx context"); return { event: rfx, lanes: [] }; }
export async function fetchRfxResponseVendorIds() { fail("RFx responses"); return []; }
export async function fetchBidRoomChat() { fail("bid room chat"); return []; }
export const applyBidUpdateFromChat = blocked;
export const archiveRfxEvent = blocked;
export const archiveRfxLaneVendors = blocked;
export const awardRfxLaneVendor = blocked;
export const clearRfxAward = blocked;
export const closeoutAwardedRfxToRateware = blocked;
export const generateRfxAwardNotices = blocked;
export const autoShortlistRfxLane = blocked;
export const createRfxEvent = blocked;
export const deleteRfxEvent = blocked;
export const duplicateRfxEvent = blocked;
export const importRfxLanes = blocked;
export const inviteRfxLaneVendors = blocked;
export const postBidRoomChatMessage = blocked;
export const sendBidRoomCarrierMessage = blocked;
export const shortlistRfxLaneVendors = blocked;
export const syncBidRoomEventThread = blocked;
export const updateBidRoomChatThread = blocked;
export const updateRfxEvent = blocked;
export const updateRfxLane = blocked;
export const updateRfxBid = blocked;
export const rejectRfxBid = blocked;
`;

const outreachBoundary = `${sharedFixture}
export async function fetchOutreachTemplates() { fail("outreach template"); return []; }
export async function fetchOutreachCampaigns() { fail("outreach campaign"); return []; }
export async function fetchContactHistory() { fail("contact history"); return []; }
export async function fetchOutreachMessages() { fail("outreach message"); return []; }
export async function fetchOutreachMessage() { fail("outreach message"); return null; }
export async function fetchOutreachMessagesPage() { fail("outreach message"); return { rows: [], total: 0, has_more: false, limit: 1000, offset: 0 }; }
export async function fetchOutreachTrackingSummary() { fail("outreach tracking"); return {}; }
export async function fetchOutreachAudienceSegments() { fail("outreach audience"); return []; }
export async function previewOutreachAudience() { fail("outreach audience"); return { rows: [], total: 0 }; }
export const archiveOutreachAudienceSegment = blocked;
export const archiveOutreachCampaign = blocked;
export const archiveOutreachTemplate = blocked;
export const createOutreachCampaign = blocked;
export const createOutreachTemplate = blocked;
export const deleteOutreachCampaign = blocked;
export const deleteOutreachMessages = blocked;
export const deleteOutreachTemplate = blocked;
export const duplicateOutreachCampaign = blocked;
export const duplicateOutreachTemplate = blocked;
export const generateOutreachDrafts = blocked;
export const markWhatsappGroupMessageManuallySent = blocked;
export const markOutreachMessages = blocked;
export const publishOutreachTemplateToWhatsapp = blocked;
export const saveOutreachAudienceSegment = blocked;
export const sendOutreachMessages = blocked;
export const sendWhatsappOutreachMessages = blocked;
export const sendWhatsappGroupOutreachMessages = blocked;
export const syncOutreachWhatsappTemplates = blocked;
export const updateOutreachCampaign = blocked;
export const updateOutreachTemplate = blocked;
`;

const rfxProcessBoundary = `${sharedFixture}
const project = Object.freeze({ id: "00000000-0000-4000-8000-000000000601", title: "QA Procurement Project", customer_name: "QA Shipper", status: "draft", target_start_date: "2026-09-01" });
export async function fetchRfxProcessProjects() { fail("RFx process"); return qaState() === "empty" ? { rows: [], total: 0 } : { rows: [project], total: 1 }; }
export async function fetchRfxProcessProject() { fail("RFx process detail"); return { project, demand_snapshots: [], rfx_packages: [], awards: [], audit: [], rfi_submission: null }; }
export const createRfxAwardPackage = blocked;
export const createRfxDemandSnapshot = blocked;
export const createRfxPackage = blocked;
export const createRfxProcessProject = blocked;
export const createRfxRfiMagicLink = blocked;
export const launchRfxPackageToBidRoom = blocked;
export const markRfxAwardPackageImplementationReady = blocked;
export const reopenRfxRfi = blocked;
export const revokeRfxRfiMagicLink = blocked;
export const saveRfxProcessRfi = blocked;
export const updateRfxProcessProject = blocked;
`;

const ratebookBoundary = `${sharedFixture}
const book = Object.freeze({ id: "00000000-0000-4000-8000-000000000701", name: "Cross-border Ratebook", lifecycle_status: "draft", source_type: "award", shipper_name: "QA Shipper", route_count: 0 });
export async function fetchRatebooks() { fail("ratebook"); return qaState() === "empty" ? { rows: [], route_rows: [], route_total: 0, facets: { shippers: [], sources: [], segments: [] } } : { rows: [book], route_rows: [], route_total: 0, facets: { shippers: [], sources: [], segments: [] } }; }
export async function fetchRatebook() { fail("ratebook detail"); return { ratebook: book, routes: [], segments: [] }; }
export async function fetchRatebookCarriers() { fail("ratebook carrier"); return []; }
export async function fetchRatebookAudit() { fail("ratebook audit"); return []; }
export async function fetchRatebookRouteDetail() { fail("ratebook route"); return null; }
export async function fetchRatebookRouteQuotes() { fail("ratebook quote"); return []; }
export async function fetchRatebookHealth() { fail("ratebook health"); return { status: "ready", gaps: [] }; }
export const exportRatebookRoutes = blocked;
export const archiveRatebook = blocked;
export const createRatebookRevision = blocked;
export const publishRatebook = blocked;
export const queueRatebookDistribution = blocked;
export const sendRatebookDistribution = blocked;
export const shareRatebookWithCarriers = blocked;
export const updateRatebookQuoteReview = blocked;
`;

const customerRfiBoundary = `${sharedFixture}
export async function fetchCustomerRfi() { fail("Customer RFI"); return { project: { id: "00000000-0000-4000-8000-000000000801", title: "QA Customer RFI", customer_name: "QA Shipper" }, link: { status: "active" }, submission: { status: "draft", response: { lanes: [], segment_checklists: [] } }, lanes: [], origins: [], destinations: [] }; }
export const saveCustomerRfi = blocked;
export const submitCustomerRfi = blocked;
`;

const businessIntelligenceBoundary = `${sharedFixture}
export async function fetchCarrierRecommendations() { fail("carrier recommendation"); return { rows: [], total: 0 }; }
`;

const shipperBoundary = `${sharedFixture}
export async function fetchShippers() { fail("shipper"); return { rows: [], total: 0 }; }
`;

const settingsBoundary = `${sharedFixture}
export async function fetchWhatsappConnections() { fail("WhatsApp connection"); return []; }
`;

const configBoundary = `// ${BOUNDARY_MARKER}: public API fixture
export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "qa-public-read-only";
`;

const xlsxBoundary = `// ${BOUNDARY_MARKER}: offline XLSX fixture
export const utils = Object.freeze({});
export function read() { throw new Error("QA boundary does not parse uploads"); }
export function writeFile() { throw new Error("QA boundary blocks downloads"); }
`;

const BOUNDARIES = new Map([
  ["/src/auth.js", authBoundary],
  ["/src/vendor-service.js", vendorBoundary],
  ["/src/rfx-service.js", rfxBoundary],
  ["/src/outreach-service.js", outreachBoundary],
  ["/src/rfx-process-service.js", rfxProcessBoundary],
  ["/src/ratebook-service.js", ratebookBoundary],
  ["/src/customer-rfi-service.js", customerRfiBoundary],
  ["/src/business-intelligence-service.js", businessIntelligenceBoundary],
  ["/src/shipper-service.js", shipperBoundary],
  ["/src/settings-service.js", settingsBoundary],
  ["/src/config.js", configBoundary],
  ["/qa/xlsx.js", xlsxBoundary]
]);

const importMap = `<script type="importmap">{"imports":{"https://esm.sh/xlsx@0.18.5":"/qa/xlsx.js"}}</script><!-- ${IMPORT_MARKER} -->`;

function isInside(root, candidate) {
  const value = relative(root, candidate);
  return value !== ".." && !value.startsWith(`..${sep}`) && !value.includes(`..${sep}`);
}

function containsTraversal(rawUrl) {
  try {
    const decodedPath = decodeURIComponent(String(rawUrl || "").split("?", 1)[0]).replace(/\\/g, "/");
    return decodedPath.split("/").includes("..");
  } catch {
    return true;
  }
}

function withImportBoundary(source) {
  const marker = /<script\s+type=["']module["']/i;
  if (!marker.test(source)) return source;
  return source.replace(marker, `${importMap}\n$&`);
}

export async function startProcurementEvidenceServer({ rootDir = process.cwd(), port = 0 } = {}) {
  const root = await realpath(resolve(rootDir));
  const server = createServer(async (request, response) => {
    try {
      if (!new Set(["GET", "HEAD"]).has(request.method || "")) {
        response.writeHead(405, { Allow: "GET, HEAD", "Cache-Control": "no-store" });
        response.end();
        return;
      }

      if (containsTraversal(request.url)) throw Object.assign(new Error("path traversal"), { status: 404 });

      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (url.pathname === "/favicon.ico") {
        response.writeHead(204, { "Cache-Control": "no-store" });
        response.end();
        return;
      }
      const boundary = BOUNDARIES.get(url.pathname);
      if (boundary) {
        response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store", "X-Rateware-QA-Boundary": "true" });
        response.end(request.method === "HEAD" ? undefined : boundary);
        return;
      }

      const relativePath = decodeURIComponent(url.pathname === "/" ? "/vendors.html" : url.pathname).replace(/^\/+/, "");
      const candidate = resolve(root, relativePath);
      if (!isInside(root, candidate)) throw Object.assign(new Error("outside root"), { status: 404 });
      const realCandidate = await realpath(candidate);
      if (!isInside(root, realCandidate) || !(await stat(realCandidate)).isFile()) throw Object.assign(new Error("not a file"), { status: 404 });
      const contentType = MIME[extname(realCandidate).toLowerCase()] || "application/octet-stream";
      const body = await readFile(realCandidate);
      const output = contentType.startsWith("text/html") ? Buffer.from(withImportBoundary(body.toString("utf8"))) : body;
      response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
      response.end(request.method === "HEAD" ? undefined : output);
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
  const instance = await startProcurementEvidenceServer({ rootDir: process.argv[2] || process.cwd(), port: Number(process.argv[3] || 4175) });
  process.stdout.write(`${instance.origin}\n`);
}
