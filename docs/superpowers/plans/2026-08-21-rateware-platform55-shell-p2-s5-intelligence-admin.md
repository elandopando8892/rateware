# Platform55 P2 Sprint 5: Intelligence, Automation, and Administration Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Apply `superpowers:test-driven-development` and `superpowers:verification-before-completion` at every gate.

**Goal:** Complete Platform55 shell adoption for intelligence, growth, configuration, memory, catalog, and the public entry experience while preserving proposal-only AI behavior and permission-aware administration.

**Architecture:** Five authenticated pages use the tenant shell. `index.html` uses a public entry shell with no tenant data. Intelligence components display last-successful evidence from their existing in-memory state and never trigger data loads merely because a summary view is opened. Administration controls remain governed by existing permissions.

**Tech Stack:** Static HTML/CSS/JavaScript, existing analytical state modules, Node tests, Action Contract validator.

**Candidate branch/worktree:** `codex/p2-shell-intelligence-admin-s5` in `C:\Users\andre\OneDrive\Documents\Rateware_P2_S5_Intelligence_Admin`.

---

## Task 1: Define the intelligence/admin contract

**Files:**
- Create: `tests/platform55-intelligence-admin-shell.test.mjs`
- Create: `src/platform55-intelligence-admin.css`
- Modify: `package.json`

- [ ] **Step 1: Write failing adoption tests**

Require tenant shell on `business-intelligence.html`, `growth-hacking.html`, `settings.html`, `interpretation-memory.html`, and `catalog-workbench.html`. Require public entry shell on `index.html` and prohibit tenant navigation/data there.

- [ ] **Step 2: Add behavior-boundary assertions**

Assert that shell adoption adds no new `fetch`, RPC, queue, promote, approve, send, writeback, or automatic analysis calls. Require explicit labels for `proposal only`, `confirmation required`, last successful result, stale/unknown timestamps, and missing evidence where those states apply.

- [ ] **Step 3: Implement the shared CSS module**

Define evidence cards, recommendation lists, confidence/gap indicators, comparison tables, governance panels, permission summaries, memory/catalog workspaces, and responsive visualization containers using only Platform55 tokens.

- [ ] **Step 4: Register and run RED**

Add `"test:platform55:intelligence-admin": "node tests/platform55-intelligence-admin-shell.test.mjs"` exactly once to `npm test`.

```powershell
npm run test:platform55:intelligence-admin
```

Expected: FAIL until all six pages adopt their assigned shell.

- [ ] **Step 5: Commit contract**

```powershell
git add tests/platform55-intelligence-admin-shell.test.mjs src/platform55-intelligence-admin.css package.json
git commit -m "test: define Platform55 intelligence admin contract"
```

## Task 2: Migrate Business Intelligence and Growth Hacking

**Files:**
- Modify: `business-intelligence.html`
- Modify: `growth-hacking.html`
- Modify: `src/business-intelligence.js`
- Modify: `src/growth-hacking.js`
- Test: `tests/platform55-intelligence-admin-shell.test.mjs`
- Test: `tests/platform55-intelligence.test.mjs`
- Test: `tests/growth-hacking.test.mjs`

- [ ] **Step 1: Add RED state tests**

Cover empty session, loading, last-successful pivot, drilldown, geo, ranking, recommendations, data gaps, stale/mixed evidence, error/retry, and permission-disabled promotion. Assert that opening a Platform55 summary tab does not call a fetch function.

- [ ] **Step 2: Adopt the tenant shell**

Preserve current analytical state objects and render each evidence source separately. Do not combine results from different filters/timestamps into one asserted universe. Escape all result text and label recommendations/proposed actions as requiring confirmation.

- [ ] **Step 3: Verify behavior**

```powershell
node tests/platform55-intelligence.test.mjs
node tests/growth-hacking.test.mjs
npm run test:platform55:intelligence-admin
node --check src/business-intelligence.js
node --check src/growth-hacking.js
```

Expected: PASS.

- [ ] **Step 4: Commit intelligence adoption**

```powershell
git add business-intelligence.html growth-hacking.html src/business-intelligence.js src/growth-hacking.js tests/platform55-intelligence-admin-shell.test.mjs
git commit -m "feat: migrate intelligence workspaces to Platform55"
```

## Task 3: Migrate settings, memory, and catalog governance

**Files:**
- Modify: `settings.html`
- Modify: `interpretation-memory.html`
- Modify: `catalog-workbench.html`
- Modify: `src/settings.js`
- Modify: `src/interpretation-memory.js`
- Modify: `src/catalog-workbench.js`
- Test: `tests/platform55-intelligence-admin-shell.test.mjs`
- Test: `tests/platform55-admin-governance.test.mjs`

