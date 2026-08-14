# Build 21 — Scan, Hash & Classification Worker

Build 21 adds an internal worker for uploaded legal-entity evidence.

- Claims only `uploaded` records with a five-minute lease.
- Downloads from the fixed private vault.
- Verifies observed size and computes SHA-256.
- Quarantines hash mismatches, malware, scan errors, and low-confidence classification.
- Requires classification confidence of at least 0.80.
- Registers clean evidence as an entity document asset with `verification_status=needs_review`.
- Assigns approval-required release policy to restricted and highly restricted assets.
- Writes an event for success, quarantine, or failure.

The worker is not an Edge route and cannot release a package, send email, apply a signature, or mark an asset verified.

Build 22 should provide the human review queue for extracted fields and document classification before any asset becomes reusable.
