# Build 27 — Controlled release-package approval

Build 27 creates an approval boundary between a ready onboarding case and any future document assembly or delivery.

## Included

- versioned release-package manifests tied to the case and exact readiness evaluation;
- evidence items containing references, sensitivity, disclosure mode, and cryptographic hashes;
- deterministic manifest hashing;
- reference-only disclosure by default;
- a hard prohibition on full disclosure for restricted and highly restricted evidence;
- one-to-three human approvals with requester/approver separation;
- optimistic revisions, approval expiry, rejection, revocation fields, and immutable events.

## Important boundary

An approved package is authorization for a specific manifest, purpose, recipient key, and limited time window. Build 27 does not read document bytes, create signed URLs, populate forms, apply signatures, send email, or submit to an external party.

## Rateware fit

The package becomes the approval object displayed from an onboarding case. Operations, compliance, data-owner, or legal reviewers can approve the exact evidence manifest before later builds assemble or transmit anything.

## Privacy

No supplied XBF document, identifier, or signature is committed. Manifest hashes allow later integrity verification without exposing the underlying files.

## Validation

Clean migration replay, Provider Service tests, authorization no-regression, product regression, release invariants, and TypeScript parsing cover this build.
