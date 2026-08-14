# Build 31 — Provider Onboarding E2E release candidate

Build 31 closes the engineering sequence with a fail-closed release policy, a synthetic end-to-end scenario, an executable release validator, and the production rollout/rollback runbook.

## E2E chain

Gmail inbound → private vault → malware scan/hash → human review → canonical fact promotion → readiness → onboarding case → release-package approval → explicit signature consent → private form assembly → human-approved Gmail delivery.

The fixture uses reserved `.invalid` addresses, synthetic UUIDs, and shape-only hashes. It contains no XBF identity, document, signature, recipient, credential, or business data.

## Default state

The committed policy is intentionally disabled. Production release requires a separate reviewed change setting `release_enabled=true` and `pilot_mode=private_canary`, plus runtime proof of all secrets, CI, vault, human owners, workflow stages, and canary limits.

## Canary

- one legal entity;
- at most two initial cases;
- at most one outbound message;
- automatic follow-ups disabled;
- rollback on any failed gate.

## Completion boundary

This PR is the final release candidate, not a production deployment. Merge order, environment configuration, private pilot ingestion, outbound authorization, validation, and rollback are defined in the runbook.
