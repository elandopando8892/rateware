import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startOperateEvidenceServer } from "./platform55-operate-evidence-server.mjs";
import { startProcurementEvidenceServer } from "./platform55-procurement-evidence-server.mjs";
import { startNetworkServiceEvidenceServer } from "./platform55-network-service-evidence-server.mjs";
import { startIntelligenceAdminEvidenceServer } from "./platform55-intelligence-admin-evidence-server.mjs";
import { startS6CommandEvidenceServer } from "./platform55-s6-command-evidence-server.mjs";
import {
  assertAccessibleControlNames,
  assertContrastSamples,
  assertFocusCycle,
} from "./platform55-s6-accessibility-certification.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.RATEWARE_PLAYWRIGHT_MODULE || "playwright");
const root = resolve(process.env.RATEWARE_CERT_ROOT || process.cwd());
const outputDirectory = process.env.RATEWARE_CERT_OUTPUT_DIR ? resolve(process.env.RATEWARE_CERT_OUTPUT_DIR) : resolve(root, "output/platform55-s6-browser-certification");
const outputManifest = process.env.RATEWARE_CERT_OUTPUT_MANIFEST ? resolve(process.env.RATEWARE_CERT_OUTPUT_MANIFEST) : resolve(root, "output/platform55-s6-browser-certification.json");
const baselineMode = process.env.RATEWARE_CERT_BASELINE_MODE === "true";
const baselinePath = process.env.RATEWARE_CERT_BASELINE || resolve(process.cwd(), "docs/release/evidence/2026-08-23-p2-s6-geometry-baseline.json");
const geometryBaseline = baselineMode ? null : JSON.parse(await readFile(baselinePath, "utf8"));
const acceptedGeometryBaselineSha = "858f8102cb3b5c7ce74955b00e7ac357b6511cdf";
const acceptedGeometryBaselineCanonicalSha256 = "9f88ad27e79f790c9590bb6832f2761b35523e614c0e6c2a142936190a09178a";
const chromePath = process.env.RATEWARE_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const viewports = Object.freeze([[1440, 900], [1024, 768], [390, 844]]);
const commandStates = Object.freeze(["data", "loading", "empty", "error", "retry"]);
const representatives = Object.freeze([
  { domain: "Home", route: "app.html", owner: "P2-S1", query: "qa_state=data" },
  { domain: "Commercial", route: "shipper-crm.html", owner: "P2-S4", query: "qa_state=loaded" },
  { domain: "Finance", route: "rateware.html", owner: "P2-S2", query: "qa_state=loaded" },
  { domain: "Intelligence", route: "business-intelligence.html", owner: "P2-S5", query: "qa_state=loaded&view=geo" },
  { domain: "Operations", route: "rfx-process.html", owner: "P2-S3", query: "qa_state=loaded" },
  { domain: "Platform", route: "settings.html", owner: "P2-S5", query: "qa_state=loaded" },
  { domain: "Procurement", route: "vendors.html", owner: "P2-S3", query: "qa_state=loaded" },
  { domain: "Administration", route: "interpretation-memory.html", owner: "P2-S5", query: "qa_state=loaded" },
  { domain: "Public", route: "shipper-profile.html", owner: "P2-S4", query: "qa_state=loaded&token=qa-token" },
]);
const routeQueries = Object.freeze({
  "app.html": "qa_state=data",
  "shipper-profile.html": "qa_state=loaded&token=qa-token",
  "business-intelligence.html": "qa_state=loaded&view=geo",
});
const readRpcActions = new Map([
  ["/functions/v1/carrier-profile-api", new Set(["get_profile"])],
  ["/functions/v1/rfx-bid-api", new Set(["public_bid_room_board", "get_invitation", "list_bid_room_chat"])],
  ["/functions/v1/ratebook-carrier-api", new Set(["get_ratebook_access"])],
  ["/functions/v1/shipper-profile-api", new Set(["get_profile"])],
]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field.length === 0) quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rows.push(row); row = []; field = ""; }
    else field += character;
  }
  if (field.length || row.length) { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rows.push(row); }
  const header = rows.shift();
  return rows.map((entry) => Object.fromEntries(header.map((key, index) => [key, entry[index]])));
}

