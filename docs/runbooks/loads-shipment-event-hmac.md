# MARKSMAN Loads shipment-event HMAC runbook

**Status:** pre-activation procedure; no secret is provisioned by this document.

## Boundary

`shipment-event-ingest-api` accepts one named HMAC key through the server-only
variables `RATEWARE_LOADS_SHIPMENT_EVENT_KEY_ID` and
`RATEWARE_LOADS_SHIPMENT_EVENT_SECRET`. MARKSMAN Loads must hold the matching
server-only values. The MVP receiver has no current/previous-key overlap, so a
rotation intentionally creates a short fail-closed publication window.

Fleet Rocket shipment creation and Rateware event publication are separate
effects. A publication retry may reuse the confirmed receipt, but must never
repeat Fleet Rocket creation.

## Preconditions

1. Keep Fleet Rocket writes and the Loads shipment-event publisher disabled.
2. Record an owner, change ticket, target environment and rollback owner.
3. Confirm the exact Rateware project, Loads project and deployed commit.
4. Generate a new high-entropy secret outside source control, logs and tickets;
   record only its key ID and secret-store version.
5. Confirm that no pending confirmed receipt is waiting for publication.

## Rotation

1. Replace the Rateware receiver key ID and secret while publication remains
   disabled. An absent or mismatched key must fail closed.
2. Verify the old key is rejected and the new key authenticates a synthetic,
   non-Fleet-Rocket test envelope in the approved environment.
3. Replace the matching server-only values in MARKSMAN Loads. Do not expose them
   to browser bundles, Preview logs or evidence packages.
4. Run the authorized synthetic event, exact replay and changed-payload conflict
   checks. Expected results are create, replay and deterministic HTTP 409.
5. Enable the publisher only after both systems report the same key ID and the
   change owner records the evidence.

## Emergency disable

1. Disable the Loads shipment-event publisher first. If Fleet Rocket writes are
   active, disable that gate too unless the incident owner explicitly preserves
   shipment creation with manual reconciliation.
2. Invalidate the Rateware HMAC secret or undeploy only
   `shipment-event-ingest-api`; do not alter the append-only ledger or read RPCs.
3. Confirm unsigned, old-key and new publication attempts fail closed and that
   Service Desk remains read-only.
4. Inventory confirmed Fleet Rocket receipts whose Rateware publication is
   missing or uncertain. Reconcile by receipt ID and idempotency key; never
   recreate the Fleet Rocket shipment.
5. Re-enable only through a new reviewed rotation using the procedure above.

## Evidence and exit gate

Retain timestamps, actor, environment, deployed SHA, key ID (never the secret),
HTTP result, Rateware event UUID, replay result and readback result. Activation
is blocked if the production mapping of the Loads publisher enable switch is not
documented, if either secret appears client-side, or if an uncertain receipt has
not been reconciled.
