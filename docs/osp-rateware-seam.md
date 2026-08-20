# The OSP ↔ Rateware seam

**Audience: whoever rebuilds Rateware.** This is the complete list of things the
Onboarding Service Provider app needs from Rateware's schema. If you change any of them,
OSP breaks — in one case silently and completely.

Nothing here asks Rateware to do anything new. It documents claims OSP *already made*, in
a migration Rateware's authors never reviewed, so that they stop being invisible.

Verified live against `alqjqzqagdmcywpjtnnr` on 2026-08-20.

---

## 1. Two constraints OSP added to Rateware's tables

`supabase/migrations/20260813120000_provider_service_relationship_core_tables.sql:6-13`
runs two `ALTER TABLE`s against tables OSP does not own:

```sql
alter table public.workspace_registry
  add constraint workspace_registry_external_canonical_unique
  unique (organization_id, organization_uuid);

alter table public.vendors
  add constraint vendors_id_organization_id_unique
  unique (id, organization_id);
```

Both exist in production today. They are not decoration: they are the targets of two
foreign keys on `provider_relationships`, which is the table the whole OSP data model
hangs from.

```
provider_relationships_vendor_workspace_fkey
  FOREIGN KEY (vendor_id, vendor_workspace_id)
  REFERENCES vendors(id, organization_id) ON DELETE RESTRICT

provider_relationships_workspace_tenant_fkey
  FOREIGN KEY (vendor_workspace_id, organization_id)
  REFERENCES workspace_registry(organization_id, organization_uuid) ON DELETE RESTRICT
```

### Why they exist

To let OSP enforce tenant scope with a foreign key rather than inferring it from an owner
email or trusting a privileged trigger. A composite FK makes it impossible to attach a
provider relationship to a vendor from a different workspace — the database refuses it,
rather than a code path remembering to check.

### What breaks without them

Dropping `vendors_id_organization_id_unique` makes **every insert into
`provider_relationships` fail**. 95 OSP tables and 29 views hang off that table, so the
practical effect is that onboarding stops entirely.

Rebuilding `public.vendors` without re-adding the constraint has the same effect, and is
the more likely way it happens: nobody deletes a constraint on purpose, but people
recreate tables.

### What Rateware may freely change

Everything else about these tables. OSP reads exactly eight columns of `vendors`
(`id`, `organization_id`, `vendor_name`, `legal_name`, `domain`, `primary_email`,
`secondary_emails`, `status`), never writes to it, and does not care about the rest.

---

## 2. What OSP reads from Rateware

| Table | Access | Used for |
|---|---|---|
| `public.vendors` | read-only, 8 columns | matching an inbound email to a known carrier; the display label on `provider_service_command_center` |
| `public.workspace_registry` | read-only | resolving a Kinde workspace to the tenant UUID |
| `public.organizations` | FK target only | tenant scoping |

OSP calls **zero** Rateware edge actions. `src/rateware-api.js` exports `callRatewareApi()`,
which no OSP module invokes.

---

## 3. What Rateware may read from OSP

Nothing today, and nothing is required. If Rateware wants onboarding state, the read
models already exist and are the intended seam:

- `provider_service_command_center` — one row per provider relationship with stage and counts
- `provider_service_360_relationship_summary` — the Provider 360 read model
- `provider_onboarding_workspace` — case-level onboarding state

**Correction worth stating plainly**, because the project's own spec says otherwise:
Provider 360 is **not** a Rateware surface that OSP consumes. It is an OSP read model that
borrows a vendor's display name, hosted on a Rateware page. That is a hosting arrangement,
not data ownership.

---

## 4. What OSP owns outright

98 tables, 29 views, `legal_entities`, and the `provider-entity-vault` storage bucket —
everything prefixed `provider_*`, plus `legal_entities`. Rateware should treat all of it
as someone else's, and OSP will not ask Rateware to know anything about it.

---

## 5. The one thing OSP still needs to fix on its own side

OSP's 24 edge actions execute inside `supabase/functions/shipper-directory-api` — a
Rateware function. When Rateware is rebuilt, that function is rebuilt, and OSP's backend
goes with it.

This is OSP's problem, not Rateware's, and OSP is moving them to their own function. It is
listed here only so that whoever rebuilds `shipper-directory-api` knows why
`provider-service.ts` is imported into it today, and that the import is on its way out.
