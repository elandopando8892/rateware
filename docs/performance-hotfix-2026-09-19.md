# Bid Room performance increment — 2026-09-19

## Scope and release status

Production diagnosis was read-only. No invitations, drafts, selections, messages,
permissions, or business records were intentionally created or changed.
Production has NOT been promoted by this increment. No new branches were created.

Frontend baseline: `706d09e7f348627a38a57224ea6e216ff4f9d462`.
Backend baseline: `e60b14ae865c95354ba6b944690d6ad47f4d4d89` in the separate
`rateware-api-perf-hotfix/carrier-list-templates` checkout. Its existing
`deno.lock` modifications were not part of this work.

## Implemented

- Bounded, value-keyed Carrier Fit term cache. Changing a route value or term
  type recomputes matching; no changes to scoring, recipients, or permissions.
- Separate backend patch: slim `audience_history` projection, retaining
  metadata, normalized phone, tracking relation, filters, ordering, and all
  history pages. Skips unnecessary invitation-token hydration only on this path.
  Message generation and delivery reads remain unchanged.

## Evidence and limits

RFx: `625cd649-f97a-4da0-865e-ec3bf8a058d1` (69 lanes, 6348 participation rows).
Production capture: detail 7275 ms; audience 9157 ms; approximately 73 seconds
between detail completion and the subsequent request group. This gap suggests
client-side work, but a CPU profile could not be retrieved: Profiler.stop timed
out. Profiling was disabled afterward. Do not call the root cause fully proven.

Preview: https://rateware-bplhgc29x-elandopando8892s-projects.vercel.app
Deployment: `dpl_2m1dKcMYkbFV4iFhgLLRBaqvg8EU`.
Authenticated read-only check loaded 50 visible candidates and all 92 RFx
carriers; action status was `Bid Room loaded.`
Preview capture: detail 11768 ms; approximately 6.6 seconds before the subsequent
request group; audience 24046 ms; context 12081 ms. These are single samples,
not a controlled performance percentile or an end-to-end speed guarantee.
Preview still uses the unchanged production backend.

SQL aggregate: 91 non-archived outreach messages total 16,102,957 JSON bytes,
including 3,663,474 metadata bytes, before joins. The new projection preserves
metadata for status compatibility but avoids the rest of the full row payload.

## Checks

- PASS: carrier-fit-terms-cache, 289800 synthetic comparisons, 953 ms local.
- PASS: bid-room-launch-workspace-performance.
- PASS: bid-room-large-event-performance.
- PASS: rfx-multilane-e2e; frontend syntax; git diff whitespace checks.
- PASS: backend outreach-audience-history (2 executable tests; pagination,
  scope, sorting, error propagation, default hydration behavior, contact keys,
  tracking, blocking and next-action parity across status/channel variants).
- FAIL: general rateware-stability test line 1011 expects `createVendorSegment`;
  the baseline HEAD also lacks this symbol. Do not mark the full suite green.
- INCOMPLETE: full backend deno check was cancelled after it did not finish;
  the focused test was typechecked successfully with node-modules-dir=none.

## Remaining release gates

1. Resolve the obsolete template-contract test against current approved CRM
   template behavior without weakening the actual template workflow checks.
2. Validate the backend projection through an authenticated non-production
   endpoint before production deployment; retain existing auth and owner scope.
3. Repeat cold/warm authenticated timings and isolate remaining main-thread
   cost; do not rely on HTML download time or one capture.
4. Promote only after regression and authenticated smoke gates pass; preserve
   prior frontend and Edge versions for rollback. No index was added.
