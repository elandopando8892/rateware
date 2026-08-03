create table if not exists public.workspace_registry (
  organization_id text primary key,
  canonical_owner_key text not null unique,
  canonical_owner_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint workspace_registry_organization_id_not_blank check (btrim(organization_id) <> ''),
  constraint workspace_registry_owner_key_not_blank check (btrim(canonical_owner_key) <> '')
);

create table if not exists public.workspace_identity_aliases (
  organization_id text not null references public.workspace_registry(organization_id) on delete cascade,
  identity_key text not null,
  identity_type text not null default 'legacy_owner',
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (organization_id, identity_key),
  constraint workspace_identity_aliases_key_normalized check (identity_key = lower(btrim(identity_key)))
);

create index if not exists workspace_identity_aliases_identity_idx
  on public.workspace_identity_aliases (identity_key, organization_id);

alter table public.workspace_registry enable row level security;
alter table public.workspace_identity_aliases enable row level security;

revoke all on table public.workspace_registry from public, anon, authenticated;
revoke all on table public.workspace_identity_aliases from public, anon, authenticated;
grant select, insert, update on table public.workspace_registry to service_role;
grant select, insert, update, delete on table public.workspace_identity_aliases to service_role;

with owner_candidates as (
  select organization_id, owner_user_id, count(*)::bigint as weight, 1 as source_priority
  from public.shippers
  where nullif(btrim(organization_id), '') is not null
  group by organization_id, owner_user_id
  union all
  select organization_id, owner_user_id, count(*)::bigint, 2
  from public.rfx_ratebooks
  where nullif(btrim(organization_id), '') is not null
  group by organization_id, owner_user_id
  union all
  select organization_id, owner_user_id, count(*)::bigint, 3
  from public.whatsapp_business_connections
  where nullif(btrim(organization_id), '') is not null
  group by organization_id, owner_user_id
), ranked_candidates as (
  select
    btrim(organization_id) as organization_id,
    nullif(btrim(owner_user_id), '') as owner_user_id,
    row_number() over (
      partition by btrim(organization_id)
      order by sum(weight) desc, min(source_priority), nullif(btrim(owner_user_id), '') nulls last
    ) as rank_number
  from owner_candidates
  group by btrim(organization_id), nullif(btrim(owner_user_id), '')
)
insert into public.workspace_registry (
  organization_id,
  canonical_owner_key,
  canonical_owner_user_id,
  metadata
)
select
  organization_id,
  'org:' || lower(organization_id),
  owner_user_id,
  jsonb_build_object('source', 'canonical_workspace_identity_backfill')
from ranked_candidates
where rank_number = 1
on conflict (organization_id) do update set
  canonical_owner_key = excluded.canonical_owner_key,
  canonical_owner_user_id = coalesce(public.workspace_registry.canonical_owner_user_id, excluded.canonical_owner_user_id),
  updated_at = now();

with direct_aliases as (
  select organization_id, owner_email as identity_key, 'owner_email'::text as identity_type
  from public.shippers
  union all
  select organization_id, owner_user_id, 'owner_user_id' from public.shippers
  union all
  select organization_id, owner_email, 'owner_email' from public.rfx_ratebooks
  union all
  select organization_id, owner_user_id, 'owner_user_id' from public.rfx_ratebooks
  union all
  select organization_id, owner_email, 'owner_email' from public.whatsapp_business_connections
  union all
  select organization_id, owner_user_id, 'owner_user_id' from public.whatsapp_business_connections
)
insert into public.workspace_identity_aliases (organization_id, identity_key, identity_type)
select distinct
  btrim(alias.organization_id),
  lower(btrim(alias.identity_key)),
  alias.identity_type
from direct_aliases alias
join public.workspace_registry registry
  on registry.organization_id = btrim(alias.organization_id)
where nullif(btrim(alias.organization_id), '') is not null
  and nullif(btrim(alias.identity_key), '') is not null
on conflict (organization_id, identity_key) do nothing;

with recursive owner_edges as (
  select distinct
    lower(btrim(rs.owner_email)) as left_identity,
    lower(btrim(v.owner_email)) as right_identity
  from public.rate_staging rs
  join public.vendors v on v.id = rs.vendor_id
  where nullif(btrim(rs.owner_email), '') is not null
    and nullif(btrim(v.owner_email), '') is not null
    and lower(btrim(rs.owner_email)) <> lower(btrim(v.owner_email))
), connected_identities as (
  select organization_id, identity_key
  from public.workspace_identity_aliases
  union
  select
    connected.organization_id,
    case
      when edge.left_identity = connected.identity_key then edge.right_identity
      else edge.left_identity
    end
  from connected_identities connected
  join owner_edges edge
    on edge.left_identity = connected.identity_key
    or edge.right_identity = connected.identity_key
)
insert into public.workspace_identity_aliases (organization_id, identity_key, identity_type, metadata)
select distinct
  connected.organization_id,
  connected.identity_key,
  'linked_record',
  jsonb_build_object('source', 'rate_vendor_owner_graph')
from connected_identities connected
where nullif(btrim(connected.identity_key), '') is not null
on conflict (organization_id, identity_key) do nothing;

do $$
declare
  target_table text;
begin
  for target_table in
    select column_owner.table_name
    from information_schema.columns column_owner
    where column_owner.table_schema = 'public'
      and column_owner.column_name = 'owner_email'
      and column_owner.table_name not in ('workspace_registry', 'workspace_identity_aliases')
  loop
    execute format('alter table public.%I add column if not exists organization_id text', target_table);
  end loop;
