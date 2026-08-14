# Build 29 — Bounded Gmail delivery and follow-up

Build 29 adds the outbound communications boundary for provider onboarding.

## Included

- enabled-mailbox policies and recipient-domain allowlists;
- versioned plain-text message templates with strict variable substitution;
- human approval for every attachment and optionally for all messages;
- requester/approver separation and optimistic revisions;
- exact recipient matching against the approved release package;
- private assembled-artifact hash and size revalidation immediately before send;
- idempotency keys, bounded worker leases, Gmail message/thread IDs, and failure records;
- bounded follow-up count and interval scheduling on the same Gmail thread.

## Gmail boundary

The shared command delegates delivery to an injected Gmail sender. Production will bind it only to the configured onboarding mailbox (for example `carriers@xbfreight.com`) using the existing Gmail OAuth/OIDC foundation. This build does not send a real message and includes no credentials.

## Follow-up behavior

A sent message may schedule a future follow-up. When due, the scheduler creates a new templated message in the same thread. It still follows the mailbox policy: a human must approve it when required; attachment-bearing messages can never bypass human approval.

## Privacy

No supplied XBF file, signature, email address, credential, or onboarding identifier is committed. Attachments remain referenced by private vault path and verified hash until the Gmail adapter streams them at send time.

## Validation

Clean migration replay, Provider Service tests, authorization no-regression, product regression, Gmail delivery invariants, and TypeScript parsing cover this build.
