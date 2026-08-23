import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startIntelligenceAdminEvidenceServer } from "./platform55-intelligence-admin-evidence-server.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.RATEWARE_PLAYWRIGHT_MODULE || "playwright");

const routes = Object.freeze([
  { slug: "business-intelligence", file: "business-intelligence.html", kind: "tenant", query: "view=geo", loaded: "#bi-geo-status[data-tone='success']", nonhappy: "#bi-geo-status[data-tone='error']", nonhappyState: "error" },
  { slug: "growth-hacking", file: "growth-hacking.html", kind: "tenant", query: "", loaded: "#growth-global-status.success", nonhappy: "#growth-global-status.error", nonhappyState: "error" },
  { slug: "settings", file: "settings.html", kind: "tenant", query: "view=governance", nonhappyQuery: "view=audit", loaded: "#settings-governance-status[data-tone]", nonhappy: "#audit-log-body td", nonhappyState: "error" },
  { slug: "interpretation-memory", file: "interpretation-memory.html", kind: "tenant", query: "view=governance", nonhappyQuery: "view=library", loaded: "[data-platform55-governance-summary]", nonhappy: "#memory-body td", nonhappyState: "error" },
  { slug: "catalog-workbench", file: "catalog-workbench.html", kind: "tenant", query: "view=import", nonhappyQuery: "view=matching", loaded: "[data-platform55-governance-summary]", nonhappy: "#catalog-workbench-body .ui-state[data-tone='danger']", nonhappyState: "error" },
  { slug: "index", file: "index.html", kind: "entry", query: "", loaded: "[data-platform55-demo-data]", nonhappy: "#auth-status", nonhappyState: "signed-out" }
]);
const viewports = Object.freeze([[1440, 900], [1024, 768], [390, 844]]);
const sourcePaths = Object.freeze([
  ...routes.map((route) => route.file),
  "src/business-intelligence.js", "src/growth-hacking.js", "src/settings.js", "src/interpretation-memory.js", "src/catalog-workbench.js", "src/landing.js",
  "src/platform55-shell.js", "src/platform55-shell.css", "src/platform55-public-shell.css", "src/platform55-tokens.css", "src/platform55-intelligence-admin.css",
  "tools/platform55-intelligence-admin-evidence-server.mjs", "tools/capture-platform55-intelligence-admin-evidence.mjs"
]);

const subject = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[0-9a-f]{40}$/.test(subject)) throw new Error("A full Git subject SHA is required");
const outputDirectory = resolve(`docs/platform55-evidence/p2-s5/${subject}`);
await mkdir(outputDirectory, { recursive: true });
const server = await startIntelligenceAdminEvidenceServer({ rootDir: process.cwd() });
const browser = await chromium.launch({ executablePath: process.env.RATEWARE_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
const captures = [];

async function stableSamples(page, selector) {
  let prior = null;
  let stable = 0;
  for (let attempt = 0; attempt < 12 && stable < 3; attempt += 1) {
    const box = await page.locator(selector).first().boundingBox();
    const serialized = JSON.stringify(box && Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(value * 100) / 100])));
    stable = serialized === prior ? stable + 1 : 1;
    prior = serialized;
    await page.waitForTimeout(80);
  }
  return stable;
}

