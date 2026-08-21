# Platform55 P2 Sprint 2: Operate Workspaces Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for every behavior change and `superpowers:verification-before-completion` before each completion claim.

**Goal:** Move Rateware's four core operating workspaces into the approved Platform55 tenant shell while preserving source lineage, review controls, URL state, and the mandatory staging-before-production workflow.

**Architecture:** Keep `src/platform55-shell.js` as the only shell owner. Each page continues to own its business data and actions; it publishes a small page-state model to `updatePlatform55Shell()` and renders its existing workspace inside the shared shell content slot. This sprint changes presentation and page composition only: it adds no endpoint, migration, automated approval, or direct production insert.

**Tech Stack:** Static HTML, CSS, browser JavaScript modules, Node.js test runner, existing Kinde authentication and Supabase Edge APIs.

**Prerequisites:** P2-S0 and P2-S1 are merged into the local P2 integration base. The 22-route tenant inventory and shared shell interfaces are immutable inputs for this sprint.

**Candidate branch/worktree:** `codex/p2-shell-operate-s2` in `C:\Users\andre\OneDrive\Documents\Rateware_P2_S2_Operate`.

---

## Task 1: Add a fail-closed Operate adoption contract

**Files:**
- Create: `tests/platform55-operate-shell.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing route-adoption test**

The test must inspect exactly `upload-center.html`, `upload-history.html`, `staging-review.html`, and `rateware.html`. For each file assert exactly one `data-platform55-shell="tenant"`, one shared shell module include, one main workspace landmark, and zero legacy `.sidebar`, `.mobile-topbar`, or page-owned global navigation roots.

- [ ] **Step 2: Write failing safety assertions**

Assert that:

```js
assert.match(stagingReviewSource, /pending_review/i);
assert.doesNotMatch(stagingReviewSource, /auto(?:matic)?[_-]?approve/i);
assert.match(uploadCenterSource, /source_file|source_filename/i);
assert.match(ratewareSource, /approved/i);
```

Also assert that the four pages keep their existing scripts, canonical IDs used by those scripts, and authentication bootstraps.

- [ ] **Step 3: Register and run the RED test**

Add `"test:platform55:operate": "node tests/platform55-operate-shell.test.mjs"` and insert it exactly once in `npm test`.

Run:

```powershell
npm run test:platform55:operate
```

Expected: FAIL because the four pages still own the legacy shell.

- [ ] **Step 4: Commit the RED contract**

```powershell
git add tests/platform55-operate-shell.test.mjs package.json
git commit -m "test: define Platform55 operate shell contract"
```

## Task 2: Create the shared Operate presentation layer

**Files:**
- Create: `src/platform55-operate.css`
- Modify: `src/platform55-shell.js`
- Modify: `src/platform55-shell.css`
- Test: `tests/platform55-operate-shell.test.mjs`

- [ ] **Step 1: Add failing semantic-layout assertions**

Require reusable classes for page heading, primary metric strip, filter row, workspace panel, empty state, validation banner, review state, and responsive data table. Require all colors, spacing, radii, shadows, and typography to use `--rw-*` tokens.

- [ ] **Step 2: Implement the Operate CSS module**

Define only page-composition classes. Do not redefine the shell rail, top bar, overlay, or global search. At widths `<=900px`, filters stack, metric cards become horizontally scrollable or a single column, and tables retain a labeled scroll container. At `390px`, no fixed-width child may cause viewport overflow.

- [ ] **Step 3: Extend shell page-state updates**

`updatePlatform55Shell(patch, { root })` may update breadcrumbs, title, subtitle, status badge, scoped action descriptors, and busy state. It must reject unknown action IDs, render text with `textContent`, and never execute page actions itself.

- [ ] **Step 4: Run focused tests**

```powershell
npm run test:platform55-shell
npm run test:platform55:operate
node --check src/platform55-shell.js
```

Expected: PASS.

- [ ] **Step 5: Commit the shared Operate layer**

```powershell
git add src/platform55-operate.css src/platform55-shell.css src/platform55-shell.js tests/platform55-operate-shell.test.mjs
git commit -m "feat: add Platform55 operate workspace primitives"
```

## Task 3: Migrate source intake and upload history

**Files:**
- Modify: `upload-center.html`
- Modify: `upload-history.html`
- Modify: `src/upload-center.js`
- Modify: `src/upload-history.js`
- Test: `tests/platform55-operate-shell.test.mjs`
- Test: `tests/upload-center.test.mjs`

- [ ] **Step 1: Add RED fixture assertions for both pages**

Verify that upload center exposes source intake, validation, interpretation, and pending-review status as separate visual regions. Verify that history exposes source filename, vendor/source context, processing state, counts, and a non-mutating detail affordance.

- [ ] **Step 2: Replace page-owned chrome with tenant shell hosts**

Keep every existing business control ID and form name. Move only the page content into the Platform55 workspace slot. Pass route metadata from `routeForPath(location.pathname)`; do not copy navigation arrays into either page.

- [ ] **Step 3: Publish page state without changing the API flow**

After existing load/render transitions, call `updatePlatform55Shell()` with status and breadcrumb text. Do not add fetch calls. Preserve `source_file`/`source_filename`; every interpreted record still lands in `rate_staging` and remains `pending_review` until a human action.

- [ ] **Step 4: Verify focused behavior**

```powershell
node tests/upload-center.test.mjs
node tests/interpret-upload-normalization.test.mjs
npm run test:platform55:operate
node --check src/upload-center.js
node --check src/upload-history.js
```

Expected: PASS.

- [ ] **Step 5: Commit intake/history adoption**

```powershell
git add upload-center.html upload-history.html src/upload-center.js src/upload-history.js tests/platform55-operate-shell.test.mjs
git commit -m "feat: migrate source intake to Platform55 shell"
```

## Task 4: Migrate staging review without weakening approval controls

**Files:**
- Modify: `staging-review.html`
- Modify: `src/staging-review.js`
- Test: `tests/platform55-operate-shell.test.mjs`
- Test: `tests/rateware-stability.test.mjs`

- [ ] **Step 1: Add RED review-state tests**

Cover loading, empty, error/retry, pending, selected-on-page, selected-elsewhere, blocked, and ready-for-human-review. Assert that the Platform55 status badge cannot itself approve, reject, or write.

- [ ] **Step 2: Compose the existing review queue inside the shell**

Preserve the global selection `Set`, page-scope selection calculation, review blocker list, evidence drawer, and existing confirmation dialogs. Put bulk action controls inside the workspace action zone but leave their handlers and authorization checks unchanged.

- [ ] **Step 3: Keep selection and shell summaries coherent**

Every checkbox, filter, pagination, retry, and load completion must update both local controls and the shell summary. Selection retained on another page must be labeled explicitly and remain blocked from page-local bulk execution.

- [ ] **Step 4: Run regression tests**

```powershell
npm run test:platform55:operate
node tests/rateware-stability.test.mjs
node --check src/staging-review.js
```

Expected: PASS with no approval-path changes.

- [ ] **Step 5: Commit staging adoption**

```powershell
git add staging-review.html src/staging-review.js tests/platform55-operate-shell.test.mjs
git commit -m "feat: migrate staging review to Platform55 shell"
```

## Task 5: Migrate the approved rate workspace

**Files:**
- Modify: `rateware.html`
- Modify: `src/rateware.js`
- Test: `tests/platform55-operate-shell.test.mjs`
- Test: `tests/rateware-stability.test.mjs`

- [ ] **Step 1: Add RED tests for approved-only presentation**

Assert that the page distinguishes active filters, result count, approved-rate status, empty/error states, and detail context. Reject any new direct `rate_staging` update or approval call introduced by the migration.

- [ ] **Step 2: Adopt the shell and preserve query state**

Keep URL/query parameter behavior, search, filters, sort, pagination, rate details, and export authorization unchanged. Publish only descriptive state to the shell.

- [ ] **Step 3: Verify rate behavior**

```powershell
npm run test:platform55:operate
node tests/rateware-stability.test.mjs
node --check src/rateware.js
```

Expected: PASS.

- [ ] **Step 4: Commit rate workspace adoption**

```powershell
git add rateware.html src/rateware.js tests/platform55-operate-shell.test.mjs
git commit -m "feat: migrate approved rates to Platform55 shell"
```

## Task 6: Produce visual evidence and close Sprint 2 locally

**Files:**
- Create: `docs/release/evidence/2026-08-21-p2-s2-operate.md`
- Modify: `docs/release/production-readiness-ledger.json`

- [ ] **Step 1: Capture deterministic local evidence**

At `1440x900`, `1024x768`, and `390x844`, capture all four pages in loaded and one non-happy state. Compare shell geometry against the approved screenshot: rail, topbar, content inset, radius, and typography must stay within the master-plan tolerance. Record overflow, focus order, keyboard search, and reduced-motion results.

- [ ] **Step 2: Run the full local gate**

```powershell
npm run test:platform55:operate
npm run test:platform55-shell
npm test
npm run validate:action-contract
npm audit --audit-level=low
git diff --check
```

Expected: all PASS; Action Contract has zero errors; audit has zero vulnerabilities.

- [ ] **Step 3: Record Sprint 2 evidence**

Document the exact candidate SHA, four migrated routes, screenshot paths, test outputs, known non-blocking visual deviations, and confirmation that no endpoint, database, approval, or production behavior changed.

- [ ] **Step 4: Advance formal progress only with evidence**

Set P2 to `45` and overall progress to `79.2` only after the evidence file exists and all checks pass. Verdict remains `NO-GO` because the formal P2 implementation and independent-review gates are not complete.

- [ ] **Step 5: Commit local Sprint 2 evidence**

```powershell
git add docs/release/evidence/2026-08-21-p2-s2-operate.md docs/release/production-readiness-ledger.json
git commit -m "docs: record P2 operate shell evidence"
```

**Stop boundary:** Do not push, create or update a PR, trigger Vercel, create a Supabase branch, deploy, or change production configuration without a new explicit authorization.
