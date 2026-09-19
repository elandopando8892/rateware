# Bid Room performance increment — 2026-09-19

## Scope and release status

Production diagnosis was read-only. No invitations, drafts, selections, messages,
permissions, or business records were intentionally created or changed.
The focused performance increment was promoted after the authenticated comparison
and scoped regression checks below. No new branches were created.

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

## Follow-up execution and production release

Frontend commit `d0d0baaa` (runtime change from `93590106`); backend `e97ab3a3`.
Production deployment `dpl_2KVU4RMMeNYiJohuJCqpRBso9AVe`, immutable URL
https://rateware-6sh9h2w3m-elandopando8892s-projects.vercel.app.
Vercel inspection verified both `rates.heymarksman.com` and `rateware.vercel.app`
alias this deployment. Public JS on the custom domain contains the term cache.
Edge `rateware-api` version 632, SHA
`d4a3dc54c1b8f7d2eafac3d943b13c19d8e2362ef7b6daeb2d09d32332e38a90`.

Before promotion, deployed a temporary `rateware-api-perf-check` endpoint with
the same authentication, limited to the audience read for the specified RFx.
It used the existing database, not a separate staging database. Unauthenticated
read returned 401; a disallowed write action returned 403 before dispatch.
The authenticated browser harness compared full response hashes, not merely
counts, with no business mutations. Baseline and candidate were identical:
`70c0b8a454cc16f97bb9cb0f98275bd272b28c65735a86c2ce3754bae615f524`.
Counts: 43 sent, 44 invited, 4 not invited, 1 no contact; total 92.

Sequential pre-release timings (baseline/candidate/candidate/baseline):
19891 / 14065 / 5764 / 4872 ms. Warm-cache/order variance prevents a reliable
causal speedup claim from these samples alone.
Post-release production reads: 5328 and 2198 ms; responses kept the same hash.

Authenticated production RFx reload: detail 12278 ms; Carrier Fit evidence
4296 ms; audience 5713 ms; context 4863 ms. All returned HTTP 200. The delay
between detail completion and the next requests remained approximately 12.7 s.
The UI loaded 50 visible candidates and all 92 audience rows. Message preview
and Delivery queue were opened without selecting recipients or creating drafts;
the queue loaded existing history, send controls were disabled, and no console
errors were captured. Initial full-page latency remains an open issue.

Validation: 13 focused frontend tests + 2 audience tests + 73 backend template
contract tests passed. The latter use simulated authenticated clients and were
run with `--no-check`; the two audience tests were typechecked. Historical
template assertions were updated to the approved CRM-maintained list flow.
The broad legacy stability suite now stops at obsolete Kinde assertions, so
this release is NOT evidence that the entire historical suite is green.

EXPLAIN ANALYZE of the event participation page at offset 5000 executed in
16.817 ms. No index/migration was justified by that isolated measurement.
The temporary Edge function was deleted after verification. Its harness is
preserved under `tools/`, excluded from production by `.vercelignore`.

Rollback: restore frontend deployment `dpl_FtApgQK2phT4zhKHASyRWvPwvWmG`
and redeploy backend baseline `e60b14ae` (live version 631 source was verified
before changes). Roll back on changed audience contents, authentication
regression, missing queue data, or repeated new 5xx responses. No schema or
business-data rollback is necessary for this increment.

## Remaining client pause: successful CPU profile

A later low-overhead CPU capture (100 ms samples, stopped only after load
completed) succeeded. Its hottest application stack attributed 4688 ms to
`normalizeLookupText -> rfxCarrierLaneMatchesText -> rfxCarrierProfileFitSignals`.
Another stack attributed 823 ms to rebuilding vendor search text inside
`fitCarrierToOutreachLanes`, even before checking its existing cache.
This supports a targeted follow-up, not a claim that every delay is CPU work:
normalize each profile-note source once per fit calculation, and check the fit
cache before rebuilding the vendor search string. Tests cover unchanged match
labels, empty lane lists, and one normalization of a long note across 69 lanes.
All 13 focused frontend checks passed after the follow-up.
