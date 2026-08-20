# Rateware P1 Platform 55 Release Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Platform 55 release queue in the exact order PR #35, PR #37, PR #39 while allowing isolated development to continue and keeping every consequential release action behind explicit human authorization.

**Architecture:** Treat each PR as a separate immutable release candidate. Isolated coding, tests, documentation, patch analysis, and offline review for later candidates may continue at any time; only final reconstruction against the accepted `main` and release promotion follow the queue. Push/force-with-lease and base retargeting are one explicit authorization gate; Ready plus merge plus the expected automatic Vercel production deployment are a later explicit gate; manual Vercel promotion remains separate. After each authorized merge, refresh `origin/main`, verify the production deployment SHA, and use that exact base for the next candidate's final reconstruction.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js test runner, Git/GitHub CLI, Vercel CLI/read-only browser QA, Supabase metadata/SELECT-only verification, Action Contract validator.

**Spec:** `docs/superpowers/specs/2026-08-19-rateware-production-closure-design.md`

## Global Constraints

- Development, tests, documentation, and offline review may continue in isolated worktrees without a time-window gate.
- Promotion order is exactly PR `#35 -> #37 -> #39`; do not mark Ready or merge a later candidate before the previous production smoke is recorded. This does not block isolated local coding, tests, documentation, patch analysis, or offline review on later candidates.
- Current baseline is production/main `c5200a39b175729ae2ed63c68d83f5f5bc76e674`, P0 `100%`, and general readiness `67.0%`.
- Never create a second Supabase preview branch; the accepted cost gate is at most one persistent non-default preview.
- Immediately before each authorized branch push, refresh the Supabase branch inventory read-only. If one persistent non-default preview already exists and the integration could create another, abort the push and request an explicit reuse/delete/integration decision; do not create the second preview.
- Do not treat `READY`, green CI, local tests, or independent review as authorization to push, mark Ready, merge, deploy, migrate, or mutate production.
- Push/force-with-lease plus PR base retargeting require explicit human authorization. Ready plus merge plus the expected automatic Vercel production deployment require a separate explicit authorization. Manual Vercel promotion, Supabase deploy/migration/configuration/enforcement changes, uploads, approvals, and production-data writes each require explicit human authorization.
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

