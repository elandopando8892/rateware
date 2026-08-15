# Build 22 — Human Document Review Queue

Build 22 introduces the human control plane between automated document processing and reusable legal-entity evidence.

- One review task per ingestion and document asset.
- Field-level accept, correct, reject, or withhold decisions.
- Requester/reviewer separation of duties.
- Identified reviewer, timestamp, and decision note required.
- Highly restricted, restricted, overdue, and expiring evidence receives higher priority.
- Corrected values remain tenant-scoped and protected by RLS.
- Direct access is revoked by default.

An approved review does not approve a release package. Sending documents, applying signatures, and submitting provider applications remain separate approval-gated actions.

Build 23 should add bounded service commands for claiming and deciding review tasks, with optimistic concurrency and immutable decision events.
