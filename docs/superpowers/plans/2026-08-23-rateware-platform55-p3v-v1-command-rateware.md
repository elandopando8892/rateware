# Platform 55 P3-V1 Command Center and Rateware Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the reusable Platform 55 page-interior system by bringing `app.html` and `rateware.html` to accepted visual parity without changing business behavior or production boundaries.

**Architecture:** Add a pure fail-closed visual contract and shared interior CSS layer. Keep `dashboard.js` and `rateware.js` authoritative; only add semantic presentation hooks and safe DOM grouping around existing controls. Certify both routes in deterministic local read-only fixtures at three viewports, then bind scores and evidence to immutable Git objects before independent review.

**Tech Stack:** Static HTML, CSS custom properties, JavaScript ES modules, Node.js test runner, Playwright through `RATEWARE_PLAYWRIGHT_MODULE`, existing Platform 55 QA servers and accessibility helpers, SHA-256 evidence manifests.

**Spec:** `docs/superpowers/specs/2026-08-23-rateware-platform55-visual-parity-design.md`

## Global Constraints

- Work only in the isolated P3-V worktree and preserve the primary dirty checkout.
- Use `apply_patch` for source and documentation edits.
- Do not change `src/dashboard.js`, `src/rateware.js`, service modules, authentication, APIs, Supabase, migrations, secrets, CORS, tenant enforcement, production data, approval behavior, exports, or mutations unless a failing regression proves a presentation adapter is unavoidable. If that happens, stop and revise this plan before editing the controller.
- Preserve the exact 44-ID set in `app.html`: count `44`, sorted-ID SHA-256 `fcaa78738a356af3018afcb451d63aa5e59adc82bdc88b7585b80c68389466bd`.
- Preserve the exact 76-ID set in `rateware.html`: count `76`, sorted-ID SHA-256 `e93d0d56c98ab5fde3c7eb9f33884e6b31d8135563dbc60e9e8d64df33000a35`.
- Preserve every `data-click-target`, `data-rateware-filter`, `data-platform55-action`, form control name, table `data-col`, and drawer relationship.
- Keep the approved-rate boundary explicit: source data enters `rate_staging`, human approval precedes production insertion, and P3-V performs no approval or write.
- The product commit, evidence commit, accreditation commit, and independent reviews are separate immutable stages. Never edit evidence to follow a rewritten product SHA.
- No route can be marked `accepted` from CSS import, screenshots alone, an average score that hides a weak dimension, or a reviewer statement that is not bound to exact Git evidence.

---

### Task 1: Build the Fail-Closed Visual Parity Contract

**Files:**
- Create: `tools/platform55-visual-parity-contract.mjs`
- Create: `tests/platform55-visual-parity-contract.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing contract tests**

Create `tests/platform55-visual-parity-contract.test.mjs` with these public imports and adversarial cases:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  P3V_DIMENSIONS,
  P3V_VIEWPORTS,
  evaluateVisualParityScore,
  parseRouteMatrix,
  validateRouteMatrix,
} from "../tools/platform55-visual-parity-contract.mjs";

const root = new URL("../", import.meta.url);

test("the canonical board contains exactly 29 unique routes", async () => {
  const text = await readFile(new URL("docs/platform55-visual-parity/p3v-route-matrix.csv", root), "utf8");
  const rows = parseRouteMatrix(text);
  assert.equal(rows.length, 29);
  assert.equal(new Set(rows.map((row) => row.route)).size, 29);
  assert.deepEqual(validateRouteMatrix(rows), { ok: true, errors: [] });
});

test("a route needs 90 points, every dimension at 80 percent, all viewports, and GO", () => {
  const accepted = evaluateVisualParityScore({
    dimensions: {
      shell_frame: 19,
      interior_hierarchy: 23,
      visual_system: 18,
      components_states: 18,
      responsive_accessibility: 14,
    },
    viewports: P3V_VIEWPORTS,
    states: ["loaded", "error"],
    required_states: ["loaded", "error"],
    reviewer_verdict: "GO",
    reference_sha256: "a".repeat(64),
    screenshot_sha256: "b".repeat(64),
    candidate_sha: "c".repeat(40),
  });
  assert.equal(accepted.total, 92);
  assert.equal(accepted.status, "accepted");

  for (const mutation of [
    { dimensions: { ...accepted.dimensions, shell_frame: 15 } },
    { dimensions: { ...accepted.dimensions, interior_hierarchy: 20 }, reviewer_verdict: "NO-GO" },
    { dimensions: accepted.dimensions, viewports: [[1440, 900], [1024, 768]] },
    { dimensions: accepted.dimensions, states: ["loaded"] },
    { dimensions: accepted.dimensions, reference_sha256: "source://rateware/example.png" },
  ]) {
    assert.notEqual(evaluateVisualParityScore({
      ...accepted,
      required_states: ["loaded", "error"],
      reviewer_verdict: "GO",
      reference_sha256: "a".repeat(64),
      screenshot_sha256: "b".repeat(64),
      candidate_sha: "c".repeat(40),
      ...mutation,
    }).status, "accepted");
  }
});

test("the weights are exact and immutable", () => {
  assert.deepEqual(P3V_DIMENSIONS, Object.freeze({
    shell_frame: 20,
    interior_hierarchy: 25,
    visual_system: 20,
    components_states: 20,
    responsive_accessibility: 15,
  }));
});
```