Add a fixture with P0=`100`, P1=`25`, P2-P5=`0`, exact schema-v1 weights, all P0 closure evidence, and P1 `scope` plus `evidence_plan` file paths. Assert `validateLedger()` succeeds and `computeOverallProgress()` returns the tool's accepted one-decimal value `69.3`.

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
- Review: `package.json`
- Test: `tests/platform55-intelligence.test.mjs`
- Create: `docs/release/evidence/2026-08-20-p1-pr35-independent-review.md`
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
Push-Location C:\Users\andre\OneDrive\Documents\Rateware_P1_PR35_Verify_4238115
try {
  npm ci
  node tests/platform55-intelligence.test.mjs
  node --check src/intelligence-brief.js
  node --check src/business-intelligence.js
} finally {
  Pop-Location
}
```

Expected: all PASS.

- [ ] **Step 4: Run the independent adversarial matrix**

Exercise lineage type/visibility boundaries, empty samples, nested/late money fields, per-row currency coverage, percentage/rate non-money fields, deep currency, invalid evidence containers, and decision-brief output escaping. Required result: no false `reviewable`, no wrong-service/default bypass, no unescaped variable HTML, and no consequential action.

- [ ] **Step 5: Run repository-wide gates**

```powershell
Push-Location C:\Users\andre\OneDrive\Documents\Rateware_P1_PR35_Verify_4238115
try {
  npm test
  npm run validate:action-contract
  npm audit --audit-level=low
  git diff --check c5200a39b175729ae2ed63c68d83f5f5bc76e674...42381154d335eb007a977070a3f1b078c71135f8
} finally {
  Pop-Location
}
```

Expected: PASS, validator errors `0`, audit vulnerabilities `0`.

- [ ] **Step 6: Request a detached independent review**

Use a second brand-new detached worktree at the same exact SHA. The reviewer must reproduce focused adversarial probes, inspect UI safety/lineage, and issue GO/NO-GO. Copy the independently reproduced verdict, exact SHA, commands, limitations, and zero-mutation boundary into `docs/release/evidence/2026-08-20-p1-pr35-independent-review.md` from the controller evidence worktree; the detached candidate remains unedited. A finding returns to this task; it does not block unrelated isolated development.

- [ ] **Step 7: Record the candidate evidence**

Update the P1 ledger with exact commands, results, review path/verdict, and any limitations. Do not mark Ready or change PR metadata.

- [ ] **Step 8: Commit evidence-only updates**

```powershell
git add -- docs/release/2026-08-20-p1-platform55-release-ledger.md docs/release/evidence/2026-08-20-p1-pr35-independent-review.md
git diff --cached --check
git commit -m "docs: certify PR 35 intelligence candidate"
```

---

### Task 3: Accept, Merge, and Smoke PR #35 Under Separate Authorization

**Files:**
- Modify: `docs/release/2026-08-20-p1-platform55-release-ledger.md`

**Interfaces:**
- Consumes: Task 2 detached GO at exact PR #35 head and its Vercel-returned exact preview URL.
- Produces: authorized merge SHA, production deployment mapping, read-only authenticated smoke, and candidate-specific production evidence.

- [ ] **Step 1: Inspect the exact current preview**

Run the Vercel read from the only trusted linked checkout and use the full head SHA:

```powershell
Push-Location C:\Users\andre\OneDrive\Documents\Rateware
try {
  $result = vercel list --status READY -m githubCommitSha=42381154d335eb007a977070a3f1b078c71135f8 --format=json | ConvertFrom-Json
  $matches = @($result.deployments) | Where-Object { $_.meta.githubCommitSha -eq '42381154d335eb007a977070a3f1b078c71135f8' -and $_.state -eq 'READY' }
  if ($matches.Count -ne 1) { throw "Expected exactly one READY deployment for PR #35 head; found $($matches.Count)" }
  $previewUrl = "https://$($matches[0].url)"
  vercel inspect $previewUrl --format=json
} finally {
  Pop-Location
}
```

Record `$previewUrl` and the deployment ID from `vercel inspect` in the ledger; never construct or guess a branch URL. Verify deployment state/SHA/protection metadata without changing Vercel.

- [ ] **Step 2: Run read-only authenticated UI acceptance**

Verify the Decision Brief view loads, escapes source text, distinguishes last-successful result sources, presents missing lineage/currency as review-required/blocked, contains no copy/queue/promote/export mutation, and matches the approved Platform 55 visual shell at desktop and mobile widths.

- [ ] **Step 3: Request explicit Ready/merge authorization**

Present exact head SHA, detached verdict, preview ID/URL, checks, limitations, and intended merge method. Stop here until the user explicitly authorizes all three named consequences: mark PR #35 Ready, merge it, and allow the expected automatic Vercel production deployment caused by merging `main`. Manual promotion remains unauthorized unless named separately.

- [ ] **Step 4: Perform only the authorized GitHub transitions**

After that exact authorization, mark PR #35 Ready, re-read live head/base/checks, and merge one PR only. Record the exact merge SHA returned by GitHub and the automatically triggered production deployment. Do not manually promote an unrelated deployment and do not start PR #37 promotion in the same action.

- [ ] **Step 5: Verify production deployment mapping**

Wait for Vercel production to map the stable alias to the exact new merge SHA. Inspect the Vercel-returned deployment URL/ID; do not manually promote an unrelated deployment.

- [ ] **Step 6: Run a production read-only smoke**

Verify authentication, the intelligence view, no unintended mutation/network write, and stable existing pages. Do not approve, upload, send, promote, or mutate production data.

- [ ] **Step 7: Record PR #35 production evidence without advancing the implementation milestone**

Record the PR #35 merge/deployment/smoke in the P1 release ledger and run progress/tests/diff. Keep P1 at `25%`: the `55%` implementation milestone is not earned until #35, #37, and #39 have all been reconstructed or certified locally and independently reviewed.

- [ ] **Step 8: Commit the evidence update**

```powershell
git add -- docs/release/2026-08-20-p1-platform55-release-ledger.md
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
- Review/Modify: `package.json`
- Test: `tests/platform55-admin-governance.test.mjs`
- Test: `tests/platform55-intelligence.test.mjs`
- Create: `docs/release/evidence/2026-08-20-p1-pr37-independent-review.md`

