# P3: Supabase template permissions

## User-visible outcome

Local correction: a Supabase user with an explicit server-managed
`app_metadata.permissions` string array containing `vendors:manage` can now
reach the existing template write authorization check. Previously the verified
Auth response lost those permissions before reaching the handler.

No permissions or roles were granted to any account. Missing or malformed
permission arrays still deny access. User-editable metadata is never trusted.

## Evidence

- New executable Auth-to-template permission contract passed, including missing
  bearer, rejected Auth response, malformed permissions and spoofed user metadata.
- Existing Supabase migration tests: 5 passed.
- Existing template API contracts: 73 passed.
- Existing browser domain tests and three remote-runner local tests passed.
- New contract included in `test:carrier-list-templates` and thus `npm test`.

These are local mocked contracts, not authenticated deployed acceptance.

## Release disposition: NO GO pending non-production acceptance

Read-only provider inspection on 2026-09-08 identified `rateware-prod`
(`alqjqzqagdmcywpjtnnr`) as ACTIVE_HEALTHY. Its branch listing returned only
the default `main` entry, with MIGRATIONS_FAILED status. That migration status
does not independently establish a live service outage; investigate before release.
The project inventory returned no projects despite direct project lookup working,
so inventory completeness is uncertain.

No non-production endpoint, seeded two-organization test workspace or authenticated
fixture credentials were established. No new branch/project was created, respecting
the user's branch restriction. Production promotion remains gated on authenticated
non-production acceptance and review of the exact release candidate.

No external messages, production data writes, migration or deployment performed.
