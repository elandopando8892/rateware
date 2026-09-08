import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const P3V6_VIEWPORTS = Object.freeze([
  Object.freeze([1440, 900]),
  Object.freeze([1024, 768]),
  Object.freeze([390, 844]),
]);

export const P3V6_ROUTES = Object.freeze([
  Object.freeze({ route: "app.html", family: "Home", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "upload-center.html", family: "Operate", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "upload-history.html", family: "Operate", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "staging-review.html", family: "Operate", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "rateware.html", family: "Operate", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "business-intelligence.html", family: "Analyze", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "growth-hacking.html", family: "Analyze", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "vendors.html", family: "Source", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "shipper-crm.html", family: "Source", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "rfx-process.html", family: "Source", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "rfx-events.html", family: "Source", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "ratebook.html", family: "Source", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "outreach.html", family: "Source", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "vendor-support.html", family: "Service", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "vendor-improvement.html", family: "Service", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "provider-service.html", family: "Service", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "provider-onboarding.html", family: "Service", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "provider-gmail.html", family: "Service", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "provider-communications.html", family: "Service", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "settings.html", family: "Admin", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "interpretation-memory.html", family: "Admin", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "catalog-workbench.html", family: "Admin", access: "authenticated", states: Object.freeze(["loaded", "permission-denied", "error"]) }),
  Object.freeze({ route: "bid-room-board.html", family: "Public", access: "public", states: Object.freeze(["loaded", "expired", "permission-denied"]) }),
  Object.freeze({ route: "carrier-profile.html", family: "Public", access: "public", states: Object.freeze(["loaded", "loading", "error"]) }),
  Object.freeze({ route: "customer-rfi.html", family: "Public", access: "public", states: Object.freeze(["loaded", "draft", "error"]) }),
  Object.freeze({ route: "index.html", family: "Public", access: "public_entry", states: Object.freeze(["loaded", "signed-out", "error"]) }),
  Object.freeze({ route: "ratebook-carrier.html", family: "Public", access: "public", states: Object.freeze(["loaded", "expired", "permission-denied"]) }),
  Object.freeze({ route: "rfx-bid.html", family: "Public", access: "public", states: Object.freeze(["loaded", "loading", "expired"]) }),
  Object.freeze({ route: "shipper-profile.html", family: "Public", access: "public", states: Object.freeze(["loaded", "loading", "error"]) }),
]);

export const P3V6_CAPTURE_MATRIX = Object.freeze(P3V6_ROUTES.flatMap((spec) => (
  spec.states.flatMap((state) => P3V6_VIEWPORTS.map((viewport) => Object.freeze({ route: spec.route, family: spec.family, access: spec.access, state, viewport })))
)));

