# Platform55 P2 Sprint 6: Certification and Release Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute local tasks. Use `superpowers:requesting-code-review`, `superpowers:verification-before-completion`, and `superpowers:finishing-a-development-branch` at the specified gates. Every external transition requires the explicit authorization stated below.

**Goal:** Certify the 12-build Platform55 shell as one immutable release candidate, remove superseded legacy shell code safely, obtain an independent GO, and—only through separately authorized gates—preview, merge, deploy, smoke, and monitor it to P2 100%.

**Architecture:** The final code has one tenant shell, one public shell variant, one icon registry, one route registry, tokenized CSS, and page-owned business controllers. A machine-readable audit proves 22 tenant routes, 7 public/entry routes, 95 inventory records, 12 Build namespaces, and 1,150 reference states. Release evidence is SHA-bound and fail-closed.

**Tech Stack:** Static web application, Node test runner, Vercel preview/production, existing Kinde auth and Supabase APIs. This sprint authorizes no Supabase branch, migration, DDL, DML, secret, or tenant-enforcement change by itself.

**Candidate branch/worktree:** `codex/p2-shell-certification-s6` in `C:\Users\andre\OneDrive\Documents\Rateware_P2_S6_Certification`.

---

## Task 1: Enforce complete shell adoption before removing legacy code

**Files:**
- Create: `tests/platform55-shell-adoption.test.mjs`
- Create: `tools/platform55-shell-audit.mjs`
- Modify: `package.json`
- Modify: `src/auth.js`
- Modify: `src/styles.css`

- [ ] **Step 1: Write the failing full-adoption test**

The test loads the route inventory and asserts exactly 22 `tenant` routes and 7 `public`/`entry` routes. It reads all 29 HTML files and requires exactly one assigned shell host, the expected shell module, one main landmark, and no duplicate legacy global nav. It fails on an unknown tracked root HTML page.

- [ ] **Step 2: Write the audit tool**

`tools/platform55-shell-audit.mjs` must emit deterministic JSON containing candidate SHA, 29 route results, tenant/public counts, duplicate IDs, missing landmarks, disallowed private controls on public pages, legacy selector counts, matrix totals, unresolved matrix rows, surface totals, and evidence-file existence. Exit non-zero on any mismatch.

- [ ] **Step 3: Register scripts and demonstrate RED**

Add:

```json
"test:platform55:adoption": "node tests/platform55-shell-adoption.test.mjs",
"audit:platform55:shell": "node tools/platform55-shell-audit.mjs"
```

Insert both exactly once in `npm test`, then run them. Expected RED while `src/auth.js` and `src/styles.css` still own legacy shell code.

- [ ] **Step 4: Remove only superseded shell ownership**

Delete legacy shell construction, legacy command palette, legacy global nav/header initialization, and shell-only CSS selectors only after the adoption test proves no page depends on them. Preserve authentication/session helpers, page permissions, redirects, and unrelated styles. If an old function has a non-shell caller, move that behavior to a focused module rather than deleting it.

- [ ] **Step 5: Run GREEN and commit**

```powershell
npm run test:platform55:adoption
npm run audit:platform55:shell
node --check src/auth.js
node --check tools/platform55-shell-audit.mjs
git diff --check
git add tests/platform55-shell-adoption.test.mjs tools/platform55-shell-audit.mjs package.json src/auth.js src/styles.css
git commit -m "refactor: retire legacy shell ownership"
```

Expected: PASS with 22 tenant, 7 public/entry, zero duplicate shell roots, and zero unresolved adoption records.

## Task 2: Certify functional, visual, responsive, and accessibility fidelity

**Files:**
- Modify: `docs/platform55-shell-build-matrix.csv`
- Modify: `docs/platform55-surface-inventory.csv`
- Create: `docs/release/evidence/2026-08-21-p2-s6-local-certification.md`

- [ ] **Step 1: Run the machine audit**

Save the sanitized JSON output from `npm run audit:platform55:shell` as evidence. It must report 12/12 Build namespaces, 1,150/1,150 state dispositions, 95/95 inventory dispositions, 29/29 route adoption, and zero unresolved/blank evidence pointers.

- [ ] **Step 2: Run representative visual regression**

