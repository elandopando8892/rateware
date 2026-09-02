# MARKSMAN Loads private resolver — staging reproducibility

Beta 10.3 repairs the automatic migration path that failed in Beta 10.2. The historical vendor seed now targets the composite `(vendor_name, domain)` constraint that actually exists at that point in the migration sequence. A focused static guard, a disposable PostgreSQL replay, a complete local reset, and an ephemeral Supabase proof branch all passed.

The prior fixture-only staging branch was deleted and replaced, rotating its branch credentials. The persistent replacement contains no production clone, follows the Beta 10.3 Git branch, completed all 69 migrations automatically, and retains only `rfx-private-resolver`; 34 inherited functions were removed.

The remote fixture canary matched one synthetic invitation, persisted one payload-minimized ledger record, returned the same result on exact replay, rejected a modified signature, blocked the live action, created zero bids, and finished with the canary kill switch disabled. No external business system was called.

This is staging evidence, not production approval. Database network restrictions are currently unrestricted and no monitoring owner has been named. A supervised pilot remains blocked until those operational decisions are completed and separately authorized.

## Reproduction path

1. Create a no-data persistent Supabase branch associated with `codex/marksman-loads-private-resolver-10-3`.
2. Require automatic status `FUNCTIONS_DEPLOYED` after all migrations pass.
3. Remove inherited Edge Functions and retain only `rfx-private-resolver`.
4. Apply `supabase/staging/marksman-loads-private-resolver-fixture.sql` only to staging.
5. Configure branch-specific secrets without recording their values.
6. Run the enabled fixture canary, disable it, and verify `CANARY_EXECUTION_DISABLED`.
7. Run `supabase/staging/marksman-loads-private-resolver-evidence.sql` and confirm 69 migrations, 1,269 source vendors, one fixture vendor, one ledger row, zero bid rows, and zero request-body columns.

Production, real carrier data, live bids, external messages, Fleet Rocket, ERP, and payments remain untouched.
