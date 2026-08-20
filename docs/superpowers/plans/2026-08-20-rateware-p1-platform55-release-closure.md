# Rateware P1 Platform 55 Release Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Platform 55 release queue in the exact order PR #35, PR #37, PR #39 while allowing isolated development to continue and keeping every consequential release action behind explicit human authorization.

**Architecture:** Treat each PR as a separate immutable release candidate. Reconstruct and test locally first, obtain a detached independent review second, then use its exact Vercel preview for read-only acceptance; Ready, push, merge, and production promotion are separate authorization gates. After each authorized merge, refresh `origin/main`, verify the production deployment SHA, and only then rebase the next stacked PR.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js test runner, Git/GitHub CLI, Vercel CLI/read-only browser QA, Supabase metadata/SELECT-only verification, Action Contract validator.

**Spec:** `docs/superpowers/specs/2026-08-19-rateware-production-closure-design.md`

## Global Constraints

- Development, tests, documentation, and offline review may continue in isolated worktrees without a time-window gate.
- Queue order is exactly PR `#35 -> #37 -> #39`; do not advance a later release candidate before the previous production smoke is recorded.
- Current baseline is production/main `c5200a39b175729ae2ed63c68d83f5f5bc76e674`, P0 `100%`, and general readiness `67.0%`.
- Never create a second Supabase preview branch; the accepted cost gate is at most one persistent non-default preview.
- Do not treat `READY`, green CI, local tests, or independent review as authorization to push, mark Ready, merge, deploy, migrate, or mutate production.
- Push/force-with-lease, Ready, merge, Vercel promotion, Supabase deploy/migration/configuration/enforcement changes, uploads, approvals, and production-data writes each require explicit human authorization.
- Preserve `rate_staging` and human approval before production insertion. Never use Tier 1/2/3, `X`, `N/A`, or `Please Estimate` as carrier rates.
- Keep Phase 0.2E `required` activation outside P1; it remains a P2 release decision and does not block P1 development.
- Agentic MarkOS and Provider Service remain post-core and may not enter this queue.
- Every independent reviewer uses a brand-new detached worktree at the exact reviewed SHA and does not edit the candidate.

---

### Task 1: Open the P1 Evidence Ledger

**Files:**
- Create: `docs/release/2026-08-20-p1-platform55-release-ledger.md`
- Modify: `docs/release/production-readiness-ledger.json`
- Test: `tests/production-readiness-report.test.mjs`

**Interfaces:**
- Consumes: P0 closure evidence at `docs/release/evidence/2026-08-19-p0-independent-review.md` and exact live PR metadata for #35/#37/#39.
- Produces: P1 scope/evidence-plan gates, immutable queue rows, and the accepted starting score for all later tasks.

- [ ] **Step 1: Write the failing P1 progress test**

Add a fixture with P0=`100`, P1=`25`, P2-P5=`0`, exact schema-v1 weights, all P0 closure evidence, and P1 `scope` plus `evidence_plan` file paths. Assert `validateLedger()` succeeds and `computeOverallProgress()` returns `69.25` before display rounding.

- [ ] **Step 2: Run the test and prove RED**

Run:

```powershell
node tests/production-readiness-report.test.mjs
```

Expected: FAIL because the P1 evidence files/fixture are not yet present.

- [ ] **Step 3: Create the immutable P1 ledger document**

Record these exact initial rows:

```text
P8 intelligence | PR 35 | base c5200a39b175729ae2ed63c68d83f5f5bc76e674 | head 42381154d335eb007a977070a3f1b078c71135f8 | draft | READY preview | not production | release queue
P9 administration | PR 37 | base ee5419ba27c6c9245a7f7356a423b77e2e941017 | head 5357cd2cd22bd88acdb1b5bf21fe5a00fcb0b690 | draft/conflicting | no current READY preview | not production | blocked
P10 readiness | PR 39 | base 5357cd2cd22bd88acdb1b5bf21fe5a00fcb0b690 | head 46f5e80ff7c914c3ae4a0922c840364fbf8a052d | draft/stacked | no current READY preview | not production | blocked
```

Include fields for candidate SHA, detached review verdict/path, preview deployment ID/URL, merge SHA, production deployment SHA, smoke result, human authorization, and final disposition. Initialize unknown future fields as `not yet collected`, never inferred.

