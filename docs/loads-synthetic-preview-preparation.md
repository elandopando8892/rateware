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

## Executed restore rehearsal — 2026-09-30

The second-database-in-one-stack attempt failed on platform ownership and extension boundaries. It was replaced by two separate local Supabase instances in an isolated CI runner. The source instance replays reviewed migrations; a schema-only export of `public` is restored in a fresh instance with its own `postgres` database. The fresh instance enables the source's `pg_trgm` dependency, preserves the built-in `public` schema and applies Supabase-owned default privileges under their owner. No historical contact INSERTs are replayed in the target.

GitHub Actions run [36670033506](https://github.com/elandopando8892/rateware/actions/runs/36670033506) passed both independent jobs: schema-only restore and private invitation integration. The restore job checked that every `public` table was empty and that the private-book `service_role` reads were allowed while `anon` reads were denied. Both local instances were stopped and removed. This is infrastructure and API evidence, not hosted Preview or Google-session acceptance.

The next hosted step needs a reviewed method to initialize the temporary branch without replaying historical contact imports, plus exact cleanup of that paid branch. Do not assume Supabase's automatic branch creation meets that requirement: the first branch stopped after 29 migrations. No schema export was published to a hosted project in this increment.

## Next gate: function on the restored database

The schema-only CI job now copies only the reviewed Edge Function and synthetic test harness into its second disposable Supabase stack. It runs the same sent-only, vendor-isolation, re-invite, archive, closed-event and no-write checks against the restored database, after confirming that every business table was initially empty. This is a local integration rehearsal; it still does not prove a hosted branch can skip automatic migration replay, Google OAuth works on a new Auth origin, or a carrier can open the private book in Loads.

GitHub Actions run [36670740141](https://github.com/elandopando8892/rateware/actions/runs/36670740141) passed both jobs, including the function flow on the separately restored database. The jobs used generated fixture IDs and `.invalid` contacts; they did not publish a hosted branch or import production rows into the restored target.

Do not create a second paid branch while Rateware main reports `MIGRATIONS_FAILED` and the provider's branch creation path replays historical migrations. A hosted Preview needs an explicitly reviewed initialization mechanism that does not replay contact INSERTs, plus an exact cost and deletion path. Production private-book flags remain off.

The [temporary-environment ADR](adr/2026-09-30-loads-private-preview-environment.md) selects a standalone disposable project, conditional on owner approval of that *project's* cost. GitHub Actions run [36671655772](https://github.com/elandopando8892/rateware/actions/runs/36671655772) passed the stricter rehearsal: after restore, browser roles had no direct table or routine privileges in `public`, while the server-side private-peek scenario still passed. The organization was confirmed for a quote; the connector returned `0` monthly for a project without specifying currency or possible extra consumption. Project creation remains unapproved and unexecuted.
