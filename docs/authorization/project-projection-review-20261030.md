# Project callers and tracking projections: scoped reconciliation

Reviewed against PR180 head `652dd403ce826ae4013ed4c15cd8ab4cd075ac30`.
This block changes contract attribution and tests only. Runtime, migrations,
permission decisions, role assignments and production remain unchanged.

## Project callers

`create_rfx_process_project` normalizes the payload, then `withOwner` replaces
owner_user_id, owner_email and organization_id with the resolved workspace.
The optional shipper lookup checks that owner's row before insertion, including
the legacy path without operation_id. An operation id is a matching UUID from
the header/body; recovery reads the same owner/operation and rejects a different
payload fingerprint. A unique-constraint conflict rereads that scope.

`get_rfx_process_project` has two paths. The receipt path rebuilds the normalized,
workspace-owned payload; ordinary detail first loads an owned project before
reading its children. Both remain after authentication, principal resolution
and the existing role gate. Both keep pending_human_approval and their existing
permission keys. The scanner's imported-handler label identifies a component;
it does not cover both dispatch branches by itself. The shared Rateware
authorization envelope is deliberately left pending for its remaining review.

Fourteen synthetic tests execute the actual branch text and actual normalization,
ownership and idempotency helpers. They cover body ownership spoofing, foreign
projects/shippers/receipts, retry, payload conflict, unique-conflict recovery,
dry run, operation-id disagreement and ordinary detail. The audit writer is a
spy. These tests do not certify live Auth, JWT expiry, RLS, audit persistence,
cross-request concurrency or a deployed end-to-end journey.

## Tracking projections

The current definitions come from the existing migration
`20261007204842_outreach_pending_delivery_projection.sql`, not the older August
source files recorded in the contract. A catalog-only production SELECT found
both functions STABLE, SECURITY INVOKER, empty search_path, service_role execution
and no anon/authenticated execution. Source-body MD5 agrees exactly with pg_proc:

| Function | Body MD5 |
| --- | --- |
| rateware_outreach_tracking_page | aedffb9e09a2e4665e6a52fd0c68d09c |
| rateware_outreach_tracking_summary | c41595302de22a326f8ac8aae7dd9655 |

Both filter outreach_messages by p_owner_email. Their Rateware callers supply
user.owner_email, and paged message hydration filters that owner again. The SQL
contains the delivery-state projection and existing event/channel/archive scope;
it is not rewritten here. Existing conservative access/mixed-scope classifications
and internal_only decisions stay intact. No customer table was queried, function
executed, ACL changed or production migration applied during this review.

Local validation retains 495 discovered surfaces and 497 registered rows. Errors
fall from 315 to 305: four source fingerprints, four source/handler metadata
attributions and two SQL envelopes are reconciled. The 291 remaining envelopes
and fourteen direct sources still fail the full gate. Three negative controls
continue rejecting unknown actions, unreviewed source and permission changes.
The separate loads_portal replay prerequisite remains unresolved; no placeholder
schema, guard removal or unrelated OSP import is included.
