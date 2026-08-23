import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startNetworkServiceEvidenceServer } from "./platform55-network-service-evidence-server.mjs";

const require = createRequire(import.meta.url);
const playwrightModule = process.env.RATEWARE_PLAYWRIGHT_MODULE || "playwright";
const { chromium } = require(playwrightModule);

const routes = Object.freeze([
  { slug: "shipper-crm", file: "shipper-crm.html", kind: "tenant", loaded: "#shipper-table-body [data-open-shipper]", nonhappy: "#shipper-directory-status[data-tone='error']", nonhappyState: "error" },
  { slug: "shipper-profile", file: "shipper-profile.html", kind: "public", loaded: "#shipper-profile-form", nonhappy: "[data-platform55-public-state][data-state='signed-out']", nonhappyState: "signed-out" },
  { slug: "vendor-support", file: "vendor-support.html", kind: "tenant", loaded: "#support-ticket-body [data-support-ticket-id]", nonhappy: "#support-ticket-body .error-state", nonhappyState: "error" },
  { slug: "vendor-improvement", file: "vendor-improvement.html", kind: "tenant", loaded: "#ci-case-body [data-ci-case-id]", nonhappy: "#ci-case-body .error-state", nonhappyState: "error" },
  { slug: "provider-service", file: "provider-service.html", kind: "tenant", loaded: "#provider-service-rows [data-provider-vendor]", nonhappy: "#provider-service-rows .ui-state-error", nonhappyState: "error" },
  { slug: "provider-onboarding", file: "provider-onboarding.html", kind: "tenant", loaded: "#onboarding-rows [data-case-id]", nonhappy: "#onboarding-rows .ui-state-error", nonhappyState: "error" },
  { slug: "provider-gmail", file: "provider-gmail.html", kind: "tenant", loaded: "#provider-gmail-connection-state", loadedText: "watching", nonhappy: "#provider-gmail-status-message[data-tone='error']", nonhappyState: "error" },
  { slug: "provider-communications", file: "provider-communications.html", kind: "tenant", loaded: "#communications-rows [data-communication-thread]", nonhappy: "#communications-rows .ui-state-error", nonhappyState: "error" }
]);
const viewports = Object.freeze([[1440, 900], [1024, 768], [390, 844]]);
const sourcePaths = Object.freeze([
  ...routes.map((route) => route.file),
  "src/shippers.js", "src/shipper-profile.js", "src/vendor-support.js", "src/vendor-improvement.js",
  "src/provider-service-page.js", "src/provider-onboarding-page.js", "src/provider-gmail-page.js", "src/provider-communications-page.js",
  "src/platform55-shell.js", "src/platform55-shell.css", "src/platform55-network-service.css", "src/platform55-public-shell.css",
  "tools/platform55-network-service-evidence-server.mjs"
]);

const subject = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[0-9a-f]{40}$/.test(subject)) throw new Error("A full Git subject SHA is required");
const outputDirectory = resolve(`docs/platform55-evidence/p2-s4/${subject}`);
await mkdir(outputDirectory, { recursive: true });
const server = await startNetworkServiceEvidenceServer({ rootDir: process.cwd() });
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
        page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
        page.on("response", (response) => { if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`); });
        page.on("pageerror", (error) => pageErrors.push(error.message));
        page.on("requestfailed", (request) => requestErrors.push(`${request.url()} ${request.failure()?.errorText || "failed"}`));
        const qaState = state === "loaded" ? "loaded" : route.nonhappyState === "signed-out" ? "loaded" : "error";
        const token = route.slug === "shipper-profile" && state === "loaded" ? "&token=qa-token" : "";
        const url = `${server.origin}/${route.file}?qa_state=${qaState}${token}`;
        await page.goto(url, { waitUntil: "networkidle" });
        const selector = state === "loaded" ? route.loaded : route.nonhappy;
        const locator = page.locator(selector).first();
        await locator.waitFor({ state: "visible", timeout: 10000 });
        if (state === "loaded" && route.loadedText) await page.waitForFunction(({ selector: target, text }) => document.querySelector(target)?.textContent?.toLowerCase().includes(text), { selector, text: route.loadedText });
        await locator.scrollIntoViewIfNeeded();
        const samples = await stableSamples(page, selector);
        const metrics = await page.evaluate(({ selector: target, kind }) => {
          const node = document.querySelector(target);
          const rect = node?.getBoundingClientRect();
          const horizontal = rect ? Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0)) : 0;
          const vertical = rect ? Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0)) : 0;
          const area = rect ? Math.max(1, rect.width * rect.height) : 1;
          const main = document.querySelector(".rw-main, main");
          return {
            exact_viewport: innerWidth === document.documentElement.clientWidth,
            document_overflow: document.documentElement.scrollWidth > innerWidth + 1,
            content_width_ratio: main ? Math.round((main.getBoundingClientRect().width / innerWidth) * 10000) / 10000 : 0,
            state_visible: Boolean(rect && horizontal > 0 && vertical > 0),
            state_intersection_ratio: Math.round(((horizontal * vertical) / area) * 10000) / 10000,
            state_marker: node?.textContent?.replace(/\s+/g, " ").trim().slice(0, 240) || "",
            active_routes: document.querySelectorAll('[aria-current="page"]').length,
            private_controls: kind === "public" ? document.querySelectorAll('.rw-sidebar, [data-platform55-tenant-nav], .rw-tenant-switcher').length : 0,
            focusable_count: document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])').length,
            reduced_motion: matchMedia("(prefers-reduced-motion: reduce)").matches,
            scroll_x: scrollX,
            overflow_candidates: [...document.querySelectorAll("body *")].map((element) => {
              const candidate = element.getBoundingClientRect();
              return { tag: element.tagName, id: element.id, className: typeof element.className === "string" ? element.className : "", left: Math.round(candidate.left), right: Math.round(candidate.right), width: Math.round(candidate.width) };
            }).filter((candidate) => candidate.width > 0 && (candidate.left < -1 || candidate.right > innerWidth + 1)).sort((left, right) => right.width - left.width).slice(0, 12)
          };
        }, { selector, kind: route.kind });
        const filename = `${route.slug}-${state}-${width}x${height}.png`;
        const path = resolve(outputDirectory, filename);
        await page.screenshot({ path, fullPage: false, animations: "disabled" });
        const bytes = await readFile(path);
        captures.push({
          file: filename, route: route.file, kind: route.kind, shell: route.kind, state, qa_state: qaState, viewport: `${width}x${height}`,
          source_frame: `${width}x${height}`, canvas_normalized: false, layout_stability_samples: samples, state_selector: selector,
          console_errors: consoleErrors.length, http_errors: httpErrors.length, page_errors: pageErrors.length, request_errors: requestErrors.length,
          ...metrics, byte_length: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex")
        });
        if (metrics.document_overflow) throw new Error(`${filename} document overflow: ${JSON.stringify(metrics.overflow_candidates)}`);
        if (consoleErrors.length || httpErrors.length || pageErrors.length || requestErrors.length) throw new Error(`${filename} browser errors: ${JSON.stringify({ consoleErrors, httpErrors, pageErrors, requestErrors })}`);
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
  capture_policy: "actual routes; deterministic read-only boundaries; one fresh context per capture; no external requests",
  captures
};
await writeFile(resolve(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`Captured ${captures.length} actual-route states for ${subject} in ${outputDirectory}\n`);
