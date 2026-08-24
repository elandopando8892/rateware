# Rateware Platform 55 P3-V Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all 29 Rateware routes to system-identical, content-adapted Platform 55 visual fidelity while preserving production controllers, authorization, tenant boundaries, human approval gates, and route URLs.

**Architecture:** Keep the production shell and page controllers authoritative. Add a fail-closed visual-parity contract, reusable page-interior CSS primitives, and family-specific composition layers. Deliver one bounded route family at a time, with immutable same-viewport evidence and independent review before the route matrix can mark any route `accepted`.

**Tech Stack:** Static HTML, CSS custom properties, browser-native JavaScript modules, Node.js test runner, Playwright through the repository's existing browser-certification runtime, SHA-256 content addressing, CSV/JSON/Markdown evidence.

**Spec:** `docs/superpowers/specs/2026-08-23-rateware-platform55-visual-parity-design.md`

## Global Constraints

- The canonical route board is `docs/platform55-visual-parity/p3v-route-matrix.csv`; it must contain exactly the 29 routes listed in this plan.
- The reference ZIP and extracted Build 01-12 package are design evidence only. Production must never import or serve them.
- Preserve route URLs, existing element IDs, event handlers, API calls, authorization checks, selection semantics, mutations, exports, pagination, and human approval gates.
- Add presentation hooks or safe grouping only. A visual wave must not add migrations, SQL, DDL, DML, Edge Functions, secrets, CORS, tenant-enforcement changes, Supabase branches, production data, or automatic approvals.
- A route is `accepted` only with score `>= 90`, every weighted dimension at least `80%`, all three viewports, required non-happy states, browser/accessibility checks, exact candidate SHA, content-addressed evidence, and independent `GO` with no P0/P1/P2 findings.
- A route with missing, stale, fabricated, or semantically mismatched evidence is `blocked`.
- Local implementation, tests, screenshots, and offline review do not authorize push, PR metadata changes, preview, Ready, merge, deployment, or production smoke.
- P3-V is a visual workstream. It does not independently change the formal P3-P5 production-readiness ledger.

---

## Route and Wave Inventory

| Wave | Routes | Exit progress |
|---|---|---:|
| P3-V0 | Contract sources, seven pinned baselines, 29-route matrix | 10% |
| P3-V1 | `app.html`, `rateware.html` | 25% |
| P3-V2 | `upload-center.html`, `upload-history.html`, `staging-review.html` | 40% |
| P3-V3 | `vendors.html`, `rfx-process.html`, `rfx-events.html`, `ratebook.html`, `outreach.html` | 60% |
| P3-V4 | `shipper-crm.html`, `vendor-support.html`, `vendor-improvement.html`, `provider-service.html`, `provider-onboarding.html`, `provider-gmail.html`, `provider-communications.html` | 75% |
| P3-V5 | `business-intelligence.html`, `growth-hacking.html`, `settings.html`, `interpretation-memory.html`, `catalog-workbench.html`, `bid-room-board.html`, `carrier-profile.html`, `customer-rfi.html`, `index.html`, `ratebook-carrier.html`, `rfx-bid.html`, `shipper-profile.html` | 90% |
| P3-V6 | Aggregate 29-route certification, independent review, authorized preview and production visual smoke | 100% |

The total is exactly 29 unique routes: 2 + 3 + 5 + 7 + 12.

---

### Task 1: Preserve and verify P3-V0

**Files:**
- Verify: `docs/superpowers/specs/2026-08-23-rateware-platform55-visual-parity-design.md`
- Verify: `docs/platform55-visual-parity/README.md`
- Verify: `docs/platform55-visual-parity/p3v-route-matrix.csv`
- Verify: `docs/platform55-visual-parity/baseline/*.png`

- [ ] **Step 1: Verify the frozen source identities**

Run:

```powershell
Get-FileHash -Algorithm SHA256 'C:\Users\andre\Downloads\rateware_foundation_home_commercial_procurement_operations_finance_intelligence_administration_platform_build_v12.zip'
Get-FileHash -Algorithm SHA256 'C:\Users\andre\Downloads\rateware_foundation_home_commercial_procurement_operations_finance_intelligence_administration_platform_implementation_blueprint_v1.html'
```

Expected ZIP hash: `CF2CED85E95DFB33BB7410BF73ACE22CB95090CE649747DF60BF2920E808C16A`.

Expected blueprint hash: `68CB5496B98CA1049A46E49E3852F2F73398BBFE6C0EE05ABA5975FEE4BBE1EA`.

- [ ] **Step 2: Verify matrix cardinality and uniqueness**

Run:

