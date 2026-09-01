# RFx private resolver retention candidate

Sprint 9.6 defines `rfx-private-resolver-retention.v1` as a local-only policy
candidate. It is not a production approval and it does not schedule itself.

## Policy windows

- Active terminal detail: 90 days after completion. This preserves the sanitized
  resolver result for support, incident review and exact retry diagnostics.
- Anti-replay tombstone: 400 additional days after compaction. It retains only
  request UUID, SHA-256 request hash, action, terminal class, optional error
  code and retention timestamps.
- Signed request authorization: five minutes maximum, enforced by the resolver
  before any ledger or invitation lookup.

The 90-day detail window and 400-day tombstone window are candidate defaults,
not legal-record requirements. They must be accepted by the Rateware owner,
security and data-governance reviewers before remote application.

## Maintenance behavior

`run_rfx_private_resolver_retention(p_now)` performs one transaction:

1. takes the exclusive retention advisory lock;
2. marks expired `processing` leases as terminal `REQUEST_LEASE_EXPIRED`;
3. copies eligible terminal evidence to the purpose-limited tombstone table;
4. deletes the corresponding detailed rows only after tombstone insertion;
5. deletes tombstones whose 400-day horizon has elapsed;
6. returns aggregate counts and fixed containment flags only.

Claims take the shared form of the same transaction lock. A claim therefore
cannot race between detailed-row deletion and tombstone creation. During the
tombstone horizon, an exact retry fails closed with
`REQUEST_RETENTION_TOMBSTONE`; altered reuse remains
`REQUEST_REPLAY_MISMATCH`. Neither path queries the private invitation source.

## Scheduling boundary

The policy table hard-codes `scheduler_enabled=false` and
`approved_for_production=false`. The migration contains no scheduler
registration, network call or extension activation. Supabase Cron may later
call the maintenance function, but only in a separately authorized release
after its cadence, owner, monitoring and rollback procedure are approved.

## Data boundary

Neither active detail nor tombstones store request bodies, HMAC signatures,
secrets, invitation tokens, quotes, Operational Fit detail, commercial terms or
external-execution permission. The tombstone also removes carrier, lane, event
and organization references.
