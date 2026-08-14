# Build 25 — Onboarding readiness engine

Build 25 evaluates whether a legal entity has the reviewed facts and verified documents required by a specific onboarding program.

## Included

- tenant-scoped, versioned requirement definitions;
- jurisdiction and legal-entity-kind matching;
- fact and document requirement selectors;
- current-fact, active-document, verification, expiry, and maximum-age checks;
- complete, incomplete, or blocked outcomes;
- per-requirement reason codes;
- deterministic evidence snapshots containing only IDs, statuses, and hashes.

## Operational meaning

A complete result means every required rule in the exact requested requirement-set version was satisfied at evaluation time. It is a diagnostic readiness result, not permission to release, sign, email, or submit documents.

## Privacy boundary

The evaluator never downloads document bytes and never copies canonical fact values into its snapshot. The supplied XBF documents, identifiers, and signature remain private and are not committed.

## Validation

Clean migration replay, Provider Service tests, authorization no-regression, Rateware regression, static readiness invariants, and TypeScript parsing validate this build.
