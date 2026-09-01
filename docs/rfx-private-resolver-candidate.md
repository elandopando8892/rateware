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