Add further tests for duplicate routes, missing routes, unknown waves/statuses/access models, absolute paths, parent traversal, missing in-repo files, duplicate viewports, malformed SHA values, `NaN`, strings/booleans as points, points over a dimension maximum, and total score over `100`.

- [ ] **Step 2: Run the test to prove RED**

Run:

```powershell
node --test tests/platform55-visual-parity-contract.test.mjs
```

Expected: fail with `ERR_MODULE_NOT_FOUND` for `tools/platform55-visual-parity-contract.mjs`.

- [ ] **Step 3: Implement the pure contract module**

Create `tools/platform55-visual-parity-contract.mjs` with this API and closed vocabularies:

```js
import { existsSync, statSync } from "node:fs";
import { isAbsolute, resolve, relative, sep } from "node:path";

export const P3V_DIMENSIONS = Object.freeze({
  shell_frame: 20,
  interior_hierarchy: 25,
  visual_system: 20,
  components_states: 20,
  responsive_accessibility: 15,
});
export const P3V_VIEWPORTS = Object.freeze([[1440, 900], [1024, 768], [390, 844]]);

const ROUTES = new Set([
  "app.html", "upload-center.html", "upload-history.html", "staging-review.html", "rateware.html",
  "business-intelligence.html", "growth-hacking.html", "vendors.html", "shipper-crm.html",
  "rfx-process.html", "rfx-events.html", "ratebook.html", "outreach.html", "vendor-support.html",
  "vendor-improvement.html", "provider-service.html", "provider-onboarding.html", "provider-gmail.html",
  "provider-communications.html", "settings.html", "interpretation-memory.html", "catalog-workbench.html",
  "bid-room-board.html", "carrier-profile.html", "customer-rfi.html", "index.html",
  "ratebook-carrier.html", "rfx-bid.html", "shipper-profile.html",
]);
const ACCESS = new Set(["authenticated", "public", "public_entry"]);
const WAVES = new Set(["P3-V1", "P3-V2", "P3-V3", "P3-V4", "P3-V5"]);
const PARITY = new Set(["unscored", "low", "partial", "blocked", "accepted"]);
const VERIFICATION = new Set(["unverified", "blocked", "reviewed", "accepted"]);
const MATRIX_FIELDS = Object.freeze([
  "route", "page_key", "access", "family", "visual_archetype", "primary_reference",
  "secondary_reference", "current_baseline", "parity_status", "gap_summary", "p3v_wave", "verification",
]);

function finiteInteger(value) {
  return Number.isInteger(value) && Number.isFinite(value);
}

function sha(value, length) {
  return typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`, "i").test(value);
}

export function parseRouteMatrix(text) {
  if (typeof text !== "string" || !text.trim()) throw new TypeError("route matrix must be non-empty text");
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      if (field) throw new Error("quote must start at beginning of CSV field");
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("unterminated quoted CSV field");
  if (field || record.length) {
    record.push(field.replace(/\r$/, ""));
    records.push(record);
  }
  const [header, ...rows] = records.filter((cells) => cells.some((cell) => cell !== ""));
  if (!header || JSON.stringify(header) !== JSON.stringify(MATRIX_FIELDS)) throw new Error("unexpected route matrix header");
  return rows.map((cells, rowIndex) => {
    if (cells.length !== header.length) throw new Error(`ragged CSV row ${rowIndex + 2}`);
    return Object.freeze(Object.fromEntries(header.map((name, columnIndex) => [name, cells[columnIndex]])));
  });
}