**Interfaces:**
- Consumes: production/main after PR #35; canonical seven-file feature commit `c582526066fbc4f6e007039f267a316d8266c0fc` with parent `6bea33c7f91273978d6d53af8a37636e7ca3575c`; and the exact resolved seven-file delta `ae64862f3c26ce849daa914799cbbb964895ec08..5357cd2cd22bd88acdb1b5bf21fe5a00fcb0b690`.
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
git -C C:\Users\andre\OneDrive\Documents\Rateware_P1_PR37_Reconstructed status --short
```

- [ ] **Step 3: Apply only PR #37's unique patch**

First prove both source representations touch the same exact seven paths, then apply only the resolved delta inside the reconstruction worktree:

```powershell
$adminFiles = @(
  'docs/platform55-administration-governance.md',
  'package.json',
  'settings.html',
  'src/admin-governance.js',
  'src/settings.js',
  'src/styles.css',
  'tests/platform55-admin-governance.test.mjs'
)
$canonical = @(git diff --name-only 6bea33c7f91273978d6d53af8a37636e7ca3575c c582526066fbc4f6e007039f267a316d8266c0fc -- $adminFiles)
$resolved = @(git diff --name-only ae64862f3c26ce849daa914799cbbb964895ec08 5357cd2cd22bd88acdb1b5bf21fe5a00fcb0b690 -- $adminFiles)
if ((Compare-Object $adminFiles $canonical) -or (Compare-Object $adminFiles $resolved)) { throw 'PR #37 patch scope mismatch' }
Push-Location C:\Users\andre\OneDrive\Documents\Rateware_P1_PR37_Reconstructed
try {
  git diff --binary ae64862f3c26ce849daa914799cbbb964895ec08 5357cd2cd22bd88acdb1b5bf21fe5a00fcb0b690 -- $adminFiles | git apply --3way --index -
} finally {
  Pop-Location
}
```

Do not use `ee5419ba..5357cd2c` or `ee5419ba...5357cd2c`: `ee5419ba` is not an ancestor of the current #37 head. Resolve any three-way conflict by retaining accepted #35 intelligence behavior and layering only these seven admin-governance paths.

- [ ] **Step 4: Write/refresh failing integration tests before fixes**

Add assertions that admin readiness is observation-only, authorization/tenant boundaries remain visible, no hidden mutation is mounted, PR #35 Decision Brief remains intact, and responsive navigation includes both surfaces. Run focused tests and confirm RED for any unresolved integration behavior.

- [ ] **Step 5: Implement the minimal conflict resolution**

Change only the listed admin/settings/shared-shell files needed to satisfy the focused tests. Do not add APIs, migrations, permission changes, or automatic governance actions.

- [ ] **Step 6: Run GREEN and full gates**

```powershell
Push-Location C:\Users\andre\OneDrive\Documents\Rateware_P1_PR37_Reconstructed
try {
  node tests/platform55-admin-governance.test.mjs
  node tests/platform55-intelligence.test.mjs
  node --check src/admin-governance.js
  node --check src/settings.js
  npm test
  npm run validate:action-contract
  npm audit --audit-level=low
  git diff --check origin/main...HEAD
} finally {
  Pop-Location
}
```

- [ ] **Step 7: Commit the reconstructed candidate locally**

```powershell
Push-Location C:\Users\andre\OneDrive\Documents\Rateware_P1_PR37_Reconstructed
try {
  git add -- package.json settings.html src/settings.js src/admin-governance.js src/styles.css docs/platform55-administration-governance.md tests/platform55-admin-governance.test.mjs
  git diff --cached --check
  git commit -m "feat: reconstruct Platform 55 admin governance"
} finally {
  Pop-Location
}
```

- [ ] **Step 8: Request independent review, then push authorization**

Review the exact local commit in a new detached worktree. If GO, copy the independently reproduced result into `docs/release/evidence/2026-08-20-p1-pr37-independent-review.md`, then present old/new patch equivalence, exact SHA, tests, and the exact remote transition below. Before requesting authorization, use the Supabase skill to refresh the live branch inventory read-only. If a push could create a second persistent non-default preview while `fcm-gmail-staging` still exists, stop and request an explicit reuse/delete/integration decision.

- [ ] **Step 9: Request and perform the exact remote update**

Request one explicit authorization covering the force-with-lease push, retargeting PR #37 to `main`, and the expected Vercel preview build. After authorization, run with `$new37` set to the independently reviewed local SHA:

```powershell
git fetch origin --prune
$new37 = git -C C:\Users\andre\OneDrive\Documents\Rateware_P1_PR37_Reconstructed rev-parse HEAD
git -C C:\Users\andre\OneDrive\Documents\Rateware_P1_PR37_Reconstructed push origin HEAD:refs/heads/codex/platform55-admin-governance-sprint9 --force-with-lease=refs/heads/codex/platform55-admin-governance-sprint9:5357cd2cd22bd88acdb1b5bf21fe5a00fcb0b690
gh pr edit 37 --repo elandopando8892/rateware --base main
gh pr view 37 --repo elandopando8892/rateware --json baseRefName,baseRefOid,headRefOid,isDraft,mergeable,statusCheckRollup,url
if ((gh pr view 37 --repo elandopando8892/rateware --json headRefOid --jq .headRefOid) -ne $new37) { throw 'PR #37 head drift after push' }
```

Do not mark Ready or merge in this step.

---

### Task 5: Preview, Merge, and Smoke PR #37

**Files:**
- Modify: `docs/release/2026-08-20-p1-platform55-release-ledger.md`
- Commit: `docs/release/evidence/2026-08-20-p1-pr37-independent-review.md`

**Interfaces:**
- Consumes: authorized remote update of PR #37, current successful checks, exact READY preview, and detached GO.
- Produces: production admin-governance merge with read-only acceptance evidence.

- [ ] **Step 1: Verify updated live PR state**

Run:

```powershell
$new37 = git -C C:\Users\andre\OneDrive\Documents\Rateware_P1_PR37_Reconstructed rev-parse HEAD
$main37 = git rev-parse origin/main
$live37 = gh pr view 37 --repo elandopando8892/rateware --json baseRefName,baseRefOid,headRefOid,isDraft,mergeable,statusCheckRollup,url | ConvertFrom-Json
if ($live37.baseRefName -ne 'main' -or $live37.baseRefOid -ne $main37 -or $live37.headRefOid -ne $new37) { throw 'PR #37 live state does not match reviewed candidate/current main' }
```

Require mergeability/checks to be clean and mapped to `$new37`.

- [ ] **Step 2: Run exact-preview acceptance**

Run from the trusted linked checkout:

```powershell
Push-Location C:\Users\andre\OneDrive\Documents\Rateware
try {
  $result37 = vercel list --status READY -m githubCommitSha=$new37 --format=json | ConvertFrom-Json
  $matches37 = @($result37.deployments) | Where-Object { $_.meta.githubCommitSha -eq $new37 -and $_.state -eq 'READY' }
  if ($matches37.Count -ne 1) { throw "Expected exactly one READY deployment for PR #37 head; found $($matches37.Count)" }
  $preview37 = "https://$($matches37[0].url)"
  vercel inspect $preview37 --format=json
} finally {
  Pop-Location
}
```

Verify admin readiness is read-only, tenant/role/approval gaps fail closed, no hidden mutation controls are mounted, PR #35 remains intact, and desktop/mobile UI matches the approved shell.

- [ ] **Step 3: Request explicit Ready/merge authorization**

Present exact head, preview, review verdict, checks, and limitations; stop until the user explicitly authorizes mark Ready, merge, and the expected automatic Vercel production deployment caused by merging `main`. Manual promotion remains separate.

- [ ] **Step 4: Merge only PR #37 and verify production**

After that exact authorization, mark Ready, revalidate head/checks, merge, record exact merge SHA, wait for the automatically triggered stable production mapping, and run a read-only authenticated smoke. Do not manually promote another deployment and do not advance PR #39 promotion in the same action.

- [ ] **Step 5: Commit evidence**

Update the P1 ledger with preview/merge/production/smoke facts and commit:

```powershell
git add -- docs/release/2026-08-20-p1-platform55-release-ledger.md docs/release/evidence/2026-08-20-p1-pr37-independent-review.md
git diff --cached --check
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
- Review/Modify: `package.json`
- Test: `tests/platform55-platform-readiness.test.mjs`
- Test: `tests/platform55-admin-governance.test.mjs`
- Create: `docs/release/evidence/2026-08-20-p1-pr39-independent-review.md`
- Create: `docs/release/evidence/2026-08-20-p1-implementation.md`
- Modify: `docs/release/2026-08-20-p1-platform55-release-ledger.md`
- Modify: `docs/release/production-readiness-ledger.json`

