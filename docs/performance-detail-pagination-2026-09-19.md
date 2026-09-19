# Bid Room detail pagination candidate

Status: implemented and locally tested; NOT deployed.

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