function baselineGeometry(route, width, height, commandState = "") {
  const viewport = `${width}x${height}`;
  if (commandState) return geometryBaseline.captures.find((row) => row.kind === "command_state" && row.state === commandState && row.viewport === viewport)?.geometry;
  return geometryBaseline.captures.find((row) => row.route === route && row.viewport === viewport)?.geometry
    || geometryBaseline.all_route_smoke.find((row) => row.route === route)?.geometry;
}

function maxDelta(actual, expected) {
  return Math.max(...Object.keys(expected).map((key) => Math.abs(Number(actual[key]) - Number(expected[key]))));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function validateGeometryBaseline(baseline) {
  if (!baseline) return;
  assert.equal(baseline.schema_version, 1, "geometry baseline schema");
  assert.equal(baseline.candidate_sha, acceptedGeometryBaselineSha, "geometry baseline must remain pinned to accepted P2-S5");
  assert.equal(baseline.all_route_smoke?.length, 29, "geometry baseline route count");
  assert.equal(baseline.captures?.length, 42, "geometry baseline capture count");
  const projection = {
    candidate_sha: baseline.candidate_sha,
    all_route_smoke: baseline.all_route_smoke.map(({ route, shell_variant, geometry }) => ({ route, shell_variant, geometry })),
    captures: baseline.captures.map(({ kind, domain, state, route, viewport, geometry }) => ({ kind, domain, state, route, viewport, geometry })),
  };
  assert.equal(digest(projection), acceptedGeometryBaselineCanonicalSha256, "geometry baseline projection digest");
  for (const row of [...baseline.all_route_smoke, ...baseline.captures]) {
    if ((row.shell_variant && row.shell_variant !== "tenant") || row.domain === "Public") continue;
    assert.ok(row.geometry && Object.values(row.geometry).every(Number.isFinite), `geometry baseline row ${row.route || row.state} must be numeric`);
  }
}

async function verifyFocusCycle(page, containerSelector, label) {
  const candidates = page.locator(`${containerSelector} a[href], ${containerSelector} button:not([disabled]), ${containerSelector} input:not([disabled]), ${containerSelector} select:not([disabled]), ${containerSelector} textarea:not([disabled]), ${containerSelector} [tabindex]:not([tabindex="-1"])`);
  const focusable = [];
  for (let index = 0; index < await candidates.count(); index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible() && await candidate.getAttribute("aria-hidden") !== "true") focusable.push(candidate);
  }
  assert.ok(focusable.length >= 2, `${label} needs at least two visible focusable controls`);
  const first = focusable[0];
  const last = focusable.at(-1);
  await last.focus();
  await page.keyboard.press("Tab");
  const forwardActive = await first.evaluate((element) => element === document.activeElement) ? "first" : "outside";
  await first.focus();
  await page.keyboard.press("Shift+Tab");
  const backwardActive = await last.evaluate((element) => element === document.activeElement) ? "last" : "outside";
  assertFocusCycle({ label, first: "first", last: "last", forwardActive, backwardActive });
}

validateGeometryBaseline(geometryBaseline);

const routes = parseCsv(await readFile(resolve(root, "docs/platform55-shell-route-map.csv"), "utf8"));
assert.equal(routes.length, 29);
await mkdir(outputDirectory, { recursive: true });
const servers = {
  "P2-S1": await startS6CommandEvidenceServer({ rootDir: root }),
  "P2-S2": await startOperateEvidenceServer({ rootDir: root }),
  "P2-S3": await startProcurementEvidenceServer({ rootDir: root }),
  "P2-S4": await startNetworkServiceEvidenceServer({ rootDir: root }),
  "P2-S5": await startIntelligenceAdminEvidenceServer({ rootDir: root }),
};
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const allRouteSmoke = [];
const captures = [];
const interactions = {};

