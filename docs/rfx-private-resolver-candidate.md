# RFx private resolver candidate

This isolated candidate gives MARKSMAN Loads a read-only, server-to-server way
to prove that one Rateware `rfx_lane_vendors` row matches the authenticated
carrier, lane and event. It never returns `invitation_token` and does not invoke
`submit_bid`.

## Contract

- Accepts only `rateware-internal-request.v1` from issuer `marksman-loads` to
  audience `rateware`.
- Verifies a short-lived HMAC-SHA256 envelope with a server-only secret.
- Reconciles the exact `submit_bid` payload fingerprint, the separate MARKSMAN
  evidence fingerprint and the complete handoff fingerprint.
- Requires an ADMIN or OPERATOR human confirmation.
- Resolves exactly one eligible `rfx_lane_vendors` record for vendor + lane +
  event while the RFx event is open and not expired.
- Returns an opaque resolver reference, never the invitation token or signing
  material.
- Claims each signed request identifier in a durable anti-replay ledger after
  HMAC and handoff verification, but before private invitation lookup.
- Returns the same sanitized resolution for an identical completed retry;
  altered reuse is rejected and processing or failed requests are not silently
  replayed.

## Durable evidence boundary

The unapplied migration
`20260901193000_rfx_private_resolver_request_ledger.sql` adds a service-role-only
ledger plus atomic claim, complete and fail RPCs. It stores only identifiers,
SHA-256 fingerprints, status, timestamps and the sanitized resolver result. It
does not store the request body, HMAC, invitation token, quote notes,
Operational Fit detail or commercial terms.

The Edge Function fails closed when this ledger is unavailable. The local HTTP
harness uses the same interface with an ignored file-backed ledger so replay can
be exercised without applying the database migration.

Sprint 9.5 additionally validates both candidate migrations against disposable
Supabase Postgres. The database preflight proves atomic concurrency, RLS,
service-role-only RPCs, aggregate-only health and the external-execution
constraint. See `docs/rfx-private-resolver-postgres-preflight.md`.

Sprint 9.6 adds the unapplied retention candidate
`20260902003000_rfx_private_resolver_retention.sql`. It recovers expired leases,
compacts terminal detail after 90 days and preserves a purpose-limited
anti-replay tombstone for 400 days. Claim and maintenance transactions use
shared/exclusive advisory locks so compaction cannot reopen a replay race. See
`docs/rfx-private-resolver-retention-candidate.md`.

Sprint 9.7 adds the unapplied operational-control candidate
`20260902013000_rfx_private_resolver_operational_controls.sql`. New claims must
pass an atomic per-minute limiter keyed by a SHA-256 scope before private
invitation lookup. Aggregate readiness keeps secret custody, network controls,
monitoring ownership, rollback rehearsal and production approval visibly false.
See `docs/rfx-private-resolver-operational-readiness.md`.

## Runtime gates

`RATEWARE_PRIVATE_RESOLVER_CANARY_ENABLED=true` enables only the read-only
resolution. `resolve_and_submit_bid` is hard-blocked by the implementation. No
live flag is implemented in this candidate.

The Edge Function reads these server-side secrets:

- `RATEWARE_PRIVATE_RESOLVER_SHARED_SECRET`
- `RATEWARE_PRIVATE_RESOLVER_KEY_ID`
- `RATEWARE_SUPABASE_SERVICE_ROLE_KEY`

`supabase/config.toml` disables the platform JWT check for this service-to-service
endpoint; the function performs its own HMAC authorization before querying
Rateware. This endpoint must not be deployed until secret provisioning,
network/rate-limit controls and an independent review are separately authorized.

## Local integration harness

`tools/serve-rfx-private-resolver-candidate.mjs` runs the same resolver core over
an explicitly labelled local fixture. It exists only to prove the HTTP protocol
with MARKSMAN Loads. The fixture is not production Rateware evidence.

## Deployment boundary

Sprint 9.4 authored the ledger migration; Sprints 9.5 through 9.7 applied all four
migrations only inside discarded local containers. No migration or Edge
Function was deployed remotely. The retention policy is technically verified
but remains a candidate with scheduling and production approval disabled.
Production still requires policy-owner acceptance, migration review, secret
provisioning, provider-level network controls, monitoring ownership, rollback
rehearsal, scheduler operations and a separately authorized release.