**Interfaces:**
- Consumes: production/main after PR #37; canonical seven-file feature commit `4765c38343aa0528ba7602ef2c770c9a7f204e47` with parent `c582526066fbc4f6e007039f267a316d8266c0fc`; and exact resolved seven-file delta `5357cd2cd22bd88acdb1b5bf21fe5a00fcb0b690..46f5e80ff7c914c3ae4a0922c840364fbf8a052d`.
- Produces: clean local PR #39 replacement candidate based on the exact post-#37 main.

- [ ] **Step 1: Capture the exact post-#37 base and create a worktree**

Run:

```powershell
git fetch origin --prune
$post37Main = git rev-parse origin/main
gh pr view 37 --repo elandopando8892/rateware --json state,mergedAt,mergeCommit,headRefOid,baseRefOid
git worktree add -b codex/p1-pr39-reconstructed C:\Users\andre\OneDrive\Documents\Rateware_P1_PR39_Reconstructed $post37Main
git -C C:\Users\andre\OneDrive\Documents\Rateware_P1_PR39_Reconstructed status --short
```

Record `$post37Main` and PR #37's merge SHA in the ledger. Require an empty worktree status.

- [ ] **Step 2: Apply only PR #39's unique patch**

Prove the canonical commit and resolved delta touch the same exact seven paths, then apply only the resolved delta inside the reconstruction worktree:

