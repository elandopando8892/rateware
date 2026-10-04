-- Synthetic database only; not a migration or a production schema assertion.
create role service_role nologin bypassrls;
create table public.rateware_catalog_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  source text not null default 'rateware_google_catalog', category text not null,
  raw_value text not null, normalized_value text not null, code text,
  metadata jsonb not null default '{}'::jsonb, active boolean not null default true,
  unique (source, category, raw_value, normalized_value)
);
alter table public.rateware_catalog_items enable row level security;
grant usage on schema public to service_role;
grant select, insert, update on public.rateware_catalog_items to service_role;
-- Counter trigger records the mutations actually performed; it is only a test fixture.
create table public.catalog_owner_mutations (operation text not null, row_id uuid not null);
create function public.catalog_owner_count() returns trigger language plpgsql as $$
begin insert into public.catalog_owner_mutations values (TG_OP, NEW.id); return NEW; end $$;
create trigger catalog_owner_count after insert or update on public.rateware_catalog_items
for each row execute function public.catalog_owner_count();
grant select, insert on public.catalog_owner_mutations to service_role;

-- A helper ASSERT for tests; never deploy this function.
create function public.catalog_owner_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;
grant execute on function public.catalog_owner_assert(boolean,text) to service_role;
