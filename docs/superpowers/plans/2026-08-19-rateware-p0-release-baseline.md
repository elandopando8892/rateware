# Rateware P0 Release Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish one current, auditable Rateware release baseline and a reproducible percentage ledger before any Platform 55 release work continues.

**Architecture:** A Node.js reporting module computes progress from a versioned JSON ledger and rejects unsupported gate claims. Read-only evidence documents capture Git/GitHub, Vercel, and Supabase state. A detached independent review must report GO before P0 reaches 100%.

**Tech Stack:** Node.js ESM, JSON, built-in `node:test`, Git, GitHub CLI or connector, Vercel CLI, Supabase MCP/CLI, Markdown.

**Spec:** `docs/superpowers/specs/2026-08-19-rateware-production-closure-design.md`

## Global Constraints

- Execute in a new clean worktree based on live `origin/main`; preserve the dirty primary checkout.
- Never use broad staging, destructive cleanup, or retry loops.
- Do not create a Supabase preview branch or deploy, merge, mark Ready, change configuration, change secrets, or run DDL/DML.
- Production database work is SELECT-only and must not reveal secret values, identity subjects, or private payloads.
- GitHub reads target `elandopando8892/rateware` and use exact SHAs.
- Vercel reads must not auto-link a worktree or disable deployment protection.
- Overall progress starts at 63%; sprint weights total 37 points.
- P0 reaches 100% only after a detached independent review reports GO.

---

### Task 1: Create the Reproducible Progress Ledger

**Files:**
- Create: `docs/release/production-readiness-ledger.json`
- Create: `tools/production-readiness-report.mjs`
- Create: `tests/production-readiness-report.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: a version-1 JSON ledger containing baseline, sprint weights, progress, and evidence gates.
- Produces: `validateLedger(ledger)`, `computeOverallProgress(ledger)`, `formatProgressReport(ledger)`, and `npm run release:progress`.

- [ ] **Step 1: Write the failing ledger tests**

Create `tests/production-readiness-report.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  computeOverallProgress,
  formatProgressReport,
  validateLedger
} from "../tools/production-readiness-report.mjs";

const ledger = {
  schema_version: 1,
  baseline: 63,
  sprints: [
    { id: "P0", weight: 4, progress: 10, evidence: { scope: ["spec", "plan"] } },
    { id: "P1", weight: 9, progress: 0, evidence: {} },
    { id: "P2", weight: 7, progress: 0, evidence: {} },
    { id: "P3", weight: 7, progress: 0, evidence: {} },
    { id: "P4", weight: 6, progress: 0, evidence: {} },
    { id: "P5", weight: 4, progress: 0, evidence: {} }
  ]
};

test("computes weighted progress", () => {
  validateLedger(ledger);
  assert.equal(computeOverallProgress(ledger), 63.4);
});

test("rejects progress without evidence", () => {
  const invalid = structuredClone(ledger);
  invalid.sprints[0].evidence = {};
  assert.throws(() => validateLedger(invalid), /P0.*evidence/i);
});

test("requires high-risk gates", () => {
  for (const [progress, key] of [[85, "independent_review"], [97, "deployment"], [100, "production_smoke"], [100, "monitoring"]]) {
    const invalid = structuredClone(ledger);
    invalid.sprints[0].progress = progress;
    invalid.sprints[0].evidence = { scope: ["spec"] };
    assert.throws(() => validateLedger(invalid), new RegExp(key, "i"));
  }
});

test("formats general and sprint progress", () => {
  const output = formatProgressReport(ledger);
  assert.match(output, /General:\s+63\.4%/);
  assert.match(output, /P0:\s+10%/);
});
```

- [ ] **Step 2: Verify the test fails before implementation**

Run `node tests/production-readiness-report.test.mjs`.

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `tools/production-readiness-report.mjs`.

- [ ] **Step 3: Implement the ledger module**

Create `tools/production-readiness-report.mjs` with:

```js
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const IDS = ["P0", "P1", "P2", "P3", "P4", "P5"];
const GATES = [[10, "scope"], [25, "evidence_plan"], [55, "implementation"], [70, "automated_suite"], [85, "independent_review"], [93, "preview_smoke"], [97, "deployment"], [100, "production_smoke"], [100, "monitoring"]];

const hasEvidence = (evidence, key) => Array.isArray(evidence?.[key]) && evidence[key].length > 0;

