# Provider Service 360 — Build 8

## Provider Portal Foundation

**Branch:** `provider-service-build8-portal-foundation`  
**Base:** `provider-service-build7-approvals-signatures`  
**Status:** implementation foundation; no public portal endpoint deployed

Build 8 defines a controlled external self-service boundary around the existing Provider Service relationship.

```text
hashed invitation
  → explicit scopes
  → explicit provider-facing requirements
  → profile proposals / requirement responses
  → internal review
  → later audited canonical command
```

### Security decisions

- Magic-link plaintext tokens are never persisted; only SHA-256 digests are stored.
- Every invitation belongs to one `provider_relationship_id` and one XBF legal entity.
- An invitation can expose only explicit scopes: profile, requirements, documents, cases, status.
- Internal activation requirements are hidden unless an explicit `provider_portal_requirement_access` row exposes them.
- Provider profile changes are proposals; they do not update `public.vendors` or `provider_relationships`.
- Provider checklist responses do not mark Build 2 requirements passed.
- A document can be linked from a response only through the Build 3 document version scoped to the same relationship/entity.
- Portal events are an audit target; portal tables are being kept behind RLS with no public endpoint in this build.

### Portal objects

`provider_portal_invitations` stores hashed invitation identity, scopes, purpose, expiry and revocation state.

`provider_portal_requirement_access` snapshots exactly which Build 2 activation requirements are provider-facing and whether the provider may read, respond, upload, or both respond and upload.

`provider_portal_profile_proposals` stores proposed field changes for internal review. Accepted values still require a later canonical update command.

`provider_portal_requirement_responses` stores provider responses and optional Build 3 document references without mutating activation state.

`provider_portal_events` is the append-only audit target.

### Domain contract

`src/provider-service-portal-domain.js` implements token hashing/matching, email normalization, deterministic invitation expiry, scope authorization, requirement action state, and the hard rule that portal submissions never directly mutate canonical records.

### Non-goals

Build 8 does not create a public route, email invitation sender, provider password account, storage upload policy, canonical vendor patch command, or production deployment.

Full clean migration replay remains blocked by issue #19 and is a pre-merge gate for the Provider Service stack.

## Next build

Build 9 adds Native Compliance: rule definitions, evaluations, evidence, findings, risk/hold state, expirations and continuous review. Compliance will consume verified Build 3 documents and official-source/integration evidence later; it will not treat AI extraction as authoritative verification.
