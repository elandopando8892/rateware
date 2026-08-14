# Build 18 — Legal Entity Source-of-Truth Vault

## Outcome

Build 18 adds a fail-closed vault model for information and documents that XBF sends while being onboarded as a customer by an external provider. It separates reusable XBF legal-entity evidence from provider-supplied evidence already stored under an individual provider relationship.

## Scope

- Entity-scoped verified profile fields.
- Entity-scoped document assets with hash, version key, validity dates, sensitivity, and release policy.
- Provider-specific release packages and release items.
- Attribution for the requester and releaser.
- Approval reference required for restricted and highly restricted packages.
- Release evidence through a SHA-256 fingerprint.
- Readiness projection that refuses never-release or unapproved items.
- RLS enabled and all direct access revoked by default.

## Security boundary

No production value or binary is committed to GitHub. In particular, Build 18 does not store tax identifiers, bank details, identity documents, signatures, mailbox addresses, or uploaded PDFs in source control.

A later ingestion build must place binaries in a private storage bucket, register only tenant-scoped metadata, verify hashes, and request approval through the existing Provider Service approval engine before any restricted item can be released.

## Document policy mapping

| Class | Default policy |
| --- | --- |
| Public authority evidence | Review required |
| Tax, incorporation, insurance, and operating authority | Approval required |
| Bank letter | Approval required |
| Legal representative ID | Approval required |
| Authorized signature | Approval required and explicit release purpose |
| Credentials, secrets, private keys | Never release |

The final policy is stored per asset and cannot be inferred solely from a filename.

## Excluded

- Uploading the user-provided files.
- Committing XBF production identifiers.
- Creating a public API or browser-accessible vault action.
- Sending email or submitting a provider application.
- Applying a signature.
- Production deployment or database mutation.
- Merge.

## Next gate

Build 19 should add a service-role-only ingestion command and private storage workflow with exact file hashing, malware/content checks, classification review, and idempotent registration. It must not add autonomous release authority.