- [ ] **Step 4: Advance P1 to 25% only after the evidence plan exists**

In `production-readiness-ledger.json`, set P1 progress to `25` and add file-backed `scope`/`evidence_plan` entries pointing to the approved production-closure spec and this plan/ledger. Preserve P0 at 100 and all exact weights.

- [ ] **Step 5: Run GREEN and deterministic checks**

Run:

```powershell
node tests/production-readiness-report.test.mjs
npm run release:progress
git diff --check origin/main...HEAD
```

Expected: readiness tests PASS and general progress displays `69.3%` after one-decimal rounding, P1 `25%`.

- [ ] **Step 6: Commit the P1 evidence baseline**

```powershell
git add -- docs/release/2026-08-20-p1-platform55-release-ledger.md docs/release/production-readiness-ledger.json tests/production-readiness-report.test.mjs
git diff --cached --check
git commit -m "docs: open P1 Platform 55 release ledger"
```

---

### Task 2: Certify PR #35 Intelligence Candidate Locally

**Files:**
- Review: `business-intelligence.html`
- Review: `src/business-intelligence.js`
- Review: `src/intelligence-brief.js`
- Review: `src/styles.css`
- Review: `docs/platform55-intelligence.md`
- Test: `tests/platform55-intelligence.test.mjs`
- Modify: `docs/release/2026-08-20-p1-platform55-release-ledger.md`

**Interfaces:**
- Consumes: PR #35 exact head `42381154d335eb007a977070a3f1b078c71135f8` on base `c5200a39b175729ae2ed63c68d83f5f5bc76e674`.
- Produces: immutable local candidate, complete test evidence, and detached GO/NO-GO without changing GitHub metadata.

- [ ] **Step 1: Refresh and prove exact PR metadata read-only**

```powershell
git fetch origin --prune
gh pr view 35 --repo elandopando8892/rateware --json baseRefOid,headRefOid,isDraft,mergeable,statusCheckRollup,url
git cat-file -e 42381154d335eb007a977070a3f1b078c71135f8^{commit}
```

Stop and refresh the ledger if the live head/base differs.

- [ ] **Step 2: Create a clean detached verification worktree**

```powershell
git worktree add --detach C:\Users\andre\OneDrive\Documents\Rateware_P1_PR35_Verify_4238115 42381154d335eb007a977070a3f1b078c71135f8
git -C C:\Users\andre\OneDrive\Documents\Rateware_P1_PR35_Verify_4238115 status --short
```

Expected: exact detached HEAD and empty status.

- [ ] **Step 3: Install from the lockfile and run the focused suite**

```powershell
npm ci
node tests/platform55-intelligence.test.mjs
node --check src/intelligence-brief.js
node --check src/business-intelligence.js
```

Expected: all PASS.

- [ ] **Step 4: Run the independent adversarial matrix**

Exercise lineage type/visibility boundaries, empty samples, nested/late money fields, per-row currency coverage, percentage/rate non-money fields, deep currency, invalid evidence containers, and decision-brief output escaping. Required result: no false `reviewable`, no wrong-service/default bypass, no unescaped variable HTML, and no consequential action.

- [ ] **Step 5: Run repository-wide gates**

```powershell
npm test
npm run validate:action-contract
npm audit --audit-level=low
git diff --check c5200a39b175729ae2ed63c68d83f5f5bc76e674...42381154d335eb007a977070a3f1b078c71135f8
```

Expected: PASS, validator errors `0`, audit vulnerabilities `0`.

- [ ] **Step 6: Request a detached independent review**

Use a second brand-new detached worktree at the same exact SHA. The reviewer must reproduce focused adversarial probes, inspect UI safety/lineage, and issue GO/NO-GO. A finding returns to this task; it does not block unrelated isolated development.

- [ ] **Step 7: Record the candidate evidence**

Update the P1 ledger with exact commands, results, review path/verdict, and any limitations. Do not mark Ready or change PR metadata.

- [ ] **Step 8: Commit evidence-only updates**

```powershell
git add -- docs/release/2026-08-20-p1-platform55-release-ledger.md
git diff --cached --check
git commit -m "docs: certify PR 35 intelligence candidate"
```

---

### Task 3: Accept, Merge, and Smoke PR #35 Under Separate Authorization

**Files:**
- Modify: `docs/release/2026-08-20-p1-platform55-release-ledger.md`
- Modify: `docs/release/production-readiness-ledger.json`