export function validateRouteMatrix(rows, { rootDir = process.cwd() } = {}) {
  const errors = [];
  const root = resolve(rootDir);
  const routeCounts = new Map();
  const pageKeys = new Set();
  const inside = (candidate) => {
    const path = relative(root, candidate);
    return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
  };
  if (!Array.isArray(rows) || rows.length !== ROUTES.size) errors.push("routes:count");
  for (const [index, row] of (Array.isArray(rows) ? rows : []).entries()) {
    const label = `row:${index + 2}`;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push(`${label}:object`);
      continue;
    }
    routeCounts.set(row.route, (routeCounts.get(row.route) || 0) + 1);
    if (!ROUTES.has(row.route)) errors.push(`${label}:route`);
    if (!row.page_key || pageKeys.has(row.page_key)) errors.push(`${label}:page_key`);
    pageKeys.add(row.page_key);
    if (!ACCESS.has(row.access)) errors.push(`${label}:access`);
    if (!WAVES.has(row.p3v_wave)) errors.push(`${label}:wave`);
    if (!PARITY.has(row.parity_status)) errors.push(`${label}:parity_status`);
    if (!VERIFICATION.has(row.verification)) errors.push(`${label}:verification`);
    for (const fieldName of ["family", "visual_archetype", "gap_summary"]) {
      if (typeof row[fieldName] !== "string" || !row[fieldName].trim()) errors.push(`${label}:${fieldName}`);
    }
    for (const fieldName of ["primary_reference", "secondary_reference", "current_baseline"]) {
      const value = row[fieldName];
      if (typeof value !== "string" || !value.trim()) {
        errors.push(`${label}:${fieldName}:missing`);
        continue;
      }
      if (value.startsWith("source://rateware/")) {
        if (row.parity_status === "accepted") errors.push(`${label}:${fieldName}:unpinned`);
        continue;
      }
      if (isAbsolute(value) || value.split(/[\\/]+/).includes("..")) {
        errors.push(`${label}:${fieldName}:outside`);
        continue;
      }
      const candidate = resolve(root, value);
      if (!inside(candidate) || !existsSync(candidate) || !statSync(candidate).isFile()) errors.push(`${label}:${fieldName}:file`);
    }
    if (row.parity_status === "accepted" && row.verification !== "accepted") errors.push(`${label}:accepted_without_verification`);
  }
  for (const route of ROUTES) {
    if (routeCounts.get(route) !== 1) errors.push(`route:${route}:cardinality`);
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

export function evaluateVisualParityScore(record) {
  const errors = [];
  const dimensions = record?.dimensions && typeof record.dimensions === "object"
    ? record.dimensions
    : {};
  for (const [name, maximum] of Object.entries(P3V_DIMENSIONS)) {
    const value = dimensions[name];
    if (!finiteInteger(value) || value < 0 || value > maximum) errors.push(`${name}:points`);
    if (finiteInteger(value) && value < maximum * 0.8) errors.push(`${name}:minimum`);
  }
  const total = Object.keys(P3V_DIMENSIONS).reduce((sum, name) => sum + (finiteInteger(dimensions[name]) ? dimensions[name] : 0), 0);
  if (total < 90 || total > 100) errors.push("score:threshold");
  if (JSON.stringify(record?.viewports) !== JSON.stringify(P3V_VIEWPORTS)) errors.push("viewports:missing");
  for (const state of record?.required_states || []) {
    if (!new Set(record?.states || []).has(state)) errors.push(`state:${state}:missing`);
  }
  if (record?.reviewer_verdict !== "GO") errors.push("review:go_required");
  if (!sha(record?.reference_sha256, 64)) errors.push("reference:sha256");
  if (!sha(record?.screenshot_sha256, 64)) errors.push("screenshot:sha256");
  if (!sha(record?.candidate_sha, 40)) errors.push("candidate:sha");
  return Object.freeze({ dimensions: Object.freeze({ ...dimensions }), total, errors: Object.freeze(errors), status: errors.length ? "blocked" : "accepted" });
}
```

Keep the implementation pure and deterministic: importing the module must not read Git, launch a browser, write files, or contact the network.

- [ ] **Step 4: Add the focused package script**

Add to `package.json`:

```json
"test:platform55:visual-parity": "node --test tests/platform55-visual-parity-contract.test.mjs"
```

Insert `npm run test:platform55:visual-parity` in the root `test` script immediately after `test:platform55-shell`.

- [ ] **Step 5: Run GREEN and syntax checks**

```powershell
npm run test:platform55:visual-parity
node --check tools/platform55-visual-parity-contract.mjs
node --check tests/platform55-visual-parity-contract.test.mjs
git diff --check
```

Expected: all pass.

- [ ] **Step 6: Commit the contract**

```powershell
git add package.json tools/platform55-visual-parity-contract.mjs tests/platform55-visual-parity-contract.test.mjs
git diff --cached --check
git commit -m "test: add fail-closed Platform55 visual parity contract"
```

---

### Task 2: Add Shared Platform 55 Interior Primitives

**Files:**
- Create: `src/platform55-visual-parity.css`
- Create: `tests/platform55-p3v-v1-contract.test.mjs`
- Modify: `app.html`
- Modify: `rateware.html`
- Modify: `package.json`

- [ ] **Step 1: Write failing structural tests**

Create `tests/platform55-p3v-v1-contract.test.mjs` with helpers that read the two HTML files and compute sorted ID hashes:

```js
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const ids = (source) => [...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]).sort();
const digest = (values) => createHash("sha256").update(values.join("\n")).digest("hex");

test("P3-V1 preserves all controller IDs", async () => {
  const appIds = ids(await read("app.html"));
  const ratewareIds = ids(await read("rateware.html"));
  assert.equal(appIds.length, 44);
  assert.equal(digest(appIds), "fcaa78738a356af3018afcb451d63aa5e59adc82bdc88b7585b80c68389466bd");
  assert.equal(ratewareIds.length, 76);
  assert.equal(digest(ratewareIds), "e93d0d56c98ab5fde3c7eb9f33884e6b31d8135563dbc60e9e8d64df33000a35");
});

test("both routes load the shared visual parity layer after their family layer", async () => {
  for (const path of ["app.html", "rateware.html"]) {
    const source = await read(path);
    assert.match(source, /platform55-(?:command-center|operate)\.css[\s\S]*platform55-visual-parity\.css/);
    assert.match(source, /class="[^"]*p55-vp-page/);
  }
});
```

Add tests that the stylesheet declares all primitive selectors, uses only existing `--rw-*` tokens for colors, contains desktop/tablet/mobile rules, and contains no `!important`.

- [ ] **Step 2: Run RED**

```powershell
node --test tests/platform55-p3v-v1-contract.test.mjs
```

Expected: fail because the shared stylesheet and hooks do not exist.

- [ ] **Step 3: Create the shared CSS layer**

Create `src/platform55-visual-parity.css`. Its route-neutral API is:

```css
.p55-vp-page {}
.p55-vp-page-header {}
.p55-vp-context-banner {}
.p55-vp-context-banner__icon {}
.p55-vp-context-banner__copy {}
.p55-vp-metric-grid {}
.p55-vp-metric {}
.p55-vp-tabs {}
.p55-vp-toolbar-card {}
.p55-vp-workspace-card {}
.p55-vp-workspace-header {}
.p55-vp-bulk-surface {}
.p55-vp-pagination {}
.p55-vp-helper-strip {}
.p55-vp-table-shell {}
.p55-vp-secondary-tools {}
.p55-vp-boundary-note {}
```

Implement the selectors with existing tokens from `src/platform55-tokens.css`. The core geometry must be:

```css
.p55-vp-page {
  width: min(100%, 1480px);
  margin-inline: auto;
  display: grid;
  gap: 16px;
}

