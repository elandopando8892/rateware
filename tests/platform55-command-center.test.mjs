import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appHtml = readFileSync("app.html", "utf8");
const dashboardSource = readFileSync("src/dashboard.js", "utf8");
const commandCss = readFileSync("src/platform55-command-center.css", "utf8");

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