end;
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'bid_room_chat_messages',
    'bid_room_chat_threads',
    'contact_history',
    'email_suppression_list',
    'gmail_mailbox_connections',
    'gmail_oauth_states',
    'google_chat_connections',
    'google_chat_oauth_states',
    'interpretation_memory',
    'onboarding_checklist',
    'outreach_campaigns',
    'outreach_messages',
    'outreach_templates',
    'rate_staging',
    'rateware_book_versions',
    'raw_uploads',
    'rfx_award_package_lanes',
    'rfx_award_packages',
    'rfx_demand_lanes',
    'rfx_demand_snapshots',
    'rfx_events',
    'rfx_package_lanes',
    'rfx_package_segments',
    'rfx_packages',
    'rfx_process_audit',
    'rfx_projects',
    'rfx_ratebook_segments',
    'rfx_ratebook_shares',
    'rfx_ratebooks',
    'rfx_rfi_attachments',
    'rfx_rfi_business_rules',
    'rfx_rfi_carrier_requirements',
    'rfx_rfi_crossborder_details',
    'rfx_rfi_destinations',
    'rfx_rfi_exception_notes',
    'rfx_rfi_lanes',
    'rfx_rfi_magic_links',
    'rfx_rfi_origins',
    'rfx_rfi_service_requirements',
    'rfx_rfi_submissions',
    'rfx_segment_confirmations',
    'saas_audit_log',
    'shipper_account_actions',
    'shipper_contacts',
    'shipper_lanes',
    'shipper_locations',
    'shipper_opportunities',
    'shipper_profile_requests',
    'shipper_rfis',
    'shippers',
    'vendor_improvement_cases',
    'vendor_profile_requests',
    'vendor_segments',
    'vendor_value_scorecards',
    'vendor_whatsapp_contacts',
    'vendor_whatsapp_groups',
    'vendors',
    'whatsapp_business_connections',
    'whatsapp_outreach_template_mappings'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is not null then
      execute format(
        'update public.%I target
         set owner_email = registry.canonical_owner_key,
             organization_id = registry.organization_id
         from public.workspace_identity_aliases alias
         join public.workspace_registry registry using (organization_id)
         where lower(btrim(coalesce(target.owner_email, ''''))) = alias.identity_key
           and (
             target.owner_email is distinct from registry.canonical_owner_key
             or target.organization_id is distinct from registry.organization_id
           )',
        target_table
      );
    end if;
  end loop;
end;
$$;

update public.user_profiles profile
set organization_id = alias.organization_id
from public.workspace_identity_aliases alias
where (
    lower(btrim(coalesce(profile.owner_email, ''))) = alias.identity_key
    or lower(btrim(coalesce(profile.owner_user_id, ''))) = alias.identity_key
  )
  and profile.organization_id is distinct from alias.organization_id;

create index if not exists vendors_organization_created_idx
  on public.vendors (organization_id, created_at desc, id desc);
create index if not exists rate_staging_organization_status_created_idx
  on public.rate_staging (organization_id, status, created_at desc, id desc);
create index if not exists raw_uploads_organization_created_idx
  on public.raw_uploads (organization_id, created_at desc, id desc);
create index if not exists rfx_events_organization_updated_idx
  on public.rfx_events (organization_id, updated_at desc, id desc);
create index if not exists outreach_messages_organization_created_idx
  on public.outreach_messages (organization_id, created_at desc, id desc);

create or replace function public.rateware_assert_vendor_workspace_link()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  linked_owner text;
  linked_organization text;
begin
  if new.vendor_id is null then
    return new;
  end if;

  select vendor.owner_email, vendor.organization_id
    into linked_owner, linked_organization
  from public.vendors vendor
  where vendor.id = new.vendor_id;

  if not found then
    raise exception 'Selected vendor does not exist.' using errcode = '23503';
  end if;

  new.owner_email := coalesce(nullif(btrim(new.owner_email), ''), linked_owner);
  new.organization_id := coalesce(nullif(btrim(new.organization_id), ''), linked_organization);

  if lower(coalesce(new.owner_email, '')) is distinct from lower(coalesce(linked_owner, ''))
    or lower(coalesce(new.organization_id, '')) is distinct from lower(coalesce(linked_organization, '')) then
    raise exception 'Vendor and rate source must belong to the same workspace.' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.rateware_assert_vendor_workspace_link() from public, anon, authenticated;
grant execute on function public.rateware_assert_vendor_workspace_link() to service_role;

drop trigger if exists rate_staging_vendor_workspace_guard on public.rate_staging;
create trigger rate_staging_vendor_workspace_guard
before insert or update of vendor_id, owner_email, organization_id
on public.rate_staging
for each row execute function public.rateware_assert_vendor_workspace_link();

drop trigger if exists raw_uploads_vendor_workspace_guard on public.raw_uploads;
create trigger raw_uploads_vendor_workspace_guard
before insert or update of vendor_id, owner_email, organization_id
on public.raw_uploads
for each row execute function public.rateware_assert_vendor_workspace_link();

comment on table public.workspace_registry is
  'Canonical workspace ownership keyed by the verified Kinde organization id.';
comment on table public.workspace_identity_aliases is
  'Legacy email and Kinde subject aliases mapped to one canonical workspace.';
