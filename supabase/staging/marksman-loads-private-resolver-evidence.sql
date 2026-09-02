-- Read-only evidence query for the isolated MARKSMAN Loads staging branch.
-- This file does not mutate data and is safe to run after the synthetic canary.

select json_build_object(
  'migration_count', (
    select count(*) from supabase_migrations.schema_migrations
  ),
  'latest_migration', (
    select max(version) from supabase_migrations.schema_migrations
  ),
  'source_vendor_rows', (
    select count(*) from public.vendors where source = 'google_sheet'
  ),
  'fixture_vendor_rows', (
    select count(*) from public.vendors where source = 'staging_fixture'
  ),
  'ledger_rows', (
    select count(*) from public.rfx_private_resolver_requests
  ),
  'bid_rows', (
    select count(*)
    from public.rfx_lane_vendors
    where bid_rate is not null
  ),
  'request_body_columns', (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rfx_private_resolver_requests'
      and column_name in ('request_body', 'body', 'payload')
  ),
  'global_vendor_arbiter_present', (
    select count(*) > 0
    from pg_constraint
    where conname = 'vendors_name_or_domain_unique'
  ),
  'closed_pilot_controls', (
    select json_build_object(
      'secret_custody_verified', secret_custody_verified,
      'network_controls_verified', network_controls_verified,
      'monitoring_owner_assigned', monitoring_owner_assigned,
      'rollback_rehearsed', rollback_rehearsed,
      'production_approved', production_approved
    )
    from public.rfx_private_resolver_release_controls
    where singleton = true
  )
) as evidence;
