# P1 Supabase migration-ledger reconciliation

Date: 2026-08-20

Scope: restore the SQL files already applied to `rateware-prod`; do not apply a
new migration, repair remote history, create/reset a Supabase preview branch, or
modify production data/configuration.

## Root cause

The production migration ledger contained 369 versions while the repository at
production SHA `fa8e35c96c8fb30635ddac21b894614172831083` contained 345 SQL files.
The missing 24 versions caused the main `Supabase Preview` check to fail with
`Remote migration versions not found in local migrations directory`.

This was a source-control omission, not unapplied production DDL. All 24
versions already existed in `supabase_migrations.schema_migrations`.

## Provenance

- The first 12 restored files were recovered from their original Git commits.
- The final 12, which were absent from every fetched Git ref, were recovered
  from the production migration ledger with the official
  `supabase migration fetch --project-ref alqjqzqagdmcywpjtnnr` command.
- The fetch also reserialized 345 tracked files. Those incidental rewrites were
  discarded; only the 24 missing files were retained.
- `tests/supabase-migration-ledger.test.mjs` pins the line-ending-normalized
  SHA-256 digest of every restored file so an applied migration cannot drift
  silently across Windows and Linux checkouts.
- Secret-pattern scan of the 24 files returned zero matches.

## Read-only production verification

- `supabase migration list --project-ref alqjqzqagdmcywpjtnnr` reported 369
  local and 369 remote versions with matching identifiers through
  `20260821011805`.
- `supabase db push --project-ref alqjqzqagdmcywpjtnnr --dry-run --skip-vault`
  returned `upToDate:true`, `dryRun:true`, and an empty migration list.
- No DDL, DML, migration-history repair, Vault update, function deployment, or
  preview-branch operation was performed.

## Clean replay

The repository was copied to an isolated temporary Supabase project with unique
project identity and ports. The existing local project owned by
`C:\Users\andre\rateware-onboarding` was not reset or stopped.

Using the same Supabase CLI version pinned by CI (`2.114.0`):

1. Initial database creation applied all 369 migrations from zero.
2. `supabase db reset --local` replayed all 369 migrations again from zero.
3. The final local migration ledger contained 369 rows and head
   `20260821011805`.
4. The public schema dump contained `organizations` and `workspace_registry`.
5. Final Provider Service grants were verified with PostgreSQL
   `has_table_privilege`: all five sampled read/update/insert grants returned
   `true`.
6. The isolated environment was stopped without backup; the pre-existing local
   environment remained healthy.

## Authorization-contract reconciliation

Restoring the SQL exposed four production RPCs that were previously invisible
to local discovery. They are now registered as active
`internal/service-role` / `internal_only` surfaces with reviewed source,
authorization, and metadata fingerprints:

- `provider_onboarding_decide_release_package_approval`
- `provider_onboarding_revoke_release_package`
- `provider_onboarding_revoke_signature_authorization`
- `provider_onboarding_valid_recipient_domains`

No role grant or runtime exposure was broadened by this change.

## Verification

- Migration-ledger regression: PASS.
- Migration history: PASS, 369 files.
- Provider Service runtime syntax: PASS, 40 files.
- Provider Service suite: PASS, 197 tests.
- Full `npm test`: PASS, including identity 14/14 and runtime enforcement 5/5.
- Action Contract hardening: PASS.
- Action Contract validator: PASS, contract 401 / discovered 399 / Edge 291 /
  Postgres 108, zero errors; one inherited `whatsapp-healthcheck` declaration
  warning remains.
- Authorization delta: PASS, zero unregistered surfaces.
- `npm audit --audit-level=low`: PASS, zero vulnerabilities.
- Syntax and diff checks: PASS.

This evidence supports code review of the repository reconciliation only. It
does not authorize merge, deployment, migration execution, or production data
changes.
