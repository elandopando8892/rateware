# Platform 55 P3-V2 Governed Operate Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Upload Center, Source Files, and Review Queue to accepted Platform 55 visual parity while preserving source retention, staging-first intake, human approval, bulk-action scope, and every existing business control.

**Architecture:** Extend the P3-V1 page-interior system with route-neutral governed-operation primitives and three route-specific compositions. Keep `src/upload-center.js`, `src/upload-history.js`, and `src/staging-review.js` authoritative; HTML and CSS may add presentation hooks but must not alter data flow, action scope, authorization, or mutation semantics. Certify real loaded and non-happy states locally at three viewports, bind all evidence to immutable Git objects, and require independent GO on all three routes before moving P3-V from 25% to 40%.

**Tech Stack:** Static HTML, existing `--rw-*` CSS tokens, JavaScript ES modules, Node.js test runner, Playwright through `RATEWARE_PLAYWRIGHT_MODULE`, existing local QA fixture/server patterns, SHA-256 evidence manifests.

**Spec:** `docs/superpowers/specs/2026-08-23-rateware-platform55-visual-parity-design.md`

## Global Constraints

- Work only in `C:\Users\andre\OneDrive\Documents\Rateware_P3V2_Operate` on `codex/p3v2-operate`; preserve the dirty primary checkout.
- Base P3-V2 on production `7b76ba36dae4e0fa26e1b6605b6bb398581051e5` and record the exact product SHA before generating evidence.
- Modify no API, Edge Function, SQL, migration, Supabase branch, secret, CORS origin, authentication, tenant enforcement, production data, or deployment configuration.
- Keep the three controllers separate. Do not consolidate Upload Center, Source Files, and Review Queue into one controller or shared mutable state.
- Preserve all controller IDs exactly:
  - `upload-center.html`: 19 IDs; sorted-ID SHA-256 `566593409b964dee101d20316307cfdd096b6529c33287b2eb4419fee69ced11`.
  - `upload-history.html`: 36 IDs; sorted-ID SHA-256 `b02043fee5e60ef2a0b225b15bc8bd71b9c24ede745c4fe5a96d45afc44a656f`.
  - `staging-review.html`: 89 IDs; sorted-ID SHA-256 `e7484a7fe7217b501d19e6eeeb69f1467d3ca9acd541ae8a9d257adba07e4d49`.
- Preserve every form name, `data-click-target`, `data-platform55-action`, `data-staging-filter`, `data-staging-brief-filter`, `data-column-toggle-list`, table `data-col`, drawer relationship, bulk-action target, and pagination control.
- Preserve source files and filenames. Uploads enter `raw_uploads`/`rate_staging` first; P3-V2 never inserts directly into production Rateware.
- Human approval remains mandatory before production insertion. Visual hierarchy must not make approval appear automatic.
- Selected-page and filtered-database scopes remain visibly distinct. Never relabel or visually merge them.
- Screenshots are insufficient alone: DOM semantics, accessible names, keyboard/focus, contrast, overflow, console/HTTP errors, external requests, and unexpected writes are mandatory gates.
- Product, evidence, accreditation, and independent-review commits are separate immutable stages. Rewriting a product SHA invalidates its evidence.
- The P2-S2 historical evidence remains immutable. While route HTML is changing, run its shell/server boundary tests separately; the historical source-parity assertion is expected to reject until Task 6 records the exact P3-V2 source-supersession contract.

---

### Task 1: Freeze the P3-V2 Structural and Safety Contract

