# ADR-008: Private MARKSMAN Loads bid connector

**Status:** Proposed, implemented behind disabled flags
**Date:** 2026-08-31
**Deciders:** MARKSMAN Loads and Rateware product owner, engineering

## Context

MARKSMAN Loads prepares a carrier quote against a Rateware Bid Room opportunity. The browser and the Loads service must not receive Rateware invitation bearer credentials, and a lost server response must not produce a second carrier bid. Rateware already owns the canonical `submit_bid` behavior, including bid-window validation, update of `rfx_lane_vendors`, creation or update of `rate_staging`, and contact-history evidence.

The integration therefore needs a private server-to-server boundary, not another bidding implementation.

## Decision

Add `rfx-internal-bid-api` as a private Edge Function with these boundaries:

1. Accept only short-lived HMAC-SHA256 envelopes issued by `marksman-loads` for audience `rateware`.
2. Require a signed ADMIN or OPERATOR confirmation, current prepared-receipt reference, quote revision, and SHA-256 payload fingerprint.
3. Resolve an active, manually reviewed `external_organization_links` record through exactly one `workspace_registry` row, then verify the vendor, event, lane, and private invitation in that workspace.
4. Keep the invitation token inside Rateware. Decrypt it server-side and attach it only to the internal call to the canonical `rfx-bid-api` `submit_bid` action.
5. Record live commands in `marksman_loads_bid_commands`, unique by provider/request UUID, stable prepared-quote operation key, and organization/preparation receipt. A retry with a new request UUID cannot resubmit the same quote, while reuse of one preparation receipt with altered payload is rejected. Store neither the HMAC signature nor invitation credentials.
6. On an uncertain or stale execution, compare the signed payload against current Rateware state. Never automatically resubmit unless the ledger proves the canonical mutation was never issued; otherwise require reconciliation.
7. Expose no browser CORS path. Both canary and live actions default to disabled and require exact `true` feature flags.

## Feature flags and secrets

- `MARKSMAN_LOADS_BID_CONNECTOR_SECRET`: shared secret, minimum 32 characters.
- `MARKSMAN_LOADS_BID_CONNECTOR_KEY_ID`: active rotation identifier.
- `MARKSMAN_LOADS_BID_CONNECTOR_CANARY_ENABLED`: exact `true` enables reviewed read-only resolution.
- `MARKSMAN_LOADS_BID_CONNECTOR_ENABLED`: exact `true` enables canonical bid execution.
- `RFX_INVITATION_TOKEN_ENCRYPTION_KEY`: existing Rateware invitation encryption secret.

Canary and live flags are independent. Enabling the canary does not enable bids.

## Alternatives considered

### Duplicate `submit_bid` inside the connector

Rejected. It would drift from Rateware's commercial-model validation, bid-window gate, staging behavior, and audit history.

### Return an invitation token to MARKSMAN Loads

Rejected. The token is a bearer credential and would expand the credential boundary into another service and potentially the browser.

### Retry every failed request

Rejected. A timeout can occur after Rateware mutated the bid. Blind retry could duplicate staging or history effects.

## Consequences

- Rateware remains the sole authority for accepting and staging the bid.
- MARKSMAN Loads can eventually submit without handling bearer invitation credentials.
- Every live request has durable, tenant-bound idempotency and an explicit uncertain-state path.
- A production activation requires migration review/apply, Edge deployment, secret provisioning, one reviewed organization link, a read-only canary, and separate explicit authorization for the first live bid.

## Current implementation state

Code and migration are present only in the isolated development worktree. No migration was applied, no Edge Function was deployed, no secret was provisioned, no organization link was created, and no carrier bid was submitted.
