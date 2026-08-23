# Platform55 P2 Sprint 5: Intelligence, Automation, and Administration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Apply `superpowers:test-driven-development` and `superpowers:verification-before-completion` at every gate. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Platform55 shell adoption for intelligence, growth, configuration, memory, catalog, and the public entry experience while preserving proposal-only AI behavior and permission-aware administration.

**Architecture:** Five authenticated pages use the tenant shell. `index.html` uses a public entry shell with no tenant data. Intelligence components display last-successful evidence from their existing in-memory state and never trigger data loads merely because a summary view is opened. Administration controls remain governed by existing permissions.

**Tech Stack:** Static HTML/CSS/JavaScript, existing analytical state modules, Node tests, Action Contract validator.

**Spec:** `docs/superpowers/specs/2026-08-21-rateware-platform55-shell-migration-design.md`

**Candidate branch/worktree:** `codex/p2-shell-intelligence-admin-s5` in `C:\Users\andre\OneDrive\Documents\Rateware_P2_S5_Intelligence_Admin`.

## Global Constraints

- Exact execution base: production `main` commit `2ea24dfdcb31df5aa8152c8e8f232fffd34720c8`.
- Starting readiness: General `80.2%`, P2 `60%`; neither number changes until its file-backed gate passes.
- The Build 12 reference archive remains reference-only and is pinned by SHA-256 `CF2CED85E95DFB33BB7410BF73ACE22CB95090CE649747DF60BF2920E808C16A`.
- The six P2-S5 routes preserve their existing data loads, RPC/action names, authorization checks, URL state, confirmation dialogs, and human-review gates.
- AI output remains proposal-only; a shell summary never triggers analysis, promotion, send, approve, publish, writeback, or catalog mutation.
- The public entry route receives no authenticated tenant navigation, tenant identity, private search result, notification summary, or internal action.
- No push, PR mutation, Vercel preview, Kinde change, Supabase change, Ready transition, merge, deployment, or production mutation is authorized by this plan.

---

## Task 0: Close the withheld P2-S4 semantic gate without inventing coverage

**Files:**
- Modify: `tests/production-readiness-report.test.mjs`
- Modify: `tools/production-readiness-report.mjs`
- Modify: `docs/platform55-shell-build-matrix.csv`
- Create: `docs/release/evidence/2026-08-22-p2-s4-semantic-closure.json`
- Modify: `docs/release/production-readiness-ledger.json`

**Interfaces:**
- Consumes: the thirteen exact `build`, `ordinal`, `state`, and `reference_asset` records from `docs/release/evidence/2026-08-22-p2-s4-independent-review.json`.
- Produces: a content-addressed semantic review whose thirteen unique records use `mapping_status` `verified` or `dispositioned` and disposition `implement`, `shared_surface`, `reference_only`, `superseded`, or `out_of_scope_public`, plus a validator that rejects missing, duplicate, fabricated, or source-drifted results.

- [ ] **Step 1: Write the failing semantic-closure tests**

Add tests that reject: fewer or more than thirteen records; duplicate `(build, ordinal, state)` identities; an invented route; an invented component; an `implement` or `shared_surface` disposition without exact route, component, and evidence; a non-implementation disposition that claims an executable target; review content whose SHA-256 digest does not match the pinned digest; and any attempt to set P2 to `70` before an independent `GO` review covers all thirteen records.

- [ ] **Step 2: Run RED**

```powershell
node tests/production-readiness-report.test.mjs
```

Expected: FAIL because the current evidence remains `NO-GO`, `semantic_credit` is `withheld`, and every retained record is unresolved.

- [ ] **Step 3: Review the thirteen reference states against real production surfaces**

For each record, compare the pinned Build reference state with the exact current route/component semantics. Use disposition `implement` or `shared_surface` only for an observable semantic match. Use an explicit non-implementation disposition when the Build state belongs to another product domain or no production workflow exists. Record the source asset, target route/component when applicable, disposition rationale, and immutable evidence identifier; do not copy a generic rationale across rows.

- [ ] **Step 4: Implement the fail-closed validator and exact review artifact**

Require a plain JSON object, exact schema version, exact thirteen-row identity set, allowed dispositions, type-safe visible identifiers, content digest, source projection digest, and independent-review verdict. Keep ledger credit blocked until the detached review is `GO`.

