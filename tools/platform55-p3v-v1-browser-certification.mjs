import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { startS6CommandEvidenceServer } from "./platform55-s6-command-evidence-server.mjs";
import { startOperateEvidenceServer } from "./platform55-operate-evidence-server.mjs";
import {
  assertAccessibleControlNames,
  assertContrastSamples,
  assertFocusCycle,
} from "./platform55-s6-accessibility-certification.mjs";

export const P3V1_VIEWPORTS = Object.freeze([
  Object.freeze([1440, 900]),
  Object.freeze([1024, 768]),
  Object.freeze([390, 844]),
]);

export const P3V1_SOURCE_PATHS = Object.freeze([
  "app.html",
  "rateware.html",
  "src/platform55-command-center.css",
  "src/platform55-operate.css",
  "src/platform55-visual-parity.css",
]);

export const P3V1_SPECS = Object.freeze([
  Object.freeze({
    route: "app.html",
    states: Object.freeze(["data", "loading", "empty", "error"]),
    requiredIds: Object.freeze(["next-best-action", "priority-queue", "business-lifecycle", "my-work-list", "network-pulse"]),
  }),
  Object.freeze({
    route: "rateware.html",
    states: Object.freeze(["loaded", "error"]),
    requiredIds: Object.freeze(["rateware-metric-total", "rateware-search", "rateware-body", "rateware-drawer", "rateware-bulk-drawer"]),
  }),
]);

export const P3V1_CAPTURE_MATRIX = Object.freeze(P3V1_SPECS.flatMap((spec) => (
  spec.states.flatMap((state) => P3V1_VIEWPORTS.map((viewport) => Object.freeze({
    route: spec.route,
    state,
    viewport,
  })))
)));

const ERROR_CHANNELS = Object.freeze([
  "console_errors",
  "http_errors",
  "page_errors",
  "request_errors",
  "external_requests",
  "mutation_attempts",
]);

