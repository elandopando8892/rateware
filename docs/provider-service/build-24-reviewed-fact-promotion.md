# Build 24 — Reviewed fact promotion

Build 24 converts approved review fields into canonical legal-entity facts without weakening the private document boundary.

## Included

- an append-preserving fact ledger with review, field, and promotion provenance;
- one current fact per legal entity and field code;
- canonical JSON hashing for deterministic equality checks;
- idempotent handling when the approved value already matches the current fact;
- guarded supersession using the expected current fact identifier;
- conflict, promotion, unchanged, supersession, and withheld-field events;
- explicit omission of withheld restricted values from the canonical fact ledger.

## Promotion gate

A promotion requires an approved review at the exact expected revision. If a different current value exists, the caller must supply its exact fact ID. A stale or missing expectation produces a conflict record rather than an overwrite.

## Privacy and authority boundary

This build stores reviewed structured facts only. It does not expose document bytes, add an HTTP endpoint, grant database access, generate release packages, or ingest the supplied XBF documents and signature.

## Validation

The build is covered by clean migration replay, Provider Service tests, authorization no-regression, product regression, static promotion invariants, and TypeScript syntax parsing.
