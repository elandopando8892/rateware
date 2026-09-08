# Thirteen-migration composition and UI contract rehearsal

Date: 2026-09-08. Candidate base: `82cb1c7` plus the test changes in this commit.
Local synthetic verification only; no cloud migration or production action.

## Scope and result

The native test `supabase/functions/osp-document-api/release-rehearsal.native.test.ts`
now consumes the ordered thirteen-file manifest at
`docs/osp/releases/2026-09-08-closeout-migrations.json`. It validates every source
SHA-256, applies each file in a transaction, and asserts the exact ordered set.
The former nine-file manifest remains unchanged as historical evidence.

Fresh database `osp_release_rehearsal_run_4`, PostgreSQL 17.11 on loopback port
55472: **one test, eight steps, zero failures (10s)**.

- All thirteen migrations apply together without creating jobs, package sets,
  member reviews, Operations receipts, profile facts or memory candidates.
- Existing real profile-store and form-handler reads continue to work.
- The revoked direct publication command remains revoked.
- Future form revisions create supervised candidates; review alone does not
  promote facts. Whole-document publication and evidence-link replay work.
- Stale/cross-tenant evidence and stale request reviews remain blocked.
- The 256-character actor hotfix works without widening the execute ACL.

The UI compatibility test consumes that run's actual synthetic API JSON and now
requires the exact thirteen-file list, not merely an arbitrary count. **Four of
four tests passed (14.11s)** with Node 24 and a single Vitest worker:

- Current UI accepts the new profile/form responses.
- Historical `ed12d16` strict schemas reject the new fields as expected: this is
  a coordinated-release requirement, not a successful old-client smoke.
- Current UI accepts the old projected response without inventing new fields.
- Whole-batch publication requires explicit confirmation; old summaries cannot
  enable it.

Native artifact (ignored, synthetic):
`tmp/osp-s13-pg17-rehearsal/osp_release_rehearsal_run_4.json`.
No connection or statement timeout was increased. Lint and diff whitespace
checks passed after aligning the test's PostgreSQL import with the existing map.

## Limits and next release step

The foundation is still a scoped contract fixture, not a dump of all Rateware
tables, triggers or production records. Additional package-review coverage is
recorded in `releases/2026-09-08-package-review-preflight.md` (twelve native steps,
including actor guards, enqueuing/rollback, immutable reviews and concurrent
completion). It is complementary, not a claim that this test executes the entire
customer-registration workflow.

Next: reconcile the live schema prerequisites and rollback artifacts, build a
compatible UI/API release, and demonstrate authenticated persistent inspection
on isolated canaries. Preserve historical Salzillo and its queued job. Real
document fidelity, applicable signatures, Sales and exact delivery remain open;
this rehearsal alone closes none of the six end-to-end exit gates.