export function validateLedger(ledger) {
  if (ledger?.schema_version !== 1 || ledger?.baseline !== 63) throw new Error("invalid ledger header");
  if (!Array.isArray(ledger.sprints) || ledger.sprints.map((s) => s.id).join(",") !== IDS.join(",")) throw new Error("sprints must be P0-P5");
  if (ledger.sprints.reduce((sum, sprint) => sum + sprint.weight, 0) !== 37) throw new Error("weights must total 37");
  for (const sprint of ledger.sprints) {
    if (!Number.isFinite(sprint.progress) || sprint.progress < 0 || sprint.progress > 100) throw new Error(`${sprint.id} progress out of range`);
    if (sprint.progress > 0 && Object.keys(sprint.evidence || {}).length === 0) throw new Error(`${sprint.id} requires evidence`);
    for (const [threshold, key] of GATES) if (sprint.progress >= threshold && !hasEvidence(sprint.evidence, key)) throw new Error(`${sprint.id} requires ${key}`);
  }
  return ledger;
}

export function computeOverallProgress(ledger) {
  validateLedger(ledger);
  const earned = ledger.sprints.reduce((sum, sprint) => sum + sprint.weight * sprint.progress / 100, 0);
  return Math.round((ledger.baseline + earned) * 10) / 10;
}

export function formatProgressReport(ledger) {
  validateLedger(ledger);
  return [`General: ${computeOverallProgress(ledger)}%`, ...ledger.sprints.map((s) => `${s.id}: ${s.progress}%`)].join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2] || "docs/release/production-readiness-ledger.json";
  process.stdout.write(`${formatProgressReport(JSON.parse(readFileSync(path, "utf8")))}\n`);
}
```

- [ ] **Step 4: Create and wire the initial ledger**

Create the ledger with weights `4/9/7/7/6/4`, P0 at 10%, P1-P5 at 0%, and P0 `scope` evidence pointing to the approved spec and this plan. Add `"release:progress": "node tools/production-readiness-report.mjs"` to `package.json` and prepend the new test to the existing `test` script.

- [ ] **Step 5: Verify and commit Task 1**

```powershell
node tests/production-readiness-report.test.mjs
npm run release:progress
git add -- docs/release/production-readiness-ledger.json tools/production-readiness-report.mjs tests/production-readiness-report.test.mjs package.json
git diff --cached --check
git commit -m "feat: add production readiness progress ledger"
```

Expected: tests PASS and the report prints `General: 63.4%` and `P0: 10%`.

---

### Task 2: Establish the Isolated Git and GitHub Baseline

**Files:**
- Create: `docs/release/evidence/2026-08-19-p0-git-github.md`
- Modify: `docs/release/production-readiness-ledger.json`

**Interfaces:**
- Consumes: live `origin/main`, local worktrees, and GitHub PR metadata for `elandopando8892/rateware`.
- Produces: an immutable release queue with exact SHAs, ownership, dependency order, review state, and checks.

- [ ] **Step 1: Verify isolation before changing Git metadata**

Read `superpowers:using-git-worktrees`. In the primary checkout run:

```powershell
git rev-parse --show-toplevel
git status --short
git worktree list --porcelain
Test-Path 'C:\Users\andre\OneDrive\Documents\Rateware_P0_Release_Baseline'
```

Stop if the path already exists. Preserve the primary checkout exactly.

- [ ] **Step 2: Create the clean P0 worktree from live main**

```powershell
git fetch --prune origin
git worktree add -b codex/p0-release-baseline 'C:\Users\andre\OneDrive\Documents\Rateware_P0_Release_Baseline' origin/main
```

In the new worktree verify that `git rev-parse HEAD`, `git rev-parse origin/main`, and `git merge-base HEAD origin/main` are identical and `git status --short` is empty.

- [ ] **Step 3: Capture local refs and worktrees**

```powershell
git branch -a --no-color
git worktree list --porcelain
git for-each-ref --format='%(refname:short)|%(objectname)|%(committerdate:iso8601)' refs/heads refs/remotes/origin
```

Classify Platform 55 P0-P10, Phase 0.2E, PR #35 integration, Sprint 11, Agentic MarkOS, Provider Service, and the dirty primary checkout independently.

- [ ] **Step 4: Capture current GitHub PR state**

Use the GitHub connector when available. CLI fallback:

```powershell
gh auth status
gh pr list --repo elandopando8892/rateware --state open --limit 100 --json number,title,isDraft,headRefName,headRefOid,baseRefName,baseRefOid,mergeable,reviewDecision,statusCheckRollup,url
```

For every release-relevant number returned, run `gh pr view <number> --repo elandopando8892/rateware --json number,title,state,isDraft,headRefName,headRefOid,baseRefName,baseRefOid,mergeable,reviewDecision,statusCheckRollup,commits,files,url`. Use only numbers returned live.

- [ ] **Step 5: Write the Git/GitHub evidence report**

Create `docs/release/evidence/2026-08-19-p0-git-github.md` with collection timestamp, `origin/main` SHA, primary-checkout summary, complete worktree table, open-PR table, ordered release queue, explicit post-core exclusions, and blockers. Do not paste private file contents.

- [ ] **Step 6: Advance P0 to 25% and commit**

Add `evidence_plan: ["docs/release/evidence/2026-08-19-p0-git-github.md"]`, set P0 progress to 25, and run `npm run release:progress`. Expected overall: 64.0%.

```powershell
git add -- docs/release/evidence/2026-08-19-p0-git-github.md docs/release/production-readiness-ledger.json
git diff --cached --check
git commit -m "docs: record P0 GitHub release baseline"
```

---

### Task 3: Establish the Read-Only Vercel Baseline

**Files:**
- Create: `docs/release/evidence/2026-08-19-p0-vercel.md`

**Interfaces:**
- Consumes: Vercel project identity, current production deployment, candidate previews, and GitHub check URLs.
- Produces: deployment-to-Git-SHA mapping without creating, promoting, relinking, or deleting deployments.

- [ ] **Step 1: Verify linkage without auto-linking**

Run `vercel whoami` and `vercel project inspect rateware` only from a trusted checkout that already contains `.vercel/project.json`. If no trusted link exists, use the Vercel connector and GitHub check URLs; do not run `vercel link`.

- [ ] **Step 2: List and inspect deployments read-only**

```powershell
vercel list --status READY
vercel list -m gitBranch=main
vercel inspect <exact-url-returned-by-vercel-list>
```

Inspect the production deployment and each release-relevant READY preview. Do not construct URLs from branch names.

- [ ] **Step 3: Write and verify the Vercel evidence**

Create `docs/release/evidence/2026-08-19-p0-vercel.md` with team/project, production deployment ID/URL/state/time/SHA, relevant previews, protection status, skipped previews, and a zero-mutation statement. Never record tokens.

For every deployment SHA run `git cat-file -e <sha>^{commit}` and `git merge-base --is-ancestor <sha> origin/main`; record the exact result.

- [ ] **Step 4: Commit the Vercel evidence**

```powershell
git add -- docs/release/evidence/2026-08-19-p0-vercel.md
git diff --cached --check
git commit -m "docs: record P0 Vercel deployment baseline"
```

---

### Task 4: Establish the Read-Only Supabase Baseline

**Files:**
- Create: `docs/release/evidence/2026-08-19-p0-supabase.md`

**Interfaces:**
- Consumes: project `alqjqzqagdmcywpjtnnr`, branch inventory, migration history, Edge Function inventory, secret metadata, and SELECT-only catalog evidence.
- Produces: environment identity, preview count, deployed baseline, and tenant posture without exposing secrets.

- [ ] **Step 1: Discover current CLI commands**

Do not retry the changelog URL blocked by safe navigation. Run:

```powershell
npx supabase@latest --version
npx supabase@latest branches --help
npx supabase@latest functions --help
npx supabase@latest migration --help
npx supabase@latest secrets --help
```

- [ ] **Step 2: Verify project and preview branches read-only**

Prefer Supabase MCP. Confirm project ref/name/health and list preview branches. The acceptance condition is no more than one paid preview branch. If MCP is unavailable, use only list commands shown by `--help`; never create or delete a branch.

- [ ] **Step 3: Inventory migrations, functions, and secret metadata**

Collect applied migration versions, maximum version, deployed Edge Function names/versions/timestamps, and secret names/digests only. Confirm whether an approved metadata path proves `RATEWARE_TENANT_ENFORCEMENT=shadow`; otherwise record `tenant mode not independently proven`. Never print the secret set's values.

- [ ] **Step 4: Run aggregate SELECT-only tenant queries**

First query `information_schema` for exact names. Then execute aggregate counts equivalent to:

```sql
select count(*) total, count(*) filter (where status = 'active') active
from public.external_identities;

