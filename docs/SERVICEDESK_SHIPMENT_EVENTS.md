# Service Desk shipment events — development candidate

**Status:** ledger/read path deployed; ingest Edge Function implemented locally
and not deployed.
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

`shipment-event-ingest-api` is the proposed server-only writer boundary. It
accepts only an expiring HMAC envelope from MARKSMAN Loads and projects a
confirmed receipt to the registration RPC. Its source and contract tests are
present, but the function and shared secret are not deployed or activated.

The applied ledger migration and ACTIVE `shipment-context-api` were confirmed
through read-only project/schema inspection on 2026-09-08. A subsequent
read-only Supabase source download proved byte-for-byte parity for the deployed
`index.ts`, `handler.ts`, `auth.ts`, `identity-contract.mjs`,
`runtime-identity.ts` and `workspace.ts`; their SHA-256 values are recorded in
the table below. The additive request-hash constraint in `20260908010000` is
local and unapplied.

| Deployed source | SHA-256 |
|---|---|
| `shipment-context-api/index.ts` | `d27d1a7e7f2df43858fc5b380ccd72a7cf858e895316351b7cb585e7149ac9eb` |
| `shipment-context-api/handler.ts` | `af0bdbc952c8db8ea377232da67339a24c7f8b73322f8d6fee7fdcd03872fdd3` |
| `_shared/auth.ts` | `e6c4d2281543522208d3d750c574f6fcbe43df8c6f6ffde8a856972fa838879b` |
| `_shared/identity-contract.mjs` | `11a520ce90c08c5b22ab23425878efe2cc1a44e722bfcc044538bade862ea408` |
| `_shared/runtime-identity.ts` | `ac5e0d2f8eb6784aeb0d3d41f1faf4446af20ca7839352bbf154b9b8b27ba3ab` |
| `_shared/workspace.ts` | `0f4be9711f82492a15fb27dc89bfb42f627000e413ff82b180383ddd7d8fcdcd` |

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

1. Preserve the recorded deployed read-bundle parity or re-run the read-only
   comparison if the deployed function changes.
2. Run the additive migration and isolated PostgreSQL tests against an empty temporary
   database; do not use production data.
3. Approve the hash migration and `shipment-event-ingest-api` deployment separately.
4. Provision a rotated named HMAC secret only after approval; keep the Fleet
   Rocket production gate off until its own approval.
5. Validate one authorized synthetic event, idempotent replay and Service Desk
   readback without creating a Fleet Rocket shipment.
6. Execute the single-key rotation and emergency-disable rehearsal in
   `docs/runbooks/loads-shipment-event-hmac.md` while both business-effect gates
   remain off.

## Rollback

Until deployment, remove the branch/worktree. After an approved deployment,
disable the Service Desk feature and Edge Function first. Preserve the append-only
ledger for audit; drop it only through a separately reviewed data-retention change.
