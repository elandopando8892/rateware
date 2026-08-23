import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const MIME = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
});

const authBoundary = `// RATEWARE_S6_QA_BOUNDARY: deterministic authentication
import { mountPlatform55Shell } from "./platform55-shell.js";
const session = Object.freeze({ token: "qa-read-only-token", user: Object.freeze({ given_name: "QA", family_name: "Reviewer", email: "qa@local.invalid" }), access: Object.freeze({ roles: Object.freeze(["qa-reviewer"]), permissions: Object.freeze([]), claims: Object.freeze({}) }) });
export async function requirePrivatePage() { return session; }
export async function ensureSignedIn() { return session; }
export async function canUse() { return true; }
export async function applyPermissionState(selector) { if (selector) document.querySelectorAll(selector).forEach((element) => { element.disabled = false; element.classList.remove("permission-disabled"); }); return true; }
export function initAuthControls() { mountPlatform55Shell({ pageKey: document.body.dataset.platform55Page, user: session.user, accessContext: session.access }); const status = document.querySelector("#auth-status"); if (status) status.textContent = "Deterministic local QA session"; document.querySelector("#auth-button")?.classList.add("hidden"); }
export async function authenticatedFetch() { throw new Error("QA boundary blocks network requests"); }
`;

const ratewareApiBoundary = `// RATEWARE_S6_QA_BOUNDARY: deterministic Command Center states
const state = () => new URLSearchParams(location.search).get("qa_state") || "data";
let retryCount = 0;
const empty = Object.freeze({ raw_uploads: 0, failed_uploads: 0, pending_review: 0, approved_rows: 0, procurement_vendors: 0, sourcing_vendors: 0, rfx_open_events: 0, rfx_bids: 0, fresh_rates: 0, aging_rates: 0, stale_rates: 0, recent_rates_7d: 0, location_gap_rates: 0 });
const data = Object.freeze({ raw_uploads: 18, failed_uploads: 2, pending_review: 12, approved_rows: 84, procurement_vendors: 27, sourcing_vendors: 9, rfx_open_events: 4, rfx_bids: 16, fresh_rates: 52, aging_rates: 20, stale_rates: 12, recent_rates_7d: 8, location_gap_rates: 3 });
export async function callRatewareApi(action) {
  if (action !== "dashboard_summary") throw new Error("QA boundary supports dashboard_summary only");
  if (state() === "loading") return await new Promise(() => {});
  if (state() === "error") throw new Error("Deterministic Command Center evidence error");
  if (state() === "retry" && retryCount++ === 0) throw new Error("Deterministic retry evidence error");
  return state() === "empty" ? empty : data;
}
export async function callRatewareFunction(_functionName, action) { return callRatewareApi(action); }
`;

const boundaries = new Map([
  ["/src/auth.js", authBoundary],
  ["/src/rateware-api.js", ratewareApiBoundary],
]);

function isInside(root, candidate) {
  const value = relative(root, candidate);
  return value !== ".." && !value.startsWith(`..${sep}`) && !value.includes(`..${sep}`);
}

export async function startS6CommandEvidenceServer({ rootDir = process.cwd(), port = 0 } = {}) {
  const root = await realpath(resolve(rootDir));
  const server = createServer(async (request, response) => {
    try {
      if (!new Set(["GET", "HEAD"]).has(request.method || "")) {
        response.writeHead(405, { Allow: "GET, HEAD", "Cache-Control": "no-store" });
        response.end();
        return;
      }
      const rawUrl = request.url || "/";
      const decodedPath = decodeURIComponent(rawUrl.split("?", 1)[0]);
      if (decodedPath.split(/[\\/]+/).includes("..")) throw Object.assign(new Error("outside root"), { status: 404 });
      const url = new URL(rawUrl, "http://127.0.0.1");
      if (url.pathname === "/favicon.ico") {
        response.writeHead(204, { "Cache-Control": "no-store" });
        response.end();
        return;
      }
      const boundary = boundaries.get(url.pathname);
      if (boundary) {
        response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store", "X-Rateware-QA-Boundary": "true" });
        response.end(request.method === "HEAD" ? undefined : boundary);
        return;
      }
      const relativePath = decodeURIComponent(url.pathname === "/" ? "/app.html" : url.pathname).replace(/^\/+/, "");
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
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose())),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const instance = await startS6CommandEvidenceServer({ rootDir: process.argv[2] || process.cwd(), port: Number(process.argv[3] || 4178) });
  process.stdout.write(`${instance.origin}\n`);
}