**Interfaces:**
- Consumes: Task 2 detached GO at exact PR #35 head and its Vercel-returned exact preview URL.
- Produces: authorized merge SHA, production deployment mapping, read-only authenticated smoke, and P1 implementation evidence.

- [ ] **Step 1: Inspect the exact current preview**

Use `vercel list -m githubPrId=35 --format=json`, then inspect only the exact URL returned for head `42381154...`. Verify deployment state/SHA/protection metadata without constructing a URL or changing Vercel.

- [ ] **Step 2: Run read-only authenticated UI acceptance**

Verify the Decision Brief view loads, escapes source text, distinguishes last-successful result sources, presents missing lineage/currency as review-required/blocked, contains no copy/queue/promote/export mutation, and matches the approved Platform 55 visual shell at desktop and mobile widths.

- [ ] **Step 3: Request explicit Ready/merge authorization**

Present exact head SHA, detached verdict, preview ID/URL, checks, limitations, and intended merge method. Stop here until the user explicitly authorizes Ready and merge for PR #35.

- [ ] **Step 4: Perform only the authorized GitHub transitions**

After authorization, mark PR #35 Ready, re-read live head/base/checks, and merge one PR only. Record the exact merge SHA returned by GitHub. Do not start PR #37 promotion in the same action.

- [ ] **Step 5: Verify production deployment mapping**

Wait for Vercel production to map the stable alias to the exact new merge SHA. Inspect the Vercel-returned deployment URL/ID; do not manually promote an unrelated deployment.

- [ ] **Step 6: Run a production read-only smoke**

Verify authentication, the intelligence view, no unintended mutation/network write, and stable existing pages. Do not approve, upload, send, promote, or mutate production data.

- [ ] **Step 7: Advance P1 to 55% only after merge and smoke evidence**

Add `implementation` evidence to the ledger, set P1 progress `55`, run progress/tests/diff, and record the production merge/deployment/smoke in the P1 ledger. Expected general progress: `72.0%` after one-decimal rounding.

- [ ] **Step 8: Commit the evidence update**

```powershell
git add -- docs/release/2026-08-20-p1-platform55-release-ledger.md docs/release/production-readiness-ledger.json
git diff --cached --check
git commit -m "docs: record PR 35 production acceptance"
```

---

### Task 4: Reconstruct PR #37 Administration on the New Main

**Files:**
- Review/Modify: `settings.html`
- Review/Modify: `src/settings.js`
- Review/Modify: `src/admin-governance.js`
- Review/Modify: `src/styles.css`
- Review/Modify: `docs/platform55-administration-governance.md`
- Test: `tests/platform55-admin-governance.test.mjs`
- Test: `tests/platform55-intelligence.test.mjs`

**Interfaces:**
- Consumes: production/main after PR #35 and unique PR #37 changes from `ee5419ba27c6c9245a7f7356a423b77e2e941017..5357cd2cd22bd88acdb1b5bf21fe5a00fcb0b690`.
- Produces: a clean local PR #37 replacement candidate based on the exact post-#35 `origin/main`, without pushing.

- [ ] **Step 1: Capture the exact post-#35 base**

```powershell
git fetch origin --prune
git rev-parse origin/main
gh pr view 35 --repo elandopando8892/rateware --json state,mergedAt,mergeCommit
```

Record the returned full SHA in the P1 ledger before changing local history.

- [ ] **Step 2: Create an isolated reconstruction branch**

```powershell
git worktree add -b codex/p1-pr37-reconstructed C:\Users\andre\OneDrive\Documents\Rateware_P1_PR37_Reconstructed origin/main
```

- [ ] **Step 3: Apply only PR #37's unique patch**

Use `git range-diff` and `git diff ee5419ba...5357cd2c --` to isolate the admin-governance changes. Apply them to the reconstruction branch; resolve conflicts by retaining the accepted PR #35 intelligence implementation and layering only admin-governance behavior.

- [ ] **Step 4: Write/refresh failing integration tests before fixes**

Add assertions that admin readiness is observation-only, authorization/tenant boundaries remain visible, no hidden mutation is mounted, PR #35 Decision Brief remains intact, and responsive navigation includes both surfaces. Run focused tests and confirm RED for any unresolved integration behavior.

