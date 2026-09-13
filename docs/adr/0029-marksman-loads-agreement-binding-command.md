# ADR-0029: Server-only idempotent MARKSMAN Loads agreement binding

**Status:** Proposed
**Date:** 2026-09-13
**Deciders:** MARKSMAN / Rateware product and operations owners

## Context

MARKSMAN Loads needs to associate its local post and offer identifiers with
the canonical Rateware event, carrier invitation and Shipper CRM record. The
association must happen only after the agreement is confirmed and a permitted
human has approved it. A Loads folio is not itself a carrier assignment or a
confirmed rate.

The existing `marksman_loads_rateware_agreement_bindings` table is intentionally
server-owned. The existing shipper-context resolver reads it but must not create
or mutate it. A browser-facing write would weaken tenant isolation and could
create a bridge for an invitation that was merely viewed or quoted.

## Decision

Add a separate `marksman-loads-bind-agreement` Edge Function with a pure domain
module. It accepts a short-lived HMAC envelope with a dedicated contract and
requires:

1. The exact Rateware vendor, event and `rfx_lane_vendors` invitation.
2. An eligible event and an explicit primary or backup award state with a
   positive carrier bid and a canonical Shipper CRM customer id.
3. A human confirmation containing actor, `ADMIN` or `OPERATOR` role,
   timestamp and approval reference.
4. A caller-provided idempotency key and canonical request fingerprint.

The command inserts only into the bridge table. It never calls Fleet Rocket,
changes Rateware bids or awards, sends communications, or performs an ERP
operation. Unique constraints on the local agreement key and Rateware
invitation are the concurrency fence. On a uniqueness race the function
re-reads and returns `already_bound` only when the complete target matches;
otherwise it returns a conflict. It never uses `upsert` and never overwrites an
existing bridge, including a revoked one.

## Options considered

### Option A: Separate HMAC command and pure domain service — selected

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Cost | No new external service; one Edge Function |
| Security | Server-only, short-lived signed request, explicit approval |
| Reliability | Unique constraints plus replay/race reconciliation |
| Maintainability | Contract and validation testable without Supabase |

**Pros:** Preserves the read-only resolver boundary, is safe to keep disabled,
and gives Loads a deterministic audited handoff when the pilot is ready.

**Cons:** Requires a later Loads-side signer and an explicit environment
configuration before it can be used.

### Option B: Reuse the shipper-context resolver for writes

| Dimension | Assessment |
|---|---|
| Complexity | Low initially |
| Cost | No new function |
| Security | Poorer separation of read and write authority |
| Reliability | Ambiguous retries and larger blast radius |
| Maintainability | Context contract would carry unrelated mutation semantics |

**Rejected:** It would violate the existing read-only contract and make a
context lookup capable of creating durable business relationships.

### Option C: Browser writes directly with a user JWT

| Dimension | Assessment |
|---|---|
| Complexity | Low initially |
| Cost | No new service |
| Security | Insufficient for a cross-product binding |
| Reliability | Client retries and tab races are unsafe |
| Maintainability | Authorization becomes dependent on mutable UI state |

**Rejected:** Browser access cannot establish the trusted MARKSMAN Loads to
Rateware organization boundary or serve as the human approval record.

## Consequences

- A future Loads adapter has a narrow, auditable command to call after dual
  approval and award confirmation.
- Replays are safe and mismatched reuse is visible as a conflict.
- The bridge table must be migrated before the command can run; the function
  fails closed when the table is absent.
- This sprint does not enable the function, apply a migration, or create a
  production or sandbox record.
- A later sprint must implement the Loads-side HMAC signer and UI approval
  receipt, then rehearse against a non-production database.

## Action items

1. [x] Add the pure binding contract and validation service.
2. [x] Add the disabled server-only Edge Function.
3. [x] Add replay, conflict, award-state and no-mutation tests.
4. [ ] Confirm dedicated secret/key configuration with the operators.
5. [ ] Implement and rehearse the Loads-side signer against sandbox only.