At `1440x900`, `1024x768`, and `390x844`, capture at least one representative route from every domain plus all five Command Center states and both tenant/public shells. Use the approved screenshot and blueprint tokens as reference. Record geometry deltas; rail/topbar/content bounds over 2 px require correction or an explicit independent-review disposition.

- [ ] **Step 3: Run all-route read-only browser smoke**

Navigate all 29 routes locally. For tenant routes use an authenticated non-mutating fixture/session; for public routes use their safe empty/expired fixture. Assert no console error, no uncaught rejection, one main landmark, no horizontal page overflow, correct focus restoration, and no unexpected network mutation.

- [ ] **Step 4: Run accessibility and performance checks**

Verify keyboard-only navigation, skip link, focus trap/release, accessible names, landmark uniqueness, contrast, reduced motion, 200% zoom, and 390px reflow. Record local performance measurements for shell boot, layout shift, and initial JS/CSS transfer; regressions over the master-plan budgets block certification.

- [ ] **Step 5: Run the aggregate local gate**

```powershell
npm run test:platform55:adoption
npm run audit:platform55:shell
npm run test:provider-service
npm test
npm run validate:action-contract
npm audit --audit-level=low
git diff --check
```

Expected: all PASS; zero vulnerabilities; zero Action Contract errors.

- [ ] **Step 6: Commit local certification evidence**

```powershell
git add docs/platform55-shell-build-matrix.csv docs/platform55-surface-inventory.csv docs/release/evidence/2026-08-21-p2-s6-local-certification.md
git commit -m "docs: certify local Platform55 shell fidelity"
```

## Task 3: Freeze an immutable candidate and obtain independent review

**Files:**
- Create: `docs/release/evidence/2026-08-21-p2-s6-independent-review.md`
- Modify: `docs/release/production-readiness-ledger.json`

- [ ] **Step 1: Freeze and record the candidate**

Require `git status --porcelain` empty. Capture full `git rev-parse HEAD`, base SHA, tree SHA, merge-base, test outputs, audit JSON hash, matrix hash, screenshot manifest hash, and reference artifact hashes. No file may change after this capture.

- [ ] **Step 2: Create a brand-new detached review worktree**

Use `superpowers:using-git-worktrees`. The reviewer must independently verify exact SHA, detached state, clean status, ancestry, file scope, artifact hashes, 29-route adoption, 12/12 matrix, 1,150 states, 95 surfaces, safety boundaries, full suite, and adversarial shell/public isolation cases. Implementer evidence is context, not proof.

- [ ] **Step 3: Stop on any P0/P1/P2 finding**

Any false-PASS, private-control leak, mutation-path change, route omission, state omission, inaccessible critical flow, or material visual mismatch returns `NO-GO`. Fixes require a new commit and a completely new detached review.

- [ ] **Step 4: Record independent GO and advance to 85**

Only a clean independent review tied to the exact immutable SHA may create the evidence file and set `verdicts.independent_review` to `GO`. Set P2 to `85`; overall progress becomes `81.95` (displayed according to the repository formatter). No external action occurs here.

- [ ] **Step 5: Commit review evidence**

```powershell
git add docs/release/evidence/2026-08-21-p2-s6-independent-review.md docs/release/production-readiness-ledger.json
git commit -m "docs: record independent Platform55 shell GO"
```

Because that evidence commit changes HEAD but not product code, the review document must record both product candidate SHA and evidence-only closure SHA.

## Task 4: Push and create a Vercel preview only after explicit authorization

**External authorization required:** The user must explicitly authorize the exact full SHA, destination branch, push, draft PR creation/update, and Vercel preview. This authorization must also state that no second Supabase preview branch may be created.

- [ ] **Step 1: Revalidate immutable state before push**

Capture `$reviewedSha` from evidence. Require current product tree equals the reviewed tree, `git status --porcelain` empty, remote expected-old SHA unchanged, and live Supabase persistent preview count `<=1`. Abort on any drift.

- [ ] **Step 2: Push with a bounded lease**

Use fast-forward when possible. If reconstruction requires force, use:

```powershell
$expectedOldSha = git rev-parse refs/remotes/origin/codex/p2-shell-certification-s6
if ($expectedOldSha -notmatch '^[0-9a-f]{40}$') { throw 'Missing exact remote lease SHA' }
git push origin HEAD:refs/heads/codex/p2-shell-certification-s6 "--force-with-lease=refs/heads/codex/p2-shell-certification-s6:$expectedOldSha"
```

