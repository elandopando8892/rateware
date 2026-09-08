# Carrier List Templates remote probe harness — 2026-09-08

## Narrative

This development closes the path from deterministic local authorization tests to a real non-production smoke without weakening the production boundary. The new runner requires explicit staging credentials and refuses the known production Supabase/API host. It checks organization isolation, read-only enforcement, and optimistic concurrency using only responses that must terminate before a write.

## Implementation result

- Runner: `npm run certify:carrier-list-templates:remote-probes`
- Local contract coverage: 3 tests passed.
- Production URL refusal: covered and passing.
- External effects from the implementation/tests: none.
- Reports: `tmp/carrier-list-templates-evidence/<timestamp>/remote-tenant-probes.json` (untracked).

## Current release disposition

The remote `GO` gate remains **pending** until a seeded non-production Supabase workspace pair, three current access tokens, and one active template UUID are supplied. The runner does not invent fixtures, use production, or report a simulated local fake as remote proof.
