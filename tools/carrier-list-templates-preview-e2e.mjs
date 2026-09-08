#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const CARRIER_TEMPLATE_PREVIEW_VIEWPORTS = Object.freeze([
  Object.freeze([1440, 900]),
  Object.freeze([1024, 768]),
  Object.freeze([390, 844]),
]);

const PREVIEW_PATH = "/output/carrier-list-templates-preview.html";
const mime = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
});

async function startStaticServer(rootDir) {
  const root = resolve(rootDir);
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const file = resolve(root, relative);
    if (!(file === root || file.startsWith(`${root}${sep}`)) || !existsSync(file)) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }
    try {
      response.writeHead(200, { "content-type": mime[extname(file).toLowerCase()] || "application/octet-stream" });
      response.end(await readFile(file));
    } catch {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end("error");
    }
  });
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const address = server.address();
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function inspectPage(page) {
  return page.evaluate(() => {
    const controls = [...document.querySelectorAll("a[href], button, input, select, textarea")]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
      })
      .map((element) => ({
        tag: element.tagName,
        label: String(element.getAttribute("aria-label") || element.getAttribute("title") || element.labels?.[0]?.textContent || element.textContent || "").trim(),
        focusKey: element.dataset.cltFocusKey || "",
      }));
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      unnamedControls: controls.filter((control) => !control.label).length,
      controlCount: controls.length,
      focusedKey: document.activeElement?.dataset?.cltFocusKey || "",
    };
  });
}

async function expectFocusedHeading(page) {
  const focusedKey = await page.evaluate(() => document.activeElement?.dataset?.cltFocusKey || "");
  assert.equal(focusedKey, "screen-heading", `route changes should move focus to the screen heading (got ${focusedKey || "none"})`);
}

