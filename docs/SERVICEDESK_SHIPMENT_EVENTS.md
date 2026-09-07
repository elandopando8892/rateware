# Service Desk shipment events — development candidate

**Status:** implemented locally; migration and Edge Function not deployed.
**Branch:** `codex/servicedesk-shipment-events`.

## Product result

Rateware becomes the source of record for the confirmed `shipment.created`
event. MARKSMAN Loads supplies the governed Fleet Rocket execution receipt;
Fleet Rocket remains the execution/tracking system. Service Desk can search and
read the resulting safe projection without receiving the commercial receipt or
writing to either source.

## Event boundary

- `rateware_register_shipment_created` accepts only receipt version
  `fleetrocket-execution-receipt.v1`, `mode=executed`,
  `externalExecution=true` and a non-empty Fleet Rocket Load Number.
- Uncertain, failed and rehearsal responses cannot create this event.
- Idempotency is scoped by organization and replays return the original Rateware
  event UUID. A changed payload under the same key fails closed.
- RFx and lane membership are resolved inside Rateware. Safe display fields are
  snapshotted at creation; the full commercial receipt is not stored.
- The ledger is append-only to runtime roles. Its registration RPC is
  service-role only and is not exposed by the browser context function.

## Read projection

`shipment-context-api` exposes exactly two authenticated operations:

- `search_shipment_creation_events`: bounded literal search and scoped keyset
  cursor;
- `get_shipment_creation_event`: UUID detail in the caller's Rateware
  organization.

The only browser origin allowed is the established authenticated Service Desk
preview. The independent visual-review alias remains fictitious and cannot call
the source.

## Activation gate

Before any cloud change:

1. Reconcile this candidate against the exact deployed Rateware function source.
2. Run migration-ledger and isolated PostgreSQL tests against an empty temporary
   database; do not use production data.
3. Approve the migration and `shipment-context-api` deployment separately.
4. Add a server-only MARKSMAN Loads writer using the registration RPC; keep the
   Fleet Rocket production gate off until its own approval.
5. Deploy the Service Desk read adapter and validate Google session, revocation,
   reload and tab change without creating a ticket or shipment.

## Rollback

Until deployment, remove the branch/worktree. After an approved deployment,
disable the Service Desk feature and Edge Function first. Preserve the append-only
ledger for audit; drop it only through a separately reviewed data-retention change.