**Files:**
- Create: `tests/platform55-p3v-v2-contract.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: canonical route rows from `docs/platform55-visual-parity/p3v-route-matrix.csv` and `parseRouteMatrix()` from `tools/platform55-visual-parity-contract.mjs`.
- Produces: the `test:platform55:p3v2` package script and immutable ID/action/scope checks used by every later task.

- [ ] **Step 1: Write the failing route and ID tests**

Create `tests/platform55-p3v-v2-contract.test.mjs` with exact route membership and ID fingerprints:

```js
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseRouteMatrix } from "../tools/platform55-visual-parity-contract.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const ids = (source) => [...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]).sort();
const digest = (values) => createHash("sha256").update(values.join("\n")).digest("hex");
const expected = Object.freeze({
  "upload-center.html": [19, "566593409b964dee101d20316307cfdd096b6529c33287b2eb4419fee69ced11"],
  "upload-history.html": [36, "b02043fee5e60ef2a0b225b15bc8bd71b9c24ede745c4fe5a96d45afc44a656f"],
  "staging-review.html": [89, "e7484a7fe7217b501d19e6eeeb69f1467d3ca9acd541ae8a9d257adba07e4d49"],
});

test("P3-V2 contains exactly the three governed Operate routes", async () => {
  const rows = parseRouteMatrix(await read("docs/platform55-visual-parity/p3v-route-matrix.csv"));
  assert.deepEqual(rows.filter((row) => row.p3v_wave === "P3-V2").map((row) => row.route).sort(), Object.keys(expected).sort());
});

