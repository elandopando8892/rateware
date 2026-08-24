import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readOrEmpty = async (path) => read(path).catch(() => "");
const elementIds = (source) => [...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]).sort();
const digest = (values) => createHash("sha256").update(values.join("\n")).digest("hex");
const stylesheetHrefs = (source) => [...source.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g)].map((match) => match[1]);
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const declarationsFor = (source, selector) => {
  const match = source.match(new RegExp(`${escaped(selector)}\\s*\\{([^}]*)\\}`, "s"));
  assert.ok(match, `${selector} must be declared`);
  return Object.fromEntries(match[1]
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(":");
      assert.ok(separator > 0, `${selector} contains an invalid declaration: ${entry}`);
      return [entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()];
    }));
};
const atRuleBody = (source, header) => {
  const start = source.indexOf(header);
  assert.ok(start >= 0, `${header} must be declared`);
  const open = source.indexOf("{", start + header.length);
  assert.ok(open >= 0, `${header} must have a block`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  assert.fail(`${header} must have a closing brace`);
};

test("P3-V1 preserves every Command Center and Rateware controller ID", async () => {
  const appIds = elementIds(await read("app.html"));
  const ratewareIds = elementIds(await read("rateware.html"));
  assert.equal(appIds.length, 44);
  assert.equal(digest(appIds), "fcaa78738a356af3018afcb451d63aa5e59adc82bdc88b7585b80c68389466bd");
  assert.equal(ratewareIds.length, 76);
  assert.equal(digest(ratewareIds), "e93d0d56c98ab5fde3c7eb9f33884e6b31d8135563dbc60e9e8d64df33000a35");
});

test("both P3-V1 routes load the shared interior layer after their family stylesheet", async () => {
  const cases = [
    ["app.html", "./src/platform55-command-center.css"],
    ["rateware.html", "./src/platform55-operate.css"],
  ];
  for (const [path, familyStylesheet] of cases) {
    const source = await read(path);
    const stylesheets = stylesheetHrefs(source);
    const familyIndex = stylesheets.indexOf(familyStylesheet);
    const parityIndex = stylesheets.indexOf("./src/platform55-visual-parity.css");
    assert.ok(familyIndex >= 0, `${path} is missing ${familyStylesheet}`);
    assert.ok(parityIndex > familyIndex, `${path} must load visual parity after its family stylesheet`);
    assert.match(source, /class="[^"]*\bp55-vp-page\b[^"]*"[^>]*data-platform55-page-content/);
  }
});

test("the shared layer exposes the complete route-neutral primitive API", async () => {
  const source = await readOrEmpty("src/platform55-visual-parity.css");
  const selectors = [
    ".p55-vp-page",
    ".p55-vp-page-header",
    ".p55-vp-context-banner",
    ".p55-vp-context-banner__icon",
    ".p55-vp-context-banner__copy",
    ".p55-vp-metric-grid",
    ".p55-vp-metric",
    ".p55-vp-tabs",
    ".p55-vp-toolbar-card",
    ".p55-vp-workspace-card",
    ".p55-vp-workspace-header",
    ".p55-vp-bulk-surface",
    ".p55-vp-pagination",
    ".p55-vp-helper-strip",
    ".p55-vp-table-shell",
    ".p55-vp-secondary-tools",
    ".p55-vp-boundary-note",
  ];
  for (const selector of selectors) {
    assert.match(source, new RegExp(`${selector.replaceAll(".", "\\.")}\\s*(?:,|\\{)`), `${selector} must be declared`);
  }
});

test("the shared layer uses Platform 55 tokens and contains its responsive behavior", async () => {
  const source = await readOrEmpty("src/platform55-visual-parity.css");
  assert.doesNotMatch(source, /!important/);
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(source, /\b(?:rgb|hsl)a?\(/i);
  assert.match(source, /var\(--rw-slate-200\)/);
  assert.match(source, /var\(--rw-shadow-sm\)/);
  assert.match(source, /@media\s*\(max-width:\s*1100px\)/);
  assert.match(source, /@media\s*\(max-width:\s*680px\)/);
  assert.match(source, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test("the page and workspace primitives constrain width, metrics, and table overflow", async () => {
  const source = await readOrEmpty("src/platform55-visual-parity.css");
  assert.match(source, /\.p55-vp-page\s*\{[^}]*width:\s*min\(100%,\s*1480px\)[^}]*margin-inline:\s*auto[^}]*display:\s*grid/s);
  assert.match(source, /\.p55-vp-metric-grid\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(source, /\.p55-vp-table-shell\s*\{[^}]*min-width:\s*0[^}]*overflow-x:\s*auto[^}]*overscroll-behavior-inline:\s*contain/s);
  assert.match(source, /@media\s*\(max-width:\s*680px\)[\s\S]*?\.p55-vp-metric-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test("Rateware exposes the governed-operations composition in semantic order", async () => {
  const source = await read("rateware.html");
  const hooks = [
    "data-platform55-page-header",
    "data-p55-vp-context-banner",
    "data-p55-vp-metrics",
    "data-p55-vp-filters",
    "data-p55-vp-bulk-actions",
    "data-p55-vp-pagination",
    "data-p55-vp-helper",
    "data-p55-vp-table",
  ];
  let cursor = -1;
  for (const hook of hooks) {
    const matches = [...source.matchAll(new RegExp(`\\b${hook}\\b`, "g"))];
    assert.equal(matches.length, 1, `${hook} must occur exactly once`);
    assert.ok(matches[0].index > cursor, `${hook} must follow the prior governed-operation region`);
    cursor = matches[0].index;
  }
});

test("Rateware keeps one primary heading/action and every existing workspace surface", async () => {
  const source = await read("rateware.html");
  assert.equal([...source.matchAll(/<h1\b/g)].length, 1);
  assert.equal([...source.matchAll(/class="[^"]*\bpage-primary-action\b[^"]*"/g)].length, 1);
  assert.match(source, /data-click-target="#export-filtered-button"/);
  assert.equal([...source.matchAll(/id="rateware-metric-(?:total|vendors|markets|average|validation)"/g)].length, 5);
  assert.equal([...source.matchAll(/data-rateware-filter=/g)].length, 6);
  assert.equal([...source.matchAll(/<table\b[^>]*class="rateware-table"/g)].length, 1);
  assert.equal([...source.matchAll(/id="rateware-drawer"/g)].length, 1);
  assert.equal([...source.matchAll(/id="rateware-bulk-drawer"/g)].length, 1);
  assert.match(source, /Approved-rate workspace/);
  assert.match(source, /Return-to-staging, bulk changes, exports, and lifecycle actions remain explicit controlled operations\./);
});

test("Rateware desktop fidelity reserves hierarchy and contains wide controls", async () => {
  const source = await read("src/platform55-operate.css");
  assert.deepEqual(declarationsFor(source, ".p55-vp-page--governed-operations .rateware-workspace"), {
    display: "grid",
    "min-width": "0",
    overflow: "clip",
  });

  const header = declarationsFor(source, ".p55-vp-page--governed-operations .workbench-header");
  assert.equal(header.display, "grid");
  assert.equal(header["grid-template-columns"], "minmax(180px, 0.7fr) minmax(0, 2.3fr)");
  assert.equal(header["min-height"], "139px");

  const metrics = declarationsFor(source, ".p55-vp-page--governed-operations .rateware-summary-strip");
  assert.equal(metrics["grid-template-columns"], "repeat(5, minmax(0, 1fr))");

  const commands = declarationsFor(source, ".p55-vp-page--governed-operations .rateware-command-bar");
  assert.equal(commands["grid-template-columns"], "minmax(0, 1fr)");
  assert.equal(commands["min-height"], "111px");
  assert.equal(commands.background, "var(--rw-slate-50)");

  const toolbar = declarationsFor(source, ".p55-vp-page--governed-operations .rateware-main-toolbar");
  assert.equal(toolbar.display, "grid");
  assert.equal(toolbar["grid-template-columns"], "minmax(240px, 2fr) repeat(2, minmax(150px, 1fr)) auto auto auto");

  const bulk = declarationsFor(source, ".p55-vp-page--governed-operations .bulk-action-bar");
  assert.equal(bulk["overflow-x"], "auto");
  assert.equal(bulk["overscroll-behavior-inline"], "contain");

  const table = declarationsFor(source, ".p55-vp-page--governed-operations .rw-operate-table-scroll");
  assert.equal(table.width, "100%");
  assert.equal(table["max-width"], "100%");
  assert.equal(table["overflow-x"], "auto");
});

test("Rateware mobile fidelity preserves primary actions and internal overflow", async () => {
  const source = await read("src/platform55-operate.css");
  const css = atRuleBody(source, "@media (max-width: 680px)");

  const metrics = declarationsFor(css, ".p55-vp-page--governed-operations .rateware-summary-strip");
  assert.equal(metrics["grid-template-columns"], "repeat(2, minmax(0, 1fr))");
  const lastMetric = declarationsFor(css, ".p55-vp-page--governed-operations .rateware-summary-strip > article:last-child");
  assert.equal(lastMetric["grid-column"], "1 / -1");

  const filters = declarationsFor(css, ".p55-vp-page--governed-operations .rateware-view-tabs");
  assert.equal(filters["overflow-x"], "auto");
  assert.equal(filters["flex-wrap"], "nowrap");

  const toolbar = declarationsFor(css, ".p55-vp-page--governed-operations .rateware-main-toolbar");
  assert.equal(toolbar["grid-template-columns"], "repeat(2, minmax(0, 1fr))");
  const search = declarationsFor(css, ".p55-vp-page--governed-operations .rateware-main-toolbar > label:first-child");
  assert.equal(search["grid-column"], "1 / -1");

  const bulk = declarationsFor(css, ".p55-vp-page--governed-operations .bulk-action-bar");
  assert.equal(bulk["max-width"], "100%");
  assert.equal(bulk["overflow-x"], "auto");

  const pagination = declarationsFor(css, ".p55-vp-page--governed-operations .sheet-pagination-bar");
  assert.equal(pagination.display, "grid");
  assert.equal(pagination["grid-template-columns"], "minmax(0, 1fr)");
  assert.equal(pagination["white-space"], "normal");

  const paginationControls = declarationsFor(css, ".p55-vp-page--governed-operations .sheet-pagination-controls");
  assert.equal(paginationControls.display, "grid");
  assert.equal(paginationControls["grid-template-columns"], "repeat(2, minmax(0, 1fr))");
  assert.equal(paginationControls.width, "100%");

  const helper = declarationsFor(css, ".p55-vp-page--governed-operations .sheet-helper-strip");
  assert.equal(helper["align-items"], "stretch");
  assert.equal(helper["flex-direction"], "column");
  assert.equal(helper["white-space"], "normal");

  const issueNav = declarationsFor(css, ".p55-vp-page--governed-operations .sheet-issue-nav");
  assert.equal(issueNav.display, "grid");
  assert.equal(issueNav["grid-template-columns"], "repeat(2, minmax(0, 1fr))");
  assert.equal(issueNav.width, "100%");

  const table = declarationsFor(css, ".p55-vp-page--governed-operations .rw-operate-table-scroll");
  assert.equal(table["overflow-x"], "auto");
});

test("Rateware fidelity keeps secondary actions disclosed and never hides focused controls", async () => {
  const html = await read("rateware.html");
  const source = `${await read("src/platform55-operate.css")}\n${await read("src/platform55-visual-parity.css")}`;
  const moreActions = html.match(/<details\b[^>]*class="[^"]*sheet-more-actions[^"]*"[\s\S]*?<\/details>/);
  assert.ok(moreActions, "secondary lifecycle and export actions must remain in details.sheet-more-actions");
  for (const id of [
    "return-selected-button",
    "export-selected-button",
    "archive-filtered-rateware",
    "remove-filtered-rateware",
  ]) assert.match(moreActions[0], new RegExp(`id="${id}"`));
  assert.match(source, /\.p55-vp-page\s+:where\([^)]*button[^)]*\):focus-visible\s*\{[^}]*outline:/s);
  assert.match(source, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(source, /:focus(?:-visible)?[^,{]*[,\s][^{]*\{[^}]*(?:display\s*:\s*none|visibility\s*:\s*hidden)/s);
  assert.doesNotMatch(source, /\.p55-vp-context-banner[^,{]*\{[^}]*(?:display\s*:\s*none|visibility\s*:\s*hidden)/s);
});
