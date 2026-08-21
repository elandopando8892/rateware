# Platform55 P2 Sprint 4: Network and Service Workspaces Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` and `superpowers:verification-before-completion` at their stated gates.

**Goal:** Bring shipper, vendor-service, onboarding, Gmail, and provider-communications workspaces into the Platform55 shell without changing correspondence, case, or release authorization behavior.

**Architecture:** Tenant service pages consume the shared shell and a network/service CSS module. `shipper-profile.html` consumes the public shell variant. Existing page modules continue to own API access. Provider Service tests gain one deterministic runner so the aggregate suite cannot silently omit a provider flow.

**Tech Stack:** Static HTML/CSS/JavaScript, Node test runner, existing Gmail/FCM/provider Edge actions.

**Candidate branch/worktree:** `codex/p2-shell-network-service-s4` in `C:\Users\andre\OneDrive\Documents\Rateware_P2_S4_Network_Service`.

---

## Task 1: Define network/service adoption and test enumeration

**Files:**
- Create: `tests/platform55-network-service-shell.test.mjs`
- Create: `src/platform55-network-service.css`
- Create: `tools/run-provider-service-tests.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing route-adoption test**

Require tenant shell on `shipper-crm.html`, `vendor-support.html`, `vendor-improvement.html`, `provider-service.html`, `provider-onboarding.html`, `provider-gmail.html`, and `provider-communications.html`. Require public shell on `shipper-profile.html` and prohibit private navigation there.

- [ ] **Step 2: Write the deterministic Provider Service runner**

The runner must use `readdirSync('tests')`, select every filename matching `/^provider-service-.*\.test\.mjs$/`, sort lexicographically, spawn `process.execPath` once per file with inherited stdio, and exit non-zero on the first failing child. It must print the enumerated count and filenames. The focused test asserts the count equals the current Git inventory so a new test cannot be silently skipped.

- [ ] **Step 3: Add package scripts**

Add:

```json
"test:provider-service": "node tools/run-provider-service-tests.mjs",
"test:platform55:network-service": "node tests/platform55-network-service-shell.test.mjs"
```

Insert both exactly once in `npm test`.

- [ ] **Step 4: Run RED**

```powershell
npm run test:platform55:network-service
npm run test:provider-service
```

Expected: route adoption FAIL; Provider Service runner PASS on the unchanged baseline.

- [ ] **Step 5: Commit contract and runner**

```powershell
git add tests/platform55-network-service-shell.test.mjs src/platform55-network-service.css tools/run-provider-service-tests.mjs package.json
git commit -m "test: define Platform55 network service contract"
```

## Task 2: Migrate shipper CRM and the public shipper profile

**Files:**
- Modify: `shipper-crm.html`
- Modify: `shipper-profile.html`
- Modify: `src/shippers.js`
- Modify: `src/shipper-profile.js`
- Test: `tests/platform55-network-service-shell.test.mjs`

- [ ] **Step 1: Add RED state and isolation tests**

Cover CRM list/detail/search, empty/error/retry, contact context, and public profile signed-out/expired states. Assert that the public profile exposes no tenant switcher, tenant nav, internal search results, or admin links.

- [ ] **Step 2: Adopt the correct shell variant on both pages**

Preserve query IDs, ownership checks, contact actions, and existing server permissions. The shell may summarize state but must not send an email, create a CRM mutation, or change a profile.

- [ ] **Step 3: Verify and commit**

```powershell
npm run test:platform55:network-service
node --check src/shippers.js
node --check src/shipper-profile.js
git add shipper-crm.html shipper-profile.html src/shippers.js src/shipper-profile.js tests/platform55-network-service-shell.test.mjs
git commit -m "feat: migrate shipper workspaces to Platform55"
```

## Task 3: Migrate vendor support and improvement workspaces

**Files:**
- Modify: `vendor-support.html`
- Modify: `vendor-improvement.html`
- Modify: `src/vendor-support.js`
- Modify: `src/vendor-improvement.js`
- Test: `tests/platform55-network-service-shell.test.mjs`

- [ ] **Step 1: Add RED tests for service-case presentation**

Cover open/closed cases, owner/state filters, improvement-plan evidence, loading/empty/error, and permission-disabled actions. Variable text must be escaped and shell actions must delegate only to already-authorized page controls.

- [ ] **Step 2: Adopt the tenant shell**

Retain the existing case/improvement APIs, status transitions, and confirmation boundaries. Do not add outreach, dispatch, or automated remediation.

- [ ] **Step 3: Verify and commit**

```powershell
npm run test:platform55:network-service
node tests/vendor-template-update.test.mjs
node --check src/vendor-support.js
node --check src/vendor-improvement.js
git add vendor-support.html vendor-improvement.html src/vendor-support.js src/vendor-improvement.js tests/platform55-network-service-shell.test.mjs
git commit -m "feat: migrate vendor service to Platform55"
```

## Task 4: Migrate provider operations without changing release controls

**Files:**
- Modify: `provider-service.html`
- Modify: `provider-onboarding.html`
- Modify: `provider-gmail.html`
- Modify: `provider-communications.html`
- Modify: `src/provider-service-page.js`
- Modify: `src/provider-onboarding-page.js`
- Modify: `src/provider-gmail-page.js`
- Modify: `src/provider-communications-page.js`
- Test: `tests/platform55-network-service-shell.test.mjs`
- Test: all `tests/provider-service-*.test.mjs`

- [ ] **Step 1: Add RED provider-state assertions**

Cover provider review queue, onboarding readiness, Gmail connectivity, message draft/preview, communication history, error/retry, and role-disabled controls. Assert the Platform55 shell cannot release, send, approve, promote, or modify provider records.

- [ ] **Step 2: Adopt the tenant shell on all four pages**

Keep every existing RPC/action name, authorization gate, explicit confirmation, draft-only boundary, and provider evidence. Use shell status badges for summaries only.

- [ ] **Step 3: Run the entire Provider Service corpus**

```powershell
npm run test:platform55:network-service
npm run test:provider-service
node tests/fcm-customer-quote-email.test.mjs
```

Expected: every enumerated provider test PASS; no file omitted.

- [ ] **Step 4: Run syntax checks on each changed module**

```powershell
$files = @('src/provider-service-page.js','src/provider-onboarding-page.js','src/provider-gmail-page.js','src/provider-communications-page.js')
foreach ($file in $files) { node --check $file }
```

- [ ] **Step 5: Commit provider adoption**

Stage `provider-service.html`, `provider-onboarding.html`, `provider-gmail.html`, `provider-communications.html`, `src/provider-service-page.js`, `src/provider-onboarding-page.js`, `src/provider-gmail-page.js`, `src/provider-communications-page.js`, and `tests/platform55-network-service-shell.test.mjs`. Verify this exact staged scope with `git diff --cached --name-only` before committing.

```powershell
git commit -m "feat: migrate provider operations to Platform55"
```

## Task 5: Close the automated-suite milestone

**Files:**
- Create: `docs/release/evidence/2026-08-21-p2-s4-network-service.md`
- Modify: `docs/release/production-readiness.json`
- Modify: `docs/platform55-shell-build-matrix.csv`

- [ ] **Step 1: Capture visual and interaction evidence**

At all three master-plan viewports, capture eight routes with loaded plus one non-happy state. Verify public/tenant isolation, keyboard navigation, focus visibility, long email/provider text, table overflow, and reduced motion.

- [ ] **Step 2: Run the complete automated gate**

```powershell
npm run test:platform55:network-service
npm run test:provider-service
npm test
npm run validate:action-contract
npm audit --audit-level=low
git diff --check
```

Expected: all PASS, zero omitted provider tests, zero Action Contract errors, zero vulnerabilities.

- [ ] **Step 3: Update Build12 fidelity evidence**

Reconcile only the network/service state rows demonstrated by screenshots or executable tests. Keep unresolved states explicit.

- [ ] **Step 4: Advance formal readiness**

Set P2 to `70` and overall progress to `80.9` only after the complete automated suite and evidence are recorded. Keep verdict `NO-GO`; independent review and preview evidence remain incomplete.

- [ ] **Step 5: Commit evidence**

```powershell
git add docs/release/evidence/2026-08-21-p2-s4-network-service.md docs/release/production-readiness.json docs/platform55-shell-build-matrix.csv
git commit -m "docs: record P2 network service evidence"
```

**Stop boundary:** No push, PR update, message send, provider release, Supabase action, deployment, or production mutation without explicit authorization.