async function runViewport(page, artifactDir, viewport, origin) {
  const [width, height] = viewport;
  const capture = { viewport: `${width}x${height}`, steps: [], screenshots: [], errors: { console: [], page: [], http: [], externalRequests: [] } };
  const screenshot = async (name) => {
    const file = resolve(artifactDir, `${width}x${height}-${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    capture.screenshots.push(file);
  };

  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon\.ico/i.test(message.text())) capture.errors.console.push(message.text());
  });
  page.on("pageerror", (error) => capture.errors.page.push(String(error?.message || error)));
  page.on("response", (response) => {
    if (response.status() >= 400 && !/favicon\.ico/i.test(response.url())) capture.errors.http.push(`${response.status()} ${response.url()}`);
  });
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== origin) capture.errors.externalRequests.push(request.url());
  });

  const response = await page.goto(`${origin}${PREVIEW_PATH}`, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200, "preview page should load");
  await page.waitForSelector("[data-clt-action='new']");
  assert.equal(await page.locator(".preview-safety-banner").innerText(), "Preview con datos simulados · sin acciones externas");
  assert.equal(await page.locator("[data-clt-select-template]").count(), 4, "library should show the four fixture templates");
  capture.steps.push("library loaded");
  await screenshot("library");

  await page.locator("[data-clt-action='new']").click();
  await expectFocusedHeading(page);
  assert.match(await page.locator("h1[data-clt-focus-key='screen-heading']").innerText(), /Create carrier list template/);
  await page.locator("[data-clt-builder-name]").fill("QA Preview Capacity");
  await page.locator("[data-clt-builder-description]").fill("Deterministic local preview list.");
  await page.locator("[data-clt-step='1']").first().click();
  await page.locator("[data-clt-candidate]").nth(0).click();
  await page.locator("[data-clt-candidate]").nth(1).click();
  await page.locator("[data-clt-add-selected]").click();
  assert.equal(await page.locator(".clt-member-row").count(), 2, "builder should add only existing CRM carriers");
  await page.locator("[data-clt-builder-mode='upload']").click();
  await page.locator("[data-clt-import-preview]").click();
  for (const status of ["matched", "ambiguous", "not found", "duplicate"]) {
    assert.match(await page.locator(".clt-upload-preview").innerText(), new RegExp(status, "i"), `import preview should show ${status}`);
  }
  capture.steps.push("builder CRM selection and import reconciliation preview");
  await screenshot("builder");

  await page.locator("[data-clt-step='2']").first().click();
  assert.match(await page.locator("h2").allTextContents().then((texts) => texts.join(" ")), /Review exact membership/);
  assert.match(await page.locator(".clt-review-grid").innerText(), /3 Carrier CRM IDs will be stored in order/);
  await page.locator("[data-clt-step='3']").first().click();
  await page.locator("[data-clt-save='active']").click();
  await page.waitForSelector("[data-clt-action='new']");
  assert.match(await page.locator(".clt-detail-panel").innerText(), /QA Preview Capacity/);
  assert.match(await page.locator(".clt-detail-panel").innerText(), /Active/);
  capture.steps.push("active template saved in local state");

  if (width <= 760) {
    await page.locator("[data-preview-mobile-nav='open']").click();
    await page.waitForTimeout(250);
    await page.locator("[data-preview-nav-key='bid-room']").dispatchEvent("click");
  } else {
    await page.locator("[data-preview-route='carrier-fit']").first().dispatchEvent("click");
  }
  await expectFocusedHeading(page);
  const templateSelect = page.locator("[data-clt-fit-template]");
  await templateSelect.selectOption("a1000000-0000-4000-8000-000000000001");
  const countsText = await page.locator(".clt-fit-counts").innerText();
  assert.match(countsText, /9\s+template members/);
  assert.match(countsText, /4\s+eligible/);
  assert.match(countsText, /2\s+already in this RFx/);
  assert.match(countsText, /1\s+missing contact/);
  assert.match(countsText, /2\s+unavailable/);
  assert.equal(await page.locator("[data-clt-fit-toggle]").count(), 4, "only eligible members should expose selection controls");
  assert.equal(await page.locator("tr.is-missing_contact [data-clt-fit-toggle], tr.is-unavailable [data-clt-fit-toggle]").count(), 0, "exception rows must not be selectable");
  capture.steps.push("Carrier Fit eligibility partition and blocked states");
  await screenshot("carrier-fit");

  await page.locator("[data-clt-fit-select-all]").click();
  assert.match(await page.locator(".clt-fit-footer").innerText(), /4 carriers selected/);
  const cta = page.locator("[data-clt-fit-submit]");
  assert.equal(await cta.innerText(), "Add 4 carriers to this RFx and open Message");
  await cta.click();
  await expectFocusedHeading(page);
  assert.match(await page.locator("h1[data-clt-focus-key='screen-heading']").innerText(), /4 carriers opened in Message/);
  assert.equal(await page.locator(".clt-message-audience span").count(), 4, "Message should receive only the selected eligible audience");
  assert.match(await page.locator(".clt-success-card").innerText(), /No draft was prepared, nothing was sent, and Delivery queue was not touched/);
  capture.steps.push("Carrier Fit selection opens Message without draft or delivery effect");
  await screenshot("message");

  const audit = await inspectPage(page);
  Object.assign(capture, audit);
  assert.equal(audit.overflow, false, `${width}x${height} preview must not overflow horizontally`);
  assert.equal(audit.unnamedControls, 0, `${width}x${height} preview must not expose unnamed controls`);
  assert.deepEqual(capture.errors.externalRequests, [], "preview must not issue outbound requests");
  assert.deepEqual(capture.errors.page, [], "preview must not raise page errors");
  assert.deepEqual(capture.errors.console, [], "preview must not log console errors");
  assert.deepEqual(capture.errors.http, [], "preview must not return asset errors");
  return capture;
}

export async function runCarrierListTemplatesPreviewE2E({
  rootDir = process.cwd(),
  chromePath = process.env.RATEWARE_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  artifactDir = resolve(rootDir, "tmp", "carrier-list-templates-evidence", new Date().toISOString().replace(/[:.]/g, "-")),
} = {}) {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.RATEWARE_PLAYWRIGHT_MODULE || "playwright");
  await mkdir(artifactDir, { recursive: true });
  const { server, origin } = await startStaticServer(rootDir);
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const captures = [];
  try {
    for (const viewport of CARRIER_TEMPLATE_PREVIEW_VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: viewport[0], height: viewport[1] }, javaScriptEnabled: true });
      const page = await context.newPage();
      await page.route("**/*", async (route) => {
        if (new URL(route.request().url()).origin !== origin) return route.abort();
        return route.continue();
      });
      captures.push(await runViewport(page, artifactDir, viewport, origin));
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
  const report = Object.freeze({
    schema_version: 1,
    sprint: "carrier-list-templates-preview-e2e",
    origin,
    preview_path: PREVIEW_PATH,
    viewport_count: CARRIER_TEMPLATE_PREVIEW_VIEWPORTS.length,
    capture_count: captures.length,
    external_effects: "none",
    captures,
  });
  await writeFile(resolve(artifactDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = await runCarrierListTemplatesPreviewE2E();
    console.log(JSON.stringify({
      sprint: report.sprint,
      capture_count: report.capture_count,
      viewports: report.captures.map((capture) => capture.viewport),
      steps: report.captures.flatMap((capture) => capture.steps),
      evidence_dir: resolve(process.cwd(), "tmp", "carrier-list-templates-evidence"),
      external_effects: report.external_effects,
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  }
}
