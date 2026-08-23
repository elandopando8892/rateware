import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const BOUNDARY = "RATEWARE_NETWORK_SERVICE_QA_BOUNDARY";
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
const session = Object.freeze({
  token: "qa-read-only-token",
  user: Object.freeze({ given_name: "QA", family_name: "Reviewer", email: "qa@local.invalid" }),
  access: Object.freeze({ claims: Object.freeze({}), roles: Object.freeze(["qa-reviewer"]), permissions: Object.freeze([]) })
});
export async function requirePrivatePage() { return session; }
export async function ensureSignedIn() { return session; }
export async function canUse() { return true; }
export async function applyPermissionState(selector) {
  if (typeof selector === "string" && selector) document.querySelectorAll(selector).forEach((element) => { element.disabled = false; element.classList.remove("permission-disabled"); });
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

const shipperBoundary = `${shared}
const shipper = Object.freeze({
  id: "00000000-0000-4000-8000-000000000101", shipper_name: "Northwind Cross-Border Logistics Program With A Deliberately Long Account Name", legal_name: "Northwind Logistics Holdings LLC", status: "active", relationship_stage: "customer", industry: "Automotive", primary_contact_name: "Alexandra Operations", primary_contact_email: "alexandra.operations.long-address@northwind-logistics.example", headquarters_city: "Monterrey", headquarters_state: "NL", owner_name: "QA Reviewer", updated_at: "2026-08-21T12:00:00Z"
});
export async function fetchShippers() { fail("shipper directory"); return { rows: [shipper], total: 1 }; }
export async function fetchShipperSummary() { fail("shipper summary"); return { total: 1, active: 1, prospects: 0, missing_contact: 0, open_opportunities: 1 }; }
export async function fetchShipper() { fail("shipper profile"); return { ...shipper, contacts: [], locations: [], profile_data: {} }; }
export async function fetchShipperRelationshipPipeline() { fail("shipper pipeline"); return { rows: [shipper], total: 1 }; }
export async function fetchShipperCommercialWork() { fail("shipper commercial work"); return { rfis: [], opportunities: [], counts: {} }; }
export async function fetchShipperActionQueue() { fail("shipper action queue"); return { rows: [], total: 0, summary: {} }; }
export async function fetchShipperIntelligence() { fail("shipper intelligence"); return { rows: [], total: 0, summary: {} }; }
export async function fetchShipperDuplicates() { fail("shipper duplicates"); return { rows: [], scanned: 1 }; }
export async function fetchShipperAccountActivity() { fail("shipper activity"); return { rows: [], ratebooks: [], sync_failures: [] }; }
export const applyShipperActionPlaybook = blocked;
export const archiveShippers = blocked;
export const createShipper = blocked;
export const createShipperProfileRequest = blocked;
export const deleteShipperRecord = blocked;
export const importShippers = blocked;
export const importShipperCrmWorkbook = blocked;
export const launchShipperOpportunityRfx = blocked;
export const mergeShipperAccounts = blocked;
export const moveShipperRelationshipStage = blocked;
export const moveShipperOpportunityStage = blocked;
export const promoteShipperRfiToOpportunity = blocked;
export const saveShipperRecord = blocked;
export const updateShipper = blocked;
export const updateShipperAccountActionStatus = blocked;
export const revokeShipperProfileRequest = blocked;
`;

const ratewareBoundary = `${shared}
const support = Object.freeze({ id: "SUP-0001", vendor_id: "V-001", vendor_name: "Northstar Carrier With Long Service Name", vendor_domain: "northstar-carrier.example", contact_email: "support.operations.long-address@northstar-carrier.example", rfx_id: "RFQ-2026-001", route: "Monterrey, NL to Detroit, MI", event_customer: "Northwind", question: "Confirm cross-border appointment support and escalation ownership.", priority: "high", support_status: "open", public_context: false, occurred_at: "2026-08-21T12:00:00Z" });
const improvement = Object.freeze({ id: "CI-0001", vendor_id: "V-001", vendor_name: "Northstar Carrier", vendor_email: "quality@northstar-carrier.example", title: "Improve border status update timeliness", vendor_request: "Provide a corrective action plan with owners and dates.", case_type: "service_quality", methodology: "dmaic", status: "open", severity: "high", current_tier: "tactical", due_date: "2026-09-15" });
const provider = Object.freeze({ vendor_id: "00000000-0000-4000-8000-000000000201", legal_entity_id: "00000000-0000-4000-8000-000000000202", vendor_name: "Northstar Carrier", vendor_code: "NSC", legal_entity_code: "NSC-MX", attention_state: "attention", health_state: "watch", health_score: 82, lifecycle_status: "active", activation_status: "blocked", primary_blocker: "Insurance renewal review", case_attention_count: 1, document_attention_count: 1, needs_reply_count: 1, pending_approval_count: 1, required_integration_count: 2, ready_integration_count: 1 });
const onboarding = Object.freeze({ id: "00000000-0000-4000-8000-000000000301", program_code: "cross_border", jurisdiction_code: "MX-US", legal_entity_kind: "carrier", case_status: "blocked", open_task_count: 3, blocking_task_count: 1, overdue_task_count: 1, due_at: "2026-09-01", revision: 2, updated_at: "2026-08-21T12:00:00Z" });
const communication = Object.freeze({ thread_id: "00000000-0000-4000-8000-000000000401", vendor_name: "Northstar Carrier", subject: "Border appointment readiness and documentation follow-up", queue_code: "needs_reply", communication_status: "active", matching_status: "matched", channel: "email", legal_entity_code: "NSC-MX", needs_reply: true, message_count: 3, attachment_count: 1, candidate_count: 0, case_count: 1, last_message_at: "2026-08-21T12:00:00Z" });
function fixture(action) {
  if (action === "list_vendor_support_tickets") return { rows: [support], summary: { total: 1, open: 1, in_progress: 0, resolved: 0, google_chat_synced: 0 } };
  if (action === "list_vendor_improvement_cases") return { rows: [improvement], summary: { open: 1, critical: 0, due_soon: 1, collaborative: 0, average_score: 82 }, value_curve: [], playbooks: [], scorecards: [] };
  if (action === "list_vendors") return { rows: [{ id: "V-001", vendor_name: "Northstar Carrier", primary_email: "quality@northstar-carrier.example" }], total: 1 };
  if (action === "list_provider_service_command_center") return { rows: [provider], total: 1, metrics: { relationships: 1, critical: 0, attention: 1, needs_reply: 1, pending_approvals: 1, blocked_activation: 1 } };
  if (action === "list_provider_onboarding_workspace") return { rows: [onboarding], total: 1, metrics: { total: 1, blocked: 1, approval: 0, overdue: 1 } };
  if (action === "get_provider_onboarding_case") return { case: onboarding, tasks: [], packages: [], assemblies: [], messages: [], events: [] };
  if (action === "provider_gmail_status") return { mailbox_email: "provider-intake-long-address@northstar-carrier.example", legal_entities: [{ id: provider.legal_entity_id, entity_code: "NSC-MX", legal_name: "Northstar Carrier Mexico" , status: "active" }], connections: [{ legal_entity_id: provider.legal_entity_id, status: "watching", token_expires_at: "2026-09-01T12:00:00Z", watch_expiration_at: "2026-08-29T12:00:00Z", last_sync_completed_at: "2026-08-21T12:00:00Z", history_id: "998877" }], pubsub_configured: true };
  if (action === "list_provider_communications_inbox") return { rows: [communication], total: 1, metrics: { threads: 1, unmatched: 0, needs_review: 0, needs_reply: 1, waiting_xbf: 0, waiting_external: 0, resolved: 0 } };
  if (action === "get_provider_communication_thread") return { thread: communication, messages: [], attachments: [], match_candidates: [], case_links: [] };
  return {};
}
export async function callRatewareApi(action) { fail(action); return fixture(action); }
export async function callRatewareFunction(_functionName, action) { fail(action); return { data: fixture(action) }; }
`;

const configBoundary = `// ${BOUNDARY}: public profile fixture\nexport const SUPABASE_URL = "";\nexport const SUPABASE_ANON_KEY = "qa-public-read-only";\n`;

const BOUNDARIES = new Map([
  ["/src/auth.js", authBoundary],
  ["/src/shipper-service.js", shipperBoundary],
  ["/src/rateware-api.js", ratewareBoundary],
  ["/src/config.js", configBoundary]
]);

const profile = Object.freeze({ shipper: { shipper_name: "Northwind Cross-Border Logistics", legal_name: "Northwind Logistics Holdings LLC", headquarters_country: "MX", industry: "Automotive", website: "https://northwind.example", headquarters_city: "Monterrey", headquarters_state: "NL" }, contacts: [], locations: [], profile_data: { company: {}, onboarding: {}, network: {}, billing: {} }, request: { expires_at: "2026-09-30T00:00:00Z" } });

function inside(root, candidate) {
  const value = relative(root, candidate);
  return value !== ".." && !value.startsWith(`..${sep}`) && !value.includes(`..${sep}`);
}

function traversal(rawUrl) {
  try { return decodeURIComponent(String(rawUrl || "").split("?", 1)[0]).replace(/\\/g, "/").split("/").includes(".."); }
  catch { return true; }
}

async function jsonBody(request, maxBytes = 65536) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > maxBytes) throw Object.assign(new Error("too large"), { status: 413 }); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw Object.assign(new Error("invalid json"), { status: 400 }); }
}