.p55-vp-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.p55-vp-context-banner {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--rw-slate-200);
  border-radius: 14px;
  color: var(--rw-slate-700);
  background: var(--rw-white);
  box-shadow: var(--rw-shadow-sm);
}

.p55-vp-metric-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.p55-vp-toolbar-card,
.p55-vp-workspace-card {
  min-width: 0;
  border: 1px solid var(--rw-slate-200);
  border-radius: 14px;
  background: var(--rw-white);
  box-shadow: var(--rw-shadow-sm);
}

.p55-vp-table-shell {
  min-width: 0;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
}

@media (max-width: 1100px) {
  .p55-vp-metric-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 680px) {
  .p55-vp-page { gap: 12px; }
  .p55-vp-page-header { display: grid; gap: 12px; }
  .p55-vp-metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
```

Use the exact token names that exist in `platform55-tokens.css`; if `--rw-shadow-sm` is absent, use the existing closest shadow token instead of adding a one-off shadow.

- [ ] **Step 4: Load the CSS and add only the top-level page hook**

In `app.html`, after `platform55-command-center.css`:

```html
<link rel="stylesheet" href="./src/platform55-visual-parity.css" />
```

Change the page wrapper to:

```html
<div class="rw-command-center rw-page p55-vp-page p55-vp-page--command" data-platform55-page-content>
```

In `rateware.html`, after `platform55-operate.css`, load the same stylesheet and change the page wrapper to:

```html
<div class="rw-operate-page history-layout p55-vp-page p55-vp-page--governed-operations" data-platform55-page-content>
```

Do not add the detailed Rateware hooks yet; keep this step small.

- [ ] **Step 5: Add the focused script and run GREEN for the primitive subset**

Add to `package.json`:

```json
"test:platform55:p3v1": "node --test tests/platform55-p3v-v1-contract.test.mjs"
```

Insert `npm run test:platform55:p3v1` in the root `test` script immediately after `npm run test:platform55:visual-parity`.

Run:

```powershell
npm run test:platform55:p3v1
node --check tests/platform55-p3v-v1-contract.test.mjs
git diff --check
```

Expected: all primitive tests pass. The detailed Rateware hook assertions are added as the first RED step in Task 3.

- [ ] **Step 6: Commit the primitives**

```powershell
git add app.html rateware.html src/platform55-visual-parity.css tests/platform55-p3v-v1-contract.test.mjs package.json
git diff --cached --check
git commit -m "feat: add Platform55 page interior primitives"
```

---

### Task 3: Recompose Rateware Without Changing Its Controller Contract

**Files:**
- Modify: `rateware.html`
- Modify: `tests/platform55-p3v-v1-contract.test.mjs`
- Test: `tests/rateware-stability.test.mjs`

- [ ] **Step 1: Strengthen the failing DOM contract**

Add assertions for the exact composition order:

```js
const rateware = await read("rateware.html");
const order = [
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
for (const hook of order) {
  const next = rateware.indexOf(hook);
  assert.ok(next > cursor, `${hook} must occur in the governed-operations sequence`);
  cursor = next;
}
```

Also assert one dominant H1, one primary header action, five metrics, six quick filters, one table, and one each of the existing detail and bulk drawers.

- [ ] **Step 2: Run RED**

```powershell
npm run test:platform55:p3v1
```

Expected: fail on missing Rateware hooks/order.

- [ ] **Step 3: Add the approved-rate context banner**

Immediately after the Rateware page header, add:

```html
<aside class="p55-vp-context-banner" data-p55-vp-context-banner role="note" aria-label="Approved rate boundary">
  <span class="p55-vp-context-banner__icon" aria-hidden="true"><rw-icon name="check"></rw-icon></span>
  <div class="p55-vp-context-banner__copy">
    <strong>Approved-rate workspace</strong>
    <p>These records passed human review. Return-to-staging, bulk changes, exports, and lifecycle actions remain explicit controlled operations.</p>
  </div>
</aside>
```

The `check` icon is already registered in `src/platform55-icons.js`; keep the surrounding span `aria-hidden` so the banner's accessible name comes from its text.

- [ ] **Step 4: Add semantic hooks to existing regions**

Apply these exact additions without renaming IDs or controls:

```html
<section class="workspace-panel spreadsheet-workbench rateware-workspace rw-operate-panel p55-vp-workspace-card">
<div class="workbench-header p55-vp-workspace-header">
<div class="rateware-summary-strip rw-operate-metrics p55-vp-metric-grid" data-p55-vp-metrics aria-label="Approved Rateware summary">
<div class="sheet-command-bar rateware-command-bar p55-vp-toolbar-card">
<div class="review-filter-row compact-filter-row rateware-view-tabs p55-vp-tabs" data-p55-vp-filters aria-label="Rateware views">
<div class="bulk-action-bar p55-vp-bulk-surface is-empty" data-p55-vp-bulk-actions aria-live="polite">
<div class="sheet-pagination-bar p55-vp-pagination" data-p55-vp-pagination aria-label="Rateware pagination">
<div class="sheet-helper-strip p55-vp-helper-strip" data-p55-vp-helper aria-live="polite">
<div class="table-wrap sheet-table-wrap rw-operate-table-scroll p55-vp-table-shell" data-p55-vp-table aria-label="Approved Rateware rows">
<details class="rateware-workbench-disclosure p55-vp-secondary-tools">
```

Do not move table headers, drawers, scripts, or `details.sheet-more-actions`. The existing DOM order already matches the approved information hierarchy once the safety banner and presentation groups are explicit.

- [ ] **Step 5: Verify controller invariants before CSS changes**

```powershell
npm run test:platform55:p3v1
node tests/rateware-stability.test.mjs
node --check src/rateware.js
git diff --check
```

Expected: all pass. The ID counts and hashes must be unchanged.

- [ ] **Step 6: Commit the semantic composition**

```powershell
git add rateware.html tests/platform55-p3v-v1-contract.test.mjs
git diff --cached --check
git commit -m "feat: recompose Rateware as governed operations"
```

---

### Task 4: Implement the Rateware Fidelity Layer

**Files:**
- Modify: `src/platform55-operate.css`
- Modify: `src/platform55-visual-parity.css`
- Modify: `tests/platform55-p3v-v1-contract.test.mjs`
- Modify only if required by existing assertions: `tests/rateware-stability.test.mjs`

- [ ] **Step 1: Add failing CSS behavior assertions**

Assert that the Rateware route declares:

- a five-column desktop metrics grid;
- a single bounded filter/tool surface;
- reserved loading geometry for summary and command areas;
- bulk actions that scroll or wrap inside their card rather than the page;
- a contained table scroller;
- a mobile two-column primary action grid;
- secondary actions inside the existing `details.sheet-more-actions`;
- visible focus styles and reduced-motion handling;
- no selector that hides a focused control or primary state banner.

The tests must parse declarations rather than merely search for labels.

- [ ] **Step 2: Run RED**

```powershell
npm run test:platform55:p3v1
```

Expected: fail on the new Rateware CSS assertions.

- [ ] **Step 3: Implement desktop and tablet composition**

In `src/platform55-operate.css`, scope changes to `.p55-vp-page--governed-operations` and preserve existing required selectors. Implement:

```css
.p55-vp-page--governed-operations .rateware-workspace {
  display: grid;
  min-width: 0;
  overflow: clip;
}

.p55-vp-page--governed-operations .workbench-header {
  display: grid;
  grid-template-columns: minmax(180px, 0.7fr) minmax(0, 2.3fr);
  align-items: end;
  gap: 18px;
  padding: 18px;
}

.p55-vp-page--governed-operations .rateware-summary-strip {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.p55-vp-page--governed-operations .rateware-command-bar {
  margin: 0 14px 12px;
  padding: 12px;
  border: 1px solid var(--rw-slate-200);
  border-radius: 12px;
  background: var(--rw-slate-50);
}

.p55-vp-page--governed-operations .rateware-main-toolbar {
  display: grid;
  grid-template-columns: minmax(240px, 2fr) repeat(2, minmax(150px, 1fr)) auto auto auto;
  gap: 10px;
  align-items: end;
}

.p55-vp-page--governed-operations .rw-operate-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border-top: 1px solid var(--rw-slate-200);
}
```

Use the current table's sticky/header patterns. Do not make the 36-column table fit by shrinking text below readable size.

- [ ] **Step 4: Implement mobile composition**

At `max-width: 680px`:

- metrics use two columns and the fifth metric spans both columns only when necessary;
- quick filters scroll horizontally inside their own row;
- Search occupies both columns;
- Operation and Service form the next two-column row;
- Refresh and Clear remain visible;
- Columns and secondary lifecycle/export actions remain inside their existing disclosure controls;
- bulk scope and primary selection actions fit within the viewport;
- the table scrolls internally;
- the context banner remains fully visible.

Do not replace the table with cards in V1 because cell/range selection is a core Rateware behavior.

- [ ] **Step 5: Reconcile old stability assertions by behavior, not by deletion**

Run:

```powershell
node tests/rateware-stability.test.mjs
```

If an assertion fails because a selector moved to `platform55-operate.css`, update the test to inspect the correct stylesheet while preserving the invariant. Do not weaken these required behaviors:

- `.bulk-action-bar` contained overflow;
- final summary and command-bar reserved height;
- `details.sheet-more-actions[open]` is not clipped;
- mobile primary actions remain in a two-column first-viewport grid;
- More actions fits and scrolls within `390px`.

- [ ] **Step 6: Run the focused regression set**

```powershell
npm run test:platform55:p3v1
npm run test:platform55:operate
node tests/rateware-stability.test.mjs
node --check src/rateware.js
git diff --check
```

Expected: all pass.

- [ ] **Step 7: Commit Rateware styling**

```powershell
git add src/platform55-operate.css src/platform55-visual-parity.css tests/platform55-p3v-v1-contract.test.mjs tests/rateware-stability.test.mjs
git diff --cached --check
git commit -m "feat: align Rateware workspace with Platform55"
```

Stage `tests/rateware-stability.test.mjs` only if it changed.

---

### Task 5: Tighten Command Center Fidelity

**Files:**
- Modify: `app.html`
- Modify: `src/platform55-command-center.css`
- Modify: `tests/platform55-command-center.test.mjs`
- Modify: `tests/platform55-p3v-v1-contract.test.mjs`

- [ ] **Step 1: Write failing Command Center geometry tests**

Assert:

- exactly one page H1 and no more than two interactive top-level actions;
- Next Best Action remains first after the page header;
- Priority Queue, Business Lifecycle, My Work, Network Pulse, Health, and Shortcuts each occur once;
- the desktop grid uses the approved decision-first order;
- card title/body sizes do not fall below the existing Platform 55 token scale;
- tablet becomes a single reading column in the same semantic order;
- mobile actions remain named and do not overflow.

Keep all current dashboard IDs and data render targets.

- [ ] **Step 2: Run RED**

```powershell
npm run test:platform55-command-center
npm run test:platform55:p3v1
```

Expected: fail only on the new visual contract assertions.

- [ ] **Step 3: Add route-neutral primitive hooks**

Add `.p55-vp-page-header` to the current `.rw-page-header`. Add `.p55-vp-workspace-card` to the six supporting panels without replacing their existing classes. Do not move or rename their IDs.

- [ ] **Step 4: Normalize proportions and density**

In `src/platform55-command-center.css`:

- keep the hero dominant but cap it so the priority queue remains visible at `1440x900`;
- use consistent `14px` card radius and token-backed shadows/borders;
- raise undersized `7px`/`8px` operational labels to readable token-backed sizes unless they are decorative metadata;
- align panel padding and section headings to the shared primitives;
- preserve the current five lifecycle links and all priority/work queue rendering;
- retain the existing desktop grid areas and single-column tablet order;
- preserve reduced-motion behavior.

Do not change dashboard data or hide Health/Shortcuts merely to resemble a single screenshot.

- [ ] **Step 5: Run focused tests**

```powershell
npm run test:platform55-command-center
npm run test:platform55:p3v1
node --check src/dashboard.js
git diff --check
```

Expected: all pass and both ID hashes remain unchanged.

- [ ] **Step 6: Commit Command Center styling**

```powershell
git add app.html src/platform55-command-center.css tests/platform55-command-center.test.mjs tests/platform55-p3v-v1-contract.test.mjs
git diff --cached --check
git commit -m "feat: tighten Platform55 Command Center fidelity"
```

---

### Task 6: Add Deterministic P3-V1 Browser Certification

**Files:**
- Create: `tools/platform55-p3v-v1-browser-certification.mjs`
- Create: `tests/platform55-p3v-v1-browser-certification.test.mjs`
- Modify: `package.json`
- Reuse: `tools/platform55-s6-command-evidence-server.mjs`
- Reuse: `tools/platform55-operate-evidence-server.mjs`
- Reuse: `tools/platform55-s6-accessibility-certification.mjs`

- [ ] **Step 1: Write failing browser-certification unit tests**

Export pure helpers from the new tool and test them without launching a browser:

```js
export const P3V1_SPECS = Object.freeze([
  { route: "app.html", states: ["data", "loading", "empty", "error"], requiredIds: ["next-best-action", "priority-queue", "business-lifecycle", "my-work-list", "network-pulse"] },
  { route: "rateware.html", states: ["loaded", "error"], requiredIds: ["rateware-metric-total", "rateware-search", "rateware-body", "rateware-drawer", "rateware-bulk-drawer"] },
]);

export function validateP3V1Capture(record) {
  const errors = [];
  const spec = P3V1_SPECS.find((candidate) => candidate.route === record?.route);
  if (!spec) errors.push("route:unknown");
  if (!spec?.states.includes(record?.state)) errors.push("state:unknown");
  if (!P3V_VIEWPORTS.some((viewport) => JSON.stringify(viewport) === JSON.stringify(record?.viewport))) errors.push("viewport:unknown");
  if (record?.page_overflow !== false) errors.push("layout:page_overflow");
  for (const id of spec?.requiredIds || []) {
    if (!record?.visible_ids?.includes(id)) errors.push(`visible:${id}:missing`);
  }
  if (!record?.page_heading_visible) errors.push("heading:hidden");
  if (!record?.state_surface_visible) errors.push("state_surface:hidden");
  if ((record?.unnamed_controls || []).length) errors.push("a11y:unnamed_controls");
  if ((record?.contrast_failures || []).length) errors.push("a11y:contrast");
  if (record?.focus_cycle_pass !== true || record?.focus_restore_pass !== true) errors.push("a11y:focus");
  for (const name of ["console_errors", "http_errors", "page_errors", "request_errors", "external_requests", "mutation_attempts"]) {
    if (!Array.isArray(record?.[name]) || record[name].length) errors.push(`${name}:nonzero`);
  }
  if (!/^[a-f0-9]{64}$/i.test(record?.screenshot_sha256 || "")) errors.push("screenshot:sha256");
  if (!record?.source_blobs || Object.values(record.source_blobs).some((value) => !/^[a-f0-9]{40}$/i.test(value))) errors.push("source:blobs");
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}
```

The tests must inject each failure independently and prove rejection. Include a malicious record with a valid overall score but a failed accessibility dimension.

- [ ] **Step 2: Run RED**

```powershell
node --test tests/platform55-p3v-v1-browser-certification.test.mjs
```

Expected: fail because the tool does not exist.

- [ ] **Step 3: Implement the browser runner**

The runner must:

1. Resolve the repository root with `realpath` and reject output inside the repo unless `RATEWARE_P3V_EVIDENCE_COMMIT=true` is explicitly set for the evidence stage.
2. Start `startS6CommandEvidenceServer()` for `app.html` and `startOperateEvidenceServer()` for `rateware.html`.
3. Use `RATEWARE_PLAYWRIGHT_MODULE` or `playwright`, and `RATEWARE_CHROME_PATH` or the existing Chrome path.
4. Launch a fresh browser context for each route/state/viewport capture.
5. Block every external host and record requested URLs.
6. Record console, HTTP >=400, page, and request errors.
7. Assert no page-level horizontal overflow.
8. Assert the page heading, safety/state banners, and primary actions are visible.
9. Use `assertAccessibleControlNames`, `assertContrastSamples`, and `assertFocusCycle` from the existing accessibility helper.
10. Verify Ctrl+K search focus/Escape restoration and mobile drawer open/Tab cycle/Shift+Tab cycle/Escape restoration.
11. Verify Rateware's table owns its horizontal overflow and the document does not.
12. Verify no write-capable request occurred; the local fixtures must throw on mutations.
13. Write PNGs and `manifest.json` only to `RATEWARE_P3V_OUTPUT_DIR`.
14. Close pages, contexts, browsers, and servers in `finally` blocks.

Use these exact capture matrices:

- Command Center: `data`, `loading`, `empty`, `error` at `1440x900`, `1024x768`, `390x844` = 12 captures.
- Rateware: `loaded`, `error` at the same three viewports = 6 captures.
- Total P3-V1 browser evidence = 18 captures.

- [ ] **Step 4: Add scripts**

Add:

```json
"test:platform55:p3v1-browser": "node --test tests/platform55-p3v-v1-browser-certification.test.mjs",
"certify:platform55:p3v1": "node tools/platform55-p3v-v1-browser-certification.mjs"
```

Append only the unit test script to root `npm test`. Do not put the 18-screenshot certification in the default unit suite.

- [ ] **Step 5: Run GREEN and a temporary browser certification**

Create an external temporary directory and use the already installed browser runtime path:

```powershell
$p3vOutput = Join-Path ([System.IO.Path]::GetTempPath()) ("rateware-p3v1-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $p3vOutput | Out-Null
$env:RATEWARE_P3V_OUTPUT_DIR = $p3vOutput
npm run test:platform55:p3v1-browser
npm run certify:platform55:p3v1
Get-Content -LiteralPath (Join-Path $p3vOutput 'manifest.json')
```

Expected: 18 captures, zero console/HTTP/page/request/external/mutation failures, all viewport and accessibility checks true.

- [ ] **Step 6: Manually inspect all 18 screenshots**

Use the local image viewer. Reject underfill, clipped errors, hidden primary actions, unreadable brand text, stretched headers, tooltips covering controls, inconsistent state timing, fake loading/error labels, table overflow outside its card, or composition that is technically present but visually broken.

- [ ] **Step 7: Commit the certification tooling**

```powershell
git add tools/platform55-p3v-v1-browser-certification.mjs tests/platform55-p3v-v1-browser-certification.test.mjs package.json
git diff --cached --check
git commit -m "test: certify P3-V1 visual parity"
```

Do not commit the temporary output.

---

### Task 7: Run Full Product Verification and Freeze the Product Candidate

**Files:**
- Verify all files changed in Tasks 1-6

- [ ] **Step 1: Run the complete test and governance gates**

```powershell
npm run test:platform55:visual-parity
npm run test:platform55:p3v1
npm run test:platform55:p3v1-browser
npm run test:platform55-command-center
npm run test:platform55:operate
node tests/rateware-stability.test.mjs
npm test
npm run validate:action-contract
npm audit --audit-level=low
npm run release:progress
git diff --check
```

Expected:

- every command exits `0`;
- no new Action Contract errors;
- zero vulnerabilities;
- formal release ledger remains `83%` with P3 still `0%` unless a separately authorized formal plan changes it;
- P3-V remains `10%` until evidence and independent review are closed.

- [ ] **Step 2: Verify scope**

```powershell
git diff --name-only origin/main...HEAD
git status --short
```

Allowed runtime paths for V1:

```text
app.html
rateware.html
src/platform55-command-center.css
src/platform55-operate.css
src/platform55-visual-parity.css
```

Plus the exact tests, tools, package script, plans, and P3-V evidence files declared here. Any service, auth, API, Supabase, migration, or controller path is a blocker.

- [ ] **Step 3: Record the product SHA**

```powershell
$productSha = git rev-parse HEAD
$productTree = git rev-parse HEAD^{tree}
git status --porcelain=v1 --untracked-files=all
```

Expected: status empty. Store `$productSha` and `$productTree` in the evidence manifest; do not amend or rewrite this product commit afterward.

---

### Task 8: Capture Immutable Evidence and Score Both Routes

**Files:**
- Create: `docs/platform55-visual-parity/evidence/p3v1/<product-sha>/manifest.json`
- Create: `docs/platform55-visual-parity/evidence/p3v1/<product-sha>/app-*.png`
- Create: `docs/platform55-visual-parity/evidence/p3v1/<product-sha>/rateware-*.png`
- Create: `docs/platform55-visual-parity/evidence/p3v1/<product-sha>/design-review.md`

- [ ] **Step 1: Capture into the product-addressed directory**

```powershell
$productSha = git rev-parse HEAD
$evidenceDir = Join-Path (Get-Location) "docs/platform55-visual-parity/evidence/p3v1/$productSha"
New-Item -ItemType Directory -Path $evidenceDir | Out-Null
$env:RATEWARE_P3V_OUTPUT_DIR = $evidenceDir
$env:RATEWARE_P3V_EVIDENCE_COMMIT = 'true'
npm run certify:platform55:p3v1
```

The output directory must equal the exact current product SHA. The manifest must record:

- schema version;
- product SHA and tree;
- route/state/viewport/access model/fixture;
- reference path and SHA-256;
- screenshot path, Git/worktree SHA-256, dimensions, and byte length;
- exact source Git blobs for both HTML files and three CSS files;
- geometry, visible landmarks, table containment, focus, keyboard, accessible-name, contrast, overflow, console/network, external-request, and mutation results;
- timestamps as evidence metadata only, never as identity.

- [ ] **Step 2: Score each route independently**

In `design-review.md`, use the exact five dimensions and show awarded/available points. Run the pure evaluator against each record. Do not average `app.html` and `rateware.html` together.

Expected acceptance conditions per route:

```text
total >= 90
shell_frame >= 16/20
interior_hierarchy >= 20/25
visual_system >= 16/20
components_states >= 16/20
responsive_accessibility >= 12/15
```

The human review must compare the same current viewport against the closest pinned reference and explain content-adapted differences.

- [ ] **Step 3: Validate evidence integrity**

Run focused tests plus adversarial copies that modify one screenshot byte, one source blob, one viewport, one score, one required state, and the candidate SHA. Every mutation must reject.

- [ ] **Step 4: Commit evidence without accreditation**

```powershell
git add docs/platform55-visual-parity/evidence/p3v1/$productSha
git diff --cached --check
git commit -m "docs: record P3-V1 visual evidence"
```

Record the resulting evidence commit SHA. Do not mark the route matrix accepted yet.

---

### Task 9: Obtain Independent Review and Close P3-V1

**Files:**
- Create: `docs/platform55-visual-parity/evidence/p3v1/<product-sha>/independent-review.md`
- Modify: `docs/platform55-visual-parity/p3v-route-matrix.csv`
- Modify: `docs/platform55-visual-parity/README.md`
- Modify: `tests/platform55-visual-parity-contract.test.mjs`

- [ ] **Step 1: Request immutable independent review**

The reviewer must create a brand-new detached clean worktree at the exact evidence commit, verify merge-base and scope, reproduce the 18-capture matrix and hashes, visually inspect all screenshots, rerun adversarial scoring/evidence probes, and run the focused/full gates. Stop on first P0/P1/P2 false-PASS.

- [ ] **Step 2: Add the independent review artifact**

Only for an exact `GO`, record:

```yaml
reviewed_product_sha: <40 hex>
reviewed_product_tree: <40 hex>
reviewed_evidence_commit: <40 hex>
reviewer_verdict: GO
p0: 0
p1: 0
p2: 0
```

Include the reproduced score, capture count, failures, commands, and the detached/clean proof. Do not paraphrase a NO-GO into GO.

- [ ] **Step 3: Make accreditation tests fail before updating the board**

Add a test that requires both V1 routes to remain non-accepted unless:

- the product and evidence objects exist;
- all referenced files are tracked;
- the normalized independent-review body digest matches the recorded digest;
- reviewer verdict is `GO` with P0/P1/P2 all zero;
- both score evaluations return `accepted`;
- manifest has exactly 18 captures and the exact state/viewport matrix;
- source and evidence Git blobs match;
- `app.html` and `rateware.html` matrix rows name the exact evidence directory and `verification=accepted`.

Prove RED before editing the CSV.

- [ ] **Step 4: Update the two matrix rows and P3-V progress**

Set only `app.html` and `rateware.html` to `parity_status=accepted`, `verification=accepted`, and evidence-backed gap summaries. Update `README.md` from P3-V `10%` to `25%`. Keep the formal release ledger unchanged.

- [ ] **Step 5: Run closure tests**

```powershell
npm run test:platform55:visual-parity
npm run test:platform55:p3v1
npm run test:platform55:p3v1-browser
npm run release:progress
git diff --check
```

Expected: all pass; P3-V reports `25%`; formal General/P3 remains unchanged.

- [ ] **Step 6: Commit the accreditation closure**

```powershell
git add docs/platform55-visual-parity/p3v-route-matrix.csv docs/platform55-visual-parity/README.md docs/platform55-visual-parity/evidence/p3v1/$productSha/independent-review.md tests/platform55-visual-parity-contract.test.mjs
git diff --cached --check
git commit -m "docs: close P3-V1 visual parity"
```

- [ ] **Step 7: Request a final closure-only review**

The closure-only reviewer verifies that the accreditation accurately reflects the reviewed product/evidence objects and that the delta contains no runtime source. P3-V1 is complete only after this review reports `GO`.

---

### Task 10: Final Local Handoff

**Files:**
- Verify all changed files

- [ ] **Step 1: Re-run final verification**

```powershell
npm test
npm run validate:action-contract
npm audit --audit-level=low
npm run release:progress
git diff --check origin/main...HEAD
git status --porcelain=v1 --untracked-files=all
```

Expected: all gates pass and the worktree is clean.

- [ ] **Step 2: Report exact progress and boundaries**

Report:

- P3-V overall `25%`;
- V1 `100%` with `2/2` routes accepted;
- V2-V6 not yet accepted;
- formal project progress and P3 unchanged;
- exact product, evidence, and closure SHAs;
- tests, browser capture count, scores, and reviewer verdicts;
- no external mutation, no production change, and no implied authorization.

- [ ] **Step 3: Request the next bounded authorization only if needed**

Do not push automatically. If the user wants remote review, request authorization for the exact closure SHA and named branch. Keep Vercel preview, Kinde callback, CORS, Ready, merge, automatic production deployment, and production visual smoke as separately explicit actions.
