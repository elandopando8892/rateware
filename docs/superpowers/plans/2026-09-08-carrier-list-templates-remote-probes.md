# Sprint: remote non-production probes for Carrier List Templates

## Narrative

The local authenticated fakes already prove the server contract, but they cannot prove that the deployed Supabase Auth identities and organization metadata are wired correctly. This bounded sprint adds a repeatable remote probe runner for a seeded non-production workspace pair without introducing a fixture writer or a business-data mutation path.

## Scope

- Require an explicit non-production `rateware-api` URL and three Supabase access tokens: organization A, organization B, and a read-only user.
- Require one active template UUID seeded in organization A.
- Verify organization A can list and read its template.
- Verify organization B cannot see the template in list or get responses.
- Verify a read-only user receives `403` before template validation or database access.
- Verify a stale positive version receives `409` without an update.
- Reject the known production Supabase/API hosts before any network call.
- Write a redacted JSON report under untracked `tmp/carrier-list-templates-evidence/`.

## Safety boundary

The runner performs no create, archive, restore, duplicate, resolve-import, RFx, invitation, message, or provider action. The two guarded `update_carrier_list_template` calls are intentionally expected to stop at authorization (`403`) or optimistic-version (`409`) before a database write. It never accepts a production override flag.

## Model, effort, and capacity

- Primary reasoning: GPT-5.6-terra, high effort, for auth/tenant and no-side-effect contract review.
- Harness/tests: GPT-5.6-luna, medium effort, for deterministic response fakes and report plumbing.
- Planned size: half-day bounded slice at 70% capacity, leaving 30% buffer for seeded-environment reconciliation.

## Exit gates

1. Unit tests cover production-host refusal, required credentials, expected probe ordering, and redaction-safe outcomes.
2. `npm run test:carrier-list-templates` passes.
3. The remote runner returns `NO_GO` without credentials and never falls back to the production URL.
4. A remote run is only called `GO` after a seeded non-production workspace pair is supplied; absence of that seed remains an explicit gap, not a simulated pass.