export async function startNetworkServiceEvidenceServer({ rootDir = process.cwd(), port = 0 } = {}) {
  const root = await realpath(resolve(rootDir));
  const server = createServer(async (request, response) => {
    try {
      if (traversal(request.url)) throw Object.assign(new Error("path traversal"), { status: 404 });
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (request.method === "POST" && url.pathname === "/functions/v1/shipper-profile-api") {
        const payload = await jsonBody(request);
        if (payload.action !== "get_profile") { response.writeHead(405, { Allow: "POST", "Cache-Control": "no-store" }); response.end(); return; }
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Rateware-QA-Boundary": "true" });
        response.end(JSON.stringify(profile));
        return;
      }
      if (!new Set(["GET", "HEAD"]).has(request.method || "")) { response.writeHead(405, { Allow: "GET, HEAD", "Cache-Control": "no-store" }); response.end(); return; }
      if (url.pathname === "/favicon.ico") { response.writeHead(204, { "Cache-Control": "no-store" }); response.end(); return; }
      const boundary = BOUNDARIES.get(url.pathname);
      if (boundary) { response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store", "X-Rateware-QA-Boundary": "true" }); response.end(request.method === "HEAD" ? undefined : boundary); return; }
      const relativePath = decodeURIComponent(url.pathname === "/" ? "/shipper-crm.html" : url.pathname).replace(/^\/+/, "");
      const candidate = resolve(root, relativePath);
      if (!inside(root, candidate)) throw Object.assign(new Error("outside root"), { status: 404 });
      const realCandidate = await realpath(candidate);
      if (!inside(root, realCandidate) || !(await stat(realCandidate)).isFile()) throw Object.assign(new Error("not a file"), { status: 404 });
      const contentType = MIME[extname(realCandidate).toLowerCase()] || "application/octet-stream";
      const body = await readFile(realCandidate);
      response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      response.writeHead(Number(error?.status || (error?.code === "ENOENT" ? 404 : 500)), { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      response.end("Not found");
    }
  });
  await new Promise((accept, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", accept); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, close: () => new Promise((accept, reject) => server.close((error) => error ? reject(error) : accept())) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const instance = await startNetworkServiceEvidenceServer({ rootDir: process.argv[2] || process.cwd(), port: Number(process.argv[3] || 4177) });
  process.stdout.write(`${instance.origin}\n`);
}