- [ ] **Step 1: Add RED permission and governance tests**

Cover loaded/empty/error states, permission-hidden and permission-disabled controls, tenant/user/team/role/domain/subscription sections, memory review state, catalog review state, and destructive-action confirmations. The shell must never make a hidden mutation available.

- [ ] **Step 2: Adopt the tenant shell**

Keep all current auth checks, permission selectors, RPC/action names, confirmation dialogs, and audit evidence. Shell badges may report `read-only`, `review required`, or `blocked`; they cannot grant permission or invoke mutation.

- [ ] **Step 3: Verify governance behavior**

```powershell
node tests/platform55-admin-governance.test.mjs
node tests/platform55-platform-readiness.test.mjs
npm run test:platform55:intelligence-admin
node --check src/settings.js
node --check src/interpretation-memory.js
node --check src/catalog-workbench.js
```

Expected: PASS.

- [ ] **Step 4: Commit administration adoption**

```powershell
git add settings.html interpretation-memory.html catalog-workbench.html src/settings.js src/interpretation-memory.js src/catalog-workbench.js tests/platform55-intelligence-admin-shell.test.mjs
git commit -m "feat: migrate administration to Platform55 shell"
```

## Task 4: Migrate the public entry experience

**Files:**
- Modify: `index.html`
- Modify: `src/landing.js`
- Modify: `src/platform55-public-shell.css`
- Test: `tests/platform55-intelligence-admin-shell.test.mjs`

- [ ] **Step 1: Add RED public-entry tests**

Assert a Platform55-branded sign-in/entry view, safe loading/error/callback states, accessible Kinde control, and zero tenant names, internal navigation, private search results, or authenticated notifications before session establishment.

- [ ] **Step 2: Implement entry composition**

Reuse public tokens/icons and the existing authentication flow. Do not change callback URLs, Kinde configuration, redirects, secrets, or session policy in this sprint.

- [ ] **Step 3: Verify and commit**

```powershell
npm run test:platform55:intelligence-admin
node --check src/landing.js
git add index.html src/landing.js src/platform55-public-shell.css tests/platform55-intelligence-admin-shell.test.mjs
git commit -m "feat: align public entry with Platform55"
```

Require the staged set to match those four paths exactly. Do not stage `src/auth.js` or any unrelated authentication change.

## Task 5: Close implementation coverage and automated evidence

**Files:**
- Modify: `docs/platform55-shell-build-matrix.csv`
- Modify: `docs/platform55-surface-inventory.csv`
- Create: `docs/release/evidence/2026-08-21-p2-s5-intelligence-admin.md`
- Modify: `docs/release/production-readiness.json`

- [ ] **Step 1: Capture visual evidence**

Capture six routes at `1440x900`, `1024x768`, and `390x844`, including loaded and one non-happy state. Verify chart containment, evidence labels, permission states, public/tenant isolation, keyboard focus, and reduced motion.

- [ ] **Step 2: Reconcile every implementation row**

All 29 route records and all 1,150 build-state rows must have `mapping_status` equal to `verified` or `dispositioned`. Every row must also use one allowed `disposition`: `implement`, `shared_surface`, `superseded`, `reference_only`, or `out_of_scope_public`. All 95 surface-inventory rows must use the same disposition vocabulary. No status, disposition, target route, or required evidence field may remain `not_started`, `unknown`, or blank; every row cites a test or screenshot identifier.

- [ ] **Step 3: Run the complete automated suite**

```powershell
npm run test:platform55:intelligence-admin
npm run test:provider-service
npm test
npm run validate:action-contract
npm audit --audit-level=low
git diff --check
```

Expected: all PASS, zero Action Contract errors, zero vulnerabilities.

- [ ] **Step 4: Advance formal readiness**

Set P2 to `80` and overall progress to `81.6` only when implementation coverage is complete and the automated suite evidence is attached. Verdict remains `NO-GO` because independent review and preview/production gates are incomplete.

- [ ] **Step 5: Commit Sprint 5 evidence**

```powershell
git add docs/platform55-shell-build-matrix.csv docs/platform55-surface-inventory.csv docs/release/evidence/2026-08-21-p2-s5-intelligence-admin.md docs/release/production-readiness.json
git commit -m "docs: complete P2 shell implementation evidence"
```

**Stop boundary:** Do not push, create/update a PR, alter Kinde/Vercel/Supabase configuration, deploy, promote, or mutate production without a new explicit authorization.
