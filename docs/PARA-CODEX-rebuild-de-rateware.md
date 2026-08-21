# For whoever rebuilds Rateware

You are rebuilding Rateware. Another app — the Onboarding Service Provider (OSP) — lives
in the same repo and the same database. This is everything you need from it. It is short
on purpose.

**You owe OSP two constraints and one habit. Nothing else.**

---

## 1. Two constraints you must not lose

`supabase/migrations/20260813120000_provider_service_relationship_core_tables.sql` runs two
`ALTER TABLE`s against tables OSP does not own:

```sql
alter table public.workspace_registry
  add constraint workspace_registry_external_canonical_unique
  unique (organization_id, organization_uuid);

alter table public.vendors
  add constraint vendors_id_organization_id_unique
  unique (id, organization_id);
```

They are the targets of two foreign keys on `provider_relationships`:

```
provider_relationships_vendor_workspace_fkey
  FOREIGN KEY (vendor_id, vendor_workspace_id)
  REFERENCES vendors(id, organization_id) ON DELETE RESTRICT

provider_relationships_workspace_tenant_fkey
  FOREIGN KEY (vendor_workspace_id, organization_id)
  REFERENCES workspace_registry(organization_id, organization_uuid) ON DELETE RESTRICT
```

All four were verified present in `alqjqzqagdmcywpjtnnr` on 2026-08-20.

### What happens if you drop one

Dropping `vendors_id_organization_id_unique` makes **every insert into
`provider_relationships` fail**. 99 OSP tables and 29 views hang off that table. Onboarding
stops completely.

Nobody drops a constraint on purpose. The realistic path is **recreating `public.vendors`
without re-adding it** — which has exactly the same effect. If you rebuild either table,
re-add its constraint in the same migration.

### Why they exist

So OSP can enforce tenant scope with a foreign key instead of inferring it from an owner
email or trusting a privileged trigger. A composite FK makes it impossible to attach a
provider relationship to a vendor from another workspace: the database refuses, rather
than a code path remembering to check.

---

## 2. What OSP reads from you

| Table | Access | Columns |
|---|---|---|
| `public.vendors` | read-only | `id`, `organization_id`, `vendor_name`, `legal_name`, `domain`, `primary_email`, `secondary_emails`, `status` |
| `public.workspace_registry` | read-only | resolving a Kinde workspace to the tenant UUID |
| `public.organizations` | FK target only | tenant scoping |

Those eight `vendors` columns are not a guess — they were read from the view dependencies
in the live database plus the one runtime query. Two OSP views depend on `vendors`:
`provider_service_command_center` and `provider_service_communications_inbox`.

**Everything else about `vendors` is yours.** Add, drop, rename, retype whatever you want
outside those eight columns. OSP never writes to the table.

OSP calls **zero** Rateware edge actions.

---

## 3. What is entirely OSP's, and you should not touch

99 tables (98 `provider_*` plus `legal_entities`), 29 views, everything prefixed `provider_*`, the
`provider-entity-vault` storage bucket, and the edge function
`supabase/functions/provider-onboarding-api`.

Treat all of it as someone else's. OSP will not ask you to know anything about it.

**Two things that used to be entangled and no longer are:**

- OSP's 24 edge actions used to run inside `supabase/functions/shipper-directory-api`.
  They no longer do. `shipper-directory-api` does not import `provider-service.ts`.
  **Rebuild, rename or delete that function freely — OSP does not notice.**
- OSP used to share `src/styles.css`. It now has `src/osp.css`. Restyle Rateware without
  considering OSP.

---

## 4. If you want data *from* OSP

Nothing is required, but if Rateware wants onboarding state, read these views rather than
the tables under them:

- `provider_service_command_center` — one row per relationship, with stage and counts
- `provider_service_360_relationship_summary` — the Provider 360 read model
- `provider_onboarding_workspace` — case-level onboarding state

**One correction, because the project's own spec says otherwise:** Provider 360 is **not**
a Rateware surface that OSP consumes. It is an OSP read model that borrows a vendor's
display name and is hosted on a Rateware page. That is a hosting arrangement, not data
ownership.

---

## 5. Migration drift — you are already ahead of us here

Before trusting any claim about this schema, including everything above:

```sql
select count(*) from supabase_migrations.schema_migrations;
```

compared against `git ls-tree -r --name-only origin/main -- supabase/migrations | wc -l`.

**Credit where it is due:** you already ran this and acted on it. `bc7686e`,
*"Reconcile Supabase production migration ledger (#60)"*, recovered six migrations that
had been applied through `apply_migration` and never written to a file. Those six were
ours — written while fixing defects in OSP, applied, and not committed. You caught our
drift before we did.

This branch forked before that commit, so it carries its own copy of those six files with
explanatory comments added. **Expect a conflict on them at merge time. Either side is
correct; prefer whichever is commented.**

Worth knowing why three of them matter more than their size suggests: they replace
constraints that looked like they enforced something and enforced nothing, because
`null ~ regex` evaluates to NULL and a CHECK only rejects on false. A database rebuilt
without them accepts what production rejects, silently.

The general hazard stands for both of us: `apply_migration` writes the database and
nothing writes the file, it leaves no trace in git, and no test here detects it — the
suite runs against code, not against a replayed schema. If a rebuild recreates `vendors`
through a direct `apply_migration` that never becomes a file, the constraint in section 1
can exist in one place and not the other, and the first symptom is onboarding failing
somewhere that points nowhere near the cause.

---

## 6. Open question, for a human

Which branch becomes `main`? OSP's work sits on
`feat/provider-service-onboarding-production`, unmerged and unpushed, forked at
`c5200a3`. Whoever
lands first makes the other rebase. That decision is not ours to make and nothing here
depends on it — but the integration plan does.
