-- Only in the fresh, isolated Docker test database. No external database URL.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'bidware_bounce_test' then raise exception 'Wrong test database'; end if;
end $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create table public.vendors (
  id uuid primary key, owner_email text not null, vendor_name text,
  primary_email text, secondary_emails text[], tags text[], profile_data jsonb,
  updated_at timestamptz default now()
);
create table public.email_suppression_list (
  id uuid primary key, owner_email text not null, email text not null, status text,
  resolved_at timestamptz, resolved_by text, replacement_email text,
  updated_at timestamptz default now(), unique(owner_email, email)
);
grant usage on schema public to service_role;
grant select, update on public.vendors, public.email_suppression_list to service_role;