test("P3-V2 preserves every controller ID", async () => {
  for (const [path, [count, sha256]] of Object.entries(expected)) {
    const values = ids(await read(path));
    assert.equal(values.length, count, path);
    assert.equal(digest(values), sha256, path);
  }
});
```

- [ ] **Step 2: Add failing safety assertions**

In the same test file, assert that:

```js
test("P3-V2 preserves staging-first and human-approval boundaries", async () => {
  const upload = await read("upload-center.html");
  const review = await read("staging-review.html");
  assert.match(upload, /Preserve source files before interpretation and human review/);
  assert.match(upload, /id="file-input"[\s\S]*name="files"/);
  assert.match(review, /Human approval is required before any production Rateware insert/);
  assert.match(review, /id="bulk-selection-count"/);
  assert.match(review, /id="staging-filtered-count"/);
  assert.match(review, /id="bulk-approve-button"[\s\S]*disabled/);
  assert.match(review, /id="bulk-approve-filtered-button"/);
});
```

Also assert every route loads `platform55-operate.css` before `platform55-visual-parity.css`, exposes one `data-platform55-page-content`, and has one visible loaded-state root plus one route-specific non-happy-state root.

- [ ] **Step 3: Run RED**

```powershell
node --test tests/platform55-p3v-v2-contract.test.mjs
```

Expected: FAIL because P3-V2 presentation hooks and the focused package script do not exist.

- [ ] **Step 4: Add the focused package script**

Add:

```json
"test:platform55:p3v2": "node --test tests/platform55-p3v-v2-contract.test.mjs"
```

Insert it in the root `test` script immediately after `test:platform55:p3v1-production`.

- [ ] **Step 5: Commit the RED contract**

```powershell
git add package.json tests/platform55-p3v-v2-contract.test.mjs
git diff --cached --check
git commit -m "test: freeze P3-V2 governed operate contract"
```

---

### Task 2: Extend Route-Neutral Governed-Operation Primitives

**Files:**
- Modify: `src/platform55-visual-parity.css`
- Modify: `src/platform55-operate.css`
- Modify: `tests/platform55-p3v-v2-contract.test.mjs`

**Interfaces:**
- Consumes: P3-V1 primitives `.p55-vp-page`, `.p55-vp-context-banner`, `.p55-vp-metric-grid`, `.p55-vp-toolbar-card`, `.p55-vp-workspace-card`, and existing `--rw-*` tokens.
- Produces: route-neutral classes used by all three P3-V2 HTML compositions.

- [ ] **Step 1: Add failing primitive tests**

Assert the stylesheets expose exactly these new route-neutral hooks and contain no `!important`:

```js
const requiredHooks = [
  ".p55-vp-operation-flow",
  ".p55-vp-source-dropzone",
  ".p55-vp-filter-surface",
  ".p55-vp-scope-strip",
  ".p55-vp-review-brief",
  ".p55-vp-state-panel",
];
```

Assert colors use only existing `--rw-*` tokens and media queries cover `1100px` and `680px` boundaries.

- [ ] **Step 2: Run RED**

```powershell
npm run test:platform55:p3v2
```

Expected: FAIL listing the missing primitive selectors.

- [ ] **Step 3: Implement the minimal shared primitives**

Add route-neutral layout only:

```css
.p55-vp-operation-flow { display: grid; gap: 16px; min-width: 0; }
.p55-vp-source-dropzone { min-width: 0; border: 1px dashed var(--rw-slate-300); border-radius: 14px; }
.p55-vp-filter-surface { display: grid; gap: 12px; min-width: 0; }
.p55-vp-scope-strip { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.p55-vp-review-brief { display: grid; gap: 12px; min-width: 0; }
.p55-vp-state-panel { min-width: 0; scroll-margin-top: 16px; }

@media (max-width: 680px) {
  .p55-vp-scope-strip { align-items: stretch; }
  .p55-vp-scope-strip > * { max-width: 100%; }
}
```

Use the real token names in `src/platform55-tokens.css`; do not add one-off colors, fonts, or shadows.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npm run test:platform55:p3v2
node --check tests/platform55-p3v-v2-contract.test.mjs
git diff --check
git add src/platform55-visual-parity.css src/platform55-operate.css tests/platform55-p3v-v2-contract.test.mjs
git commit -m "style: add P3-V2 governed operate primitives"
```

---

### Task 3: Compose Upload Center Without Changing Intake

**Files:**
- Modify: `upload-center.html`
- Modify: `src/platform55-operate.css`
- Modify: `tests/platform55-p3v-v2-contract.test.mjs`
- Test: `tests/upload-center.test.mjs`

**Interfaces:**
- Consumes: route-neutral primitives from Task 2 and the unchanged `src/upload-center.js` controller.
- Produces: Upload Center loaded, empty, validation-error, and upload-error presentation surfaces.

- [ ] **Step 1: Write failing composition tests**

Assert that `upload-center.html`:

```js
assert.match(source, /class="[^"]*p55-vp-page[^"]*p55-vp-page--upload-center/);
assert.match(source, /data-p3v2-state="loaded"/);
assert.match(source, /data-p3v2-state="empty"/);
assert.match(source, /data-p3v2-state="validation-error"/);
assert.match(source, /data-p3v2-source-boundary/);
```

Assert `file-input`, `upload-form`, `drop-zone`, `file-list`, `upload-button`, `status-message`, RFx/vendor inputs, accept list, and `multiple` semantics are unchanged.

- [ ] **Step 2: Run RED**

```powershell
npm run test:platform55:p3v2
```

- [ ] **Step 3: Add semantic presentation hooks**

Load `platform55-visual-parity.css` after `platform55-operate.css`. Add `p55-vp-page p55-vp-page--upload-center p55-vp-operation-flow` to the existing page wrapper. Group, without recreating controls:

1. existing heading/actions;
2. source-retention context banner;
3. four existing queue metrics;
4. existing form/dropzone workspace;
5. existing file queue/status surface.

The context copy must state that originals are preserved and interpretation remains pending human review. Do not auto-open the file picker, auto-upload, reinterpret files, or change accepted extensions.

- [ ] **Step 4: Run route and regression tests**

```powershell
npm run test:platform55:p3v2
node tests/upload-center.test.mjs
node tests/platform55-operate-shell.test.mjs
node --test --test-name-pattern="serves actual Operate routes" tests/platform55-operate-evidence-server.test.mjs
git diff --check
```

- [ ] **Step 5: Commit**

```powershell
git add upload-center.html src/platform55-operate.css tests/platform55-p3v-v2-contract.test.mjs
git commit -m "style: align Upload Center with Platform55"
```

---

### Task 4: Compose Source Files Around Provenance and Processing State

**Files:**
- Modify: `upload-history.html`
- Modify: `src/platform55-operate.css`
- Modify: `tests/platform55-p3v-v2-contract.test.mjs`

**Interfaces:**
- Consumes: route-neutral primitives and unchanged `src/upload-history.js`.
- Produces: Source Files loaded, empty, loading, processing-error, and evidence-detail visual states.

- [ ] **Step 1: Write failing source-provenance tests**

Assert the route exposes:

```js
assert.match(source, /p55-vp-page--source-files/);
assert.match(source, /data-p3v2-state="loaded"/);
assert.match(source, /data-p3v2-state="empty"/);
assert.match(source, /data-p3v2-state="processing-error"/);
assert.match(source, /data-p3v2-provenance-boundary/);
```

Freeze every current ID and assert source filename, upload identity, processing status, evidence/detail affordance, filters, pagination, and retry controls retain their existing identifiers and action wiring.

- [ ] **Step 2: Run RED**

```powershell
npm run test:platform55:p3v2
```

- [ ] **Step 3: Add the governed Source Files composition**

Load the shared parity stylesheet and add only semantic group classes. Order the page as:

1. heading and existing page actions;
2. provenance/safety banner;
3. existing processing metrics;
4. one filter surface;
5. source-file workspace with contained table/cards;
6. explicit non-happy state and evidence/detail surface.

Do not reinterpret, delete, retry, or mutate a source merely by rendering the page. Preserve exact filename display and lineage links.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npm run test:platform55:p3v2
node tests/platform55-operate-shell.test.mjs
node --test --test-name-pattern="serves actual Operate routes" tests/platform55-operate-evidence-server.test.mjs
node --check src/upload-history.js
git diff --check
git add upload-history.html src/platform55-operate.css tests/platform55-p3v-v2-contract.test.mjs
git commit -m "style: align Source Files with Platform55"
```

---

### Task 5: Compose Review Queue With Explicit Human and Bulk Scope

**Files:**
- Modify: `staging-review.html`
- Modify: `src/platform55-operate.css`
- Modify: `tests/platform55-p3v-v2-contract.test.mjs`
- Test: `tests/rateware-stability.test.mjs`

**Interfaces:**
- Consumes: route-neutral primitives and unchanged `src/staging-review.js`.
- Produces: Review Queue loaded, loading, empty, blocked/review-required, and error visual states with unchanged mutation controls.

- [ ] **Step 1: Write failing approval and scope tests**

Assert:

```js
assert.match(source, /p55-vp-page--review-queue/);
assert.match(source, /data-p3v2-state="review-required"/);
assert.match(source, /data-p3v2-human-approval-boundary/);
assert.match(source, /data-p3v2-selection-scope="page"/);
assert.match(source, /data-p3v2-selection-scope="filtered-database"/);
```

Freeze the IDs and relative ordering of page-selected controls, filtered-database controls, evidence drawer, bulk drawer, save, approve, reject, archive, remove, pagination, and issue navigation. Assert destructive and approval actions retain existing disabled/confirmation semantics.

- [ ] **Step 2: Run RED**

```powershell
npm run test:platform55:p3v2
```

- [ ] **Step 3: Add semantic grouping without changing actions**

Load the parity stylesheet and compose:

1. heading plus approval boundary;
2. five existing metrics;
3. review-required brief;
4. one filter/tool surface;
5. a scope strip that visually separates page selection from all filtered database rows;
6. contained table workspace and pagination;
7. existing evidence/edit/bulk drawers.

The primary page action may visually point to the existing `bulk-approve-button`, but it must remain disabled until the controller authorizes it. Never make `Approve matching`, `Reject matching`, archive, remove, or bulk edit look equivalent to a page-only action.

- [ ] **Step 4: Run regression gates**

```powershell
npm run test:platform55:p3v2
node tests/platform55-operate-shell.test.mjs
node --test --test-name-pattern="serves actual Operate routes" tests/platform55-operate-evidence-server.test.mjs
node tests/rateware-stability.test.mjs
node --check src/staging-review.js
git diff --check
```

- [ ] **Step 5: Commit**

```powershell
git add staging-review.html src/platform55-operate.css tests/platform55-p3v-v2-contract.test.mjs
git commit -m "style: align Review Queue with Platform55"
```

---

### Task 6: Supersede Only the Reviewed Operate Sources

**Files:**
- Create: `docs/release/evidence/2026-08-24-p3v2-source-supersession.json`
- Create: `tools/platform55-p3v2-source-supersession.mjs`
- Create: `tests/platform55-p3v2-source-supersession.test.mjs`
- Modify: `tools/platform55-s6-source-supersession.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: the frozen P3-V2 product SHA/tree and exactly `upload-center.html`, `upload-history.html`, `staging-review.html`, and the shared `src/platform55-visual-parity.css` layer extended by P3-V2.
- Produces: a content-addressed exception that preserves P2-S2 and P3-V1 evidence while proving the four current source blobs are intentional and reviewed.

- [ ] **Step 1: Write RED tests for exact source scope**

Require schema version 1, sprint `P3-V2`, exact product SHA/tree, exactly four unique source paths, Git blob SHA for each path, normalized record digest, and no other runtime path. Reject missing/extra/duplicate paths, working-tree drift, HEAD drift, wrong product tree, stale record digest, absolute/traversal paths, and an untracked record.

- [ ] **Step 2: Run RED**

```powershell
node --test tests/platform55-p3v2-source-supersession.test.mjs
```

Expected: fail because the validator and record do not exist.

- [ ] **Step 3: Freeze the product source commit**

Commit the three completed HTML/CSS compositions and tests, require a clean worktree, then record:

```powershell
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
git rev-parse 'HEAD:upload-center.html'
git rev-parse 'HEAD:upload-history.html'
git rev-parse 'HEAD:staging-review.html'
git rev-parse 'HEAD:src/platform55-visual-parity.css'
```

Do not amend this product commit after creating the record.

- [ ] **Step 4: Implement fail-closed supersession validation**

Follow the existing P3-V1 content-addressed pattern, but accept only `sprint === "P3-V2"` and the exact four-path set. Update `validateHistoricalSourceParity()` to accept current source divergence only when the matching P3-V2 record validates against both product Git objects and current working bytes. It must continue validating the historical P2-S2 and P3-V1 subjects and evidence unchanged.

- [ ] **Step 5: Run GREEN including the previously failing gate**

```powershell
node --test tests/platform55-p3v2-source-supersession.test.mjs
npm run test:platform55:operate
npm run test:platform55:certification
git diff --check
```

- [ ] **Step 6: Commit the supersession contract**

```powershell
git add docs/release/evidence/2026-08-24-p3v2-source-supersession.json tools/platform55-p3v2-source-supersession.mjs tools/platform55-s6-source-supersession.mjs tests/platform55-p3v2-source-supersession.test.mjs package.json
git diff --cached --check
git commit -m "test: bind P3-V2 source supersession"
```

---

### Task 7: Build Deterministic P3-V2 Browser Certification

**Files:**
- Create: `tools/platform55-p3v-v2-browser-certification.mjs`
- Create: `tests/platform55-p3v-v2-browser-certification.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: the three route compositions, P3-V scoring contract, local-only fixture patterns, and accessibility helpers from P3-V1/S6.
- Produces: an external temporary manifest during product review and a product-addressed evidence directory only after the exact product SHA is frozen.

- [ ] **Step 1: Write failing certification-shape tests**

Require this closed route/state matrix:

```js
const MATRIX = Object.freeze({
  "upload-center": ["loaded", "empty", "validation-error", "upload-error"],
  "upload-history": ["loaded", "empty", "loading", "processing-error"],
  "staging-review": ["loaded", "loading", "empty", "review-required", "error"],
});
```

At three viewports this yields exactly 39 captures. Reject missing, duplicate, unknown, misnamed, wrong-viewport, zero-byte, and outside-directory captures.

- [ ] **Step 2: Run RED**

```powershell
node --test tests/platform55-p3v-v2-browser-certification.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for the new certifier.

- [ ] **Step 3: Implement a local-only, read-only certifier**

Follow `tools/platform55-p3v-v1-browser-certification.mjs`, but require:

- exact route/state/query mapping;
- fresh browser context per capture;
- no external requests;
- console, page, request, and HTTP errors equal zero;
- write-like request count equal zero;
- exact viewport and no page overflow;
- internal table overflow contained;
- visible state marker intersecting the viewport;
- accessible names on all visible controls;
- WCAG AA contrast;
- drawer/dialog Tab and Shift+Tab containment plus Escape focus restoration;
- source filename visible in Source Files loaded state;
- page-selected and filtered-database scopes simultaneously visible and distinguishable in Review Queue;
- upload originals/source-retention boundary visible in Upload Center.

Output must be outside the repository unless `--evidence-mode` targets exactly `docs/platform55-visual-parity/evidence/p3v2/<product-sha>`.

- [ ] **Step 4: Add adversarial tests**

Inject and require rejection of: missing accessible name, 1:1 contrast, focus leak, hidden error below fold, viewport metadata drift, PNG hash drift, source blob drift, duplicate state, absent scope distinction, unexpected POST/PUT/PATCH/DELETE, external request, console error, and a symlink/junction output escape.

- [ ] **Step 5: Add package scripts and run GREEN**

```json
"test:platform55:p3v2-browser": "node --test tests/platform55-p3v-v2-browser-certification.test.mjs",
"certify:platform55:p3v2": "node tools/platform55-p3v-v2-browser-certification.mjs"
```

```powershell
npm run test:platform55:p3v2-browser
node --check tools/platform55-p3v-v2-browser-certification.mjs
node --check tests/platform55-p3v-v2-browser-certification.test.mjs
git diff --check
git add package.json tools/platform55-p3v-v2-browser-certification.mjs tests/platform55-p3v-v2-browser-certification.test.mjs
git commit -m "test: certify P3-V2 governed operate visuals"
```

---

### Task 8: Freeze Product, Generate Evidence, Score, and Review

**Files:**
- Create: `docs/platform55-visual-parity/evidence/p3v2/<product-sha>/manifest.json`
- Create: `docs/platform55-visual-parity/evidence/p3v2/<product-sha>/*.png`
- Create: `docs/platform55-visual-parity/evidence/p3v2/<product-sha>/design-review.md`
- Create after independent review: `docs/platform55-visual-parity/evidence/p3v2/<product-sha>/independent-review.md`
- Modify only after all three GO: `docs/platform55-visual-parity/p3v-route-matrix.csv`
- Modify only after all three GO: `docs/platform55-visual-parity/README.md`
- Create: `tools/platform55-p3v2-evidence.mjs`
- Create: `tests/platform55-p3v2-evidence.test.mjs`

**Interfaces:**
- Consumes: exact product commit and 39-capture certification output.
- Produces: immutable P3-V2 evidence and semantic accreditation for exactly three canonical route rows.

- [ ] **Step 1: Run all product gates and freeze the product SHA**

```powershell
npm run test:platform55:p3v2
npm run test:platform55:p3v2-browser
npm run test:platform55:operate
npm test
npm run validate:action-contract
npm audit --audit-level=low
git diff --check
git status --short
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
```

Expected: every command passes and the worktree is clean. Record the exact SHA/tree; do not amend this commit after evidence generation.

- [ ] **Step 2: Generate the exact evidence corpus**

```powershell
$env:RATEWARE_P3V2_PRODUCT_SHA = (git rev-parse HEAD)
npm run certify:platform55:p3v2 -- --evidence-mode
```

Expected: exactly 39 PNG files plus one manifest under the product-addressed directory. Re-run into an external temporary directory and require byte-identical PNGs and manifest normalization.

- [ ] **Step 3: Write and validate the design review**

Score every route independently across the five canonical dimensions. Each route needs total `>=90`, each dimension `>=80%` of its maximum, all required states/viewports, and reviewer verdict `GO`. Record visible differences from the Platform 55 references; content adaptation is allowed, missing hierarchy or broken states are not.

- [ ] **Step 4: Implement fail-closed evidence binding**

`tools/platform55-p3v2-evidence.mjs` must bind:

- exact product SHA and tree;
- all route source blobs at product SHA and current HEAD;
- manifest blob and normalized SHA-256;
- every PNG blob, byte length, dimensions, and SHA-256;
- exactly three score records and canonical route rows;
- exact independent-review body, normalized digest, verdict, counts, reviewed SHA/tree, and no P0/P1/P2;
- squash-safe tree equality without requiring unreachable feature ancestry.

Tests must mutate each field independently and coherently mutate manifest+PNG+review to prove the reviewed commit remains immutable.

- [ ] **Step 5: Commit evidence without route credit**

```powershell
git add docs/platform55-visual-parity/evidence/p3v2 tools/platform55-p3v2-evidence.mjs tests/platform55-p3v2-evidence.test.mjs package.json
git diff --cached --check
git commit -m "docs: record P3-V2 visual evidence"
```

Do not update the route matrix or P3-V progress yet.

- [ ] **Step 6: Obtain immutable independent review**

Review in a brand-new detached clean worktree at the exact evidence SHA. Require fresh browser reproduction, all 39 captures, score validation, controller/ID preservation, action-scope safety, full tests, Action Contract, audit, and zero P0/P1/P2. Any material false-PASS returns NO-GO and leaves all three rows unaccepted.

- [ ] **Step 7: Credit P3-V2 only after three-route GO**

After a bound independent GO, change exactly the three P3-V2 rows to `parity_status=accepted` and `verification=accepted`, with substantive evidence-backed gap summaries. Update the board from 25% to 40%. Add closure regressions that reject partial credit, bare-directory summaries, fabricated review text, noncanonical route sets, evidence drift, and review-body drift.

- [ ] **Step 8: Run closure gates and commit**

```powershell
npm run test:platform55:visual-parity
npm run test:platform55:p3v2
npm run test:platform55:p3v2-browser
npm run test:platform55:p3v2-evidence
npm test
npm run validate:action-contract
npm audit --audit-level=low
git diff --check
git status --short
```

Commit only after all pass:

```powershell
git add docs/platform55-visual-parity tests tools package.json
git diff --cached --check
git commit -m "docs: close P3-V2 governed operate parity"
```

The resulting branch remains local. Push, draft PR, Vercel preview, callback/CORS, Ready, merge, production deployment, and production smoke each require explicit authorization.

---

## Plan Self-Review

- Spec coverage: all three P3-V2 routes, governed-operation archetype, required states/viewports, source retention, staging-first intake, approval boundaries, bulk scopes, evidence binding, independent review, and 40% gate are assigned to explicit tasks.
- Placeholder scan: no TODO, TBD, “similar to,” or unspecified test step remains.
- Interface consistency: Tasks 3-5 consume Task 2 hooks; Task 6 binds their exact source blobs; Task 7 consumes all three route compositions; Task 8 consumes the exact Task 7 manifest/capture contract.
- Scope: HTML/CSS/tests/tools/docs only; controller edits require stopping and revising this plan after a failing presentation-adapter regression.