```powershell
$rows = Import-Csv docs/platform55-visual-parity/p3v-route-matrix.csv
if ($rows.Count -ne 29) { throw "Expected 29 routes, found $($rows.Count)" }
$duplicates = $rows | Group-Object route | Where-Object Count -gt 1
if ($duplicates) { throw "Duplicate P3-V routes: $($duplicates.Name -join ', ')" }
```

Expected: no output and exit `0`.

- [ ] **Step 3: Run baseline safety checks**

Run:

```powershell
npm test
npm audit --audit-level=low
git diff --check
```

Expected: all tests pass, zero vulnerabilities, and no diff errors.

- [ ] **Step 4: Record the immutable starting point**

The implementation evidence for P3-V1 must record the exact base SHA and the P3-V0 design commit; it must not rewrite the seven baseline files.

---

### Task 2: Execute P3-V1 — Command Center and Rateware

**Files:**
- Execute: `docs/superpowers/plans/2026-08-23-rateware-platform55-p3v-v1-command-rateware.md`

- [ ] **Step 1: Execute the detailed plan in order**

Use the dedicated P3-V1 plan. It creates the fail-closed scoring contract, reusable interior primitives, the Command Center and Rateware composition changes, deterministic browser evidence, and independent review artifacts.

- [ ] **Step 2: Enforce the wave gate**

P3-V1 may move from `10%` to `25%` only when both `app.html` and `rateware.html` are `accepted`. One accepted route and one blocked route leaves P3-V at `10%`.

---

### Task 3: Execute P3-V2 — Governed Operate Routes

**Files:**
- Create: `docs/superpowers/plans/2026-08-23-rateware-platform55-p3v-v2-operate.md`
- Modify: `upload-center.html`
- Modify: `upload-history.html`
- Modify: `staging-review.html`
- Modify: `src/platform55-visual-parity.css`
- Modify: `src/platform55-operate.css`
- Modify: route controllers only when a presentation adapter cannot be expressed safely in HTML/CSS
- Create: `tests/platform55-p3v-v2-contract.test.mjs`
- Create: `tools/platform55-p3v-v2-browser-certification.mjs`

- [ ] **Step 1: Write the detailed P3-V2 plan before code**

The plan must preserve source-file retention, staging-first intake, review/approval boundaries, bulk-action scopes, evidence links, and all existing IDs.

- [ ] **Step 2: Migrate the three routes as one visual family**

Use the governed-operations archetype: context banner, metrics, one filter surface, explicit selection scope, table/card workspace, and visible non-happy state. Do not merge Upload Center, Source Files, and Review Queue into one controller.

- [ ] **Step 3: Certify states**

Capture loaded plus route-specific loading/empty/error/review-required states at `1440x900`, `1024x768`, and `390x844`.

- [ ] **Step 4: Close P3-V2**

All three routes must be independently `GO` before P3-V becomes `40%`.

---

### Task 4: Execute P3-V3 — Procurement and Carrier Lifecycle

**Files:**
- Create: `docs/superpowers/plans/2026-08-23-rateware-platform55-p3v-v3-procurement.md`
- Modify: `vendors.html`
- Modify: `rfx-process.html`
- Modify: `rfx-events.html`
- Modify: `ratebook.html`
- Modify: `outreach.html`
- Modify: `src/platform55-visual-parity.css`
- Modify: `src/platform55-procurement.css`
- Create: `tests/platform55-p3v-v3-contract.test.mjs`
- Create: `tools/platform55-p3v-v3-browser-certification.mjs`

- [ ] **Step 1: Write the detailed P3-V3 plan before code**

The plan must map project/event identity, carrier profile, lifecycle, lanes, bids, awards, agreements, communication proposals, and confirmation boundaries without inventing backend state.

- [ ] **Step 2: Implement family-consistent procurement interiors**

Preserve bid and award confirmation gates. Hidden legacy mutation panels must not become visible merely to match a reference screen.

- [ ] **Step 3: Certify private and public boundary behavior**

Verify authentication, permissions, confirmation-required actions, focus containment, mobile reflow, table containment, and zero unexpected writes.

- [ ] **Step 4: Close P3-V3**

All five routes must be independently `GO` before P3-V becomes `60%`.

---

### Task 5: Execute P3-V4 — Network, Provider, Support, and Improvement

**Files:**
- Create: `docs/superpowers/plans/2026-08-23-rateware-platform55-p3v-v4-network-service.md`
- Modify: `shipper-crm.html`
- Modify: `vendor-support.html`
- Modify: `vendor-improvement.html`
- Modify: `provider-service.html`
- Modify: `provider-onboarding.html`
- Modify: `provider-gmail.html`
- Modify: `provider-communications.html`
- Modify: `src/platform55-visual-parity.css`
- Modify: `src/platform55-network-service.css`
- Create: `tests/platform55-p3v-v4-contract.test.mjs`
- Create: `tools/platform55-p3v-v4-browser-certification.mjs`

