# Carrier List Templates tenant and permission evidence — 2026-09-08

## Narrative

This increment closes the remote-safety gap left intentionally outside the browser preview. It exercised the actual Rateware API handler with authenticated principals and deterministic Supabase fakes, proving that a template cannot cross organization boundaries, that reads are separated from writes, and that stale or archived state fails closed before mutation.

## Result

- Runner: `npm run certify:carrier-list-templates:tenant-probes`
- Probes: 5 passed
- Environment: `local-fake-authenticated-calls`
- External effects: none
- Evidence output: `tmp/carrier-list-templates-evidence/<timestamp>/tenant-probes.json` (untracked)

The evidence is not a substitute for a remote tenant-isolation test against a seeded non-production Supabase project. It is the deterministic server-contract gate required before that remote step.
