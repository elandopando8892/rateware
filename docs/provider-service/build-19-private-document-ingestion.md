# Build 19 — Private Document Ingestion

## Outcome

Build 19 creates the quarantine and evidence boundary for legal-entity documents before they can enter the Build 18 source-of-truth vault.

## Pipeline

1. Register an idempotent ingestion request.
2. Allocate a tenant/entity/job-scoped path in the private bucket.
3. Upload only PDF, PNG, or JPEG content up to 25 MiB.
4. Compute and compare SHA-256 evidence.
5. Scan for malware.
6. Classify document type and sensitivity.
7. Quarantine mismatches, infected files, and ambiguous content.
8. Register a legal-entity document asset only after the file is clean.
9. Mark the ingestion ready while preserving its immutable event timeline.

## Controls

- Private bucket; no public flag.
- No storage object policy is created.
- Direct table, queue, authenticated, and service-role access is revoked.
- No external API or browser upload authority.
- Tenant and legal entity are part of every key.
- Traversal-like paths and directory-bearing filenames are rejected.
- Ready state requires clean malware status, accepted hash disposition, classification, and a registered asset.
- Ingestion does not grant release, email, signature, or application-submission authority.

## Uploaded source package

The documents supplied in the conversation are evidence inputs for a later controlled ingestion run. They are deliberately not copied to GitHub, migrations, fixtures, tests, logs, or a public deployment.

## Next gate

Build 20 should add a bounded service-role ingestion command and signed-upload orchestration. It must:

- authenticate the tenant and legal entity;
- generate the server-owned object path;
- never accept a client-provided bucket or final path;
- verify object metadata before progressing;
- write an event for every transition;
- fail closed on duplicate, mismatch, or classification uncertainty;
- keep release authority outside the ingestion command.
