# Rateware Platform 55 Shell P2 Master Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a faithful, production-wired Platform 55 shell across the complete Rateware experience, with traceable coverage of all twelve reference builds and all 95 inventoried surfaces.

**Architecture:** Build a shared tenant shell, icon system, search/navigation model, and focused CSS layers around the existing page modules. Migrate bounded route groups sequentially, preserve all domain APIs and human-approval boundaries, then certify the immutable aggregate candidate through visual, behavioral, security, preview, deployment, and monitoring gates.

**Tech Stack:** Static HTML, ES modules, CSS, Node.js tests, PowerShell ZIP inventory, Kinde PKCE authentication, existing Supabase Edge clients, Vercel previews, and browser-based visual verification.

**Spec:** `docs/superpowers/specs/2026-08-21-rateware-platform55-shell-migration-design.md`

## Global Constraints

- The Build 12 reference is `C:\Users\andre\Downloads\rateware_foundation_home_commercial_procurement_operations_finance_intelligence_administration_platform_build_v12.zip`, SHA-256 `CF2CED85E95DFB33BB7410BF73ACE22CB95090CE649747DF60BF2920E808C16A`.
- The cumulative blueprint is `C:\Users\andre\Downloads\rateware\rateware_foundation_home_commercial_procurement_operations_finance_intelligence_administration_platform_implementation_blueprint_v1.html`, SHA-256 `68CB5496B98CA1049A46E49E3852F2F73398BBFE6C0EE05ABA5975FEE4BBE1EA`.
- Builds `build_01` through `build_12`, all 1,150 render-plan states, all 95 surface-inventory rows, 22 authenticated internal pages, and 7 public/entry pages must be accounted for.
- Later build evidence wins a visual conflict; superseded evidence remains documented.
- The blueprint and ZIP are reference inputs only and must never be loaded by the production browser.
- Existing page IDs, domain modules, API calls, tenant isolation, permissions, URL state, and action handlers stay authoritative unless an owning sprint changes and tests them.
- Rate quotations enter `rate_staging`; human approval remains mandatory before production insertion.
- No shell task may automatically send a message, submit a bid, approve a rate, create an award, dispatch freight, mutate Fleet Rocket, mutate MARKSMAN ERP, change a secret, change tenant enforcement, or write production data.
- Public/entry pages never receive authenticated tenant navigation or private header controls.
- Local development, tests, documentation, and offline visual work continue without scheduled blockers.
- Push, PR metadata, Vercel preview, Ready, merge, automatic production deployment, manual promotion, Supabase branch creation, migrations, DDL, DML, configuration, secrets, and production mutations require their separately stated authorization.
- Never create a second persistent Supabase preview branch for this frontend-only program.

---

## Execution Map

| Order | Plan | Branch | Model / effort before execution | Exit P2 | Exit overall |
|---:|---|---|---|---:|---:|
| 0 | `2026-08-21-rateware-platform55-shell-p2-s0-contract.md` | `codex/p2-shell-contract-s0` | GPT-5.6 Sol / high | 10% | 76.7% |
| 1 | `2026-08-21-rateware-platform55-shell-p2-s1-command-center.md` | `codex/p2-shell-command-center-s1` | GPT-5.6 Sol / xhigh | 25% | 77.8% |
| 2 | `2026-08-21-rateware-platform55-shell-p2-s2-operate.md` | `codex/p2-shell-operate-s2` | GPT-5.6 Terra / high; Sol / high independent review | 45% | 79.2% |
| 3 | `2026-08-21-rateware-platform55-shell-p2-s3-procurement.md` | `codex/p2-shell-procurement-s3` | GPT-5.6 Sol / high | 60% | 80.2% |
| 4 | `2026-08-21-rateware-platform55-shell-p2-s4-network-service.md` | `codex/p2-shell-network-service-s4` | GPT-5.6 Terra / high; Sol / high independent review | 70% | 80.9% |
| 5 | `2026-08-21-rateware-platform55-shell-p2-s5-intelligence-admin.md` | `codex/p2-shell-intelligence-admin-s5` | GPT-5.6 Sol / xhigh | 80% | 81.6% |
| 6 | `2026-08-21-rateware-platform55-shell-p2-s6-certification-release.md` | `codex/p2-shell-certification-s6` | GPT-5.6 Sol / xhigh | 100% | 83.0% |

Each sprint starts from the exact live `origin/main` after the preceding accepted merge, not from an assumed historical SHA. Record the full base SHA before creating its isolated worktree.

## Shared Interfaces

All sprint plans use these stable contracts after P2-S1 creates them:

```js
// src/platform55-shell.js
export function mountPlatform55Shell({
  pageKey,
  user,
  accessContext,
  notificationSummary,
  root = document
}) {}

export function updatePlatform55Shell({
  pageKey,
  breadcrumbs,
  title,
  subtitle,
  status,
  actions,
  busy
} = {}, { root = document } = {}) {}

export function unmountPlatform55Shell({ root = document } = {}) {}
```

```js
// src/platform55-shell-model.js
export const PLATFORM55_ROUTES = [];
export function routeForPath(pathname) {}
export function visibleNavigation(accessContext) {}
export function shellModel({ pageKey, user, accessContext, notificationSummary }) {}
```

```js
// src/platform55-search.js
export function searchShellCommands(query, { routes, actions, accessContext, limit = 12 }) {}
export function initPlatform55Search({ trigger, routes, actions, accessContext, root = document }) {}
```

```js
// src/platform55-icons.js
export function registerPlatform55Icons({ root = document } = {}) {}
```

Page migration status uses exact values:

```text
not_started | contract_ready | implemented | verified | dispositioned
```

Build-matrix disposition uses exact values:

```text
implement | shared_surface | superseded | reference_only | out_of_scope_public
```

No `implemented`, `verified`, or `dispositioned` row may have an empty evidence field.

## Sprint Handoff Protocol

Every sprint follows this order:

1. Fetch read-only refs and record exact `origin/main`.
2. Create a new isolated worktree using the sprint branch name.
3. Run the sprint's baseline tests before editing.
4. Execute TDD tasks and commit focused changes.
5. Run focused tests, full `npm test`, Action Contract validation, audit, syntax, and diff checks.
6. Freeze a clean candidate SHA.
7. Create a brand-new detached worktree at that SHA for independent review.
8. Do not modify the reviewed candidate after GO; any fix creates a new SHA and restarts review.
9. Continue local work on the next sprint if useful, but pause all external transitions pending explicit authorization.
10. Request push + draft PR + Vercel preview authorization using the exact SHA; do not create a Supabase preview branch.
11. After preview and independent GO, revalidate exact head/base/checks, then request Ready + merge + automatic Vercel deployment authorization.
12. Manual promotion remains unauthorized unless named separately.

## Standard Verification Commands

Run from the sprint worktree:

```powershell
npm ci
npm test
npm run validate:action-contract
npm run release:progress
npm audit --audit-level=low
node --check src/platform55-shell-model.js
node --check src/platform55-shell.js
node --check src/platform55-search.js
node --check src/platform55-icons.js
git diff --check origin/main...HEAD
git status --short
```

Expected: every command exits 0 and final status is empty. A sprint may omit a `node --check` only before the named file exists.

## Standard Visual Evidence

For each representative page in a sprint:

- Desktop: 1440x900.
- Tablet: 1024x768.
- Mobile: 390x844.
- No horizontal document overflow.
- Sidebar/header geometry differs from the approved reference by at most 2 CSS pixels for non-text anchors at the same viewport.
- Blueprint color tokens are exact hexadecimal values.
- Visible text may differ only where live data replaces fixture copy.
- Loading, empty, error, warning, blocked, permission-denied, and success states retain their semantic distinction.
- Keyboard order, Escape behavior, focus return, landmarks, accessible names, reduced motion, and mobile navigation are exercised.

Save approved captures under `docs/platform55-evidence/<sprint>/<sha>/`; never overwrite evidence for an older SHA.

## Progress Gates

The repository ledger enforces these exact P2 thresholds:

| P2 | Required evidence |
|---:|---|
| 10% | `scope` |
| 25% | `evidence_plan` |
| 55% | `implementation` |
| 70% | `automated_suite` |
| 85% | `independent_review` and verdict `GO` |
| 93% | `preview_smoke` |
| 97% | `deployment` |
| 100% | `production_smoke` and `monitoring` |

P2-S6 owns the 85/93/97/100 progression on one immutable final candidate. If the candidate changes after any gate, evidence collected for the earlier SHA cannot be reused.

## Plan Self-Review Checklist

- [ ] Every requirement in the approved spec maps to a sprint plan.
- [ ] Every one of the 29 HTML routes appears in exactly one owning sprint or an explicit certification task.
- [ ] Public routes never inherit tenant navigation.
- [ ] All shared interface names match the per-sprint plans.
- [ ] All percentages reproduce the readiness formula `63 + 4 + 9 + 7 * P2 / 100`.
- [ ] No plan contains unresolved work markers, omitted route records, generic file references, or an unspecified test step.
- [ ] Every external or production transition stops for explicit authorization.