function sha(value, length) {
  return typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`, "i").test(value);
}

function ownDataRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  let descriptors;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return null;
  }
  if (Object.values(descriptors).some((descriptor) => !("value" in descriptor))) return null;
  return descriptors;
}

function dataValue(descriptors, name) {
  return descriptors?.[name] && "value" in descriptors[name] ? descriptors[name].value : undefined;
}

function denseTextArray(value) {
  return Array.isArray(value)
    && Object.getPrototypeOf(value) === Array.prototype
    && Object.keys(value).length === value.length
    && value.every((entry) => typeof entry === "string");
}

function viewportKey(viewport) {
  return Array.isArray(viewport) && viewport.length === 2 ? `${viewport[0]}x${viewport[1]}` : "invalid";
}

function captureKey(record) {
  return `${record.route}:${record.state}:${viewportKey(record.viewport)}`;
}

function validSourceBlobs(value) {
  const descriptors = ownDataRecord(value);
  if (!descriptors) return false;
  const keys = Object.keys(descriptors).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...P3V1_SOURCE_PATHS].sort())) return false;
  return keys.every((path) => sha(dataValue(descriptors, path), 40));
}

function result(errors) {
  const unique = Object.freeze([...new Set(errors)]);
  return Object.freeze({ ok: unique.length === 0, errors: unique });
}

export function validateP3V1Capture(record) {
  const errors = [];
  const descriptors = ownDataRecord(record);
  if (!descriptors) return result(["record:object"]);
  const route = dataValue(descriptors, "route");
  const state = dataValue(descriptors, "state");
  const viewport = dataValue(descriptors, "viewport");
  const spec = P3V1_SPECS.find((candidate) => candidate.route === route);
  if (!spec) errors.push("route:unknown");
  if (!spec?.states.includes(state)) errors.push("state:unknown");
  if (!P3V1_VIEWPORTS.some((candidate) => viewportKey(candidate) === viewportKey(viewport))) errors.push("viewport:unknown");
  if (dataValue(descriptors, "page_overflow") !== false) errors.push("layout:page_overflow");
  const visibleIds = dataValue(descriptors, "visible_ids");
  if (!denseTextArray(visibleIds)) errors.push("visible_ids:array");
  for (const id of spec?.requiredIds || []) {
    if (!visibleIds?.includes?.(id)) errors.push(`visible:${id}:missing`);
  }
  if (dataValue(descriptors, "page_heading_visible") !== true) errors.push("heading:hidden");
  if (dataValue(descriptors, "state_surface_visible") !== true) errors.push("state_surface:hidden");
  if (dataValue(descriptors, "primary_actions_visible") !== true) errors.push("primary_actions:hidden");
  if (dataValue(descriptors, "table_overflow_owned") !== true) errors.push("layout:table_containment");
  for (const [name, code] of [["unnamed_controls", "a11y:unnamed_controls"], ["contrast_failures", "a11y:contrast"]]) {
    const entries = dataValue(descriptors, name);
    if (!Array.isArray(entries) || entries.length) errors.push(code);
  }
  if (dataValue(descriptors, "focus_cycle_pass") !== true || dataValue(descriptors, "focus_restore_pass") !== true) errors.push("a11y:focus");
  for (const name of ERROR_CHANNELS) {
    const entries = dataValue(descriptors, name);
    if (!Array.isArray(entries) || entries.length) errors.push(`${name}:nonzero`);
  }
  if (!sha(dataValue(descriptors, "screenshot_sha256"), 64)) errors.push("screenshot:sha256");
  if (!validSourceBlobs(dataValue(descriptors, "source_blobs"))) errors.push("source:blobs");
  return result(errors);
}

export function validateP3V1Manifest(manifest) {
  const errors = [];
  const descriptors = ownDataRecord(manifest);
  if (!descriptors) return result(["manifest:object"]);
  if (dataValue(descriptors, "schema_version") !== 1) errors.push("schema_version");
  if (!sha(dataValue(descriptors, "product_sha"), 40)) errors.push("product_sha");
  if (!sha(dataValue(descriptors, "product_tree"), 40)) errors.push("product_tree");
  const sourceBlobs = dataValue(descriptors, "source_blobs");
  if (!validSourceBlobs(sourceBlobs)) errors.push("source_blobs");
  const expectedKeys = new Set(P3V1_CAPTURE_MATRIX.map(captureKey));
  const captures = dataValue(descriptors, "captures");
  if (!Array.isArray(captures) || captures.length !== expectedKeys.size) {
    errors.push("captures:count");
  }
  const observed = new Set();
  for (const [index, capture] of (Array.isArray(captures) ? captures : []).entries()) {
    const captureResult = validateP3V1Capture(capture);
    for (const error of captureResult.errors) errors.push(`capture:${index}:${error}`);
    const key = captureKey(capture || {});
    if (!expectedKeys.has(key)) errors.push(`capture:${index}:matrix`);
    if (observed.has(key)) errors.push(`capture:${index}:duplicate`);
    observed.add(key);
    if (JSON.stringify(capture?.source_blobs) !== JSON.stringify(sourceBlobs)) errors.push(`capture:${index}:source_drift`);
  }
  for (const key of expectedKeys) if (!observed.has(key)) errors.push(`capture:${key}:missing`);
  return result(errors);
}

function isInside(root, candidate) {
  const value = relative(root, candidate);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

async function prepareOutputDirectory(root, productSha) {
  const configured = process.env.RATEWARE_P3V_OUTPUT_DIR;
  if (!configured) throw new Error("RATEWARE_P3V_OUTPUT_DIR is required");
  const candidate = resolve(configured);
  if (candidate === root) throw new Error("P3-V output cannot be the repository root");
  const evidenceMode = process.env.RATEWARE_P3V_EVIDENCE_COMMIT === "true";
  const expectedEvidence = resolve(root, "docs", "platform55-visual-parity", "evidence", "p3v1", productSha);
  if (evidenceMode && candidate !== expectedEvidence) throw new Error("P3-V evidence output must equal the product-addressed directory");

  let ancestor = candidate;
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new Error("P3-V output has no existing ancestor");
    ancestor = parent;
  }
  const realAncestor = await realpath(ancestor);
  const projected = resolve(realAncestor, relative(ancestor, candidate));
  if (!evidenceMode && isInside(root, projected)) throw new Error("temporary P3-V output must remain outside the repository");
  if (evidenceMode && !isInside(root, projected)) throw new Error("committed P3-V evidence must remain inside the repository");
  await mkdir(candidate, { recursive: true });
  const realOutput = await realpath(candidate);
  if (realOutput !== projected) throw new Error("P3-V output resolves through an unexpected link");
  return realOutput;
}

function gitValue(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function readSourceBlobs(root) {
  return Object.fromEntries(P3V1_SOURCE_PATHS.map((path) => {
    const committed = gitValue(root, "rev-parse", `HEAD:${path}`);
    const working = gitValue(root, "hash-object", "--", path);
    assert.equal(working, committed, `${path} working bytes must match the product candidate`);
    return [path, committed];
  }));
}

async function verifyFocusCycle(page, containerSelector, label) {
  const candidates = page.locator(`${containerSelector} a[href], ${containerSelector} button:not([disabled]), ${containerSelector} input:not([disabled]), ${containerSelector} select:not([disabled]), ${containerSelector} textarea:not([disabled]), ${containerSelector} [tabindex]:not([tabindex="-1"])`);
  const visible = [];
  for (let index = 0; index < await candidates.count(); index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible() && await candidate.getAttribute("aria-hidden") !== "true") visible.push(candidate);
  }
  assert.ok(visible.length >= 2, `${label} needs at least two visible controls`);
  const first = visible[0];
  const last = visible.at(-1);
  await last.focus();
  await page.keyboard.press("Tab");
  const forwardActive = await first.evaluate((element) => element === document.activeElement) ? "first" : "outside";
  await first.focus();
  await page.keyboard.press("Shift+Tab");
  const backwardActive = await last.evaluate((element) => element === document.activeElement) ? "last" : "outside";
  assertFocusCycle({ label, first: "first", last: "last", forwardActive, backwardActive });
}

async function collectMetrics(page, spec, viewport) {
  return page.evaluate(({ route, requiredIds, viewportWidth }) => {
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && box.width > 0 && box.height > 0;
    };
    const intersectsViewport = (element) => {
      if (!visible(element)) return false;
      const box = element.getBoundingClientRect();
      return box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
    };
    const parseColor = (value) => {
      const match = String(value).match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
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
    const backgroundsFor = (element) => {
      const overlays = [];
      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        const solid = parseColor(style.backgroundColor);
        const image = style.backgroundImage;
        if (image && image !== "none") {
          const colors = [...image.matchAll(/rgba?\([^)]+\)/gi)].map((match) => parseColor(match[0])).filter(Boolean);
          const bases = colors.filter((color) => color.a >= 1);
          if (!bases.length && solid?.a >= 1) bases.push(solid);
          if (bases.length) return bases.map((base) => overlays.reduceRight((value, overlay) => blend(overlay, value), base));
        }
        if (solid?.a >= 1) return [overlays.reduceRight((value, overlay) => blend(overlay, value), solid)];
        if (solid?.a > 0) overlays.push(solid);
      }
      return [{ r: 255, g: 255, b: 255, a: 1 }];
    };
    const luminance = ({ r, g, b }) => [r, g, b]
      .map((value) => value / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const ratio = (foreground, background) => {
      const text = blend(foreground, background);
      const light = Math.max(luminance(text), luminance(background));
      const dark = Math.min(luminance(text), luminance(background));
      return (light + 0.05) / (dark + 0.05);
    };
    const controls = [...document.querySelectorAll("button,a[href],input,select,textarea,summary")].filter(visible);
    const unnamed = controls.filter((element) => {
      const labelled = element.getAttribute("aria-labelledby")?.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ") || "";
      const explicit = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent || "" : "";
      const name = element.getAttribute("aria-label") || labelled || explicit || element.closest("label")?.textContent || element.textContent || element.getAttribute("placeholder") || element.getAttribute("title") || "";
      return !name.trim();
    }).map((element) => `${element.tagName.toLowerCase()}#${element.id}.${String(element.className).replace(/\s+/g, ".")}`);
    const contrastElements = [...new Set([
      ...controls,
      ...document.querySelectorAll("[data-platform55-page-content] h1,[data-platform55-page-content] h2,[data-platform55-page-content] h3,[data-platform55-page-content] p,[data-platform55-page-content] strong,[data-platform55-page-content] small,[data-platform55-page-content] label,[data-platform55-page-content] summary"),
    ])].filter((element) => visible(element) && !element.matches(":disabled,[aria-disabled='true']") && (element.innerText || element.value || element.placeholder || "").trim());
    const contrastSamples = contrastElements.map((element) => {
      const style = getComputedStyle(element);
      const foreground = parseColor(style.color);
      const backgrounds = backgroundsFor(element);
      const fontSize = Number.parseFloat(style.fontSize);
      const weight = Number.parseInt(style.fontWeight, 10) || 400;
      const threshold = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700) ? 3 : 4.5;
      const ratios = foreground ? backgrounds.map((background) => ratio(foreground, background)) : [];
      return {
        selector: `${element.tagName.toLowerCase()}#${element.id}.${String(element.className).trim().replace(/\s+/g, ".")}`,
        text: (element.innerText || element.value || element.placeholder || "").trim().replace(/\s+/g, " ").slice(0, 100),
        color: style.color,
        background: backgrounds.map(({ r, g, b }) => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`).join(" | "),
        ratio: ratios.length ? Math.round(Math.min(...ratios) * 1000) / 1000 : 0,
        threshold,
      };
    });
    const table = document.querySelector(".p55-vp-table-shell");
    const stateSurface = document.querySelector(route === "app.html" ? "#next-best-action" : "#rateware-body");
    const overflowElements = [...document.querySelectorAll("body *")].filter((element) => {
      if (!visible(element)) return false;
      const box = element.getBoundingClientRect();
      return box.left < -1 || box.right > viewportWidth + 1;
    }).slice(0, 20).map((element) => {
      const box = element.getBoundingClientRect();
      return {
        selector: `${element.tagName.toLowerCase()}#${element.id}.${String(element.className).trim().replace(/\s+/g, ".")}`,
        left: Math.round(box.left * 100) / 100,
        right: Math.round(box.right * 100) / 100,
        width: Math.round(box.width * 100) / 100,
      };
    });
    const internalOverflowElements = [...document.querySelectorAll("body *")].filter((element) => (
      visible(element) && element.scrollWidth > element.clientWidth + 1
    )).slice(0, 20).map((element) => ({
      selector: `${element.tagName.toLowerCase()}#${element.id}.${String(element.className).trim().replace(/\s+/g, ".")}`,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      overflowX: getComputedStyle(element).overflowX,
    }));
    return {
      visible_ids: requiredIds.filter((id) => document.getElementById(id)),
      page_heading_visible: visible(document.querySelector("h1")),
      state_surface_visible: intersectsViewport(stateSurface),
      primary_actions_visible: visible(document.querySelector(".page-primary-action")),
      page_overflow: document.documentElement.scrollWidth > viewportWidth + 1,
      document_scroll_width: document.documentElement.scrollWidth,
      body_scroll_width: document.body.scrollWidth,
      document_client_width: document.documentElement.clientWidth,
      body_rect_width: Math.round(document.body.getBoundingClientRect().width * 100) / 100,
      internal_overflow_elements: internalOverflowElements,
      overflow_elements: overflowElements,
      table_overflow_owned: route !== "rateware.html" || Boolean(table && table.scrollWidth > table.clientWidth && document.documentElement.scrollWidth <= viewportWidth + 1),
      unnamed_controls: unnamed,
      contrast_samples: contrastSamples,
      contrast_failures: contrastSamples.filter(({ ratio: value, threshold }) => !Number.isFinite(value) || value + Number.EPSILON < threshold),
      reduced_motion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  }, { route: spec.route, requiredIds: spec.requiredIds, viewportWidth: viewport[0] });
}