```powershell
$readinessFiles = @(
  'docs/platform55-platform-readiness.md',
  'package.json',
  'settings.html',
  'src/platform-readiness.js',
  'src/settings.js',
  'src/styles.css',
  'tests/platform55-platform-readiness.test.mjs'
)
$canonical = @(git diff --name-only c582526066fbc4f6e007039f267a316d8266c0fc 4765c38343aa0528ba7602ef2c770c9a7f204e47 -- $readinessFiles)
$resolved = @(git diff --name-only 5357cd2cd22bd88acdb1b5bf21fe5a00fcb0b690 46f5e80ff7c914c3ae4a0922c840364fbf8a052d -- $readinessFiles)
if ((Compare-Object $readinessFiles $canonical) -or (Compare-Object $readinessFiles $resolved)) { throw 'PR #39 patch scope mismatch' }
Push-Location C:\Users\andre\OneDrive\Documents\Rateware_P1_PR39_Reconstructed
try {
  git diff --binary 5357cd2cd22bd88acdb1b5bf21fe5a00fcb0b690 46f5e80ff7c914c3ae4a0922c840364fbf8a052d -- $readinessFiles | git apply --3way --index -
} finally {
  Pop-Location
}
```

Preserve accepted intelligence/admin code and layer only these seven platform-readiness paths.

- [ ] **Step 3: Write/refresh failing integration tests**

Assert readiness statuses derive from auditable inputs, unknown/invalid evidence fails closed, no control claims a deploy/approval occurred, both earlier Platform 55 views remain functional, and responsive UI remains coherent.

- [ ] **Step 4: Implement minimal conflict resolution and run GREEN**

