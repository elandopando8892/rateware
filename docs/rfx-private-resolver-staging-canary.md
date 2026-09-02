# Private resolver remote staging canary — Beta 10.2

The user authorized a paid persistent staging branch and remote fixture-only
canary. `marksman-loads-staging` now exists as an isolated Supabase branch in
`us-east-1`; it is healthy, persistent and contains no cloned production data.
GitHub also has a `Staging` environment restricted to the Sprint 10.2 branch.

The first Git-associated branch correctly exposed an inherited Rateware
migration defect: an old vendor seed uses `ON CONFLICT` without the required
unique constraint. The failure is preserved as evidence. That failed branch
was removed, and the replacement was created without automatic Git migration
execution so unrelated historical migrations could not populate or destabilize
the resolver environment.

The replacement received only the real Bid Room source-table migration, the
four audited resolver migrations and one synthetic event/lane/carrier/private
invitation. Thirty-three inherited Edge Functions were removed from this
branch; `rfx-private-resolver` is the only retained function. There is no cron
scheduler and no row contains a bid rate.

The remote HMAC canary matched exactly one synthetic invitation, stored one
idempotent ledger record, returned the same result on exact replay, rejected a
tampered payload and blocked `resolve_and_submit_bid`. The kill switch was then
disabled and returned `CANARY_EXECUTION_DISABLED`; it remains disabled.

Decision: `REMOTE_STAGING_CANARY_PASSED_PRODUCTION_BLOCKED`.

This proves the isolated resolver path, not production readiness. Network
controls and a monitoring owner remain open. No real bid, message, payment,
Fleet Rocket record, ERP record or production object was created or changed.