If the remote branch does not exist, use a normal first push without `--force-with-lease`. Never use an unbounded force.

- [ ] **Step 3: Create/update a draft PR against current main**

The PR description must include exact head/base SHAs, 12-build/29-route/1,150-state coverage, test evidence, independent GO, visual evidence links, no-Supabase-change statement, and explicit remaining preview/deployment gates.

- [ ] **Step 4: Verify exact Vercel preview mapping**

From the trusted Vercel-linked checkout, prove the READY preview deployment maps to the exact PR head SHA. Do not promote it. Confirm no second Supabase preview branch was created.

- [ ] **Step 5: Run authenticated read-only preview smoke**

Verify Command Center, one route per domain, public shell, search, focus mode, tenant nav, mobile nav, and permission-disabled controls. Record console/network evidence and zero unexpected writes.

- [ ] **Step 6: Record preview evidence and advance to 93**

Create `docs/release/evidence/2026-08-21-p2-s6-preview-smoke.md`, update P2 to `93`, and overall progress to `82.51`. Commit and push this evidence only after verifying it does not invalidate the reviewed product tree.

## Task 5: Ready, merge, and automatic production deployment through a second authorization

**External authorization required:** The user must explicitly authorize updating the exact PR description/head/base, marking Ready, squash merge, and the expected automatic Vercel production deployment. Manual promotion remains unauthorized.

- [ ] **Step 1: Revalidate before changing PR metadata**

Require exact PR head/base, reviewed product tree, clean checks, mergeability, successful preview smoke, unchanged Supabase preview count, and no newer main conflict. Abort before Ready on drift.

- [ ] **Step 2: Mark Ready and reread live state**

Mark Ready only after Step 1. Then reread PR head/base/checks/mergeability. Abort before merge if any value changed.

- [ ] **Step 3: Squash merge**

Merge through GitHub with the authorized method. Record PR number, final head, base, squash SHA, merge time, and check conclusions. Do not run manual `vercel promote`.

- [ ] **Step 4: Verify automatic Vercel production deployment**

Prove the production alias is READY and maps to the squash SHA/tree. If deployment fails or maps to another SHA, stop; do not manually promote.

- [ ] **Step 5: Record deployment evidence and advance to 97**

Create `docs/release/evidence/2026-08-21-p2-s6-production-deployment.md`, update P2 to `97`, and overall progress to `82.79` only after the exact production mapping is proven.

## Task 6: Production smoke, monitoring, and P2 closure

**Production authorization boundary:** Read-only browser checks are allowed only within the merge authorization's stated smoke scope. Any configuration, Supabase, data, approval, upload, send, or corrective production action requires new explicit authorization.

- [ ] **Step 1: Run the production read-only route smoke**

At minimum verify Command Center, Operate, Procurement, Network/Service, Intelligence/Admin, and one public route. Confirm authenticated tenant context, correct shell variant, route/search/focus behavior, no console errors, and no unexpected write request.

- [ ] **Step 2: Verify responsive production shell**

Check `1440x900`, `1024x768`, and `390x844`; confirm mobile navigation, tables, dialogs, focus restoration, and no horizontal viewport overflow.

- [ ] **Step 3: Monitor at bounded intervals**

At T+0, T+5 minutes, and T+15 minutes record Vercel deployment state, production alias SHA, 4xx/5xx sample, uncaught client errors, route availability, and unexpected write indicators. The monitoring window is a P2 UI release check, not the separate Phase 0.2E 24-hour tenant-enforcement gate.

- [ ] **Step 4: Close P2 only on clean evidence**

Create `docs/release/evidence/2026-08-21-p2-s6-production-smoke-monitoring.md`. Set P2 to `100`, overall progress to `83.0`, and the P2 verdict to `GO` only when production smoke and monitoring pass with no P0/P1/P2 issue.

- [ ] **Step 5: Commit the closure ledger**

Commit only the production evidence and readiness ledger. If any blocker exists, retain P2 at the highest already-proven threshold and record `NO-GO`; do not round progress up.

**Final stop boundary:** P2 completion does not authorize Phase 0.2E `required`, Supabase migrations/DDL/DML, secret/config changes, uploads, approvals, sends, financial decisions, Fleet Rocket dispatch, or any other production mutation.
