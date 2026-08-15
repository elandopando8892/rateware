-- Convergence hardening: relationship creation may not inject lifecycle/activation state,
-- and runtime state changes must flow through bounded commands instead of generic table writes.

revoke insert, update on table public.provider_relationships from service_role;

grant insert (
  organization_id,
  vendor_id,
  vendor_workspace_id,
  legal_entity_id,
  legal_entity_code,
  risk_tier,
  assigned_owner_user_id,
  source,
  metadata
) on table public.provider_relationships to service_role;

grant update (
  risk_tier,
  assigned_owner_user_id,
  metadata,
  updated_at
) on table public.provider_relationships to service_role;

create or replace function public.provider_service_lifecycle_transition_allowed(
  p_from_status text,
  p_to_status text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case lower(coalesce(p_from_status, ''))
    when 'identified' then lower(coalesce(p_to_status, '')) = any (array['identified','contactable','information_required','rejected','offboarded'])
    when 'contactable' then lower(coalesce(p_to_status, '')) = any (array['contactable','eligible','information_required','rejected','offboarded'])
    when 'eligible' then lower(coalesce(p_to_status, '')) = any (array['eligible','onboarding','information_required','rejected','offboarded'])
    when 'onboarding' then lower(coalesce(p_to_status, '')) = any (array['onboarding','under_review','information_required','correction_required','rejected','offboarded'])
    when 'under_review' then lower(coalesce(p_to_status, '')) = any (array['under_review','approved','information_required','correction_required','compliance_hold','finance_hold','legal_review','rejected','offboarded'])
    when 'approved' then lower(coalesce(p_to_status, '')) = any (array['approved','activated','compliance_hold','finance_hold','legal_review','suspended','offboarded'])
    when 'activated' then lower(coalesce(p_to_status, '')) = any (array['activated','executed','compliance_hold','finance_hold','suspended','offboarded'])
    when 'executed' then lower(coalesce(p_to_status, '')) = any (array['executed','recurrent','compliance_hold','finance_hold','suspended','offboarded'])
    when 'recurrent' then lower(coalesce(p_to_status, '')) = any (array['recurrent','compliance_hold','finance_hold','suspended','offboarded'])
    when 'information_required' then lower(coalesce(p_to_status, '')) = any (array['information_required','onboarding','under_review','rejected','offboarded'])
    when 'correction_required' then lower(coalesce(p_to_status, '')) = any (array['correction_required','onboarding','under_review','rejected','offboarded'])
    when 'compliance_hold' then lower(coalesce(p_to_status, '')) = any (array['compliance_hold','under_review','approved','activated','suspended','rejected','offboarded'])
    when 'finance_hold' then lower(coalesce(p_to_status, '')) = any (array['finance_hold','under_review','approved','activated','suspended','rejected','offboarded'])
    when 'legal_review' then lower(coalesce(p_to_status, '')) = any (array['legal_review','under_review','approved','rejected','offboarded'])
    when 'suspended' then lower(coalesce(p_to_status, '')) = any (array['suspended','onboarding','under_review','approved','activated','offboarded'])
    when 'rejected' then lower(coalesce(p_to_status, '')) = any (array['rejected','onboarding','offboarded'])
    when 'offboarded' then lower(coalesce(p_to_status, '')) = any (array['offboarded','identified'])
    else false
  end;
$$;

create or replace function public.provider_service_set_relationship_lifecycle(
  p_organization_id uuid,
  p_provider_relationship_id uuid,
  p_target_status text,
  p_actor_type text default 'user',
  p_actor_user_id text default null,
  p_reason text default null,
  p_correlation_id uuid default gen_random_uuid()
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  relationship_row public.provider_relationships%rowtype;
  target_status text := lower(btrim(coalesce(p_target_status,'')));
  actor_type text := lower(btrim(coalesce(p_actor_type,'user')));
  actor_user_id text := nullif(btrim(coalesce(p_actor_user_id,'')),'');
begin
  if actor_type not in ('user','agent','system','integration') then
    raise exception 'Unsupported Provider Service actor type.' using errcode='22023';
  end if;
  if actor_type='user' and actor_user_id is null then
    raise exception 'User lifecycle changes require an identified user.' using errcode='22023';
  end if;

  select relationship.* into relationship_row
  from public.provider_relationships relationship
  where relationship.organization_id=p_organization_id
    and relationship.id=p_provider_relationship_id
  for update;

  if not found then
    raise exception 'Provider relationship not found.' using errcode='P0002';
  end if;

  if target_status in ('activated','suspended','offboarded') then
    raise exception 'Lifecycle state % requires its dedicated guarded command.', target_status using errcode='23514';
  end if;
  if relationship_row.lifecycle_status='offboarded' then
    raise exception 'Offboarded relationships require an explicit re-onboarding command.' using errcode='23514';
  end if;
  if not public.provider_service_lifecycle_transition_allowed(relationship_row.lifecycle_status,target_status) then
    raise exception 'Invalid provider lifecycle transition: % -> %.', relationship_row.lifecycle_status,target_status using errcode='23514';
  end if;
  if target_status in ('executed','recurrent') and relationship_row.activation_status<>'activated' then
    raise exception 'Executed or recurrent lifecycle requires an activated relationship.' using errcode='23514';
  end if;
  if relationship_row.lifecycle_status=target_status then
    return target_status;
  end if;

  update public.provider_relationships relationship
  set lifecycle_status=target_status,
      updated_at=now()
  where relationship.organization_id=p_organization_id
    and relationship.id=p_provider_relationship_id;

  insert into public.provider_relationship_events (
    organization_id,provider_relationship_id,event_type,previous_lifecycle_status,lifecycle_status,
    previous_activation_status,activation_status,actor_type,actor_user_id,source,correlation_id,payload
  ) values (
    p_organization_id,p_provider_relationship_id,'lifecycle_changed',relationship_row.lifecycle_status,target_status,
    relationship_row.activation_status,relationship_row.activation_status,actor_type,actor_user_id,'provider_service',
    coalesce(p_correlation_id,gen_random_uuid()),jsonb_build_object('reason',nullif(btrim(coalesce(p_reason,'')),''))
  );

  return target_status;
end;
$$;

revoke all on function public.provider_service_lifecycle_transition_allowed(text,text) from public,anon,authenticated,service_role;
revoke all on function public.provider_service_set_relationship_lifecycle(uuid,uuid,text,text,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.provider_service_lifecycle_transition_allowed(text,text) to service_role;
grant execute on function public.provider_service_set_relationship_lifecycle(uuid,uuid,text,text,text,text,uuid) to service_role;
