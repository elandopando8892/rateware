import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLATFORM55_ROUTES } from "../src/platform55-shell-model.js";

const TENANT_ROUTES = Object.freeze([
  ["business-intelligence.html", "business-intelligence", "src/business-intelligence.js"],
  ["growth-hacking.html", "growth-hacking", "src/growth-hacking.js"],
  ["settings.html", "settings", "src/settings.js"],
  ["interpretation-memory.html", "interpretation-memory", "src/interpretation-memory.js"],
  ["catalog-workbench.html", "catalog-workbench", "src/catalog-workbench.js"],
]);

const count = (text, pattern) => [...text.matchAll(pattern)].length;
const shellReporter = (text, modulePath) => {
  const match = text.match(/function reportPlatform55State\([^)]*\) \{[\s\S]*?^\}/m);
  assert.ok(match, `${modulePath} must isolate shell-only state reporting`);
  return match[0];
};

for (const [route, pageKey, modulePath] of TENANT_ROUTES) {
  const html = readFileSync(route, "utf8");
  const moduleText = readFileSync(modulePath, "utf8");
  const model = PLATFORM55_ROUTES.find((candidate) => candidate.key === pageKey);
  assert.ok(model, `${route} must have a frozen Platform55 route`);
  assert.equal(model.shell, "tenant", `${route} must remain a tenant-only route`);
  assert.match(html, new RegExp(`<body[^>]*data-platform55-shell=["']tenant["'][^>]*data-platform55-page=["']${pageKey}["']`));
  assert.match(html, /src\/platform55-tokens\.css/);
  assert.match(html, /src\/platform55-shell\.css/);
  assert.match(html, /src\/platform55-intelligence-admin\.css/);
  assert.match(html, /data-platform55-app/);
  assert.match(html, /data-platform55-sidebar/);
  assert.match(html, /data-platform55-topbar/);
  assert.match(html, /data-platform55-page-content/);
  assert.match(html, /data-platform55-page-header/);
  assert.match(html, /data-platform55-breadcrumbs/);
  assert.match(html, /data-platform55-page-title/);
  assert.match(html, /data-platform55-page-subtitle/);
  assert.equal(count(html, /id=["']auth-form["']/g), 1, `${route} must preserve one authenticated shell slot`);
  assert.equal(count(html, /class=["'][^"']*side-nav/g), 0, `${route} must not retain the legacy duplicate sidebar`);
  assert.match(html, new RegExp(`<script[^>]+src=["']\\./${modulePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(moduleText, /updatePlatform55Shell/, `${modulePath} must report page state through the mounted shell`);
  assert.doesNotMatch(
    shellReporter(moduleText, modulePath),
    /\b(fetch|rpc|queue|promote|approve|send|writeback|sync|analy[sz]e)\w*\s*\(/i,
    `${modulePath} shell reporting cannot load, analyze, or mutate data`
  );
}

for (const route of ["business-intelligence.html", "growth-hacking.html"]) {
  const html = readFileSync(route, "utf8");
  assert.match(html, /data-platform55-evidence-summary/);
  assert.match(html, /last successful/i);
  assert.match(html, /data as of/i);
  assert.match(html, /proposal only/i);
  assert.match(html, /confirmation required/i);
}

for (const route of ["settings.html", "interpretation-memory.html", "catalog-workbench.html"]) {
  const html = readFileSync(route, "utf8");
  assert.match(html, /data-platform55-governance-summary/);
  assert.match(html, /read-only/i);
  assert.match(html, /review required|blocked/i);
}

const entry = readFileSync("index.html", "utf8");
const entryModel = PLATFORM55_ROUTES.find((candidate) => candidate.key === "index");
assert.equal(entryModel?.shell, "entry");
assert.match(entry, /<body[^>]*data-platform55-shell=["']entry["'][^>]*data-platform55-page=["']index["']/);
assert.match(entry, /src\/platform55-tokens\.css/);
assert.match(entry, /src\/platform55-public-shell\.css/);
assert.match(entry, /src\/platform55-intelligence-admin\.css/);
assert.match(entry, /data-platform55-entry-app/);
assert.match(entry, /data-platform55-public-context/);
assert.match(entry, /data-platform55-demo-data/);
assert.match(entry, /illustrative preview/i);
assert.match(entry, /no tenant data/i);
assert.equal(/data-platform55-sidebar|data-platform55-topbar|class=["'][^"']*rw-nav-link/.test(entry), false, "public entry cannot expose tenant shell navigation");
assert.equal(count(entry, /id=["']auth-form["']/g), 1);

const css = readFileSync("src/platform55-intelligence-admin.css", "utf8");
assert.match(css, /\.rw-intelligence-admin-page/);
assert.match(css, /\.rw-evidence-card/);
assert.match(css, /\.rw-governance-panel/);
assert.match(css, /\.rw-entry-app/);
assert.equal(/--p55-|#[0-9a-f]{3,8}\b/i.test(css), false, "S5 presentation must consume Platform55 tokens instead of inventing a second palette");
assert.match(
  css,
  /body\[data-platform55-page=["']interpretation-memory["']\]\s+\[data-workbench-view-panel=["']library["']\]\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/s,
  "Memory rule library must contain its wide table within the page"
);
assert.match(
  css,
  /@media\s*\(max-width:\s*900px\)[\s\S]*?\.compact-bulk-toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  "Memory mobile toolbar must collapse to a shrinkable column"
);
assert.match(
  css,
  /@media\s*\(max-width:\s*1200px\)[\s\S]*?\.compact-bulk-toolbar\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  "Memory tablet toolbar must use shrinkable tracks instead of overflowing the document"
);
assert.match(
  css,
  /body\[data-platform55-page=["']catalog-workbench["']\]\s+\[data-workbench-view-panel=["']import["']\]\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/s,
  "Catalog import panel must not inherit the preview table's intrinsic width"
);
assert.match(
  css,
  /body\[data-platform55-page=["']catalog-workbench["']\][\s\S]*?\.catalog-import-preview\s*>\s*\.table-wrap\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/s,
  "Catalog import preview must scroll wide data inside its panel"
);
assert.match(
  css,
  /@media\s*\(max-width:\s*900px\)[\s\S]*?body\[data-platform55-page=["']catalog-workbench["']\]\s+\.catalog-import-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  "Catalog import controls must collapse to one shrinkable column on mobile"
);

const growthCss = readFileSync("src/growth-hacking.css", "utf8");
assert.match(
  growthCss,
  /\.growth-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
  "Growth workspace must allow its grid track to shrink within the mobile viewport"
);
assert.match(
  growthCss,
  /\.growth-workspace\s*>\s*\*\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/s,
  "Growth workspace children must not impose intrinsic document width"
);
assert.match(
  growthCss,
  /\.growth-view\.active\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
  "Active Growth views must shrink their content track within the workspace"
);
assert.match(
  growthCss,
  /\.growth-view\.active\s*>\s*\*\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/s,
  "Active Growth view children must not widen the document"
);
assert.match(
  growthCss,
  /@media\s*\(max-width:\s*820px\)[\s\S]*?\.growth-metric-strip\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  "Growth mobile metrics must use shrinkable columns instead of a 400px intrinsic minimum"
);

const tenantModuleText = TENANT_ROUTES.map(([, , modulePath]) => readFileSync(modulePath, "utf8")).join("\n");
assert.equal(/mountPlatform55Shell\s*\(/.test(tenantModuleText), false, "page modules must not mount a second tenant shell");

console.log("Platform55 intelligence/admin shell adoption contract passed.");
