# ADR-007: Correlation and idempotency for critical Rateware mutations

**Status:** Accepted  
**Date:** 2026-08-30  
**Deciders:** Rateware product owner and engineering

## Context

P3 requires releases and high-risk mutations to be observable, tenant-aware, and resistant to duplicate execution. The governed contract currently contains 158 high/critical write surfaces. Applying one durable operation ledger to every write immediately would add broad schema and migration risk, while body-only identifiers would remain inconsistent across errors and clients.

## Decision

Use a staged contract:

1. Every `rateware-api` response carries `X-Request-Id` and exposes it to browser clients.
2. Selected high-risk effects also carry `X-Operation-Id`. A valid caller-supplied UUID is retained; otherwise the server creates one.
3. Error logs, performance evidence, API error bodies, and audit metadata reuse the same identifiers.
4. Durable uniqueness ledgers are added only after the P3 inventory confirms that an effect is non-idempotent or externally delivered. Existing specialized keys and ledgers remain authoritative.

Initial high-risk actions cover rate approval, RFx award/closeout, bulk rate changes, outreach draft generation, carrier messaging, and award notices. This change adds correlation only; it does not send, approve, close, or mutate any business record by itself.

## Options considered

### A. Body-only identifiers

Low implementation cost, but errors before body parsing and browser/network diagnostics cannot reliably correlate.

### B. Response headers plus selective operation identifiers

Moderate implementation cost, backward-compatible response bodies, and useful correlation across browser, Edge logs, and audits. Selected.

### C. Universal durable operation ledger

Strongest duplicate protection but high migration and behavioral risk across 158 surfaces. Deferred until the mutation inventory identifies the actions that need durable uniqueness.

## Consequences

- Support can correlate one request across client, Edge logs, and audit evidence.
- High-risk effects receive a stable operation identifier without changing existing payload consumers.
- Correlation is not itself idempotency; external sends and non-idempotent writes still require a unique durable key and receipt.
- P3 must next classify the critical mutation inventory as already idempotent, guarded, or ledger-required.

## Action items

1. Add contract tests for valid, invalid, and generated identifiers.
2. Extend the same response contract to the smaller authenticated Edge Functions after `rateware-api` proves stable.
3. Produce the non-idempotent mutation inventory and prioritize external delivery, awards, approvals, and financial effects.
4. Add rollback and verification commands before any new durable ledger migration.