Modify only the listed files, then run:

```powershell
Push-Location C:\Users\andre\OneDrive\Documents\Rateware_P1_PR39_Reconstructed
try {
  node tests/platform55-platform-readiness.test.mjs
  node tests/platform55-admin-governance.test.mjs
  node tests/platform55-intelligence.test.mjs
  node --check src/platform-readiness.js
  node --check src/settings.js
  npm test
  npm run validate:action-contract
  npm audit --audit-level=low
  git diff --check origin/main...HEAD
} finally {
  Pop-Location
}
```

- [ ] **Step 5: Commit and independently review locally**

Commit and review with exact commands:

```powershell
Push-Location C:\Users\andre\OneDrive\Documents\Rateware_P1_PR39_Reconstructed
try {
  git add -- package.json settings.html src/settings.js src/platform-readiness.js src/styles.css docs/platform55-platform-readiness.md tests/platform55-platform-readiness.test.mjs
  git diff --cached --check
  git commit -m "feat: reconstruct Platform 55 readiness controls"
} finally {
  Pop-Location
}
```

Obtain a detached GO at the exact SHA and copy the independently reproduced result into `docs/release/evidence/2026-08-20-p1-pr39-independent-review.md`. A finding returns to this task without stopping other isolated work.

- [ ] **Step 6: Advance P1 to 55% after all three implementations are complete**

Create `docs/release/evidence/2026-08-20-p1-implementation.md` with the exact #35 certified head plus the independently reviewed reconstructed #37/#39 SHAs, seven-file scopes, tests, and review paths. In `production-readiness-ledger.json`, point `evidence.implementation` to that file and set P1 to `55`. Run readiness tests and `npm run release:progress`; expected general display is `72%` (numeric value `72.0`). Commit only the two evidence files, release ledger, and readiness ledger from the controller evidence worktree.

```powershell
Push-Location C:\Users\andre\OneDrive\Documents\Rateware_P0_Release_Baseline
try {
  node tests/production-readiness-report.test.mjs
  npm run release:progress
  git diff --check
  git add -- docs/release/evidence/2026-08-20-p1-pr39-independent-review.md docs/release/evidence/2026-08-20-p1-implementation.md docs/release/2026-08-20-p1-platform55-release-ledger.md docs/release/production-readiness-ledger.json
  git diff --cached --check
  git commit -m "docs: record complete P1 implementation evidence"
} finally {
  Pop-Location
}
```

- [ ] **Step 7: Refresh preview capacity and request remote update authorization**

Use the Supabase skill to refresh the live branch inventory read-only. If a push could create a second persistent non-default preview while `fcm-gmail-staging` exists, stop and request an explicit reuse/delete/integration decision. Otherwise present patch equivalence, exact old/new head, base, tests, review, and request one explicit authorization covering force-with-lease, retargeting PR #39 to `main`, and its expected Vercel preview build.

- [ ] **Step 8: Perform only the authorized PR #39 remote update**

After authorization, run with `$new39` set to the independently reviewed local SHA:

```powershell
git fetch origin --prune
$new39 = git -C C:\Users\andre\OneDrive\Documents\Rateware_P1_PR39_Reconstructed rev-parse HEAD
git -C C:\Users\andre\OneDrive\Documents\Rateware_P1_PR39_Reconstructed push origin HEAD:refs/heads/codex/platform55-platform-readiness-sprint10 --force-with-lease=refs/heads/codex/platform55-platform-readiness-sprint10:46f5e80ff7c914c3ae4a0922c840364fbf8a052d
gh pr edit 39 --repo elandopando8892/rateware --base main
gh pr view 39 --repo elandopando8892/rateware --json baseRefName,baseRefOid,headRefOid,isDraft,mergeable,statusCheckRollup,url
if ((gh pr view 39 --repo elandopando8892/rateware --json headRefOid --jq .headRefOid) -ne $new39) { throw 'PR #39 head drift after push' }
```

Do not mark Ready or merge in this step.

---

### Task 7: Preview, Merge, and Smoke PR #39

