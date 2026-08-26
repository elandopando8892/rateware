-- Participant templates share public.vendor_segments with dynamic saved lists.
-- This migration is intentionally additive: it preserves dynamic-segment semantics
-- and refuses to guess an organization or resolve legacy name conflicts.

alter table public.vendor_segments
  add column if not exists lifecycle_status text not null default 'active',
  add column if not exists template_version bigint not null default 1,
  add column if not exists created_by_user_id text,
  add column if not exists created_by_email text,
  add column if not exists updated_by_user_id text,
  add column if not exists updated_by_email text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id text,
  add column if not exists archived_by_email text;

-- Preserve the legacy owner as the best available provenance for participant
-- templates. Dynamic segments retain their existing behavior and need no rewrite.
update public.vendor_segments
set
  created_by_user_id = coalesce(nullif(btrim(created_by_user_id), ''), nullif(btrim(owner_user_id), '')),
  created_by_email = coalesce(nullif(btrim(created_by_email), ''), nullif(lower(btrim(owner_email)), '')),
  updated_by_user_id = coalesce(nullif(btrim(updated_by_user_id), ''), nullif(btrim(owner_user_id), '')),
  updated_by_email = coalesce(nullif(btrim(updated_by_email), ''), nullif(lower(btrim(owner_email)), ''))
where segment_type = 'participant_template';

-- An identity may be mapped to more than one workspace. Resolve only the
-- unambiguous union of legacy owner identities; conflicting or unknown rows stay
-- unresolved and are blocked below for human reconciliation.
with template_identities as (
  select
    segment.id as segment_id,
    nullif(lower(btrim(identity.identity_key)), '') as identity_key
  from public.vendor_segments segment
  cross join lateral (
    values
      (segment.owner_email),
      (segment.owner_user_id)
  ) as identity(identity_key)
  where segment.segment_type = 'participant_template'
    and nullif(btrim(segment.organization_id), '') is null
), candidate_organizations as (
  select distinct
    template_identities.segment_id,
    alias.organization_id
  from template_identities
  join public.workspace_identity_aliases alias
    on alias.identity_key = template_identities.identity_key
  where template_identities.identity_key is not null
), unambiguous_organizations as (
  select
    segment_id,
    min(organization_id) as organization_id
  from candidate_organizations
  group by segment_id
  having count(distinct organization_id) = 1
)
update public.vendor_segments segment
set organization_id = resolved.organization_id
from unambiguous_organizations resolved
where segment.id = resolved.segment_id;

do $$
declare unresolved_count bigint;
begin
  select count(*) into unresolved_count
  from public.vendor_segments
  where segment_type = 'participant_template'
    and nullif(btrim(organization_id), '') is null;

  if unresolved_count > 0 then
    raise exception 'carrier template migration blocked: % participant templates lack organization_id', unresolved_count;
  end if;
end $$;

do $$
declare duplicate_member_template_count bigint;
begin
  select count(*) into duplicate_member_template_count
  from public.vendor_segments segment
  where segment.segment_type = 'participant_template'
    and cardinality(segment.vendor_ids) <> (
      select count(distinct member_id) from unnest(segment.vendor_ids) as member_id
    );

  if duplicate_member_template_count > 0 then
    raise exception 'carrier template migration blocked: % participant templates contain duplicate vendor_ids', duplicate_member_template_count;
  end if;
end $$;

do $$
declare cross_organization_member_template_count bigint;
begin
  select count(*) into cross_organization_member_template_count
  from public.vendor_segments segment
  where segment.segment_type = 'participant_template'
    and exists (
      select 1
      from public.vendors v
      where v.id = any(segment.vendor_ids)
        and v.organization_id is distinct from segment.organization_id
    );

  if cross_organization_member_template_count > 0 then
    raise exception 'carrier template migration blocked: % participant templates include members from another organization', cross_organization_member_template_count;
  end if;
end $$;

do $$
declare duplicate_count bigint;
begin
  select count(*) into duplicate_count
  from (
    select organization_id, lower(btrim(segment_name)) as normalized_segment_name
    from public.vendor_segments
    where segment_type = 'participant_template'
    group by organization_id, lower(btrim(segment_name))
    having count(*) > 1
  ) duplicate_names;

  if duplicate_count > 0 then
    raise exception 'carrier template migration blocked: % duplicate normalized organization/name pairs require reconciliation', duplicate_count;
  end if;
end $$;

alter table public.vendor_segments
  add constraint vendor_segments_participant_template_lifecycle_check
    check (segment_type <> 'participant_template' or lifecycle_status in ('draft', 'active', 'archived')),
  add constraint vendor_segments_participant_template_organization_check
    check (segment_type <> 'participant_template' or nullif(btrim(organization_id), '') is not null),
  add constraint vendor_segments_participant_template_name_check
    check (segment_type <> 'participant_template' or nullif(btrim(segment_name), '') is not null),
  add constraint vendor_segments_participant_template_version_check
    check (segment_type <> 'participant_template' or template_version >= 1),
  add constraint vendor_segments_participant_template_active_members_check
    check (segment_type <> 'participant_template' or lifecycle_status <> 'active' or cardinality(vendor_ids) > 0);

create unique index vendor_segments_participant_template_org_name_uidx
  on public.vendor_segments (organization_id, lower(btrim(segment_name)))
  where segment_type = 'participant_template';

create or replace function public.rateware_validate_participant_template_membership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.segment_type <> 'participant_template' then
    return new;
  end if;

  if cardinality(new.vendor_ids) <> (
    select count(distinct member_id) from unnest(new.vendor_ids) as member_id
  ) then
    raise exception 'carrier template vendor_ids must be unique';
  end if;

  -- Intentionally do not reject absent vendors: a deleted member remains in the
  -- template so callers can render it as unavailable rather than silently lose it.
  if exists (
    select 1
    from public.vendors v
    where v.id = any(new.vendor_ids)
      and v.organization_id is distinct from new.organization_id
  ) then
    raise exception 'carrier template member belongs to another organization';
  end if;

  return new;
end;
$$;

create trigger vendor_segments_participant_template_membership_guard
before insert or update of segment_type, vendor_ids, organization_id
on public.vendor_segments
for each row
execute function public.rateware_validate_participant_template_membership();
