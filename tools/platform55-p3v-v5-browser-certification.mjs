import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const P3V5_VIEWPORTS = Object.freeze([
  Object.freeze([1440, 900]),
  Object.freeze([1024, 768]),
  Object.freeze([390, 844]),
]);

export const P3V5_SPECS = Object.freeze([
  Object.freeze({ route: "business-intelligence.html", states: Object.freeze(["loaded", "no-data", "permission-denied", "error"]), family: "intelligence" }),
  Object.freeze({ route: "growth-hacking.html", states: Object.freeze(["loaded", "no-data", "permission-denied", "error"]), family: "intelligence" }),
  Object.freeze({ route: "settings.html", states: Object.freeze(["loaded", "review-required", "permission-denied", "error"]), family: "administration" }),
  Object.freeze({ route: "interpretation-memory.html", states: Object.freeze(["loaded", "empty", "permission-denied", "error"]), family: "administration" }),
  Object.freeze({ route: "catalog-workbench.html", states: Object.freeze(["loaded", "review-required", "permission-denied", "error"]), family: "administration" }),
  Object.freeze({ route: "bid-room-board.html", states: Object.freeze(["loaded", "empty", "permission-denied", "expired"]), family: "public" }),
  Object.freeze({ route: "carrier-profile.html", states: Object.freeze(["loaded", "loading", "permission-denied", "error"]), family: "public" }),
  Object.freeze({ route: "customer-rfi.html", states: Object.freeze(["loaded", "draft", "permission-denied", "error"]), family: "public" }),
  Object.freeze({ route: "index.html", states: Object.freeze(["loaded", "signed-out", "permission-denied", "error"]), family: "entry" }),
  Object.freeze({ route: "ratebook-carrier.html", states: Object.freeze(["loaded", "empty", "permission-denied", "expired"]), family: "public" }),
  Object.freeze({ route: "rfx-bid.html", states: Object.freeze(["loaded", "loading", "permission-denied", "expired"]), family: "public" }),
  Object.freeze({ route: "shipper-profile.html", states: Object.freeze(["loaded", "loading", "permission-denied", "error"]), family: "public" }),
]);

export const P3V5_CAPTURE_MATRIX = Object.freeze(P3V5_SPECS.flatMap((spec) => (
  spec.states.flatMap((state) => P3V5_VIEWPORTS.map((viewport) => Object.freeze({ route: spec.route, state, viewport })))
)));

const mime = Object.freeze({ ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json" });

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

async function inspectPage(page, spec, state) {
  return page.evaluate(({ expectedFamily, expectedState }) => {
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const boundary = document.querySelector("[data-p3v5-boundary]");
    const controls = [...document.querySelectorAll("a[href], button, input, select, textarea")].filter(visible);
    const unnamed = controls.filter((element) => {
      const label = element.getAttribute("aria-label") || element.getAttribute("title") || element.labels?.[0]?.textContent || element.textContent;
      return !String(label || "").trim();
    });
    const fixture = document.createElement("div");
    fixture.className = "p55-v5-cert-state";
    fixture.setAttribute("role", "status");
    fixture.textContent = `Certification fixture: ${expectedState}`;
    fixture.style.cssText = "position:fixed;inset:auto 12px 12px auto;z-index:9999;padding:8px;background:#1e1e1e;color:#fff;font:12px sans-serif";
    document.body.append(fixture);
    const root = document.documentElement;
    return {
      family: document.body.dataset.p3v5Family,
      familyMatches: document.body.dataset.p3v5Family === expectedFamily,
      boundaryVisible: visible(boundary),
      stateVisible: visible(fixture),
      pageOverflow: root.scrollWidth > root.clientWidth,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      overflowNodes: [...document.querySelectorAll("body *")]
        .map((element) => ({ tag: element.tagName, id: element.id, className: String(element.className || "").slice(0, 80), right: Math.round(element.getBoundingClientRect().right) }))
        .filter((entry) => entry.right > innerWidth + 1)
        .slice(0, 5),
      unnamedControls: unnamed.length,
      controlCount: controls.length,
      privateTenantNavExposed: expectedFamily !== "public" && expectedFamily !== "entry" ? false : Boolean(document.querySelector("[data-platform55-sidebar], [data-platform55-topbar], .rw-nav-link")),
    };
  }, { expectedFamily: spec.family, expectedState: state });
}

export async function runP3V5BrowserCertification({ rootDir = process.cwd(), chromePath = process.env.RATEWARE_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" } = {}) {
  const root = resolve(rootDir);
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.RATEWARE_PLAYWRIGHT_MODULE || "playwright");
  const { server, origin } = await startStaticServer(root);
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const captures = [];
  const selectedRoutes = String(process.env.RATEWARE_P3V5_ROUTES || "").split(",").map((value) => value.trim()).filter(Boolean);
  const captureMatrix = selectedRoutes.length
    ? P3V5_CAPTURE_MATRIX.filter(({ route }) => selectedRoutes.includes(route))
    : P3V5_CAPTURE_MATRIX;
  try {
    for (const matrix of captureMatrix) {
      const spec = P3V5_SPECS.find((candidate) => candidate.route === matrix.route);
      const context = await browser.newContext({ viewport: { width: matrix.viewport[0], height: matrix.viewport[1] }, javaScriptEnabled: false });
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
      const response = await page.goto(`${origin}/${matrix.route}`, { waitUntil: "networkidle" });
      assert.equal(response?.status(), 200, `${matrix.route} must load`);
      const metrics = await inspectPage(page, spec, matrix.state);
      captures.push({ ...matrix, ...metrics, consoleErrors, httpErrors });
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
  const failures = captures.flatMap((capture) => [
    capture.familyMatches ? null : `${capture.route}:${capture.state}:family`,
    capture.boundaryVisible ? null : `${capture.route}:${capture.state}:boundary`,
    capture.stateVisible ? null : `${capture.route}:${capture.state}:state`,
    capture.pageOverflow ? `${capture.route}:${capture.state}:${capture.viewport.join("x")}:overflow` : null,
    capture.unnamedControls ? `${capture.route}:${capture.state}:unnamed-controls=${capture.unnamedControls}` : null,
    capture.privateTenantNavExposed ? `${capture.route}:${capture.state}:private-nav` : null,
    capture.consoleErrors.length ? `${capture.route}:${capture.state}:console` : null,
    capture.httpErrors.length ? `${capture.route}:${capture.state}:http` : null,
  ].filter(Boolean));
  return Object.freeze({ schema_version: 1, sprint: "P3-V5", viewport_count: P3V5_VIEWPORTS.length, capture_count: captures.length, failures, captures });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = await runP3V5BrowserCertification();
  const details = report.failures.length ? report.captures.filter((capture) => capture.pageOverflow || capture.consoleErrors.length).slice(0, 8) : [];
  console.log(JSON.stringify({ sprint: report.sprint, capture_count: report.capture_count, failures: report.failures, details }, null, 2));
  if (report.failures.length) process.exitCode = 1;
}