- [ ] **Step 5: Implement the minimal conflict resolution**

Change only the listed admin/settings/shared-shell files needed to satisfy the focused tests. Do not add APIs, migrations, permission changes, or automatic governance actions.

- [ ] **Step 6: Run GREEN and full gates**

```powershell
node tests/platform55-admin-governance.test.mjs
node tests/platform55-intelligence.test.mjs
npm test
npm run validate:action-contract
npm audit --audit-level=low
git diff --check origin/main...HEAD
```

- [ ] **Step 7: Commit the reconstructed candidate locally**

```powershell
git add -- settings.html src/settings.js src/admin-governance.js src/styles.css docs/platform55-administration-governance.md tests/platform55-admin-governance.test.mjs
git diff --cached --check
git commit -m "feat: reconstruct Platform 55 admin governance"
```

- [ ] **Step 8: Request independent review, then push authorization**

Review the exact local commit in a new detached worktree. If GO, present old/new patch equivalence, exact SHA, tests, and expected force-with-lease target; request explicit authorization before updating PR #37's remote branch.

---

### Task 5: Preview, Merge, and Smoke PR #37

**Files:**
- Modify: `docs/release/2026-08-20-p1-platform55-release-ledger.md`

**Interfaces:**
- Consumes: authorized remote update of PR #37, current successful checks, exact READY preview, and detached GO.
- Produces: production admin-governance merge with read-only acceptance evidence.

- [ ] **Step 1: Verify updated live PR state**

Confirm PR #37 base is current `main`, head equals the reviewed reconstructed SHA, mergeability is clean, and all checks map to that SHA.

- [ ] **Step 2: Run exact-preview acceptance**

Inspect the exact Vercel-returned URL. Verify admin readiness is read-only, tenant/role/approval gaps fail closed, no hidden mutation controls are mounted, PR #35 remains intact, and desktop/mobile UI matches the approved shell.

- [ ] **Step 3: Request explicit Ready/merge authorization**

Present exact head, preview, review verdict, checks, and limitations; stop until authorized.

- [ ] **Step 4: Merge only PR #37 and verify production**

After authorization, mark Ready, revalidate head/checks, merge, record exact merge SHA, wait for stable production mapping, and run a read-only authenticated smoke. Do not advance PR #39 promotion in the same action.

- [ ] **Step 5: Commit evidence**

Update the P1 ledger with preview/merge/production/smoke facts and commit:

```powershell
git add -- docs/release/2026-08-20-p1-platform55-release-ledger.md
git commit -m "docs: record PR 37 production acceptance"
```

---

### Task 6: Reconstruct PR #39 Platform Readiness on the New Main

**Files:**
- Review/Modify: `settings.html`
- Review/Modify: `src/settings.js`
- Review/Modify: `src/platform-readiness.js`
- Review/Modify: `src/styles.css`
- Review/Modify: `docs/platform55-platform-readiness.md`
- Test: `tests/platform55-platform-readiness.test.mjs`
- Test: `tests/platform55-admin-governance.test.mjs`

**Interfaces:**
- Consumes: production/main after PR #37 and PR #39 unique changes from `5357cd2cd22bd88acdb1b5bf21fe5a00fcb0b690..46f5e80ff7c914c3ae4a0922c840364fbf8a052d`.
- Produces: clean local PR #39 replacement candidate based on the exact post-#37 main.

- [ ] **Step 1: Capture the exact post-#37 base and create a worktree**

Fetch `origin/main`, record its full SHA and PR #37 merge commit, then create `codex/p1-pr39-reconstructed` in `C:\Users\andre\OneDrive\Documents\Rateware_P1_PR39_Reconstructed` from that exact main.

- [ ] **Step 2: Apply only PR #39's unique patch**

Use the exact range above. Preserve accepted intelligence/admin code and layer only platform-readiness behavior.

- [ ] **Step 3: Write/refresh failing integration tests**

Assert readiness statuses derive from auditable inputs, unknown/invalid evidence fails closed, no control claims a deploy/approval occurred, both earlier Platform 55 views remain functional, and responsive UI remains coherent.

- [ ] **Step 4: Implement minimal conflict resolution and run GREEN**

Modify only the listed files, then run focused P10/P9/P8 tests, full `npm test`, Action Contract validator, audit, syntax, and diff checks.

