import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { startOperateEvidenceServer } from "./platform55-operate-evidence-server.mjs";
import {
  assertAccessibleControlNames,
  assertContrastSamples,
  assertFocusCycle,
} from "./platform55-s6-accessibility-certification.mjs";

export const P3V2_VIEWPORTS = Object.freeze([
  Object.freeze([1440, 900]),
  Object.freeze([1024, 768]),
  Object.freeze([390, 844]),
]);

export const P3V2_SOURCE_PATHS = Object.freeze([
  "upload-center.html",
  "upload-history.html",
  "staging-review.html",
  "src/platform55-visual-parity.css",
]);

export const P3V2_SPECS = Object.freeze([
  Object.freeze({
    route: "upload-center.html",
    states: Object.freeze(["loaded", "empty", "validation-error", "upload-error"]),
    referencePath: "docs/platform55-visual-parity/baseline/reference-operator-console-1920.png",
  }),
  Object.freeze({
    route: "upload-history.html",
    states: Object.freeze(["loaded", "empty", "loading", "processing-error"]),
    referencePath: "docs/platform55-visual-parity/baseline/reference-runtime-jobs-1920.png",
  }),
  Object.freeze({
    route: "staging-review.html",
    states: Object.freeze(["loaded", "loading", "empty", "review-required", "error"]),
    referencePath: "docs/platform55-visual-parity/baseline/reference-readiness-1920.png",
  }),
]);

