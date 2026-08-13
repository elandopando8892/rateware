# Provider Service 360 — Build 1

## Provider Relationship Core

**Branch:** `provider-service-build1-20260813`  
**Status:** implementation only; not deployed  
**Scope:** additive relationship foundation

## Purpose

Build 1 creates the permanent relationship layer for Provider Service 360 while preserving `public.vendors` as the existing Carrier CRM master.

```text
public.vendors
  → provider_relationships
      → roles
      → contacts
      → external references
      → lifecycle events
```

An onboarding will later be one process under this relationship. It will not replace or duplicate the vendor record.

## Main decisions

### Existing CRM vendor remains canonical

Every Provider Service relationship references the current `public.vendors.id`. Rate Intake, RFx, Bid Room, Ratebook, outreach, and existing vendor pages can continue using their current foreign keys.

### Relationship is specific to an XBF legal entity

The same vendor may have separate relationships with XBF US and XBF MX. Each relationship may later carry different agreements, terms, documents, TMS mappings, ERP mappings, and activation requirements.

### Stable visible Vendor ID

The database assigns a numeric identity and derives an immutable visible code:

```text
VND-{LEGAL_ENTITY_CODE}-{SEQUENCE}
```

Examples:

```text
VND-XBFUS-000184
VND-XBFMX-000185
```

### Tenant scope fails closed

A relationship must match all three records:

```text
existing vendor workspace
reviewed workspace-to-tenant bridge
selected XBF legal entity
```

This is enforced through composite foreign keys. No tenant is inferred from email, owner name, domain, or other mutable data.

## Database objects

`legal_entities` stores the XBF entities available inside each Rateware tenant.

`provider_relationships` stores the stable vendor-to-XBF relationship, visible Vendor ID, lifecycle, activation state, risk tier, owner, and current blocker.

`provider_relationship_roles` supports composable roles such as carrier, drayage carrier, warehouse, customs broker, cross-dock, last-mile, or technology provider.

`provider_relationship_contacts` stores AP, dispatch, compliance, executive, and operational contacts specific to the relationship.

`provider_external_references` stores future Fleet Rocket, MARKSMAN ERP, portal, compliance, and other external IDs.

`provider_relationship_events` is the append-only destination for the Provider Service timeline. Build 2 commands will write explicit events with actor and correlation information.

## Lifecycle contract

Build 1 establishes the vocabulary:

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

It also includes review and exception states:

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

The database restricts stored values to this vocabulary. The JavaScript domain contract defines and tests allowed transitions. Build 2 will enforce transitions transactionally together with activation gates and event creation.

## Safety boundaries

Build 1:

- creates no backfill;
- inserts no legal entity or vendor data;
- updates no existing vendor rows;
- exposes no direct browser workflow;
- connects no Gmail account;
- applies no signature;
- creates no production activation;
- remains isolated on its implementation branch.

## Files

```text
supabase/migrations/20260813120000_provider_service_relationship_core_tables.sql
supabase/migrations/20260813122000_provider_service_relationship_core_security.sql
src/provider-service-domain.js
tests/provider-service-domain.test.mjs
docs/provider-service/build-1-provider-relationship-core.md
```

## Build 1 acceptance

- Existing Carrier CRM records remain the compatibility anchor.
- One vendor can hold a separate relationship per XBF legal entity.
- Cross-tenant relationships fail through database constraints.
- Vendor codes are database-generated and immutable.
- Roles, relationship contacts, and external IDs are normalized.
- Lifecycle values are canonical.
- Transition behavior is covered by domain tests.
- The event timeline has a durable target.
- No runtime route or production migration is introduced.

## Next build

Build 2 will add the Mutual Activation Engine with three independent tracks:

```text
Provider Readiness
XBF Customer Setup
Commercial & Operational Readiness
```

A provider will become ready only when its required gates pass or receive a documented exception. There will be no unrestricted `active = true` control.