try {
  for (const route of routes) {
    for (const state of ["loaded", route.nonhappyState]) {
      for (const [width, height] of viewports) {
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: "reduce" });
        const page = await context.newPage();
        const consoleErrors = [];
        const httpErrors = [];
        const pageErrors = [];
        const requestErrors = [];
        const externalRequests = [];
        page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
        page.on("response", (response) => { if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`); });
        page.on("pageerror", (error) => pageErrors.push(error.message));
        page.on("requestfailed", (request) => requestErrors.push(`${request.url()} ${request.failure()?.errorText || "failed"}`));
        page.on("request", (request) => { if (new URL(request.url()).origin !== server.origin) externalRequests.push(request.url()); });
        const qaState = state === "loaded" ? "loaded" : route.nonhappyState;
        const query = state === "loaded" ? route.query : (route.nonhappyQuery ?? route.query);
        const url = `${server.origin}/${route.file}?qa_state=${qaState}${query ? `&${query}` : ""}`;
        await page.goto(url, { waitUntil: "networkidle" });
        const selector = state === "loaded" ? route.loaded : route.nonhappy;
        const locator = page.locator(selector).first();
        await locator.waitFor({ state: "visible", timeout: 10000 });
        await locator.scrollIntoViewIfNeeded();
        const samples = await stableSamples(page, selector);
        const metrics = await page.evaluate(({ selector: target, kind }) => {
          const rgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
          const luminance = (value) => {
            const channels = rgb(value).map((channel) => { const normalized = channel / 255; return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4; });
            return channels.length === 3 ? (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]) : 0;
          };
          const contrast = (foreground, background) => { const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a); return Math.round(((values[0] + 0.05) / (values[1] + 0.05)) * 1000) / 1000; };
          const node = document.querySelector(target);
          const rect = node?.getBoundingClientRect();
          const horizontal = rect ? Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0)) : 0;
          const vertical = rect ? Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0)) : 0;
          const area = rect ? Math.max(1, rect.width * rect.height) : 1;
          const main = document.querySelector("main");
          const publicHeader = kind === "entry" ? document.querySelector(".landing-nav") : null;
          const brand = publicHeader?.querySelector(".brand-mark") || null;
          const headerStyle = publicHeader ? getComputedStyle(publicHeader) : null;
          const brandStyle = brand ? getComputedStyle(brand) : null;
          const systemStatus = document.querySelector("[data-platform55-system-status] span")?.textContent?.trim() || "";
          return {
            exact_viewport: innerWidth === document.documentElement.clientWidth,
            document_overflow: document.documentElement.scrollWidth > innerWidth + 1,
            content_width_ratio: main ? Math.round((main.getBoundingClientRect().width / innerWidth) * 10000) / 10000 : 0,
            public_header_height_ratio: publicHeader ? Math.round((publicHeader.getBoundingClientRect().height / innerHeight) * 10000) / 10000 : null,
            public_brand_contrast_ratio: brand ? contrast(brandStyle.color, headerStyle.backgroundColor) : null,
            state_visible: Boolean(rect && horizontal > 0 && vertical > 0),
            state_intersection_ratio: Math.round(((horizontal * vertical) / area) * 10000) / 10000,
            state_marker: node?.textContent?.replace(/\s+/g, " ").trim().slice(0, 240) || "",
            active_routes: document.querySelectorAll('[aria-current="page"]').length,
            private_controls: kind === "entry" ? document.querySelectorAll('.rw-sidebar, [data-platform55-tenant-nav], .rw-tenant-switcher').length : 0,
            evidence_summaries: document.querySelectorAll("[data-platform55-evidence-summary]").length,
            governance_summaries: document.querySelectorAll("[data-platform55-governance-summary]").length,
            demo_data_markers: document.querySelectorAll("[data-platform55-demo-data]").length,
            system_status: systemStatus,
            focusable_count: document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])').length,
            reduced_motion: matchMedia("(prefers-reduced-motion: reduce)").matches,
            scroll_x: scrollX,
            overflow_candidates: [...document.querySelectorAll("body *")].map((element) => { const box = element.getBoundingClientRect(); return { tag: element.tagName, id: element.id, className: typeof element.className === "string" ? element.className : "", left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width) }; }).filter((candidate) => candidate.width > 0 && (candidate.left < -1 || candidate.right > innerWidth + 1)).sort((a, b) => b.width - a.width).slice(0, 12)
          };
        }, { selector, kind: route.kind });
        const filename = `${route.slug}-${state}-${width}x${height}.png`;
        const path = resolve(outputDirectory, filename);
        await page.screenshot({ path, fullPage: false, animations: "disabled" });
        const bytes = await readFile(path);
        captures.push({ file: filename, route: route.file, kind: route.kind, shell: route.kind, state, qa_state: qaState, viewport: `${width}x${height}`, source_frame: `${width}x${height}`, canvas_normalized: false, layout_stability_samples: samples, state_selector: selector, console_errors: consoleErrors.length, http_errors: httpErrors.length, page_errors: pageErrors.length, request_errors: requestErrors.length, external_requests: externalRequests.length, ...metrics, byte_length: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
        if (metrics.document_overflow) throw new Error(`${filename} document overflow: ${JSON.stringify(metrics.overflow_candidates)}`);
        if (route.kind === "entry" && (metrics.public_header_height_ratio <= 0 || metrics.public_header_height_ratio > 0.25 || metrics.public_brand_contrast_ratio < 4.5 || metrics.private_controls !== 0 || metrics.demo_data_markers !== 1)) throw new Error(`${filename} entry isolation/composition failure`);
        if (route.kind === "tenant" && (metrics.active_routes !== 1 || /unavailable/i.test(metrics.system_status))) throw new Error(`${filename} tenant shell state failure: ${JSON.stringify({ activeRoutes: metrics.active_routes, status: metrics.system_status })}`);
        if (consoleErrors.length || httpErrors.length || pageErrors.length || requestErrors.length || externalRequests.length) throw new Error(`${filename} browser errors: ${JSON.stringify({ consoleErrors, httpErrors, pageErrors, requestErrors, externalRequests })}`);
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}

const sourceGitBlobs = Object.fromEntries(sourcePaths.map((path) => [path, execFileSync("git", ["rev-parse", `${subject}:${path}`], { encoding: "utf8" }).trim()]));
const manifest = {
  schema_version: 1,
  subject_sha: subject,
  routes: routes.map((route) => route.file),
  states_by_route: Object.fromEntries(routes.map((route) => [route.file, ["loaded", route.nonhappyState]])),
  viewports: viewports.map(([width, height]) => `${width}x${height}`),
  source_git_blobs: sourceGitBlobs,
  capture_policy: "actual routes; deterministic local-only read boundaries; mutations blocked; one fresh context per capture; no external requests",
  captures
};
await writeFile(resolve(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`Captured ${captures.length} actual-route states for ${subject} in ${outputDirectory}\n`);
