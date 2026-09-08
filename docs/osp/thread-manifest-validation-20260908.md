# Multi-message manifest validation

Implementation through f20fc12, local validation 2026-09-08.

All 11 osp-worker *request-manifest*.test.ts files executed with Deno,
--no-lock --allow-env --allow-read and the worker import map: 29 passed, zero
failed. No real provider request, database mutation or worker invocation.

Verified: ordered earlier messages, per-email citation IDs and source hashes,
20-message overflow rejection, duplicate/size rejection before interpretation,
changed earlier evidence invalidates the replay fingerprint, policy-version
change differs from the legacy fingerprint, single-message path, attachment
handling, and configured canary restrictions. Mocked interpreter tests prove
input delivery, not actual LLM understanding of Crane's eight requirements.

Store code remains append-only: new fingerprints allocate a new manifest
version; identical fingerprints reuse an existing record. No migration added.
Adapter supports up to 300 evidence blocks / 250000 total characters and 20
attachments; each block remains capped at 40000 characters. Source bundle cap
is 20 messages / 80000 combined subject/body characters. Oversize requests must
fail explicitly, never silently truncate.

Before activation: verify downstream approvals are tied to the current manifest
version and reject stale review after an amendment; preserve original emailed
attachments and the QF-168 supersession; handle the original .doc QF-167 safely;
execute an isolated full-source canary and inspect the actual output. No historic
Salzillo replay. Crane entity confirmed by user as XBFUS; fiscal applicability
remains unresolved, not silently substituted with Mexican entity documents.

No production deployment, email, signature or webhook was performed. This is
component validation, not end-to-end production acceptance.