export const P3V2_CAPTURE_MATRIX = Object.freeze(P3V2_SPECS.flatMap((spec) => (
  spec.states.flatMap((state) => P3V2_VIEWPORTS.map((viewport) => Object.freeze({
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
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.values(descriptors).some((descriptor) => !("value" in descriptor))) return null;
    return descriptors;
  } catch {
    return null;
  }
}

function dataValue(descriptors, name) {
  return descriptors?.[name] && "value" in descriptors[name] ? descriptors[name].value : undefined;
}

function viewportKey(viewport) {
  return Array.isArray(viewport) && viewport.length === 2 ? `${viewport[0]}x${viewport[1]}` : "invalid";
}

function captureKey(record) {
  return `${record?.route}:${record?.state}:${viewportKey(record?.viewport)}`;
}

function validSourceBlobs(value) {
  const descriptors = ownDataRecord(value);
  if (!descriptors) return false;
  const keys = Object.keys(descriptors).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...P3V2_SOURCE_PATHS].sort())) return false;
  return keys.every((path) => sha(dataValue(descriptors, path), 40));
}

function result(errors) {
  const unique = Object.freeze([...new Set(errors)]);
  return Object.freeze({ ok: unique.length === 0, errors: unique });
}

export function validateP3V2Capture(record) {
  const errors = [];
  const descriptors = ownDataRecord(record);
  if (!descriptors) return result(["record:object"]);
  const route = dataValue(descriptors, "route");
  const state = dataValue(descriptors, "state");
  const viewport = dataValue(descriptors, "viewport");
  const spec = P3V2_SPECS.find((candidate) => candidate.route === route);
  if (!spec) errors.push("route:unknown");
  if (!spec?.states.includes(state)) errors.push("state:unknown");
  if (!P3V2_VIEWPORTS.some((candidate) => viewportKey(candidate) === viewportKey(viewport))) errors.push("viewport:unknown");
  if (dataValue(descriptors, "access_model") !== "authenticated") errors.push("access_model");
  if (dataValue(descriptors, "fixture") !== `qa_state:${state}`) errors.push("fixture");
  if (dataValue(descriptors, "reference_path") !== spec?.referencePath) errors.push("reference:path");
  if (!sha(dataValue(descriptors, "reference_sha256"), 64)) errors.push("reference:sha256");
  if (dataValue(descriptors, "file") !== `${String(route || "").replace(/\.html$/, "")}-${state}-${viewportKey(viewport)}.png`) errors.push("screenshot:path");
  for (const [field, code] of [
    ["page_heading_visible", "heading:hidden"],
    ["page_heading_intersects_viewport", "heading:outside_viewport"],
    ["state_surface_visible", "state_surface:hidden"],
    ["state_surface_intersects_viewport", "state_surface:outside_viewport"],
    ["source_retention_visible", "source_retention:hidden"],
    ["source_retention_intersects_viewport", "source_retention:outside_viewport"],
    ["internal_overflow_contained", "layout:internal_overflow"],
    ["focus_cycle_pass", "a11y:focus_cycle"],
    ["focus_restore_pass", "a11y:focus_restore"],
  ]) if (dataValue(descriptors, field) !== true) errors.push(code);
  if (route === "upload-history.html" && state === "loaded" && dataValue(descriptors, "source_filename_visible") !== true) errors.push("source_filename:hidden");
  if (route === "staging-review.html" && dataValue(descriptors, "selection_scopes_distinct") !== true) errors.push("selection_scopes:not_distinct");
  if (dataValue(descriptors, "page_overflow") !== false) errors.push("layout:page_overflow");
  for (const [field, code] of [["unnamed_controls", "a11y:unnamed_controls"], ["contrast_failures", "a11y:contrast"]]) {
    const entries = dataValue(descriptors, field);
    if (!Array.isArray(entries) || entries.length) errors.push(code);
  }
  for (const field of ERROR_CHANNELS) {
    const entries = dataValue(descriptors, field);
    if (!Array.isArray(entries) || entries.length) errors.push(`${field}:nonzero`);
  }
  if (!sha(dataValue(descriptors, "screenshot_sha256"), 64)) errors.push("screenshot:sha256");
  if (!sha(dataValue(descriptors, "screenshot_git_blob"), 40)) errors.push("screenshot:git_blob");
  if (!Number.isSafeInteger(dataValue(descriptors, "screenshot_byte_length")) || dataValue(descriptors, "screenshot_byte_length") <= 0) errors.push("screenshot:byte_length");
  if (dataValue(descriptors, "screenshot_width") !== viewport?.[0] || dataValue(descriptors, "screenshot_height") !== viewport?.[1]) errors.push("screenshot:dimensions");
  if (!validSourceBlobs(dataValue(descriptors, "source_blobs"))) errors.push("source:blobs");
  return result(errors);
}

export function validateP3V2Manifest(manifest) {
  const errors = [];
  const descriptors = ownDataRecord(manifest);
  if (!descriptors) return result(["manifest:object"]);
  if (dataValue(descriptors, "schema_version") !== 1) errors.push("schema_version");
  if (!sha(dataValue(descriptors, "product_sha"), 40)) errors.push("product_sha");
  if (!sha(dataValue(descriptors, "product_tree"), 40)) errors.push("product_tree");
  const sourceBlobs = dataValue(descriptors, "source_blobs");
  if (!validSourceBlobs(sourceBlobs)) errors.push("source_blobs");
  const expected = new Set(P3V2_CAPTURE_MATRIX.map(captureKey));
  const captures = dataValue(descriptors, "captures");
  if (!Array.isArray(captures) || captures.length !== expected.size) errors.push("captures:count");
  const observed = new Set();
  for (const [index, capture] of (Array.isArray(captures) ? captures : []).entries()) {
    for (const error of validateP3V2Capture(capture).errors) errors.push(`capture:${index}:${error}`);
    const key = captureKey(capture);
    if (!expected.has(key)) errors.push(`capture:${index}:matrix`);
    if (observed.has(key)) errors.push(`capture:${index}:duplicate`);
    observed.add(key);
    if (JSON.stringify(capture?.source_blobs) !== JSON.stringify(sourceBlobs)) errors.push(`capture:${index}:source_drift`);
  }
  for (const key of expected) if (!observed.has(key)) errors.push(`capture:${key}:missing`);
  return result(errors);
}

function isInside(root, candidate) {
  const value = relative(root, candidate);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

async function prepareOutputDirectory(root, productSha) {
  const configured = process.env.RATEWARE_P3V2_OUTPUT_DIR;
  if (!configured) throw new Error("RATEWARE_P3V2_OUTPUT_DIR is required");
  const candidate = resolve(configured);
  if (candidate === root) throw new Error("P3-V2 output cannot be the repository root");
  const evidenceMode = process.env.RATEWARE_P3V2_EVIDENCE_COMMIT === "true";
  const expected = resolve(root, "docs", "platform55-visual-parity", "evidence", "p3v2", productSha);
  if (evidenceMode && candidate !== expected) throw new Error("P3-V2 evidence output must equal the product-addressed directory");
  let ancestor = candidate;
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new Error("P3-V2 output has no existing ancestor");
    ancestor = parent;
  }
  const realAncestor = await realpath(ancestor);
  const projected = resolve(realAncestor, relative(ancestor, candidate));
  if (!evidenceMode && isInside(root, projected)) throw new Error("temporary P3-V2 output must remain outside the repository");
  if (evidenceMode && !isInside(root, projected)) throw new Error("committed P3-V2 evidence must remain inside the repository");
  await mkdir(candidate, { recursive: true });
  const realOutput = await realpath(candidate);
  if (realOutput !== projected) throw new Error("P3-V2 output resolves through an unexpected link");
  return realOutput;
}

function gitValue(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function readSourceBlobs(root, productSha) {
  return Object.fromEntries(P3V2_SOURCE_PATHS.map((path) => {
    const committed = gitValue(root, "rev-parse", `${productSha}:${path}`);
    const working = gitValue(root, "hash-object", "--", path);
    assert.equal(working, committed, `${path} working bytes must match the P3-V2 candidate`);
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

async function applyStateFixture(page, route, state) {
  await page.evaluate(({ routeName, stateName }) => {
    const panel = (title, message, tone = "neutral") => `<div class="ui-state p55-vp-state-panel" data-tone="${tone}" data-p3v2-active-state="${stateName}" role="status"><strong>${title}</strong><p>${message}</p></div>`;
    if (routeName === "upload-center.html") {
      const form = document.querySelector("#upload-form");
      const list = document.querySelector("#file-list");
      const status = document.querySelector("#status-message");
      if (stateName === "loaded") {
        form?.setAttribute("data-p3v2-active-state", stateName);
      } else if (stateName === "empty") {
        if (list) { list.dataset.p3v2ActiveState = stateName; list.innerHTML = "<li><strong>No files selected</strong><span>Select the original carrier quotation to preserve its source filename.</span></li>"; }
      } else if (status) {
        status.dataset.p3v2ActiveState = stateName;
        status.classList.remove("hidden");
        status.setAttribute("role", "alert");
        status.innerHTML = stateName === "validation-error"
          ? "<strong>File validation needs attention</strong><br>Use XLSX, PDF, image or email evidence with a preserved source filename."
          : "<strong>Upload could not be completed</strong><br>The original file remains unchanged. Retry only after confirming the source evidence.";
      }
      return;
    }
    if (routeName === "upload-history.html") {
      const body = document.querySelector("#history-body");
      if (!body) return;
      if (stateName === "loaded") {
        body.dataset.p3v2ActiveState = stateName;
      } else {
        const copy = {
          empty: ["No source files yet", "Import an original carrier quotation to begin a traceable intake.", "neutral"],
          loading: ["Loading source files", "Reading preserved filenames and staged row counts.", "loading"],
          "processing-error": ["Source files could not be loaded", "No source evidence was changed. Retry the read-only view.", "error"],
        }[stateName];
        body.innerHTML = `<tr><td colspan="9">${panel(...copy)}</td></tr>`;
      }
      return;
    }
    const body = document.querySelector("#staging-body");
    const brief = document.querySelector("[data-p3v2-state='review-required']");
    if (stateName === "review-required") {
      brief?.setAttribute("data-p3v2-active-state", stateName);
      return;
    }
    if (stateName === "loaded") {
      body?.setAttribute("data-p3v2-active-state", stateName);
      return;
    }
    if (body) {
      const copy = {
        loading: ["Loading review queue", "Reading staged rows and source evidence.", "loading"],
        empty: ["No rows require review", "New normalized rows will remain staged here until a person approves them.", "neutral"],
        error: ["Review queue could not be loaded", "No rows were approved or changed. Retry the read-only view.", "error"],
      }[stateName];
      body.innerHTML = `<tr><td colspan="22">${panel(...copy)}</td></tr>`;
    }
  }, { routeName: route, stateName: state });
}

async function collectMetrics(page, route, state, viewport) {
  return page.evaluate(({ routeName, stateName, width }) => {
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && box.width > 0 && box.height > 0;
    };
    const intersects = (element) => {
      if (!visible(element)) return false;
      const box = element.getBoundingClientRect();
      return box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
    };
    const stateSurface = document.querySelector(`[data-p3v2-active-state="${CSS.escape(stateName)}"]`);
    const sourceBoundary = document.querySelector("[data-p3v2-source-boundary], [data-p3v2-provenance-boundary], [data-source-field='source_filename'], #staging-brief-source");
    const controls = [...document.querySelectorAll("button,a[href],input,select,textarea,summary")].filter(visible);
    const unnamed = controls.filter((element) => {
      const labelled = element.getAttribute("aria-labelledby")?.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ") || "";
      const explicit = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent || "" : "";
      return !(element.getAttribute("aria-label") || labelled || explicit || element.closest("label")?.textContent || element.textContent || element.getAttribute("placeholder") || element.getAttribute("title") || "").trim();
    }).map((element) => `${element.tagName.toLowerCase()}#${element.id}`);
    const parseColor = (value) => {
      const match = String(value).match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const values = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return values.length >= 3 ? { r: values[0], g: values[1], b: values[2], a: Number.isFinite(values[3]) ? values[3] : 1 } : null;
    };
    const luminance = ({ r, g, b }) => [r, g, b].map((value) => value / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    const background = (element) => {
      for (let current = element; current; current = current.parentElement) {
        const color = parseColor(getComputedStyle(current).backgroundColor);
        if (color?.a === 1) return color;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const samples = [...document.querySelectorAll("[data-platform55-page-content] h1,[data-platform55-page-content] h2,[data-platform55-page-content] h3,[data-platform55-page-content] p,[data-platform55-page-content] strong,[data-platform55-page-content] small,[data-platform55-page-content] label,[data-platform55-page-content] button,[data-platform55-page-content] a")]
      .filter((element) => visible(element) && (element.innerText || "").trim())
      .map((element) => {
        const style = getComputedStyle(element);
        const foreground = parseColor(style.color);
        const back = background(element);
        const light = Math.max(luminance(foreground), luminance(back));
        const dark = Math.min(luminance(foreground), luminance(back));
        const fontSize = Number.parseFloat(style.fontSize);
        const weight = Number.parseInt(style.fontWeight, 10) || 400;
        const threshold = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700) ? 3 : 4.5;
        return { selector: `${element.tagName.toLowerCase()}#${element.id}`, ratio: Math.round(((light + .05) / (dark + .05)) * 1000) / 1000, threshold };
      });
    const overflowOwners = [...document.querySelectorAll(".p55-vp-table-shell,.rw-operate-table-scroll,.table-scroll")].filter(visible);
    const uncontainedOverflow = overflowOwners.filter((element) => element.scrollWidth > element.clientWidth + 1 && !["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(element).overflowX));
    const scopes = routeName === "staging-review.html" ? [document.querySelector("[data-p3v2-selection-scope='page']"), document.querySelector("[data-p3v2-selection-scope='filtered-database']")] : [];
    return {
      page_heading_visible: visible(document.querySelector("h1")),
      page_heading_intersects_viewport: intersects(document.querySelector("h1")),
      state_surface_visible: visible(stateSurface),
      state_surface_intersects_viewport: intersects(stateSurface),
      source_retention_visible: visible(sourceBoundary),
      source_retention_intersects_viewport: intersects(sourceBoundary),
      source_filename_visible: routeName !== "upload-history.html" || stateName !== "loaded" || document.body.innerText.includes("lane-quote.xlsx"),
      selection_scopes_distinct: routeName !== "staging-review.html" || (scopes.every(visible) && scopes[0].textContent.trim() !== scopes[1].textContent.trim()),
      page_overflow: document.documentElement.scrollWidth > width + 1,
      internal_overflow_contained: uncontainedOverflow.length === 0,
      internal_overflow_elements: uncontainedOverflow.slice(0, 12).map((element) => ({ selector: `${element.tagName.toLowerCase()}#${element.id}.${String(element.className).trim().replace(/\s+/g, ".")}`, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, overflowX: getComputedStyle(element).overflowX })),
      unnamed_controls: unnamed,
      contrast_samples: samples,
      contrast_failures: samples.filter(({ ratio, threshold }) => !Number.isFinite(ratio) || ratio + Number.EPSILON < threshold),
      reduced_motion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  }, { routeName: route, stateName: state, width: viewport[0] });
}

async function verifyInteractions(page, viewport) {
  const searchTrigger = page.locator("[data-platform55-search-trigger]");
  await searchTrigger.focus();
  await page.keyboard.press("Control+K");
  await page.waitForFunction(() => document.querySelector("[data-platform55-search-dialog] input[type='search']") === document.activeElement);
  await verifyFocusCycle(page, "[data-platform55-search-dialog] .rw-search-dialog", "global search");
  await page.keyboard.press("Escape");
  const searchRestore = await searchTrigger.evaluate((element) => element === document.activeElement);
  let drawerRestore = true;
  if (viewport[0] === 390) {
    const trigger = page.locator("[data-platform55-nav-open]");
    await trigger.click();
    await page.waitForFunction(() => document.querySelector("[data-platform55-nav-close]") === document.activeElement);
    await verifyFocusCycle(page, ".rw-sidebar", "mobile navigation");
    await page.keyboard.press("Escape");
    drawerRestore = await trigger.evaluate((element) => element === document.activeElement);
  }
  return { focus_cycle_pass: true, focus_restore_pass: searchRestore && drawerRestore };
}

async function runCli() {
  const root = await realpath(resolve(process.env.RATEWARE_P3V2_ROOT || process.cwd()));
  const productSha = gitValue(root, "rev-parse", process.env.RATEWARE_P3V2_PRODUCT_SHA || "HEAD");
  assert.match(productSha, /^[0-9a-f]{40}$/, "P3-V2 product SHA must be exact");
  execFileSync("git", ["-C", root, "merge-base", "--is-ancestor", productSha, "HEAD"], { stdio: "ignore" });
  const productTree = gitValue(root, "rev-parse", `${productSha}^{tree}`);
  const sourceBlobs = readSourceBlobs(root, productSha);
  const outputDirectory = await prepareOutputDirectory(root, productSha);
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.RATEWARE_PLAYWRIGHT_MODULE || "playwright");
  const chromePath = process.env.RATEWARE_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const server = await startOperateEvidenceServer({ rootDir: root });
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const captures = [];
  try {
    for (const matrix of P3V2_CAPTURE_MATRIX) {
      const spec = P3V2_SPECS.find((candidate) => candidate.route === matrix.route);
      const [width, height] = matrix.viewport;
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const page = await context.newPage();
      const errors = Object.fromEntries(ERROR_CHANNELS.map((name) => [name, []]));
      try {
        await context.route("**/*", async (route) => {
          const request = route.request();
          let origin = "invalid";
          try { origin = new URL(request.url()).origin; } catch { /* recorded below */ }
          if (origin !== server.origin) {
            errors.external_requests.push(request.url());
            await route.abort("blockedbyclient");
            return;
          }
          await route.continue();
        });
        page.on("console", (message) => { if (message.type() === "error") errors.console_errors.push(message.text()); });
        page.on("response", (response) => { if (response.status() >= 400) errors.http_errors.push(`${response.status()} ${response.url()}`); });
        page.on("pageerror", (error) => errors.page_errors.push(error.message));
        page.on("requestfailed", (request) => { if (!errors.external_requests.includes(request.url())) errors.request_errors.push(`${request.url()} ${request.failure()?.errorText || "failed"}`); });
        page.on("request", (request) => { if (!new Set(["GET", "HEAD"]).has(request.method())) errors.mutation_attempts.push(`${request.method()} ${request.url()}`); });
        await page.goto(`${server.origin}/${matrix.route}?qa_state=${matrix.state}`, { waitUntil: "networkidle", timeout: 15000 });
        await page.waitForSelector("[data-platform55-page-content]");
        await applyStateFixture(page, matrix.route, matrix.state);
        await page.waitForTimeout(60);
        const metrics = await collectMetrics(page, matrix.route, matrix.state, matrix.viewport);
        assert.equal(metrics.reduced_motion, true, `${captureKey(matrix)} must honor reduced motion`);
        assertAccessibleControlNames(metrics.unnamed_controls, captureKey(matrix));
        assertContrastSamples(metrics.contrast_samples, captureKey(matrix));
        const interactions = await verifyInteractions(page, matrix.viewport);
        const file = `${matrix.route.replace(/\.html$/, "")}-${matrix.state}-${width}x${height}.png`;
        const filePath = resolve(outputDirectory, file);
        await page.screenshot({ path: filePath, fullPage: false, animations: "disabled" });
        const bytes = await readFile(filePath);
        const referenceBytes = await readFile(resolve(root, spec.referencePath));
        const record = {
          route: matrix.route,
          state: matrix.state,
          viewport: [...matrix.viewport],
          access_model: "authenticated",
          fixture: `qa_state:${matrix.state}`,
          reference_path: spec.referencePath,
          reference_sha256: createHash("sha256").update(referenceBytes).digest("hex"),
          file,
          ...metrics,
          ...interactions,
          ...errors,
          screenshot_sha256: createHash("sha256").update(bytes).digest("hex"),
          screenshot_git_blob: execFileSync("git", ["hash-object", "--no-filters", filePath], { encoding: "utf8" }).trim(),
          screenshot_byte_length: bytes.length,
          screenshot_width: width,
          screenshot_height: height,
          source_blobs: sourceBlobs,
        };
        const validation = validateP3V2Capture(record);
        assert.equal(validation.ok, true, `${captureKey(record)} failed: ${validation.errors.join(", ")} internal=${JSON.stringify(metrics.internal_overflow_elements)}`);
        captures.push(record);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await server.close();
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
  const validation = validateP3V2Manifest(manifest);
  assert.equal(validation.ok, true, `P3-V2 manifest failed: ${validation.errors.join(", ")}`);
  await writeFile(resolve(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`Platform55 P3-V2 browser certification passed: ${captures.length} captures, local-only and read-only.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runCli();
