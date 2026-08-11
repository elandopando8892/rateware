# Phase 0.2A Tenant and Identity Contract

## Scope

This increment adds the canonical tenant and external identity mapping contract without changing runtime authorization. It does not enable memberships, roles, permissions, shadow mode, pilot enforcement, RLS for domain data, or production backfill.

The canonical Rateware tenant is `public.organizations.id uuid`. Kinde subjects and organizations are external evidence mapped through `external_identities` and `external_organization_links`. `workspace_registry.organization_uuid` is a nullable transition bridge. Null, missing, inactive, ambiguous, or conflicting mappings fail closed in the new resolver.

`phase0_workspace_tenant_candidates` exposes only external organization ID, candidate tenant UUID and aggregate evidence metadata to `service_role`. It omits emails and subjects and never activates a mapping.

## Production reconciliation baseline

The read-only baseline observed on 2026-08-11 contained four organizations, one external workspace registry row and three identity aliases. The single external workspace had multiple candidate internal organizations, so an automatic backfill would be unsafe. This increment deliberately creates no identity, organization-link or bridge rows from those candidates.

## Activation contract

- `sub` is the only accepted provider subject; email and `id` are not fallbacks.
- exactly one consistent Kinde organization claim is required;
- email is normalized evidence, never a principal;
- identity and organization-link rows must both be explicitly reviewed and `active`;
- the external organization link and workspace registry UUID must agree;
- the resolver reads only and never inserts, upserts or activates a mapping;
- browser roles have no table privileges; only `service_role` can manage the new objects;
- an active row requires reviewer identity and review timestamp; active organization links also require a review note.
- changing a reviewed subject, provider, external organization or canonical tenant resets the row to `needs_review` and clears the previous approval.

## Deferred work

Runtime handlers continue using the existing workspace resolver in this commit. A later, separately reviewed step may invoke the new resolver in observe-only mode after an isolated migration replay and explicit reconciliation of the ambiguous production mapping. Memberships and authorization decisions remain Phase 0.3+ and default to deny.
