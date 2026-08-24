import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appHtml = readFileSync("app.html", "utf8");
const dashboardSource = readFileSync("src/dashboard.js", "utf8");
const commandCss = readFileSync("src/platform55-command-center.css", "utf8");
const declarationsFor = (source, selector) => {
  const declarations = {};
  let found = false;
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/gs)) {
    const selectors = match[1].split(",").map((value) => value.trim());
    if (!selectors.includes(selector)) continue;
    found = true;
    for (const entry of match[2].split(";").map((value) => value.trim()).filter(Boolean)) {
      const separator = entry.indexOf(":");
      assert.ok(separator > 0, `${selector} contains an invalid declaration`);
      declarations[entry.slice(0, separator).trim()] = entry.slice(separator + 1).trim().replace(/\r\n/g, "\n");
    }
  }
  assert.ok(found, `${selector} must be declared`);
  return declarations;
};
const baseCommandCss = commandCss.split("@media")[0];

for (const id of [
  "next-best-action",
  "priority-queue",
  "business-lifecycle",
  "network-pulse",
  "my-work-list"
]) {
  assert.equal((appHtml.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, `${id} must be unique`);
}

assert.match(appHtml, /class="rw-hero/);
assert.match(appHtml, /class="rw-command-center/);
assert.match(appHtml, /platform55-command-center\.css/);
assert.match(appHtml, /id="next-action-title">Checking today's work/);
assert.match(appHtml, /id="priority-queue"[\s\S]*Loading priorities/);
assert.match(appHtml, /id="my-work-list"[\s\S]*Loading your work/);
assert.match(appHtml, /class="rw-page-actions"/);
assert.match(appHtml, /href="#my-work-title"[\s\S]*Open My Work/);
for (const id of ["next-action-impact", "next-action-due", "next-action-object"]) {
  assert.equal((appHtml.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, `${id} must be unique`);
}
assert.match(appHtml, /class="rw-hero-actions"/);
assert.match(appHtml, /class="rw-hero-metrics"/);
assert.match(appHtml, /Business lifecycle[\s\S]*Current live flow from acquisition to execution\./);
assert.match(appHtml, /id="my-work-title">Today’s operator queue<[\s\S]*>Open workspace</);

for (const renderer of [
  "renderNextBestAction",
  "renderPriorityQueue",
  "renderBusinessLifecycle",
  "renderNetworkPulse",
  "renderMyWork"
]) {
  assert.match(dashboardSource, new RegExp(`function ${renderer}\\(summary\\)`));
}
assert.match(dashboardSource, /function renderHeroDecisionContext\(action\)/);

assert.equal((dashboardSource.match(/callRatewareApi\("dashboard_summary"\)/g) || []).length, 1);
assert.match(dashboardSource, /async function loadDashboard\(\)/);
assert.match(dashboardSource, /requirePrivatePage\(\)/);
assert.match(dashboardSource, /renderDashboardLoading\(\)/);
assert.match(dashboardSource, /renderLoadError\(error\)/);
assert.match(dashboardSource, /data-retry-action="load-dashboard"/);
assert.doesNotMatch(dashboardSource, /insert_approved|send_bid|dispatch_freight|create_award/i);
assert.match(dashboardSource, /class="priority-alert-icon/);
assert.match(dashboardSource, /<rw-icon name="\$\{priorityIcon\(item\.severity\)\}"/);

assert.match(commandCss, /\.rw-command-center/);
assert.match(commandCss, /\.rw-hero/);
assert.match(commandCss, /\.rw-lifecycle/);
assert.match(commandCss, /\.rw-network-pulse/);
assert.match(commandCss, /\.rw-my-work/);
assert.match(commandCss, /\.rw-page-actions/);
assert.match(commandCss, /\.rw-hero-metrics/);
assert.match(commandCss, /\.priority-alert-icon/);
assert.doesNotMatch(commandCss, /\.rw-sidebar|\.rw-topbar|\.rw-nav-link/);

assert.equal((appHtml.match(/<h1\b/g) || []).length, 1, "Command Center must have one H1");
assert.equal((appHtml.match(/<header\b[^>]*class="[^"]*rw-page-header[^"]*"[\s\S]*?<\/header>/g) || []).length, 1);
const pageHeader = appHtml.match(/<header\b[^>]*class="[^"]*rw-page-header[^"]*"[\s\S]*?<\/header>/)?.[0] || "";
assert.ok((pageHeader.match(/<(?:a|button)\b/g) || []).length <= 2, "page header must not exceed two top-level actions");
assert.match(pageHeader, /\bp55-vp-page-header\b/);

const orderedRegions = [
  "id=\"next-best-action\"",
  "class=\"rw-command-priority",
  "id=\"business-lifecycle\"",
  "class=\"rw-my-work",
  "id=\"network-pulse\"",
  "id=\"rate-book-health\"",
  "class=\"rw-command-shortcuts",
];
for (const region of orderedRegions) {
  assert.equal((appHtml.match(new RegExp(region, "g")) || []).length, 1, `${region} must occur once`);
}

for (const panel of ["rw-command-priority", "rw-lifecycle", "rw-my-work", "rw-network-pulse", "rw-command-health", "rw-command-shortcuts"]) {
  assert.match(appHtml, new RegExp(`class="[^"]*${panel}[^"]*\\bp55-vp-workspace-card\\b`), `${panel} must use the shared card primitive`);
}

const center = declarationsFor(baseCommandCss, ".rw-command-center");
assert.equal(center["grid-template-areas"], '"header header"\n    "hero hero"\n    "priority lifecycle"\n    "work pulse"\n    "work health"\n    "shortcuts shortcuts"');
const hero = declarationsFor(baseCommandCss, ".rw-hero");
assert.equal(hero["min-height"], "clamp(200px, 25vh, 248px)");
assert.equal(hero["max-height"], "320px");

for (const selector of [
  ".rw-command-priority",
  ".rw-lifecycle",
  ".rw-network-pulse",
  ".rw-my-work",
  ".rw-command-health",
  ".rw-command-shortcuts",
]) {
  const card = declarationsFor(baseCommandCss, selector);
  assert.equal(card["border-radius"], "14px");
  assert.equal(card["box-shadow"], "var(--rw-shadow-sm)");
}

assert.doesNotMatch(commandCss, /font-size:\s*(?:7|8)px\b/, "operational labels must not fall below the Platform55 readable scale");
assert.equal(declarationsFor(baseCommandCss, ".rw-command-priority .priority-alert > div")["min-width"], "0");
assert.equal(declarationsFor(baseCommandCss, ".rw-command-priority .priority-alert small")["overflow-wrap"], "anywhere");
assert.match(commandCss, /@media\s*\(max-width:\s*1180px\)[\s\S]*?grid-template-areas:\s*"header"\s*"hero"\s*"priority"\s*"lifecycle"\s*"work"\s*"pulse"\s*"health"\s*"shortcuts"/);
assert.match(commandCss, /@media\s*\(max-width:\s*680px\)[\s\S]*?\.rw-hero\s*\{[^}]*max-height:\s*none/);
assert.match(commandCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
