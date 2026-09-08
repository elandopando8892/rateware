# Package review release preflight — 2026-09-08

Candidate base: `ee7f36b`. Read-only observations against shared Rateware/OSP
`alqjqzqagdmcywpjtnnr`; this report does not authorize or certify deployment.

## Live reconciliation

- `production_controls`: version 30, `release_mode=shadow`,
  `outbound_enabled=false`.
- The historical Salzillo generation job
  `1cdf4b0a-6d24-419e-b579-1046c4fae35a` still has no completion or lease.
- Pending jobs in the OSP organization: one `generate_supplier_package` and
  thirteen `quarterly_document_check`. No job was claimed or changed.
- Case states were rechecked: historical Salzillo remains `sent`, aggregate
  version 16; Crane remains `received`, aggregate version 1.
- A migration-ledger search by semantic name suffix also found none of the
  thirteen pending release migrations listed below. This supplements exact
  version/name matching; it does not prove absence of equivalent manual DDL.

Pending: `request_contract_semantic_stop`, `operations_review_contract_gate`,
`approved_profile_memory_reuse`, `case_answer_memory_candidates`,
`answer_memory_human_review`, `answer_memory_evidence_preflight`,
`answer_memory_evidence_links`, `profile_complete_batch_confirmation`,
`request_constraint_actor_regex_hotfix`, `supplier_package_sets`,
`package_set_operations_reviews`, `package_set_member_reviews`,
`member_review_command_identity`.

## Production trigger dependency

Live non-internal triggers on the inspected tables:

| Table | Trigger function |
| --- | --- |
| `approval_events` | `reject_approval_mutation` (before update/delete) |
| `case_package_input_snapshots` | `enqueue_supplier_package_generation` (after insert) |
| `case_package_input_snapshots` | `reject_append_only_mutation` (before update/delete) |
| `case_package_input_snapshots` | `validate_package_input_snapshot` (before insert) |

No non-internal trigger was returned for `customer_registration_cases`.
The live enqueue function inserts one job using the organization, case and
snapshot from the inserted row, with `supplier-package:<snapshot UUID>` and
`ON CONFLICT (organization_id,kind,idempotency_key) DO NOTHING`. Its body matches
the source migration `20260829070649_osp_supplier_package_generation.sql`.

The review integration fixture previously omitted this enqueue trigger. It now
loads the actual function/trigger from that migration and tests transactional
enqueue and rollback. This remains a reduced fixture: it does not yet reproduce
every validation/append-only trigger or all thirteen migrations together.

## Release restrictions

Do not invoke a generic queue drain as a release smoke. Disabled outbound does
not by itself prevent internal job mutations. Preserve the historical Salzillo
job and case; use separately approved isolated cases and exact job/snapshot IDs.
The candidate edge entrypoint uses `createShadowWorkerRuntime`, not the separate
`runComposedWorker`. Its generic run does not inject the supplier-package
service, while the exact package-canary path does. This source observation is
not proof of current deployed runtime settings or permission to invoke it.

Before release: reconcile all schema dependencies, capture rollback artifacts,
prove a compatible authenticated UI/API preview, and verify scoped invocation
cannot claim the historical job. Do not count this read-only preflight as a
completed production gate.

## Validation results for the added trigger coverage

- PGlite integration: one test / eleven steps passed, zero failures (2m40s).
- Deno lint and `git diff --check`: passed.
- Native PostgreSQL attempt on preserved local database
  `osp_package_review_run_4`: failed before fixture creation with
  `CONNECT_TIMEOUT 127.0.0.1:55472` (three-second connection limit).
- A direct `psql` probe then connected and confirmed the intended database with
  zero user tables. A second Deno attempt on that verified-empty database again
  failed at connection, before the new checks. No timeout was increased.

The previous run-3 native success does not certify this new trigger coverage.
Native acceptance remains pending; do not deploy based on the PGlite pass alone.
The local PostgreSQL server was stopped successfully after the attempts; the
run-4 database and prior rehearsal evidence were preserved.

## Subsequent native verification

After confirming the server was stopped and run-4 still had zero user tables,
the same test passed on PostgreSQL 17.11: one test / eleven steps, zero failures
(3s). Neither the three-second connection nor six-second statement limit changed.
The earlier timeouts remain evidence; a specific host/network cause is unproven.

Coverage was then expanded to apply the actual pending migration
`20260902130000_osp_operations_review_contract_gate.sql` alongside the four new
package-review migrations. Six rollback probes reject absent, pending,
wrong-version, wrong-hash, wrong-manifest and superseded-manifest reviews on a
direct case-state update. The actual package-set completion still succeeds with
a resolved current review, including concurrent requests with one receipt.

Fresh native database `osp_package_review_run_5`: one test / twelve steps, zero
failures (4s). These checks reduce the SQL composition gap but are still a scoped
fixture, not the complete thirteen-migration release or authenticated UI proof.