select count(*) total, count(*) filter (where status = 'active') active
from public.external_identity_organization_links;

select count(*) total,
       count(*) filter (where reconciliation_status = 'reconciled') reconciled
from public.workspace_registry;
```

Do not select subjects, emails, tokens, names, or payloads.

- [ ] **Step 5: Write and commit the Supabase evidence**

Create `docs/release/evidence/2026-08-19-p0-supabase.md` with project health, preview count, migrations/functions, safe config posture, aggregate tenant counts, P2 blockers, and a statement confirming zero DDL, DML, deploys, branch changes, secret changes, uploads, or approvals.

```powershell
git add -- docs/release/evidence/2026-08-19-p0-supabase.md
git diff --cached --check
git commit -m "docs: record P0 Supabase baseline"
```

---

### Task 5: Produce the Authoritative P0 Release Queue

**Files:**
- Create: `docs/release/2026-08-19-p0-release-baseline.md`
- Modify: `docs/release/production-readiness-ledger.json`

**Interfaces:**
- Consumes: Git/GitHub, Vercel, and Supabase evidence from Tasks 2-4.
- Produces: one ordered core release queue, explicit exclusions, recalibrated score, and P1 entry criteria.

- [ ] **Step 1: Reconcile all candidates by exact SHA**

For every workstream record:

```text
workstream | PR | base SHA | head SHA | review | preview | production | disposition
```

Allowed dispositions are `release queue`, `already production`, `superseded`, `blocked`, and `post-core`. Do not use inferred states.

- [ ] **Step 2: Write the baseline report**

Create `docs/release/2026-08-19-p0-release-baseline.md` with:

1. Executive decision and recalibrated progress.
2. Evidence timestamps and source documents.
3. Production SHA and deployed component versions.
4. Ordered Platform 55 release queue.
5. Separate Phase 0.2E entry for P2.
6. Post-core Agentic MarkOS and Provider Service entries.
7. Dirty-checkout ownership summary.
8. Blockers and P1 entry criteria.
9. Supabase preview-branch cost statement.
10. Next exact action.

- [ ] **Step 3: Advance P0 to 70% after deterministic verification**

Set P0 progress to 70 and add:

```json
"implementation": ["docs/release/2026-08-19-p0-release-baseline.md"],
"automated_suite": [
  "node tests/production-readiness-report.test.mjs",
  "npm run release:progress",
  "git diff --check origin/main...HEAD"
]
```

Run:

```powershell
node tests/production-readiness-report.test.mjs
npm run release:progress
git diff --check origin/main...HEAD
```

Expected overall progress: 65.8%.

- [ ] **Step 4: Commit the baseline**

```powershell
git add -- docs/release/2026-08-19-p0-release-baseline.md docs/release/production-readiness-ledger.json
git diff --cached --check
git commit -m "docs: establish P0 release queue"
```

---

### Task 6: Independently Review and Close P0

**Files:**
- Create: `docs/release/evidence/2026-08-19-p0-independent-review.md`
- Modify: `docs/release/production-readiness-ledger.json`

**Interfaces:**
- Consumes: immutable P0 candidate and all P0 evidence.
- Produces: independent GO/NO-GO, final P0 score, and exact P1 starting point.

- [ ] **Step 1: Freeze and verify the candidate**

```powershell
git rev-parse HEAD
git status --short
git log --oneline origin/main..HEAD
```

Expected: clean status and only P0 commits in the range.

- [ ] **Step 2: Request a detached independent review**

Use `superpowers:requesting-code-review`. The reviewer must create a new detached worktree at the exact candidate SHA, may not treat implementer evidence as proof, and may not edit the candidate.

The review verifies ledger arithmetic/gates, live GitHub state, Vercel SHA mappings, Supabase project/preview count, absence of secrets/private identities in evidence, queue ordering, exclusions, and preservation of the dirty primary checkout.

- [ ] **Step 3: Record the verdict**

Create `docs/release/evidence/2026-08-19-p0-independent-review.md` with candidate SHA, detached review path, commands, mismatches, findings by severity, and GO/NO-GO. If any P0/P1/P2 finding exists, keep P0 below 85% and return to its owning task.

- [ ] **Step 4: Close P0 only after GO**

Set P0 to 100 and add evidence keys:

```json
"independent_review": ["docs/release/evidence/2026-08-19-p0-independent-review.md"],
"preview_smoke": ["P0 read-only inventories verified without creating a preview"],
"deployment": ["P0 documentation and tooling require no application deployment"],
"production_smoke": ["P0 production inventory verified read-only"],
"monitoring": ["P0 completed without production mutation"]
```

Run:

```powershell
npm run release:progress
npm test
npm audit --audit-level=low
git diff --check origin/main...HEAD
git status --short
```

Expected: overall 67.0%, P0 100%, tests PASS, zero audit vulnerabilities, clean diff check, and clean worktree.

- [ ] **Step 5: Commit the closure and hand off**

```powershell
git add -- docs/release/evidence/2026-08-19-p0-independent-review.md docs/release/production-readiness-ledger.json
git diff --cached --check
git commit -m "docs: close P0 release baseline"
```

Write the P1 plan against the exact release queue and `origin/main` recorded by P0. Historical PR numbers or percentages may not override the live baseline.

---

## Plan Self-Review Results

- Spec coverage: P0 goal, progress model, GitHub, Vercel, Supabase, preview-cost constraint, release queue, and independent review each map to a task.
- Placeholder scan: no deferred implementation marker remains.
- Type consistency: ledger IDs, weights, evidence keys, thresholds, and expected percentages match across tasks.
- Scope: this plan closes P0 only; P1-P5 require separate plans based on the preceding sprint's evidence.
