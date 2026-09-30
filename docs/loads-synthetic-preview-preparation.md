# Loads synthetic Preview preparation

## Scope

Use the existing private-peek integration harness. Do not create another paid branch until initialization has been rehearsed. Do not copy production rows, send invitations, enable bids or deploy to production.

## Why automatic branching is not enough

The deleted disposable Preview stopped before the RFx/outreach tables existed. Full repository replay also includes historical contact imports. `with_data=false` does not prevent data INSERTs embedded in migrations. Successful migration replay is not proof of synthetic-only contents.

## Initialization gate (not yet executed)

1. Build the reviewed schema in the isolated CI database already used by the migration replay workflow, never the shared developer database or production.
2. Export schema only, preserving constraints, RLS, functions and grants. Review function bodies/defaults for embedded operational values; a schema dump is not automatically sanitized.
3. Restore into a second empty disposable database with the required Supabase platform schemas. Verify dependencies and grants; do not mark historical data migrations as executed on this target.
4. Assert that business tables contain no rows before seeding. Load only generated fixture IDs and `.invalid` contacts from the existing harness.
5. Run the actual Edge Function tests on that target: current send required, tenant separation, reauthorization, archive and closed event, no bearer leakage and no read-induced writes.
6. Run Loads expiry/date-boundary tests separately. A closed event is not a natural-expiry receipt. A source test is not Google-session acceptance in Loads.
7. Only after this rehearsal, provision a temporary protected Preview with a recorded exact resource ID and cleanup path. Do not weaken the matching Auth/source-origin guard to mix environments.

## This increment

Added an explicit closed-event negative test and rejected-read audit checks to `tools/test-rfx-bid-peek-local.mjs`. Extended the source unit test for closed-event refusal and absence of private rows/tokens. Local Deno unit test passed; integration harness syntax check passed. The extended integration scenario has not run against a database yet. No functional source code, cloud configuration, production data or paid resources changed.