async function inspect(spec, width, height, { screenshot = "", loading = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    window.__s6Cls = 0;
    window.__s6ShiftEntries = [];
    window.__s6ShellBoot = null;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) {
        window.__s6Cls += entry.value;
        window.__s6ShiftEntries.push({
          startTime: Math.round(entry.startTime * 100) / 100,
          value: Math.round(entry.value * 10000) / 10000,
          sources: [...(entry.sources || [])].map((source) => ({
            tag: source.node?.tagName || "",
            id: source.node?.id || "",
            className: typeof source.node?.className === "string" ? source.node.className : "",
            previous: source.previousRect,
            current: source.currentRect,
          })),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
    const observer = new MutationObserver(() => {
      if (window.__s6ShellBoot === null && document.querySelector("[data-platform55-shell-root]")) {
        window.__s6ShellBoot = performance.now();
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  const page = await context.newPage();
  const errors = { console: [], http: [], page: [], request: [], external: [], mutation: [] };
  const readRpcs = [];
  page.on("console", (message) => { if (message.type() === "error") errors.console.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) errors.http.push(`${response.status()} ${response.url()}`); });
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("requestfailed", (request) => errors.request.push(`${request.url()} ${request.failure()?.errorText || "failed"}`));
  page.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.origin !== servers[spec.owner].origin) errors.external.push(request.url());
    if (!new Set(["GET", "HEAD"]).has(request.method())) {
      let action = "";
      try { action = request.postDataJSON()?.action || ""; } catch { /* Fail closed below. */ }
      const allowed = request.method() === "POST" && readRpcActions.get(requestUrl.pathname)?.has(action);
      if (allowed) readRpcs.push(`${requestUrl.pathname}:${action}`);
      else errors.mutation.push(`${request.method()} ${request.url()} action=${action || "missing"}`);
    }
  });
  const query = spec.query || routeQueries[spec.route] || "qa_state=loaded";
  const url = `${servers[spec.owner].origin}/${spec.route}${query ? `?${query}` : ""}`;
  await page.goto(url, { waitUntil: loading ? "domcontentloaded" : "networkidle", timeout: 15000 });
  await page.waitForTimeout(loading ? 350 : 120);
  if (spec.commandState === "retry") {
    await page.locator("[data-retry-action='load-dashboard']").first().click();
    await page.waitForFunction(() => document.querySelector("#next-action-title")?.textContent?.includes("Fix failed uploads"));
  }
  const metrics = await page.evaluate(({ shellVariant, width: viewportWidth }) => {
    const parseColor = (value) => {
      const match = String(value).match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const parts = match[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
      if (parts.length < 3 || parts.slice(0, 3).some((part) => !Number.isFinite(part))) return null;
      return { r: parts[0], g: parts[1], b: parts[2], a: Number.isFinite(parts[3]) ? parts[3] : 1 };
    };
    const blend = (foreground, background) => {
      const alpha = foreground.a + background.a * (1 - foreground.a);
      if (!alpha) return { r: 255, g: 255, b: 255, a: 1 };
      return {
        r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
        g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
        b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
        a: alpha,
      };
    };
    const backgroundFor = (element) => {
      const layers = [];
      for (let current = element; current; current = current.parentElement) {
        const color = parseColor(getComputedStyle(current).backgroundColor);
        if (color?.a > 0) layers.push(color);
        if (color?.a >= 1) break;
      }
      let result = { r: 255, g: 255, b: 255, a: 1 };
      for (const layer of layers.reverse()) result = blend(layer, result);
      return result;
    };
    const backgroundsFor = (element) => {
      const overlays = [];
      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        const solid = parseColor(style.backgroundColor);
        const image = style.backgroundImage;
        if (image && image !== "none") {
          const colors = [...image.matchAll(/rgba?\([^)]+\)/gi)].map((match) => parseColor(match[0])).filter(Boolean);
          const opaque = colors.filter((color) => color.a >= 1);
          if (!opaque.length && solid?.a >= 1) opaque.push(solid);
          if (!opaque.length) continue;
          const translucent = colors.filter((color) => color.a > 0 && color.a < 1);
          const candidates = opaque.flatMap((base) => [
            base,
            ...translucent.map((color) => blend(color, base)),
          ]);
          return candidates.map((base) => {
            let result = base;
            for (const overlay of [...overlays].reverse()) result = blend(overlay, result);
            return result;
          });
        }
        if (solid?.a >= 1) {
          let result = solid;
          for (const overlay of overlays.reverse()) result = blend(overlay, result);
          return [result];
        }
        if (solid?.a > 0) overlays.push(solid);
      }
      return [backgroundFor(element)];
    };
    const luminance = ({ r, g, b }) => [r, g, b]
      .map((value) => value / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const contrastRatio = (foreground, background) => {
      const text = blend(foreground, background);
      const light = Math.max(luminance(text), luminance(background));
      const dark = Math.min(luminance(text), luminance(background));
      return (light + 0.05) / (dark + 0.05);
    };
    const rect = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box ? Object.fromEntries(["x", "y", "width", "height"].map((key) => [key, Math.round(box[key] * 100) / 100])) : null;
    };
    const controls = [...document.querySelectorAll("button,a[href],input,select,textarea")].filter((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
    });
    const missingNames = controls.filter((element) => {
      const labelled = element.getAttribute("aria-labelledby")?.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ") || "";
      const explicitLabel = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent || "" : "";
      const wrappingLabel = element.closest("label")?.textContent || "";
      const value = element.getAttribute("aria-label") || labelled || explicitLabel || wrappingLabel || element.textContent || element.getAttribute("placeholder") || element.getAttribute("title") || element.getAttribute("alt") || "";
      return !value.trim();
    }).map((element) => `${element.tagName.toLowerCase()}#${element.id}.${String(element.className).replace(/\s+/g, ".")}`);
    const contrastCandidates = [...new Set([
      ...controls.filter((element) => (element.innerText || element.value || element.placeholder || "").trim()),
      ...document.querySelectorAll(".rw-nav-group > p, .rw-sidebar-footer span, .rw-sidebar-footer small, .rw-system-status span, .rw-page-header h1, .rw-page-header p, body[data-platform55-shell='public'] header a, body[data-platform55-shell='entry'] header a"),
    ])].filter((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && box.width > 0 && box.height > 0 && !element.matches(":disabled,[aria-disabled='true']");
    });
    const contrastSamples = contrastCandidates.map((element) => {
      const style = getComputedStyle(element);
      const foreground = parseColor(style.color);
      const backgrounds = backgroundsFor(element);
      const fontSize = Number.parseFloat(style.fontSize);
      const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
      const large = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
      const ratios = foreground ? backgrounds.map((background) => contrastRatio(foreground, background)) : [];
      return {
        selector: `${element.tagName.toLowerCase()}#${element.id}.${String(element.className).trim().replace(/\s+/g, ".")}`,
        text: (element.innerText || element.value || element.placeholder || "").trim().replace(/\s+/g, " ").slice(0, 80),
        color: style.color,
        background: backgrounds.map((background) => `rgb(${Math.round(background.r)}, ${Math.round(background.g)}, ${Math.round(background.b)})`).join(" | ") || "unmeasurable",
        ratio: ratios.length ? Math.round(Math.min(...ratios) * 1000) / 1000 : 0,
        threshold: large ? 3 : 4.5,
      };
    });
    const resources = performance.getEntriesByType("resource");
    const shell = rect(".rw-app");
    const sidebar = rect(".rw-sidebar");
    const topbar = rect(".rw-topbar");
    const main = rect(".rw-main, main");
    const workspaceHeader = rect(".spreadsheet-workbench-header");
    const commandBar = rect(".sheet-command-bar");
    const summaryStrip = rect(".rateware-summary-strip");
    const bulkActions = rect(".bulk-action-bar");
    const hero = document.querySelector(".rw-hero");
    return {
      body_text_length: document.body.innerText.trim().length,
      main_landmarks: document.querySelectorAll("main").length,
      active_routes: document.querySelectorAll('[aria-current="page"]').length,
      private_controls: shellVariant === "tenant" ? 0 : document.querySelectorAll(".rw-sidebar,[data-platform55-tenant-nav],.rw-tenant-switcher").length,
      skip_links: document.querySelectorAll('a[href^="#"][class*="skip"],.rw-skip-link').length,
      document_overflow: document.documentElement.scrollWidth > viewportWidth + 1,
      reduced_motion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      missing_accessible_names: missingNames,
      contrast_samples: contrastSamples,
      shell, sidebar, topbar, main, workspace_header: workspaceHeader, command_bar: commandBar, summary_strip: summaryStrip, bulk_actions: bulkActions,
      hero_background_image: hero ? getComputedStyle(hero).backgroundImage : "",
      geometry: sidebar && topbar && main ? { sidebar_width: sidebar.width, topbar_x: topbar.x, topbar_height: topbar.height, main_x: main.x, main_y: main.y } : null,
      shell_boot_ms: Math.round(Number(window.__s6ShellBoot || 0) * 100) / 100,
      cls: Math.round(Number(window.__s6Cls || 0) * 10000) / 10000,
      layout_shifts: window.__s6ShiftEntries,
      js_css_transfer_bytes: Math.round(resources.filter((entry) => /\.(?:js|css)(?:\?|$)/.test(entry.name)).reduce((sum, entry) => sum + Number(entry.transferSize || entry.encodedBodySize || 0), 0)),
    };
  }, { shellVariant: spec.shell_variant || "tenant", width });
  if (screenshot) await page.screenshot({ path: resolve(outputDirectory, screenshot), fullPage: false, animations: "disabled" });
  assert.equal(metrics.main_landmarks, 1, `${spec.route} must have one main landmark`);
  assert.ok(metrics.body_text_length > 80, `${spec.route} must render meaningful content`);
  assert.equal(metrics.document_overflow, false, `${spec.route} must not overflow the page`);
  assert.equal(metrics.reduced_motion, true, `${spec.route} must honor reduced motion`);
  assert.deepEqual(errors, { console: [], http: [], page: [], request: [], external: [], mutation: [] }, `${spec.route} must remain local, read-only, and error-free`);
  assertAccessibleControlNames(metrics.missing_accessible_names, spec.route);
  assertContrastSamples(metrics.contrast_samples, spec.route);
  if ((spec.shell_variant || "tenant") === "tenant") {
    assert.equal(metrics.active_routes, 1, `${spec.route} must expose one active tenant route`);
    if (!baselineMode) assert.ok(metrics.skip_links >= 1, `${spec.route} must expose a skip link`);
    if (!baselineMode) {
      const expected = baselineGeometry(spec.route, width, height, spec.commandState);
      assert.ok(expected, `${spec.route} must have accepted baseline geometry`);
      assert.ok(maxDelta(metrics.geometry, expected) <= 2, `${spec.route} shell geometry must remain within 2px: ${JSON.stringify({ actual: metrics.geometry, expected })}`);
    }
    if (!baselineMode) {
      assert.ok(metrics.shell_boot_ms > 0 && metrics.shell_boot_ms <= 2000, `${spec.route} shell boot ${metrics.shell_boot_ms}ms must be measured and remain within 2000ms`);
      assert.ok(metrics.cls <= 0.1, `${spec.route} CLS ${metrics.cls} exceeds 0.1: ${JSON.stringify({ layout: { workspace_header: metrics.workspace_header, command_bar: metrics.command_bar, summary_strip: metrics.summary_strip, bulk_actions: metrics.bulk_actions }, shifts: metrics.layout_shifts })}`);
      assert.ok(metrics.js_css_transfer_bytes <= 3_000_000, `${spec.route} JS/CSS transfer ${metrics.js_css_transfer_bytes} exceeds 3MB`);
    }
    if (spec.route === "app.html") assert.match(metrics.hero_background_image, /linear-gradient/, "Command Center hero must retain its dark Platform55 background in every state");
  } else {
    assert.equal(metrics.private_controls, 0, `${spec.route} public shell must not expose tenant controls`);
  }
  return { page, context, routeUrl: `/${spec.route}${query ? `?${query}` : ""}`, errors, readRpcs, metrics };
}

try {
  for (const route of routes) {
    const result = await inspect({ ...route, owner: route.owner_sprint }, 1440, 900);
    allRouteSmoke.push({ route: route.route, owner: route.owner_sprint, shell_variant: route.shell_variant, route_url: result.routeUrl, read_rpcs: result.readRpcs, ...result.metrics });
    await result.context.close();
  }

  for (const representative of representatives) {
    for (const [width, height] of viewports) {
      const filename = `${representative.domain.toLowerCase()}-${representative.route.replace(/\.html$/, "")}-${width}x${height}.png`;
      const result = await inspect({ ...representative, shell_variant: representative.domain === "Public" ? "public" : "tenant" }, width, height, { screenshot: filename });
      const bytes = await readFile(resolve(outputDirectory, filename));
      captures.push({ kind: "domain", domain: representative.domain, route: representative.route, viewport: `${width}x${height}`, file: filename, sha256: createHash("sha256").update(bytes).digest("hex"), ...result.metrics });
      await result.context.close();
    }
  }

  for (const state of commandStates) {
    for (const [width, height] of viewports) {
      const filename = `command-${state}-${width}x${height}.png`;
      const result = await inspect({ route: "app.html", owner: "P2-S1", shell_variant: "tenant", query: `qa_state=${state}`, commandState: state }, width, height, { screenshot: filename, loading: state === "loading" });
      const marker = await result.page.locator("#next-action-title").textContent();
      const expected = { data: "Fix failed uploads", loading: "Checking today's work...", empty: "Upload carrier quotes", error: "Dashboard could not load", retry: "Fix failed uploads" }[state];
      assert.equal(marker?.trim(), expected, `Command Center ${state} marker`);
      const bytes = await readFile(resolve(outputDirectory, filename));
      captures.push({ kind: "command_state", state, route: "app.html", viewport: `${width}x${height}`, file: filename, marker: marker?.trim(), sha256: createHash("sha256").update(bytes).digest("hex"), ...result.metrics });
      await result.context.close();
    }
  }

  const focusResult = await inspect({ route: "app.html", owner: "P2-S1", shell_variant: "tenant", query: "qa_state=data" }, 390, 844);
  const trigger = focusResult.page.locator("[data-platform55-nav-open]");
  await trigger.click();
  const close = focusResult.page.locator("[data-platform55-nav-close]");
  assert.equal(await close.evaluate((element) => element === document.activeElement), true, "mobile drawer must focus Close");
  await verifyFocusCycle(focusResult.page, ".rw-sidebar", "mobile navigation");
  interactions.mobile_drawer_focus_cycle = true;
  await focusResult.page.keyboard.press("Escape");
  assert.equal(await trigger.evaluate((element) => element === document.activeElement), true, "mobile drawer must restore trigger focus");
  const searchTrigger = focusResult.page.locator("[data-platform55-search-trigger]");
  await searchTrigger.focus();
  await focusResult.page.keyboard.press("Control+K");
  const searchInput = focusResult.page.locator("[data-platform55-search-dialog] input[type='search']");
  assert.equal(await searchInput.evaluate((element) => element === document.activeElement), true, "search must focus its input");
  await verifyFocusCycle(focusResult.page, "[data-platform55-search-dialog] .rw-search-dialog", "global search");
  interactions.search_focus_cycle = true;
  await focusResult.page.keyboard.press("Escape");
  assert.equal(await searchTrigger.evaluate((element) => element === document.activeElement), true, "search must restore trigger focus");
  interactions.mobile_drawer_focus_restore = true;
  interactions.search_focus_restore = true;
  await focusResult.context.close();

  for (const spec of [representatives[0], representatives[3], representatives[4], representatives[8]]) {
    const result = await inspect({ ...spec, shell_variant: spec.domain === "Public" ? "public" : "tenant" }, 390, 844);
    const zoomOverflow = await result.page.evaluate(() => { document.documentElement.style.fontSize = "200%"; return new Promise((resolveCheck) => requestAnimationFrame(() => resolveCheck(document.documentElement.scrollWidth > innerWidth + 1))); });
    assert.equal(zoomOverflow, false, `${spec.route} must reflow at 200% text zoom`);
    await result.context.close();
  }
  interactions.text_zoom_200_reflow = true;
} finally {
  await browser.close();
  await Promise.all(Object.values(servers).map((server) => server.close()));
}

const manifest = {
  schema_version: 1,
  candidate_sha: execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  geometry_baseline_sha: baselineMode ? null : geometryBaseline.candidate_sha,
  capture_policy: "local-only deterministic fixtures; fresh browser contexts; GET/HEAD plus explicit read-only RPC POST allowlist; no external requests; no writes",
  budgets: { shell_boot_ms_max: 2000, cls_max: 0.1, js_css_transfer_bytes_max: 3_000_000, geometry_delta_px_max: 2 },
  all_route_smoke: allRouteSmoke,
  captures,
  interactions,
};
await writeFile(outputManifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`Platform55 S6 browser certification passed: 29 routes, ${captures.length} captures, local-only and read-only.\n`);
