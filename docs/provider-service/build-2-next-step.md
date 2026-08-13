# Provider Service 360 — Build 2

## Mutual Activation Engine

**Branch:** `provider-service-build2-activation-engine`  
**Base:** `provider-service-build1-20260813`  
**Status:** implementation only; not deployed

Build 2 introduces a deterministic activation process under the stable `provider_relationships` object created in Build 1.

## Three readiness tracks

1. `provider_readiness`
2. `xbf_customer_setup`
3. `commercial_operational_readiness`

Overall readiness is `ready` only when all three tracks are configured and ready. A blocking failure returns `blocked`; missing required configuration returns `not_configured`.

## Included objects

- versioned activation templates;
- template requirements grouped by track;
- historical activation instances;
- immutable requirement snapshots;
- evidence references;
- explicit, reviewed, expiring exceptions;
- requirement, track, and overall readiness views;
- append-only activation events;
- controlled commands for activation lifecycle.

## Requirement states

`pending`, `in_progress`, `submitted`, `under_review`, `passed`, `failed`, `correction_required`, `expired`, and `not_applicable`.

A requirement is satisfied only when it is passed, reviewed as not applicable, or covered by a currently effective approved exception. Passed evidence with an elapsed validity date is treated as expired.

## Main controls

- one open activation per provider relationship;
- published templates are immutable;
- requirement snapshots remain unchanged after template updates;
- activation is rejected unless overall readiness equals `ready`;
- exceptions require requester, reviewer, reason, effective date, and expiration;
- direct browser mutation remains closed;
- no provider, template, or activation data is seeded by this build.

## Files

```text
supabase/migrations/20260813130000_provider_service_activation_core_tables.sql
supabase/migrations/20260813131000_provider_service_activation_readiness_views.sql
supabase/migrations/20260813132000_provider_service_activation_guards.sql
supabase/migrations/20260813132100_provider_service_activation_commands.sql
supabase/migrations/20260813132200_provider_service_activation_exception_commands.sql
supabase/migrations/20260813133000_provider_service_activation_security.sql
src/provider-service-activation-domain.js
tests/provider-service-activation-domain.test.mjs
tests/provider-service-activation-migration.test.mjs
```

## Focused validation

```text
13 tests
13 passed
0 failed
```

This covers the JavaScript domain contract and static migration invariants. SQL execution in an isolated Supabase project remains a pre-merge gate.

## Pre-merge gates

1. Apply Build 1 and Build 2 migrations in a disposable Supabase environment.
2. Verify cross-tenant and cross-entity inserts fail.
3. Publish a three-track test template.
4. Verify immutable snapshots and one-open-activation concurrency.
5. Test approved, expired, and revoked exceptions.
6. Confirm only `ready` can activate the provider relationship.
7. Run the full Rateware regression suite.
8. Extend the action contract before exposing an API route.

## Next build

Build 3 adds the native Document Registry: identity, versions, classification, issuer, subject, legal entity, validity, sensitivity, extracted fields, evidence links, review, and correction state.