async function verifyInteractions(page, viewport) {
  let focusCyclePass = true;
  let focusRestorePass = true;
  const details = {};
  const searchTrigger = page.locator("[data-platform55-search-trigger]");
  await searchTrigger.focus();
  await page.keyboard.press("Control+K");
  const searchInput = page.locator("[data-platform55-search-dialog] input[type='search']");
  await page.waitForFunction(() => document.querySelector("[data-platform55-search-dialog] input[type='search']") === document.activeElement, { timeout: 1000 });
  details.search_open_focus = await searchInput.evaluate((element) => element === document.activeElement);
  focusRestorePass &&= details.search_open_focus;
  await verifyFocusCycle(page, "[data-platform55-search-dialog] .rw-search-dialog", "global search");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector("[data-platform55-search-trigger]") === document.activeElement, { timeout: 1000 });
  details.search_restore = await searchTrigger.evaluate((element) => element === document.activeElement);
  focusRestorePass &&= details.search_restore;
  if (viewport[0] === 390) {
    const trigger = page.locator("[data-platform55-nav-open]");
    await trigger.click();
    const close = page.locator("[data-platform55-nav-close]");
    await page.waitForFunction(() => document.querySelector("[data-platform55-nav-close]") === document.activeElement, { timeout: 1000 });
    details.drawer_open_focus = await close.evaluate((element) => element === document.activeElement);
    focusRestorePass &&= details.drawer_open_focus;
    await verifyFocusCycle(page, ".rw-sidebar", "mobile navigation");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector("[data-platform55-nav-open]") === document.activeElement, { timeout: 1000 });
    details.drawer_restore = await trigger.evaluate((element) => element === document.activeElement);
    focusRestorePass &&= details.drawer_restore;
  }
  return { focus_cycle_pass: focusCyclePass, focus_restore_pass: focusRestorePass, focus_details: details };
}