**Files:**
- Modify: `docs/release/2026-08-20-p1-platform55-release-ledger.md`
- Modify: `docs/release/production-readiness-ledger.json`
- Create: `docs/release/evidence/2026-08-20-p1-release-candidate-independent-review.md`

**Interfaces:**
- Consumes: updated PR #39 exact head, successful checks/preview, detached GO, and explicit human authorization.
- Produces: exhausted Platform 55 queue and P1 automated/preview/production evidence.

- [ ] **Step 1: Verify exact live state and preview**

Run:

```powershell
$new39 = git -C C:\Users\andre\OneDrive\Documents\Rateware_P1_PR39_Reconstructed rev-parse HEAD
$main39 = git rev-parse origin/main
$live39 = gh pr view 39 --repo elandopando8892/rateware --json baseRefName,baseRefOid,headRefOid,isDraft,mergeable,statusCheckRollup,url | ConvertFrom-Json
if ($live39.baseRefName -ne 'main' -or $live39.baseRefOid -ne $main39 -or $live39.headRefOid -ne $new39) { throw 'PR #39 live state does not match reviewed candidate/current main' }
Push-Location C:\Users\andre\OneDrive\Documents\Rateware
try {
  $result39 = vercel list --status READY -m githubCommitSha=$new39 --format=json | ConvertFrom-Json
  $matches39 = @($result39.deployments) | Where-Object { $_.meta.githubCommitSha -eq $new39 -and $_.state -eq 'READY' }
  if ($matches39.Count -ne 1) { throw "Expected exactly one READY deployment for PR #39 head; found $($matches39.Count)" }
  $preview39 = "https://$($matches39[0].url)"
  vercel inspect $preview39 --format=json
} finally {
  Pop-Location
}
```

Require mergeability/checks to be clean and mapped to `$new39`.

- [ ] **Step 2: Run cross-platform visual/workflow acceptance**

At desktop and mobile widths, verify Home, Rate Intake, Procurement, Commercial Network, Operations, Finance, Intelligence, Administration, and Readiness share the approved Platform 55 shell. Verify navigation, loading/error/empty states, escaping, and human approval copy. Do not execute consequential controls.

- [ ] **Step 3: Request explicit Ready/merge authorization**

Present the complete queue evidence and stop until the user explicitly authorizes mark Ready, merge, and the expected automatic Vercel production deployment caused by merging `main`. Manual promotion remains separate.

- [ ] **Step 4: Merge and smoke only after authorization**

After that exact authorization, mark Ready, re-read head/base/checks, merge PR #39, capture the exact merge SHA, verify the automatically triggered stable production deployment maps to it, and run a read-only authenticated smoke across the three newly released surfaces plus representative existing flows. Do not manually promote another deployment.

- [ ] **Step 5: Obtain aggregate candidate GO and advance P1 to 93%**

Use a brand-new detached worktree at the exact post-#39 production SHA. The reviewer must independently reproduce the three candidate-to-merge-to-production mappings, focused adversarial tests, preview/production read-only smokes, and redaction boundaries. Copy the GO result into `docs/release/evidence/2026-08-20-p1-release-candidate-independent-review.md`. Add `automated_suite`, `preview_smoke`, `deployment`, and `production_smoke` evidence; point `evidence.independent_review` to that exact file; set `verdicts.independent_review` to `GO`; and set P1 progress `93`. Run readiness tests/progress/full suite/validator/audit/diff. Expected general progress: `75.4%` after rounding. Any P0/P1/P2 finding keeps P1 below 85 and returns to the owning task without blocking unrelated isolated development.

- [ ] **Step 6: Commit queue-exhaustion evidence**

```powershell
git add -- docs/release/2026-08-20-p1-platform55-release-ledger.md docs/release/production-readiness-ledger.json docs/release/evidence/2026-08-20-p1-release-candidate-independent-review.md
git diff --cached --check
git commit -m "docs: record Platform 55 queue completion"
```

---

### Task 8: Independently Close P1

**Files:**
- Create: `docs/release/evidence/2026-08-20-p1-independent-review.md`
- Create: `docs/release/evidence/2026-08-20-p1-monitoring.md`
- Modify: `docs/release/production-readiness-ledger.json`