- [ ] **Step 5: Run GREEN and the S4 focused gates**

```powershell
node tests/production-readiness-report.test.mjs
npm run test:platform55:network-service
npm run release:progress
```

Expected before independent review: functional tests PASS and ledger remains P2 `60`. Expected only after the exact detached `GO` artifact is committed: P2 `70`, overall `80.9`.

- [ ] **Step 6: Commit the semantic candidate without claiming independent GO**

```powershell
git add tests/production-readiness-report.test.mjs tools/production-readiness-report.mjs docs/platform55-shell-build-matrix.csv docs/release/evidence/2026-08-22-p2-s4-semantic-closure.json
git commit -m "fix: reconcile withheld Platform55 service semantics"
```

Do not stage the ledger at `70` in this candidate commit. Independent review is a separate immutable gate.

## Task 1: Define the intelligence/admin contract

**Files:**
- Create: `tests/platform55-intelligence-admin-shell.test.mjs`
- Create: `src/platform55-intelligence-admin.css`
- Modify: `package.json`

**Interfaces:**
- Consumes: `mountPlatform55Shell`, `updatePlatform55Shell`, and the existing page-owned auth/data modules.
- Produces: the `test:platform55:intelligence-admin` command and shared P2-S5 presentation classes; it creates no data or action API.

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

**Interfaces:**
- Consumes: existing successful-result state from the BI and Growth modules plus the shared tenant shell.
- Produces: escaped, source-separated evidence summaries labeled with data-as-of, gaps, proposal-only status, and confirmation requirements; opening them performs zero fetches.

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

**Interfaces:**
- Consumes: existing permission selectors, confirmations, governance evidence, memory review state, catalog review state, and the shared tenant shell.
- Produces: permission-aware shell presentation whose badges report state but never grant authorization or expose a hidden mutation.

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

**Interfaces:**
- Consumes: the existing Kinde sign-in/callback/session flow and public Platform55 tokens.
- Produces: an accessible public entry composition with no tenant model, private navigation, or private action registry.

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
- Create: `docs/release/evidence/2026-08-22-p2-s5-intelligence-admin.md`
- Modify: `docs/release/production-readiness-ledger.json`

**Interfaces:**
- Consumes: the exact six-route implementation candidate, the P2-S5-owned route and surface rows, and immutable browser captures.
- Produces: content-addressed P2-S5 evidence and, only when every S4 and S5 gate is accepted, ledger progress P2 `80` / General `81.6`.

- [ ] **Step 1: Capture visual evidence**

Capture six routes at `1440x900`, `1024x768`, and `390x844`, including loaded and one non-happy state. Verify chart containment, evidence labels, permission states, public/tenant isolation, keyboard focus, and reduced motion.

- [ ] **Step 2: Reconcile the P2-S5-owned implementation rows**

The six P2-S5 route records must be `verified`. Every P2-S5-owned surface-inventory row must use one allowed disposition: `implement`, `shared_surface`, `superseded`, `reference_only`, or `out_of_scope_public`, with a route or explicit non-implementation rationale and immutable evidence identifier. Only Build-state rows actually demonstrated by S4 semantic closure or S5 evidence may be changed; unrelated `not_started` Build rows remain owned by P2-S6 convergence. Tests must reject bulk-filled generic evidence and any P2-S5 claim that silently changes a P2-S0 through P2-S4 disposition.

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

Set P2 to `80` and overall progress to `81.6` only when the thirteen-row S4 semantic gate is independently accepted, all six P2-S5 routes and owned surface rows are complete, the 36-capture matrix is content-addressed, and the automated suite evidence is attached. Otherwise preserve the last accepted ledger value. Verdict remains `NO-GO` because P2-S6 convergence, aggregate independent review, preview, deployment, production smoke, and monitoring are incomplete.

- [ ] **Step 5: Commit Sprint 5 evidence**

```powershell
git add docs/platform55-shell-build-matrix.csv docs/platform55-surface-inventory.csv docs/release/evidence/2026-08-22-p2-s5-intelligence-admin.md docs/release/production-readiness-ledger.json
git commit -m "docs: complete P2 shell implementation evidence"
```

**Stop boundary:** Do not push, create/update a PR, alter Kinde/Vercel/Supabase configuration, deploy, promote, or mutate production without a new explicit authorization.
