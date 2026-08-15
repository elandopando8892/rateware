# Provider Service 360 — Build 3

## Native Document Registry

**Branch:** `provider-service-build3-document-registry`  
**Base:** `provider-service-build2-activation-engine`  
**Status:** implementation only; not deployed

Build 3 creates the native document system that Provider Service needs before Gmail, portal uploads, or the Provider Service Agent can ingest files.

## System boundary

The existing `raw_uploads` pipeline remains dedicated to Rateware rate interpretation and staging. Provider Service documents use a separate registry because they require relationship scope, legal-entity separation, versions, expiration, review, sensitivity, and activation evidence.

```text
provider_relationship
  → provider_document
      → provider_document_version
          → extraction attempts
          → review decisions
          → activation requirement links
          → audit events
```

Binary storage is deliberately not created in this build. The registry stores immutable storage references and SHA-256 fingerprints; a later controlled storage command will own upload authorization.

## Core objects

### `provider_documents`

Logical document identity scoped to exactly one provider relationship and one XBF legal entity. Examples include `w9`, `mc_authority`, `bmc84`, `credit_application`, `insurance_certificate`, or future configured types.

The database does not infer that vocabulary. It only enforces normalized identifiers.

### `provider_document_versions`

Immutable file provenance for each document revision:

- version number;
- original filename;
- storage bucket and path;
- SHA-256 fingerprint;
- source channel;
- issuer and subject metadata;
- country;
- effective and expiration dates;
- processing and classification states;
- actor provenance.

The same file hash cannot be registered twice inside one provider relationship.

### `provider_document_extractions`

Separate extraction attempts preserve AI/system output, confidence, warnings, errors, and timestamps without overwriting the original document version.

### `provider_document_reviews`

Explicit review decisions:

```text
pending
approved
rejected
correction_required
```

Terminal decisions require an identified reviewer in the schema contract.

### `provider_document_requirement_links`

Strongly typed link between one document version and one Build 2 activation requirement. Composite foreign keys force the activation, requirement, document version, provider relationship, tenant, and XBF legal entity to agree.

### `provider_document_events`

Append-only audit target for document registration, classification, extraction, review, supersession, requirement links, and future agent/integration activity.

## Effective document state

The projection derives a deterministic state from lifecycle, version state, expiration, and latest review decision.

Simplified precedence:

```text
archived
revoked
superseded
expired
rejected
correction_required
verified
needs_review
registered / processing
```

A ready document becomes `verified` only after an approved review. An expired document never remains verified.

## Activation evidence

A typed document link qualifies as document evidence only when all are true:

```text
link status = active
link role   = evidence
document effective state = verified
```

Build 3 does not silently make that link satisfy the generic Build 2 evidence table. The future audited registration command will bridge the two contracts explicitly so evidence cannot be created merely by inserting a file reference.

## Security boundary

All Build 3 base tables enable RLS and explicitly revoke direct access from:

```text
public
anon
authenticated
service_role
```

No browser write policy, storage bucket, upload route, Gmail route, signature action, or autonomous agent action is introduced.

Identity and provenance guards protect logical document identity, file identity, relationship links, terminal reviews/extractions, and append-only events.

## Focused validation performed

Domain contract reproduction:

```text
5 tests
5 passed
0 failed
```

Disposable Supabase compatibility sandbox checks also confirmed:

- XBF US and XBF MX provider relationships remain distinct;
- cross-entity document insertion is rejected by foreign key;
- Build 3 audit foreign keys now create successfully after adding the required composite unique keys;
- a document version with `ready` processing plus approved review projects to `verified`;
- duplicate SHA-256 within one provider relationship is rejected;
- a verified US document can link to the matching US activation requirement;
- the resulting typed link evaluates as qualifying evidence.

## Clean-room validation limitation

The current Supabase preview branch cannot reproduce the repository migration chain past `20260609130000_sourcing_procurement_vendor_base`. This is tracked separately in GitHub issue #19.

Therefore the compatibility sandbox used explicit current-schema shims for the missing historical migrations. This is useful for Build 3 PostgreSQL contract validation but is not accepted as the final clean-migration gate.

No Provider Service build should merge to production until issue #19 is resolved and Builds 1–3 replay successfully from the canonical migration chain.

## Non-goals

Build 3 does not:

- create a storage bucket;
- ingest email attachments;
- connect `carriers@xbfreight.com`;
- expose browser writes;
- create provider portal uploads;
- parse PDFs in production;
- apply signatures;
- backfill legacy vendor files;
- activate providers;
- deploy to production.

## Next build

Build 4 is Provider Service Cases. It will make onboarding, customer setup, credit applications, document corrections, renewals, payment support, disputes, banking changes, and operational support durable case objects under the same `provider_relationship_id`.

Build 5 will then attach Communications Inbox / Gmail to those cases and to the Document Registry rather than creating a second mailbox-centric source of truth.