const mime = Object.freeze({ ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml" });

async function startStaticServer(root) {
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const file = resolve(root, relative);
    if (!file.startsWith(`${root}\\`) || !existsSync(file)) {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    try {
      response.writeHead(200, { "content-type": mime[extname(file).toLowerCase()] || "application/octet-stream" });
      response.end(await readFile(file));
    } catch {
      response.writeHead(500);
      response.end("error");
    }
  });
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const address = server.address();
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function inspectPage(page, capture) {
  return page.evaluate(({ expectedFamily, expectedAccess, expectedState }) => {
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const fixture = document.createElement("div");
    fixture.className = "p55-v6-cert-state";
    fixture.setAttribute("role", "status");
    fixture.textContent = `Certification fixture: ${expectedState}`;
    fixture.style.cssText = "position:fixed;inset:auto 12px 12px auto;z-index:9999;padding:8px;background:#1e1e1e;color:#fff;font:12px sans-serif";
    document.body.append(fixture);
    const controls = [...document.querySelectorAll("a[href], button, input, select, textarea")].filter(visible);
    const unnamedControls = controls.filter((element) => {
      const label = element.getAttribute("aria-label") || element.getAttribute("title") || element.labels?.[0]?.textContent || element.textContent;
      return !String(label || "").trim();
    });
    const isPublic = expectedAccess === "public" || expectedAccess === "public_entry";
    const pageHeaderElement = document.querySelector("[data-platform55-page-header], [data-platform55-public-context]");
    const actionsElement = document.querySelector(".page-header-actions");
    const rectSnapshot = (element) => element ? (() => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return { left: Math.round(rect.left), width: Math.round(rect.width), right: Math.round(rect.right), boxSizing: style.boxSizing, padding: style.padding, margin: style.margin }; })() : null;
    return {
      routeFamily: document.body.dataset.platform55Page || "",
      shell: document.body.dataset.platform55Shell || "",
      family: expectedFamily,
      familyMarker: document.body.dataset.p3v5Family || "",
      shellHost: Boolean(document.querySelector(expectedAccess === "public_entry" ? "[data-platform55-entry-app]" : isPublic ? "[data-platform55-public-app]" : "[data-platform55-sidebar][data-platform55-page-content], [data-platform55-sidebar]")),
      topbarHost: Boolean(document.querySelector("[data-platform55-topbar]")),
      pageContent: Boolean(document.querySelector("[data-platform55-page-content], [data-platform55-public-app], [data-platform55-entry-app]")),
      pageHeader: Boolean(document.querySelector("[data-platform55-page-header], [data-platform55-public-context]")),
      boundary: Boolean(document.querySelector("[data-p3v5-boundary], [data-platform55-page-content]")),
      stateVisible: visible(fixture),
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      overflowNodes: [...document.querySelectorAll("body *")]
        .map((element) => ({ tag: element.tagName, id: element.id, className: String(element.className || "").slice(0, 120), left: Math.round(element.getBoundingClientRect().left), width: Math.round(element.getBoundingClientRect().width), right: Math.round(element.getBoundingClientRect().right) }))
        .filter((entry) => entry.right > innerWidth + 1)
        .slice(0, 5),
      pageHeaderRect: rectSnapshot(pageHeaderElement),
      actionsRect: rectSnapshot(actionsElement),
      unnamedControls: unnamedControls.length,
      controlCount: controls.length,
      privateTenantNavExposed: isPublic && Boolean(document.querySelector("[data-platform55-sidebar], [data-platform55-topbar], .rw-nav-link")),
    };
  }, { expectedFamily: capture.family, expectedAccess: capture.access, expectedState: capture.state });
}

export async function runP3V6AggregateCertification({ rootDir = process.cwd(), chromePath = process.env.RATEWARE_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" } = {}) {
  const root = resolve(rootDir);
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.RATEWARE_PLAYWRIGHT_MODULE || "playwright");
  const { server, origin } = await startStaticServer(root);
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const captures = [];
  const selectedRoutes = String(process.env.RATEWARE_P3V6_ROUTES || "").split(",").map((value) => value.trim()).filter(Boolean);
  const captureMatrix = selectedRoutes.length ? P3V6_CAPTURE_MATRIX.filter(({ route }) => selectedRoutes.includes(route)) : P3V6_CAPTURE_MATRIX;
  try {
    for (const [index, capture] of captureMatrix.entries()) {
      const context = await browser.newContext({ viewport: { width: capture.viewport[0], height: capture.viewport[1] }, javaScriptEnabled: false });
      const page = await context.newPage();
      const consoleErrors = [];
      const httpErrors = [];
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        if (!/ERR_ABORTED|blocked by client|javascript is disabled|Failed to load resource:.*404/i.test(text)) consoleErrors.push(text);
      });
      page.on("response", (responseEvent) => {
        if (responseEvent.status() >= 400 && !/favicon\.ico$/i.test(responseEvent.url())) httpErrors.push(`${responseEvent.status()} ${responseEvent.url()}`);
      });
      const response = await page.goto(`${origin}/${capture.route}`, { waitUntil: "networkidle" });
      assert.equal(response?.status(), 200, `${capture.route} must load`);
      const metrics = await inspectPage(page, capture);
      captures.push({ ...capture, ...metrics, consoleErrors, httpErrors });
      await context.close();
      if (index && index % 30 === 0) console.error(`P3-V6 certification progress: ${index}/${captureMatrix.length}`);
    }
  } finally {
    await browser.close();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
  const failures = captures.flatMap((capture) => [
    capture.shell !== (capture.access === "public_entry" ? "entry" : capture.access === "public" ? "public" : "tenant") ? `${capture.route}:${capture.state}:shell` : null,
    capture.pageContent ? null : `${capture.route}:${capture.state}:page-content`,
    capture.pageHeader ? null : `${capture.route}:${capture.state}:page-header`,
    capture.boundary ? null : `${capture.route}:${capture.state}:boundary`,
    capture.stateVisible ? null : `${capture.route}:${capture.state}:state`,
    capture.pageOverflow ? `${capture.route}:${capture.state}:${capture.viewport.join("x")}:overflow` : null,
    capture.unnamedControls ? `${capture.route}:${capture.state}:unnamed-controls=${capture.unnamedControls}` : null,
    capture.privateTenantNavExposed ? `${capture.route}:${capture.state}:private-nav` : null,
    capture.consoleErrors.length ? `${capture.route}:${capture.state}:console` : null,
    capture.httpErrors.length ? `${capture.route}:${capture.state}:http` : null,
  ].filter(Boolean));
  return Object.freeze({ schema_version: 1, sprint: "P3-V6", route_count: P3V6_ROUTES.length, viewport_count: P3V6_VIEWPORTS.length, capture_count: captures.length, failures, captures });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = await runP3V6AggregateCertification();
  const details = report.failures.length ? report.captures.filter((capture) => capture.pageOverflow || capture.consoleErrors.length || capture.httpErrors.length).slice(0, 12) : [];
  console.log(JSON.stringify({ sprint: report.sprint, route_count: report.route_count, capture_count: report.capture_count, failures: report.failures, details }, null, 2));
  if (report.failures.length) process.exitCode = 1;
}
