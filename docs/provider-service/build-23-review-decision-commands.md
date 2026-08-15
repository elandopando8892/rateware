# Build 23 — Review decision commands

Build 23 turns the Build 22 review queue into a bounded internal command surface.

## Included

- exclusive review claiming guarded by status, assignment, and expected revision;
- field decisions for accept, correct, reject, or restricted-field withholding;
- final decisions only after every field is resolved;
- separation of requester and final reviewer;
- immutable claim, field-decision, and final-decision events;
- document verification updates without release-package authority.

## Concurrency and access

Every command requires an expected positive revision. A stale worker receives a conflict instead of overwriting a newer decision. The tables remain RLS-enabled with privileges revoked from public, anon, authenticated, and service-role database roles; callers must run inside the trusted Provider Service boundary.

## Deliberate boundary

This build does not expose an HTTP action, grant document access, create release packages, distribute document bytes, or ingest the supplied XBF documents. Those files remain private source material for a later controlled ingestion run.

## Validation

The clean migration replay, provider-service contract suite, static command invariants, and TypeScript syntax parser cover this build.