**Interfaces:**
- Consumes: exact final production SHA/deployment, all P1 evidence, queue rows, tests, authenticated read-only smokes, and primary-checkout preservation fingerprint.
- Produces: final P1 GO/NO-GO and the exact P2 starting point.

- [ ] **Step 1: Freeze the P1 candidate**

Record exact HEAD, `origin/main`, production deployment SHA, Supabase project/preview count, Git status, and commit range. Require clean release/evidence checkout.

- [ ] **Step 2: Run a new detached independent review**

The reviewer independently refreshes GitHub/Vercel/Supabase, proves all three PRs' merge/production mapping, repeats focused adversarial/visual checks, verifies P1 ledger gates/arithmetic, scans redaction, and preserves the dirty primary checkout. No implementer evidence is accepted without reproduction. The reviewer writes no candidate files; the controller records the reproduced verdict in `docs/release/evidence/2026-08-20-p1-independent-review.md`.

- [ ] **Step 3: Record GO or return findings**

Any P0/P1/P2 finding returns to its owning task while isolated development continues. A GO document includes exact path/SHA, tests, live mappings, limitations, P3 advisories, and zero-external-mutation boundary. On GO, update `evidence.independent_review` to `docs/release/evidence/2026-08-20-p1-independent-review.md` and retain `verdicts.independent_review="GO"`.

- [ ] **Step 4: Collect bounded P1 monitoring evidence**

Observe the exact production deployment for 15 minutes with samples at T+0, T+5, and T+15. Record all results in `docs/release/evidence/2026-08-20-p1-monitoring.md`. The acceptance criteria are exact and P1-specific:

1. `vercel inspect https://rateware.vercel.app --format=json` reports `READY`, the stable alias resolves to the exact PR #39 merge deployment, and its Git SHA equals the recorded merge SHA in all three samples.
2. `vercel logs https://rateware.vercel.app --since 15m --level error --json` reports zero new application errors attributable to the Intelligence, Administration, or Readiness routes. Record unrelated/preexisting errors separately; do not suppress them.
3. Run six authenticated read-only navigations—desktop and mobile for each new surface. Require HTTP 5xx count `0`, browser uncaught error count `0`, and load-to-ready duration below `3000 ms` for at least five of six samples; any slower sample is recorded and manually inspected before GO.
4. Capture the browser network log for those six navigations. Require zero upload, approval, send, promote, merge, deploy, configuration, secret, enforcement, or production-data mutation requests. Read-only POST/RPC calls are acceptable only when their action name is already documented as read-only and their response is not followed by a write.
5. Use Supabase only with SELECT/metadata reads to confirm the persistent non-default preview count remains `<=1` and no approval/upload artifact carrying the review session request IDs was created. Do not change branches, secrets, functions, rows, or tenant mode.

If any criterion fails, leave P1 at `93` and return the failure to its owning task; local P2 development may continue.

- [ ] **Step 5: Set P1 to 100 only after GO and bounded monitoring**

Point `evidence.monitoring` to `docs/release/evidence/2026-08-20-p1-monitoring.md`, keep the final independent-review path/verdict from Step 3, set P1 progress `100`, and run:

```powershell
Push-Location C:\Users\andre\OneDrive\Documents\Rateware_P0_Release_Baseline
try {
  npm run release:progress
  npm test
  npm run validate:action-contract
  npm audit --audit-level=low
  git diff --check origin/main...HEAD
  git status --short
} finally {
  Pop-Location
}
```

Expected: general progress `76.0%`, P1 `100%`, all gates PASS.

- [ ] **Step 6: Commit closure and hand off P2**

```powershell
git add -- docs/release/evidence/2026-08-20-p1-independent-review.md docs/release/evidence/2026-08-20-p1-monitoring.md docs/release/production-readiness-ledger.json
git diff --cached --check
git commit -m "docs: close P1 Platform 55 release"
```

Write the P2 plan against the exact production SHA and tenant posture recorded by P1. The 24-hour shadow window gates only a future `required` activation decision, not P2 development.