async function runCli() {
  const root = await realpath(resolve(process.env.RATEWARE_P3V_ROOT || process.cwd()));
  const productSha = gitValue(root, "rev-parse", "HEAD");
  const productTree = gitValue(root, "rev-parse", "HEAD^{tree}");
  const sourceBlobs = readSourceBlobs(root);
  const outputDirectory = await prepareOutputDirectory(root, productSha);
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.RATEWARE_PLAYWRIGHT_MODULE || "playwright");
  const chromePath = process.env.RATEWARE_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const servers = {
    "app.html": await startS6CommandEvidenceServer({ rootDir: root }),
    "rateware.html": await startOperateEvidenceServer({ rootDir: root }),
  };
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const captures = [];
  try {
    for (const matrix of P3V1_CAPTURE_MATRIX) {
      const spec = P3V1_SPECS.find((candidate) => candidate.route === matrix.route);
      const origin = servers[spec.route].origin;
      const [width, height] = matrix.viewport;
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const page = await context.newPage();
      const errors = Object.fromEntries(ERROR_CHANNELS.map((name) => [name, []]));
      try {
        await context.route("**/*", async (route) => {
          const request = route.request();
          let requestOrigin = "invalid";
          try { requestOrigin = new URL(request.url()).origin; } catch { /* Recorded below. */ }
          if (requestOrigin !== origin) {
            errors.external_requests.push(request.url());
            await route.abort("blockedbyclient");
            return;
          }
          await route.continue();
        });
        page.on("console", (message) => { if (message.type() === "error") errors.console_errors.push(message.text()); });
        page.on("response", (response) => { if (response.status() >= 400) errors.http_errors.push(`${response.status()} ${response.url()}`); });
        page.on("pageerror", (error) => errors.page_errors.push(error.message));
        page.on("requestfailed", (request) => {
          if (!errors.external_requests.includes(request.url())) errors.request_errors.push(`${request.url()} ${request.failure()?.errorText || "failed"}`);
        });
        page.on("request", (request) => {
          if (!new Set(["GET", "HEAD"]).has(request.method())) errors.mutation_attempts.push(`${request.method()} ${request.url()}`);
        });
        const url = `${origin}/${spec.route}?qa_state=${matrix.state}`;
        await page.goto(url, { waitUntil: matrix.state === "loading" ? "domcontentloaded" : "networkidle", timeout: 15000 });
        if (spec.route === "app.html") {
          const expected = { data: "Fix failed uploads", loading: "Checking today's work...", empty: "Upload carrier quotes", error: "Dashboard could not load" }[matrix.state];
          if (matrix.state !== "loading") await page.waitForFunction((text) => document.querySelector("#next-action-title")?.textContent?.trim() === text, expected);
          else await page.waitForTimeout(250);
        } else if (matrix.state === "loaded") {
          await page.waitForFunction(() => Boolean(document.querySelector("#rateware-body tr[data-rateware-id]")));
        } else {
          await page.waitForFunction(() => document.querySelector("#rateware-body")?.textContent?.includes("Rateware could not load"));
        }
        if (spec.route === "rateware.html") {
          await page.locator("#rateware-body").scrollIntoViewIfNeeded();
          await page.waitForTimeout(80);
        }
        const metrics = await collectMetrics(page, spec, matrix.viewport);
        assert.equal(metrics.reduced_motion, true, `${captureKey(matrix)} must honor reduced motion`);
        assertAccessibleControlNames(metrics.unnamed_controls, captureKey(matrix));
        assertContrastSamples(metrics.contrast_samples, captureKey(matrix));
        const interactions = await verifyInteractions(page, matrix.viewport);
        const file = `${spec.route.replace(/\.html$/, "")}-${matrix.state}-${width}x${height}.png`;
        const filePath = resolve(outputDirectory, file);
        await page.screenshot({ path: filePath, fullPage: false, animations: "disabled" });
        const screenshotSha256 = createHash("sha256").update(await readFile(filePath)).digest("hex");
        const record = {
          route: spec.route,
          state: matrix.state,
          viewport: [...matrix.viewport],
          file,
          ...metrics,
          ...interactions,
          ...errors,
          screenshot_sha256: screenshotSha256,
          source_blobs: sourceBlobs,
        };
        const validation = validateP3V1Capture(record);
        assert.equal(validation.ok, true, `${captureKey(record)} failed: ${validation.errors.join(", ")} widths=${metrics.document_scroll_width}/${metrics.body_scroll_width}/${metrics.document_client_width}/${metrics.body_rect_width}/${width} overflow=${JSON.stringify(metrics.overflow_elements)} internal=${JSON.stringify(metrics.internal_overflow_elements)} focus=${JSON.stringify(interactions)}`);
        captures.push(record);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await Promise.all(Object.values(servers).map((server) => server.close()));
  }
  const manifest = {
    schema_version: 1,
    product_sha: productSha,
    product_tree: productTree,
    generated_at: new Date().toISOString(),
    capture_policy: "local deterministic fixtures; fresh contexts; GET/HEAD only; external requests and mutations rejected",
    source_blobs: sourceBlobs,
    captures,
  };
  const validation = validateP3V1Manifest(manifest);
  assert.equal(validation.ok, true, `P3-V1 manifest failed: ${validation.errors.join(", ")}`);
  await writeFile(resolve(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`Platform55 P3-V1 browser certification passed: ${captures.length} captures, local-only and read-only.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli();
}
