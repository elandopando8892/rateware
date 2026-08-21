# Platform55 P2 Sprint 3: Procurement and Public Bid Experiences Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Apply `superpowers:test-driven-development` to every behavior change and `superpowers:verification-before-completion` before completion claims.

**Goal:** Migrate Rateware's procurement lifecycle into the Platform55 experience while keeping internal tenant workflows and external bid experiences visually related but operationally isolated.

**Architecture:** Internal procurement routes mount the shared tenant shell. Public RFx/carrier routes mount a separate public shell variant that shares tokens, icons, and accessibility primitives but contains no tenant navigation, tenant switcher, notification center, or private global search. Existing page controllers retain all data access and mutations.

**Tech Stack:** Static HTML/CSS, browser JavaScript modules, Node tests, existing authenticated and public Edge API contracts.

**Candidate branch/worktree:** `codex/p2-shell-procurement-s3` in `C:\Users\andre\OneDrive\Documents\Rateware_P2_S3_Procurement`.

---

## Task 1: Define internal and public procurement contracts

**Files:**
- Create: `tests/platform55-procurement-shell.test.mjs`
- Create: `src/platform55-procurement.css`
- Create: `src/platform55-public-shell.css`
- Modify: `package.json`

- [ ] **Step 1: Write failing route-classification tests**

Assert tenant shell adoption for `vendors.html`, `rfx-process.html`, `rfx-events.html`, `ratebook.html`, and `outreach.html`. Assert public shell adoption for `carrier-profile.html`, `rfx-bid.html`, `bid-room-board.html`, `customer-rfi.html`, and `ratebook-carrier.html`.

- [ ] **Step 2: Write failing isolation assertions**

Public pages must contain `data-platform55-shell="public"` and must not contain or receive private tenant nav, tenant avatar/menu, authenticated notification controls, Ask AI, admin links, or private command results. Tenant pages must continue to require their current auth bootstrap.

- [ ] **Step 3: Implement procurement and public-shell CSS**

Procurement classes cover event status, milestones, lane tables, vendor responses, award-readiness, outreach state, and carrier comparison. Public-shell classes cover a compact brand header, deadline/context strip, form workspace, mobile action region, and signed-out/error states. Both consume `--rw-*` tokens.

- [ ] **Step 4: Register and run focused tests**

Add `"test:platform55:procurement": "node tests/platform55-procurement-shell.test.mjs"` exactly once to `npm test`.

```powershell
npm run test:platform55:procurement
```

Expected: RED until pages adopt their assigned shell.

- [ ] **Step 5: Commit the contract**

```powershell
git add tests/platform55-procurement-shell.test.mjs src/platform55-procurement.css src/platform55-public-shell.css package.json
git commit -m "test: define Platform55 procurement shell contract"
```

## Task 2: Migrate vendor and sourcing workspaces

**Files:**
- Modify: `vendors.html`
- Modify: `rfx-events.html`
- Modify: `src/vendors.js`
- Modify: `src/rfx-events.js`
- Test: `tests/platform55-procurement-shell.test.mjs`

- [ ] **Step 1: Add RED state tests**

Cover vendor list/search/detail, RFx draft/open/closed states, filter persistence, empty/error/retry, and deep-link restoration via `rfx_event_id` and `draft_search`.

- [ ] **Step 2: Mount both pages in the tenant shell**

Preserve all existing IDs, query parameters, route links, and handlers. Shell updates are descriptive only; navigation and page state remain owned by page controllers.

- [ ] **Step 3: Verify lifecycle and URL behavior**

```powershell
npm run test:platform55:procurement
node tests/rfx-multilane-e2e.test.mjs
node tests/vendor-template-update.test.mjs
node --check src/vendors.js
node --check src/rfx-events.js
```

Expected: PASS without new API calls.

- [ ] **Step 4: Commit vendor/sourcing migration**

```powershell
git add vendors.html rfx-events.html src/vendors.js src/rfx-events.js tests/platform55-procurement-shell.test.mjs
git commit -m "feat: migrate vendor sourcing to Platform55 shell"
```

## Task 3: Migrate RFx process, ratebook, and outreach

**Files:**
- Modify: `rfx-process.html`
- Modify: `ratebook.html`
- Modify: `outreach.html`
- Modify: `src/rfx-process.js`
- Modify: `src/ratebook.js`
- Modify: `src/outreach.js`
- Test: `tests/platform55-procurement-shell.test.mjs`

- [ ] **Step 1: Add RED assertions for workflow boundaries**

Require separate presentation of process readiness, demand snapshot, package, bid response, award, and implementation handoff. Assert that hidden or unavailable mutation controls are not made visible merely by shell adoption. Preserve preview/download-only handoff behavior where required.