- [ ] **Step 5: Commit and independently review locally**

Commit `feat: reconstruct Platform 55 readiness controls`, then obtain a detached GO at the exact SHA. A finding returns to this task without stopping other isolated work.

- [ ] **Step 6: Request explicit remote update authorization**

Present patch equivalence, exact old/new head, base, tests, review, and the proposed force-with-lease command. Do not push before authorization.

---

### Task 7: Preview, Merge, and Smoke PR #39

**Files:**
- Modify: `docs/release/2026-08-20-p1-platform55-release-ledger.md`
- Modify: `docs/release/production-readiness-ledger.json`

**Interfaces:**
- Consumes: updated PR #39 exact head, successful checks/preview, detached GO, and explicit human authorization.
- Produces: exhausted Platform 55 queue and P1 automated/preview/production evidence.

- [ ] **Step 1: Verify exact live state and preview**

Confirm base=current main, head=reviewed SHA, mergeability/checks clean, and inspect only the exact Vercel-returned READY preview URL.

- [ ] **Step 2: Run cross-platform visual/workflow acceptance**

At desktop and mobile widths, verify Home, Rate Intake, Procurement, Commercial Network, Operations, Finance, Intelligence, Administration, and Readiness share the approved Platform 55 shell. Verify navigation, loading/error/empty states, escaping, and human approval copy. Do not execute consequential controls.

- [ ] **Step 3: Request explicit Ready/merge authorization**

Present the complete queue evidence and stop until authorized.

- [ ] **Step 4: Merge and smoke only after authorization**

Merge PR #39, capture exact merge SHA, verify stable production deployment maps to it, and run read-only authenticated smoke across the three newly released surfaces plus representative existing flows.

- [ ] **Step 5: Advance P1 to 93% after preview and production smoke evidence**

Add `automated_suite`, `independent_review`, `preview_smoke`, `deployment`, and `production_smoke` evidence; set P1 progress `93`. Run readiness tests/progress/full suite/validator/audit/diff. Expected general progress: `75.4%` after rounding.

- [ ] **Step 6: Commit queue-exhaustion evidence**

```powershell
git add -- docs/release/2026-08-20-p1-platform55-release-ledger.md docs/release/production-readiness-ledger.json
git diff --cached --check
git commit -m "docs: record Platform 55 queue completion"
```

---

### Task 8: Independently Close P1

**Files:**
- Create: `docs/release/evidence/2026-08-20-p1-independent-review.md`
- Modify: `docs/release/production-readiness-ledger.json`

**Interfaces:**
- Consumes: exact final production SHA/deployment, all P1 evidence, queue rows, tests, authenticated read-only smokes, and primary-checkout preservation fingerprint.
- Produces: final P1 GO/NO-GO and the exact P2 starting point.

- [ ] **Step 1: Freeze the P1 candidate**

Record exact HEAD, `origin/main`, production deployment SHA, Supabase project/preview count, Git status, and commit range. Require clean release/evidence checkout.

- [ ] **Step 2: Run a new detached independent review**

The reviewer independently refreshes GitHub/Vercel/Supabase, proves all three PRs' merge/production mapping, repeats focused adversarial/visual checks, verifies P1 ledger gates/arithmetic, scans redaction, and preserves the dirty primary checkout. No implementer evidence is accepted without reproduction.

- [ ] **Step 3: Record GO or return findings**

Any P0/P1/P2 finding returns to its owning task while isolated development continues. A GO document includes exact path/SHA, tests, live mappings, limitations, P3 advisories, and zero-external-mutation boundary.

- [ ] **Step 4: Set P1 to 100 only after GO and monitored production evidence**

Add `monitoring` evidence, set P1 progress `100`, and run:

```powershell
npm run release:progress
npm test
npm run validate:action-contract
npm audit --audit-level=low
git diff --check origin/main...HEAD
git status --short
```

Expected: general progress `76.0%`, P1 `100%`, all gates PASS.

- [ ] **Step 5: Commit closure and hand off P2**

```powershell
git add -- docs/release/evidence/2026-08-20-p1-independent-review.md docs/release/production-readiness-ledger.json
git diff --cached --check
git commit -m "docs: close P1 Platform 55 release"
```

Write the P2 plan against the exact production SHA and tenant posture recorded by P1. The 24-hour shadow window gates only a future `required` activation decision, not P2 development.
