# Bid Room detail pagination candidate

Status: deployed as rateware-api version 634 after authenticated comparison.

Read-only production aggregate for event 625cd649-f97a-4da0-865e-ec3bf8a058d1:
6348 participation rows, 92 unique carriers, 2826447 bytes of repeated coverage
notes in joined vendor profiles. No source values or token material recorded.

Existing participant reads use sequential pages of 1000. The candidate retains
one initial page (no speculative reads for small events), then at most three
concurrent pages. For 6348 rows, this changes seven sequential request groups
to three groups. This is a scheduling improvement, not a measured end-to-end
speedup. The projection, event filter, order and 50000-row guard are unchanged.
Only the initial list_rfx_detail participant read opts in. Other callers remain
sequential. Any failed page fails the request; no partial result is returned.
At a final batch boundary at most two extra read-only pages can be requested.
Offset pagination retains its existing lack of snapshot isolation.

Validation: two executable pagination tests passed (empty/small/exact-page/large
boundaries, out-of-order completion, scope/order, bounded concurrency, errors,
maximum-row guard); two audience-history tests passed; compact-detail contract
check passed. Deno typechecked the extracted-function tests. Full application
typecheck and historical full suite are not claimed.

Before promotion: obtain an authenticated isolated read-only comparison with
the current production baseline; verify full response equivalence and measure
repeated warm/cold samples. Do not call list_rfx_detail blindly for a benchmark:
it can invoke legacy coverage insertion and token migration. An isolated
candidate must explicitly suppress those writes, on both comparison paths,
without altering production business behavior. No migration, communication,
draft creation or business-data change was performed in this increment.

Pre-existing deno.lock changes are unrelated and were not included.

## Authenticated comparison and release

The temporary rateware-detail-perf-check function required existing Supabase
authentication, sales@heymarksman.com, the single approved event, and the normal
workspace owner check. Identity persistence was disabled. Its database fetch
adapter rejected every method except GET/HEAD. It ran only the extracted
participant reader and returned aggregate counts and hashes, never tokens or
carrier records. This used live data read-only, not a separate staging database.

Five sequential samples (ms): 3446, 2480, 2030, 2303, 2084.
Five bounded-parallel samples (ms): 1903, 2763, 1496, 1391, 1238.
Order: baseline, candidate, candidate, baseline, candidate, baseline, baseline,
candidate, baseline, candidate. Medians: 2303 vs 1496 ms (~35% lower).
All ten reads contained 6348 rows, 92 carriers, 16281676 canonical JSON bytes,
and SHA256 2b30e33ceb61ff7a70a0f9e7432ea1736dedead8a0520064660b1a596f63c874.
This supports this specific read optimization, not p95 or full-screen latency.

Preflight SQL confirmed draft event and zero legacy plaintext tokens, so the
complete-detail smoke did not trigger coverage or token repair. Full production
detail before promotion took 7795 ms; after promotion 4332 ms. Both returned
69 lanes, 6348 participants, 92 carriers, coverage_sync.inserted=0 and identical
full-response SHA256
6bb8e889a1b8a2f2347e2d1f1eb0027c7ce1239bea59859c5ec3dd4ddfd35ab7.
These two samples are directional, not a controlled total-page benchmark.

Pre-deploy: 4 executable pagination/audience tests, compact-detail contract check,
and 73 template contract tests passed (78 total). Template contracts used
--no-check and simulated clients; full historical suite remains unverified.
Production baseline version 633 had unchanged approved source. All deployment
files were checked unchanged immediately before promoting only the pagination
function and its one opt-in call. Version 634 bundle SHA256:
232acc7e13468da4e3faa2e4fab900b4c0161fd82f12aaa31be5b47b23167337.
Rollback: redeploy e97ab3a3 baseline backend files (version 633 source), leaving
the frontend untouched, if counts/content change or new read errors appear.
No frontend deployment or schema migration was required. No messages or drafts
were created. Immediate smoke is not a 15-minute post-release monitoring window.

Authenticated production reload confirmed the selected event, 69 lanes, 6348
participation rows, 92 audience rows, the saved 332-member carrier list, zero
checked audience carriers and disabled add-selection button. No console errors
were returned for the reload. The temporary diagnostic function was deleted
after comparison; no business records were deleted.
