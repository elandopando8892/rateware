-- SYNTHETIC / DISPOSABLE DATABASE ONLY. Never execute against a shared database.
-- Minimal dependencies reflecting the checked-in tables; QuoteDesk tables use their real migration.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'quotedesk_spot_fixture' then raise exception 'Disposable fixture database required'; end if;
end $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create table public.shippers (id uuid primary key default gen_random_uuid(), owner_email text, shipper_name text, legal_name text);
create table public.shipper_opportunities (id uuid primary key default gen_random_uuid());
create table public.rfx_events (id uuid primary key default gen_random_uuid());
create table public.rfx_lanes (id uuid primary key default gen_random_uuid());
create table public.rfx_projects (
  id uuid primary key default gen_random_uuid(), owner_email text, owner_user_id text,
  title text not null, opportunity_type text not null default 'spot', status text not null default 'rfi_submitted',
  customer_id uuid, customer_contact_name text, linked_rfx_event_id uuid, notes text, updated_at timestamptz default now()
);
create table public.rfx_rfi_submissions (
  id uuid primary key default gen_random_uuid(), owner_email text, project_id uuid unique references public.rfx_projects(id),
  status text not null default 'submitted', updated_at timestamptz not null default now(),
  frozen_snapshot jsonb not null default '{}'::jsonb
);
create table public.rateware_fx_spot_rates (currency_pair text, rate numeric, rate_date date);
create table public.saas_audit_log (
  id uuid primary key default gen_random_uuid(), owner_user_id text, owner_email text, organization_id text, actor_email text,
  action text not null, entity_type text, entity_id text, summary text, metadata jsonb default '{}'::jsonb
);
\ir ../../supabase/migrations/20260924054441_quotedesk_quotes.sql
grant usage on schema public to service_role, anon, authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
\ir ../../supabase/migrations/20261006220131_quotedesk_spot_conversion_atomic.sql
