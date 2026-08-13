# Provider Service 360 — Build 1

## Provider Relationship Core

**Status:** implementation branch only  
**Branch:** `provider-service-build1-20260813`  
**Production impact:** none  
**Gmail scope:** excluded  
**Backfill scope:** excluded

## 1. Purpose

Build 1 creates the additive relationship layer required for Provider Service 360 without replacing the current Carrier CRM or changing any existing vendor foreign key.

Rateware already uses `public.vendors` as its carrier/vendor master. That table remains the compatibility anchor for Rate Intake, RFx, Bid Room, Ratebook, outreach, support, and current vendor pages. Provider Service adds a legal-entity-specific relationship above that record:

```text
public.vendors
    ↓
public.provider_relationships
    ↓
roles / contacts / external references / lifecycle events
```

The relationship, not an onboarding instance, becomes the permanent Provider Service object.

## 2. Core decisions

### Existing vendor UUID remains canonical

`public.vendors.id` remains the internal Carrier CRM identifier. Build 1 does not copy vendors into a second company directory.

### One relationship per XBF legal entity

The same vendor can have separate relationships with different tenant legal entities. Each relationship can later carry different contracts, terms, bank validation, TMS IDs, ERP IDs, documents, and activation gates.

### Human-readable vendor code is relationship-specific

Each relationship receives an immutable code:

```text
VND-{LEGAL_ENTITY_CODE}-{SEQUENCE}
```

Examples:

```text
VND-XBFUS-000184
VND-XBFMX-000184
```

The code is system-generated through a locked counter. Callers cannot supply or change it.

### Tenant resolution fails closed

Legacy vendor records currently carry the external workspace identifier in `vendors.organization_id`. Build 1 resolves that identifier through `workspace_registry.organization_uuid` and refuses to create a relationship when the canonical tenant bridge has not been reviewed.

No tenant is inferred from email, owner name, vendor domain, or historical ownership fields.

### Existing funnel is not rewritten

The current sourcing/procurement funnel on `public.vendors` remains intact. Provider Service lifecycle is relationship-specific and can later coexist with the procurement funnel:

```text
identified
contactable
eligible
onboarding
under_review
approved
activated
executed
recurrent
```

Exception states are also represented:

```text
information_required
correction_required
compliance_hold
finance_hold
legal_review
suspended
rejected
offboarded
```

## 3. Database objects

### `legal_entities`

Canonical tenant legal entities. This is the separation boundary needed to keep XBF US and XBF MX data from mixing.

### `provider_relationships`

Stable relationship between an existing vendor and one legal entity. Stores the immutable vendor code, Provider Service lifecycle, activation status, risk tier, owner, blocker, and core timestamps.

### `provider_relationship_roles`

Composable role records such as:

```text
carrier
drayage_carrier
warehouse
cross_dock
customs_broker
last_mile
technology_provider
professional_services
equipment_provider
```

Role semantics remain configurable; the database validates normalized role codes but does not invent business classifications.

### `provider_relationship_contacts`

Relationship-specific contacts, preserving the legacy contact fields on `public.vendors`. A provider can therefore have different AP, dispatch, compliance, executive, and operational contacts per XBF relationship.

### `provider_external_references`

External identifiers for later integrations, including:

```text
Fleet Rocket carrier ID
MARKSMAN ERP vendor ID
portal ID
compliance source ID
mail thread reference
```

### `provider_relationship_events`

Append-only Provider Service timeline. Build 1 records relationship creation and status changes automatically. Later builds will add user, agent, document, approval, email, TMS, ERP, and operational events.

### `provider_vendor_code_counters`

Per-tenant, per-legal-entity counter used to allocate stable vendor codes without race conditions.

## 4. Security boundary

All Build 1 tables:

- have RLS enabled;
- revoke Data API access from `public`, `anon`, and `authenticated`;
- are accessible only through `service_role` for now;
- expose no permissive browser policy;
- require the canonical tenant UUID;
- validate tenant consistency through composite foreign keys and a fail-closed vendor bridge check.

Provider Service UI and API access are deliberately deferred until the action contract and runtime authorization layer are extended explicitly.

## 5. Lifecycle controls

Build 1 provides matching lifecycle rules in SQL and JavaScript. Invalid jumps such as:

```text
identified → activated
contactable → recurrent
```

are rejected.

Review holds and controlled reactivation paths are supported. Vendor codes are immutable, and archived CRM vendors cannot receive a new relationship.

`activation_status = activated` also requires an activated or post-execution lifecycle. Build 2 will replace general service-role updates with a transactional activation command that evaluates all required gates before activation.

## 6. Non-goals

Build 1 does not:

- connect `carriers@xbfreight.com`;
- ingest email or attachments;
- create onboarding templates;
- create document storage;
- calculate activation gates;
- apply signatures;
- expose browser writes;
- seed XBF legal entities;
- infer XBF US versus XBF MX;
- backfill existing vendors;
- modify `public.vendors`;
- deploy or migrate production.

## 7. Files

```text
supabase/migrations/20260813120000_provider_service_relationship_core.sql
src/provider-service-domain.js
tests/provider-service-domain.test.mjs
docs/provider-service/build-1-provider-relationship-core.md
```

## 8. Acceptance criteria

- [x] Existing vendor records remain untouched.
- [x] One vendor can have one relationship per tenant legal entity.
- [x] Cross-tenant relationship creation fails closed.
- [x] Legal entities must be explicitly configured and activated.
- [x] Vendor codes are stable, immutable, and race-safe.
- [x] Relationship roles are composable.
- [x] Relationship-specific contacts are supported.
- [x] External system IDs have a normalized registry.
- [x] Lifecycle transitions are validated in SQL and JavaScript.
- [x] Status changes create timeline events.
- [x] New tables remain outside direct browser access.
- [x] No backfill or production mutation occurs.
- [x] Domain contract tests pass locally.

## 9. Integration sequence

Build 1 must be reviewed before any UI/API route is attached.

```text
Build 1  Provider Relationship Core
Build 2  Mutual Activation Engine
Build 3  Document Registry
Build 4  Provider Service Cases
Build 5  Communications Inbox
Build 6  Provider Service Agent
Build 7  Approval and Signature Center
Build 8  Provider Portal
Build 9  Native Compliance Engine
Build 10 Fleet Rocket and MARKSMAN ERP activation mappings
Build 11 Provider 360 UI
Build 12 Health, renewals, and network intelligence
```

## 10. Build 2 entry criteria

Build 2 begins only after:

1. schema review confirms `public.vendors` remains the compatibility anchor;
2. the canonical workspace bridge is accepted as the tenant source;
3. XBF legal entities are configured through a controlled administrative path;
4. the migration is tested in an isolated Supabase environment;
5. authorization review approves the new service-role-only objects;
6. no existing vendor, RFx, Ratebook, Bid Room, or Rate Intake test regresses.

Build 2 will create the three activation tracks:

```text
Provider Readiness
XBF Customer Setup
Commercial & Operational Readiness
```

and will calculate readiness from explicit gates rather than a manually editable `active` flag.