- [ ] **Step 2: Adopt the tenant shell on all three routes**

Keep the existing RFx state machine, ratebook filters, outreach drafts, confirmation prompts, and server authorization. Do not mount dormant `Create award package`, `Mark implementation ready`, send, dispatch, or promotion controls unless the existing page state already authorizes them.

- [ ] **Step 3: Run focused behavior checks**

```powershell
npm run test:platform55:procurement
node tests/rfx-multilane-e2e.test.mjs
node tests/ratebook.test.mjs
node tests/rateware-stability.test.mjs
node --check src/rfx-process.js
node --check src/ratebook.js
node --check src/outreach.js
```

Expected: PASS.

- [ ] **Step 4: Commit internal procurement adoption**

```powershell
git add rfx-process.html ratebook.html outreach.html src/rfx-process.js src/ratebook.js src/outreach.js tests/platform55-procurement-shell.test.mjs
git commit -m "feat: compose procurement workflows in Platform55"
```

## Task 4: Build the public Platform55 procurement variant

**Files:**
- Modify: `carrier-profile.html`
- Modify: `rfx-bid.html`
- Modify: `bid-room-board.html`
- Modify: `customer-rfi.html`
- Modify: `ratebook-carrier.html`
- Modify: `src/carrier-profile.js`
- Modify: `src/rfx-bid.js`
- Modify: `src/rfx-bid-chat-cache.js`
- Modify: `src/bid-room-board.js`
- Modify: `src/customer-rfi.js`
- Modify: `src/ratebook-carrier.js`
- Test: `tests/platform55-procurement-shell.test.mjs`
- Test: `tests/customer-rfi.test.mjs`

- [ ] **Step 1: Add RED public-boundary tests**

For each page assert public-shell metadata, explicit organization/event context, safe signed-out/expired/error states, accessible form labels, and no private-route links. Test keyboard submission boundaries and mobile sticky actions without invoking a live endpoint.

- [ ] **Step 2: Mount the public shell variant**

Use the same tokens and icon component but a different DOM template. Preserve invitation tokens, RFx IDs, carrier context, deadlines, existing validation, and existing submit confirmation. Do not import tenant navigation state.

- [ ] **Step 3: Run public-flow tests**

```powershell
npm run test:platform55:procurement
node tests/customer-rfi.test.mjs
node tests/ratebook.test.mjs
node tests/rfx-multilane-e2e.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit public procurement adoption**

```powershell
git add carrier-profile.html rfx-bid.html bid-room-board.html customer-rfi.html ratebook-carrier.html src/carrier-profile.js src/rfx-bid.js src/rfx-bid-chat-cache.js src/bid-room-board.js src/customer-rfi.js src/ratebook-carrier.js tests/platform55-procurement-shell.test.mjs
git commit -m "feat: add Platform55 public procurement shell"
```

Before committing, use `git diff --name-only --cached` and require the staged set to match the files named in this task exactly.

## Task 5: Verify visual parity and close Sprint 3 locally

**Files:**
- Create: `docs/release/evidence/2026-08-21-p2-s3-procurement.md`
- Modify: `docs/release/production-readiness-ledger.json`

- [ ] **Step 1: Capture deterministic viewports**

Capture the five tenant and five public pages at `1440x900`, `1024x768`, and `390x844`, including loaded, empty/error, and one lifecycle-specific state per page. Verify no private control appears in public output and no public form loses event/carrier context.

- [ ] **Step 2: Run the complete local gate**

```powershell
npm run test:platform55:procurement
npm test
npm run validate:action-contract
npm audit --audit-level=low
git diff --check
```

Expected: PASS, zero Action Contract errors, zero vulnerabilities.

- [ ] **Step 3: Reconcile the Build12 fidelity matrix**

Mark only the procurement route/state rows actually reproduced. Attach screenshots and test names to each updated row; a state without evidence remains `not_started`.

- [ ] **Step 4: Advance readiness with evidence**

Set P2 to `60` and overall progress to `80.2` after the full implementation evidence exists. Keep verdict `NO-GO`; automated-suite and independent-review gates remain ahead.

- [ ] **Step 5: Commit evidence**

```powershell
git add docs/release/evidence/2026-08-21-p2-s3-procurement.md docs/release/production-readiness-ledger.json docs/platform55-shell-build-matrix.csv
git commit -m "docs: record P2 procurement shell evidence"
```

**Stop boundary:** No push, PR metadata, Vercel action, Supabase branch, send/dispatch, bid submission, award, or production mutation without a new explicit authorization.