- [ ] **Step 1: Write the detailed P3-V4 plan before code**

Separate customer/carrier profile, operational support, provider runtime, onboarding, read-only Gmail, and proposal-only communication semantics even when they share cards and timeline primitives.

- [ ] **Step 2: Implement profile, health, timeline, and readiness primitives**

No visual consolidation may imply dispatch, message sending, ticket resolution, CRM writeback, or implementation readiness that the current controllers do not authorize.

- [ ] **Step 3: Certify the seven routes**

Require loaded and non-happy states, exact access model, no private controls on public surfaces, accessible names, focus behavior, contrast, overflow, and zero unexpected writes.

- [ ] **Step 4: Close P3-V4**

All seven routes must be independently `GO` before P3-V becomes `75%`.

---

### Task 6: Execute P3-V5 — Intelligence, Administration, and Public/Entry

**Files:**
- Create: `docs/superpowers/plans/2026-08-23-rateware-platform55-p3v-v5-intelligence-admin-public.md`
- Modify: the 12 P3-V5 route HTML files listed in the route table
- Modify: `src/platform55-visual-parity.css`
- Modify: `src/platform55-intelligence-admin.css`
- Modify: `src/platform55-public.css`
- Create: `tests/platform55-p3v-v5-contract.test.mjs`
- Create: `tools/platform55-p3v-v5-browser-certification.mjs`

- [ ] **Step 1: Write the detailed P3-V5 plan before code**

The plan must keep evidence/data-as-of/gaps separate from recommendations, keep configuration actions scoped and auditable, and prevent private tenant controls from appearing on public or entry routes.

- [ ] **Step 2: Implement the three related visual families**

Use shared tokens and component geometry, but keep intelligence, administration, and public/entry DOM contracts distinct.

- [ ] **Step 3: Certify all 12 routes**

Test loaded and route-specific non-happy states at all viewports, including signed-out and permission-denied boundaries.

- [ ] **Step 4: Close P3-V5**

All 12 routes must be independently `GO` before P3-V becomes `90%`.

---

### Task 7: Execute P3-V6 — Aggregate Convergence and Release Evidence

**Files:**
- Create: `docs/superpowers/plans/2026-08-23-rateware-platform55-p3v-v6-aggregate.md`
- Create: `tests/platform55-p3v-aggregate.test.mjs`
- Create: `tools/platform55-p3v-aggregate-certification.mjs`
- Modify: `docs/platform55-visual-parity/p3v-route-matrix.csv`
- Create: `docs/platform55-visual-parity/evidence/p3v6/<candidate-sha>/manifest.json`
- Create: `docs/platform55-visual-parity/evidence/p3v6/<candidate-sha>/independent-review.md`

- [ ] **Step 1: Write the detailed aggregate plan before code or evidence changes**

The aggregate plan must verify exact route set, accepted score math, immutable evidence bindings, current source blobs, browser results, and reviewer verdicts.

- [ ] **Step 2: Run the 29-route browser matrix**

At minimum, run `29 routes x 3 viewports x loaded state`, plus every route's required non-happy state. Use a fresh browser context per capture group, local deterministic boundaries, zero external network, zero mutation, console/HTTP/page/request error collection, focus/keyboard checks, contrast, and overflow assertions.

- [ ] **Step 3: Run the full regression and governance gates**

```powershell
npm test
npm run validate:action-contract
npm audit --audit-level=low
npm run release:progress
git diff --check
```

Expected: exit `0`, no new Action Contract errors, zero vulnerabilities, formal project ledger unchanged by visual-only work unless separately authorized, and clean diff checks.

- [ ] **Step 4: Obtain independent immutable review**

The reviewer must use a new detached clean worktree at the exact candidate SHA, reproduce scoring and evidence hashes, inspect all route families, and stop on the first P0/P1/P2 false-PASS.

- [ ] **Step 5: Request consequential authorization separately**

Only after aggregate `GO`, request explicit authorization for push/draft PR. Preview, Ready, merge, automatic deployment, and authenticated production smoke remain separate authorization boundaries.

- [ ] **Step 6: Close P3-V**

Mark P3-V `100%` only after all 29 routes are `accepted` and the authorized production visual smoke confirms the deployed SHA. Keep the formal P3-P5 production-readiness ledger independent.

---

## Delivery Rule

Execute waves in order. Local development of the next detailed plan may begin while a prior wave awaits external authorization, but no later wave may inherit `accepted` credit from an unreviewed or blocked route. The fastest safe path is therefore: reusable contract and primitives in V1, then family-sized parallelizable work packages, then one aggregate certification rather than repeated global rewrites.
