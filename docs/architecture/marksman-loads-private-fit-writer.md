# MARKSMAN Loads private Operational Fit writer

**Status:** Candidate implementation behind a disabled flag

The private Bid Room fit is a separate effect from the quote. Loads signs a short-lived server-to-server request after a human ADMIN or OPERATOR has confirmed the six canonical rubrics. The fit writer does not accept an invitation token from the caller and does not reproduce the canonical Bid Room mutation.

The flow is:

1. Validate the exact private invitation scope, reviewed organization link, workspace, vendor, event, lane, and one segment.
2. Validate exactly one answer for each of the six rubrics. `agree`, `exception`, `disagree`, and `not_applicable` are the only answers; pending answers are not writable. `exception` and `disagree` require a rubric-specific comment.
3. Recompute the Fit operation ID from organization, Vendor ID, event, lane, invitation, prepared quote receipt, and exact Fit payload fingerprint. A missing or mismatched identity fails before database access.
4. Write a minimal command row with the prepared receipt, operation ID, and payload fingerprint. The six-answer payload, signature, and bearer credential are not persisted. One prepared quote can produce only one Fit command.
5. Call Rateware's canonical `save_segment_confirmations` action with the invitation credential kept inside Rateware.
6. Reread the six current confirmation rows and compare their canonical fingerprint with the signed request.
7. Persist an operation receipt only after the command records the returned canonical result and the rows reconcile.
8. On replay, return the existing receipt. On an uncertain response, mark `reconcile_required` and do not retry automatically.

The readback endpoint remains independent. It can report an observed fit receipt only when the stored scope, operation, fingerprint, segment, receipt chronology, and current six-row fingerprint all match. Absence is `not_observed`, not rejection.

Both effects retain their own deterministic identity. Fit is bound to `preparedReceiptId` plus `fitPayloadFingerprint`; the live quote is bound to the same prepared receipt plus its quote `payloadFingerprint`. Rateware recomputes both identities before any canonical write and never substitutes its own operation identity.

## Runtime fence

The candidate is gated by `MARKSMAN_LOADS_FIT_CONNECTOR_ENABLED=false` unless explicitly enabled in a controlled environment. No migration, Edge Function deployment, secret provisioning, carrier fit submission, or quote submission was performed as part of this sprint.

## QA completed

The focused Deno suite passed 36 tests, including a fixed Node.js-to-Deno HMAC/operation vector, disabled-route behavior, exact rubric validation, authorization/tamper rejection, prepared-receipt conflict handling, uncertain-result handling, six-rubric end-to-end reconciliation, independent readback, replay idempotency, quote readback regressions, and no-CORS/credential exposure checks. The migration-ledger suite passed 3/3.
