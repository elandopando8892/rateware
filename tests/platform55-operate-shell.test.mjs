import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizePlatform55PageState, platform55BreadcrumbText } from "../src/platform55-shell.js";

const operateCss = readFileSync("src/platform55-operate.css", "utf8");
const operatePrimitives = [
  "rw-operate-page",
  "rw-operate-heading",
  "rw-operate-metrics",
  "rw-operate-filters",
  "rw-operate-panel",
  "rw-operate-empty",
  "rw-operate-validation",
  "rw-operate-review-state",
  "rw-operate-table-scroll"
];

for (const primitive of operatePrimitives) {
  assert.match(operateCss, new RegExp(`\\.${primitive}\\b`), `${primitive} must be reusable`);
}
assert.doesNotMatch(operateCss, /\.rw-(?:sidebar|topbar|nav-link|nav-scrim)\b/);
assert.doesNotMatch(operateCss, /#[0-9a-f]{3,8}\b|rgba?\s*\(/i);
assert.match(operateCss, /@media\s*\(max-width:\s*900px\)/i);
assert.match(operateCss, /\.rw-operate-table-scroll\s*\{[^}]*overflow-x:\s*auto/s);
assert.match(
  operateCss,
  /\.rw-operate-panel\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
  "Operate panels must keep wide data tables inside a zero-minimum grid track"
);
assert.match(
  operateCss,
  /@media\s*\(max-width:\s*900px\)[\s\S]*?\.rw-operate-page\.upload-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
  "Upload Center must collapse its desktop two-column grid at the mobile breakpoint"
);

const normalizedPageState = normalizePlatform55PageState({
  title: "Source <Files>",
  subtitle: "Last successful result",
  breadcrumbs: ["Operate", "Source Files"],
  status: "Loaded",
  busy: true,
  actions: [{ id: "refresh", label: "Refresh", status: "ready", busy: false }]
}, { allowedActionIds: ["refresh"] });
assert.equal(normalizedPageState.title, "Source <Files>");
assert.deepEqual(normalizedPageState.breadcrumbs, ["Operate", "Source Files"]);
assert.equal(
  platform55BreadcrumbText(normalizedPageState.breadcrumbs),
  "Operate · Source Files",
  "Visible breadcrumbs must preserve a readable separator"
);
assert.equal(normalizedPageState.busy, true);
assert.ok(Object.isFrozen(normalizedPageState));
assert.ok(Object.isFrozen(normalizedPageState.actions));
assert.throws(
  () => normalizePlatform55PageState({ actions: [{ id: "approve-all", label: "Approve all" }] }, { allowedActionIds: ["refresh"] }),
  /Unknown Platform55 page action/
);
assert.throws(
  () => normalizePlatform55PageState({ actions: [{ id: "refresh", label: "Refresh", run() {} }] }, { allowedActionIds: ["refresh"] }),
  /descriptor keys/
);

const pages = Object.freeze([
  Object.freeze({
    file: "upload-center.html",
    key: "upload-center",
    script: "src/upload-center.js",
    ids: ["auth-form", "file-input", "upload-form", "status-message"]
  }),
  Object.freeze({
    file: "upload-history.html",
    key: "upload-history",
    script: "src/upload-history.js",
    ids: ["auth-form", "history-body", "refresh-button", "status-filter"]
  }),
  Object.freeze({
    file: "staging-review.html",
    key: "staging-review",
    script: "src/staging-review.js",
    ids: ["auth-form", "staging-body", "bulk-approve-button", "staging-status-filter"]
  }),
  Object.freeze({
    file: "rateware.html",
    key: "rateware",
    script: "src/rateware.js",
    ids: ["auth-form", "rateware-body", "rateware-search", "export-filtered-button"]
  })
]);

assert.equal(pages.length, 4, "The Operate adoption contract must stay limited to four routes");

for (const page of pages) {
  const html = readFileSync(page.file, "utf8");
  const source = readFileSync(page.script, "utf8");

  assert.equal(
    (html.match(/data-platform55-shell="tenant"/g) || []).length,
    1,
    `${page.file} must adopt the tenant shell exactly once`
  );
  assert.equal(
    (html.match(new RegExp(`data-platform55-page="${page.key}"`, "g")) || []).length,
    1,
    `${page.file} must publish its canonical route key exactly once`
  );
  assert.equal(
    (html.match(/platform55-shell\.css/g) || []).length,
    1,
    `${page.file} must include the shared shell module exactly once`
  );
  assert.equal(
    (html.match(/platform55-operate\.css/g) || []).length,
    1,
    `${page.file} must include the Operate composition module exactly once`
  );
  assert.equal((html.match(/<main\b/g) || []).length, 1, `${page.file} must expose one main landmark`);
  assert.equal((html.match(/data-platform55-app(?:\s|>)/g) || []).length, 1, `${page.file} must expose one shell app host`);
  assert.equal((html.match(/data-platform55-sidebar(?:\s|>)/g) || []).length, 1, `${page.file} must expose one shell sidebar host`);
  assert.equal((html.match(/data-platform55-topbar(?:\s|>)/g) || []).length, 1, `${page.file} must expose one shell topbar host`);
  assert.equal((html.match(/data-platform55-page-content(?:\s|>)/g) || []).length, 1, `${page.file} must expose one page-content slot`);

  assert.doesNotMatch(html, /class="[^"]*\b(?:shell-layout|side-nav|mobile-topbar|nav-groups)\b/);
  assert.doesNotMatch(html, /<nav[^>]+aria-label="Rateware modules"/i);
  const escapedScript = page.script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(html, new RegExp(`<script[^>]+src="\\./${escapedScript}"`));
  assert.match(source, /import\s*\{[^}]*initAuthControls[^}]*\}\s*from\s*["']\.\/auth\.js["']/s);
  assert.match(source, /initAuthControls\s*\(/);

  for (const id of page.ids) {
    assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, `${page.file} must preserve #${id}`);
  }
}

const uploadCenterSource = `${readFileSync("upload-center.html", "utf8")}\n${readFileSync("src/upload-center.js", "utf8")}`;
const stagingReviewSource = `${readFileSync("staging-review.html", "utf8")}\n${readFileSync("src/staging-review.js", "utf8")}`;
const ratewareSource = `${readFileSync("rateware.html", "utf8")}\n${readFileSync("src/rateware.js", "utf8")}`;

assert.match(stagingReviewSource, /pending_review/i);
assert.doesNotMatch(stagingReviewSource, /auto(?:matic)?[_-]?approve/i);
assert.match(uploadCenterSource, /source_file|source_filename/i);
assert.match(ratewareSource, /approved/i);

console.log("Platform55 Operate shell contract passed.");
