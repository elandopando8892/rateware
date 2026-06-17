alter table public.vendors
  add column if not exists owner_user_id text,
  add column if not exists owner_email text;

update public.vendors
set
  owner_email = coalesce(owner_email, 'sales@heymarksman.com'),
  owner_user_id = coalesce(owner_user_id, 'sales@heymarksman.com')
where owner_email is null
  or owner_user_id is null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.vendors'::regclass
      and conname = 'vendors_domain_key'
  ) then
    alter table public.vendors drop constraint vendors_domain_key;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.vendors'::regclass
      and conname = 'vendors_name_or_domain_unique'
  ) then
    alter table public.vendors drop constraint vendors_name_or_domain_unique;
  end if;
end $$;

create index if not exists vendors_owner_email_idx on public.vendors (owner_email);
create index if not exists vendors_owner_stage_idx on public.vendors (owner_email, base_stage);
create index if not exists vendors_owner_domain_idx on public.vendors (owner_email, domain);
