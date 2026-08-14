# Build 20 — Bounded Upload Orchestration

## Outcome

Build 20 adds an internal signed-upload orchestrator over the Build 19 private ingestion ledger. It is deliberately not connected to an Edge route or browser action.

## Begin upload

The server validates tenant, legal entity, idempotency key, filename, MIME type, declared size, expected SHA-256, and actor identity. It generates:

- ingestion UUID;
- upload-session UUID;
- tenant/entity/ingestion-scoped object path;
- ten-minute expiration;
- signed upload URL and token.

The client cannot supply the bucket or final object path.

## Confirm upload

Confirmation reloads the exact tenant/entity/session record, rejects expired or consumed sessions, lists the server-owned prefix, requires exactly one matching object, and verifies the observed size. Success moves the ledger only to `uploaded`.

## Authority boundary

This build cannot:

- mark malware status clean;
- accept or override a hash;
- classify the document;
- register the asset as ready;
- approve a release package;
- send email;
- sign or submit an application.

Those responsibilities remain separate gates.

## Next gate

Build 21 should implement asynchronous scan/hash/classification processing from `uploaded` to either `quarantined` or a reviewed asset candidate. It should use immutable events and must not combine ingestion with release authority.
