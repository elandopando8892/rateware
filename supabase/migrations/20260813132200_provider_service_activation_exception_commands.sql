-- Provider Service Build 2: exception decisions and final activation command.

create or replace function public.provider_service_request_exception(
  p_organization_id uuid,
  p_activation_id uuid,
  p_scope_type text,
  p_requested_by_user_id text,
  p_request_reason text,
  p_activation_requirement_id uuid default null,
  p_track_code text default null,
  p_actor_type text default 'user',
  p_correlation_id uuid default gen_random_uuid(),
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_scope_type text;
  normalized_track_code text;
  normalized_actor_type text;
  exception_id uuid;
begin
  normalized_scope_type := lower(btrim(coalesce(p_scope_type, '')));
  normalized_track_code := nullif(lower(btrim(coalesce(p_track_code, ''))), '');
  normalized_actor_type := lower(btrim(coalesce(p_actor_type, 'user')));

  if normalized_actor_type not in ('user', 'agent', 'system', 'integration') then
    raise exception 'Unsupported Provider Service actor type.' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_requested_by_user_id, '')), '') is null
    or nullif(btrim(coalesce(p_request_reason, '')), '') is null then
    raise exception 'Exception requester and reason are required.' using errcode = '22023';
  end if;

  perform 1
  from public.provider_activations activation
  where activation.organization_id = p_organization_id
    and activation.id = p_activation_id
    and activation.status in ('in_progress', 'under_review', 'blocked', 'ready')
  for update;

  if not found then
    raise exception 'Open Provider Service activation not found.' using errcode = 'P0002';
  end if;

  if normalized_scope_type = 'requirement' then
    if p_activation_requirement_id is null or normalized_track_code is not null then
      raise exception 'Requirement exceptions require one requirement and no track.'
        using errcode = '22023';
    end if;
    perform 1
    from public.provider_activation_requirements requirement
    where requirement.organization_id = p_organization_id
      and requirement.activation_id = p_activation_id
      and requirement.id = p_activation_requirement_id;
    if not found then
      raise exception 'Provider Service requirement not found for exception.' using errcode = 'P0002';
    end if;
  elsif normalized_scope_type = 'track' then
    if p_activation_requirement_id is not null
      or normalized_track_code is null
      or normalized_track_code not in (
        'provider_readiness',
        'xbf_customer_setup',
        'commercial_operational_readiness'
      ) then
      raise exception 'Track exceptions require one canonical track and no requirement.'
        using errcode = '22023';
    end if;
  elsif normalized_scope_type = 'activation' then
    if p_activation_requirement_id is not null or normalized_track_code is not null then
      raise exception 'Activation exceptions cannot specify a track or requirement.'
        using errcode = '22023';
    end if;
  else
    raise exception 'Unsupported Provider Service exception scope.' using errcode = '22023';
  end if;

  insert into public.provider_activation_exceptions (
    organization_id,
    activation_id,
    scope_type,
    activation_requirement_id,
    track_code,
    status,
    requested_by_user_id,
    request_reason,
    metadata
  ) values (
    p_organization_id,
    p_activation_id,
    normalized_scope_type,
    p_activation_requirement_id,
    normalized_track_code,
    'requested',
    btrim(p_requested_by_user_id),
    btrim(p_request_reason),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into exception_id;

  insert into public.provider_activation_events (
    organization_id,
    activation_id,
    activation_requirement_id,
    activation_exception_id,
    event_type,
    actor_type,
    actor_user_id,
    correlation_id,
    payload
  ) values (
    p_organization_id,
    p_activation_id,
    p_activation_requirement_id,
    exception_id,
    'exception_requested',
    normalized_actor_type,
    btrim(p_requested_by_user_id),
    coalesce(p_correlation_id, gen_random_uuid()),
    jsonb_strip_nulls(jsonb_build_object(
      'scope_type', normalized_scope_type,
      'track_code', normalized_track_code,
      'request_reason', btrim(p_request_reason)
    ))
  );

  return exception_id;
end;
$$;

create or replace function public.provider_service_decide_exception(
  p_organization_id uuid,
  p_activation_exception_id uuid,
  p_decision text,
  p_decided_by_user_id text,
  p_decision_note text,
  p_expires_at timestamptz default null,
  p_effective_from timestamptz default now(),
  p_actor_type text default 'user',
  p_correlation_id uuid default gen_random_uuid()
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  exception_row public.provider_activation_exceptions%rowtype;
  normalized_decision text;
  normalized_actor_type text;
  effective_from_value timestamptz;
begin
  normalized_decision := lower(btrim(coalesce(p_decision, '')));
  normalized_actor_type := lower(btrim(coalesce(p_actor_type, 'user')));
  effective_from_value := coalesce(p_effective_from, now());

  if normalized_decision not in ('approved', 'rejected') then
    raise exception 'Provider Service exception decision must be approved or rejected.'
      using errcode = '22023';
  end if;

  if normalized_actor_type not in ('user', 'agent', 'system', 'integration') then
    raise exception 'Unsupported Provider Service actor type.' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_decided_by_user_id, '')), '') is null
    or nullif(btrim(coalesce(p_decision_note, '')), '') is null then
    raise exception 'Exception decision requires an identified reviewer and decision note.'
      using errcode = '22023';
  end if;

  if normalized_decision = 'approved'
    and (p_expires_at is null or p_expires_at <= effective_from_value) then
    raise exception 'Approved exceptions require a future expiration.' using errcode = '22023';
  end if;

  select exception_record.*
    into exception_row
  from public.provider_activation_exceptions exception_record
  join public.provider_activations activation
    on activation.organization_id = exception_record.organization_id
   and activation.id = exception_record.activation_id
  where exception_record.organization_id = p_organization_id
    and exception_record.id = p_activation_exception_id
    and activation.status in ('in_progress', 'under_review', 'blocked', 'ready')
  for update of exception_record, activation;

  if not found then
    raise exception 'Open Provider Service exception not found.' using errcode = 'P0002';
  end if;

  if exception_row.status <> 'requested' then
    raise exception 'Only requested Provider Service exceptions can be decided.'
      using errcode = '23514';
  end if;

  update public.provider_activation_exceptions exception_record
  set
    status = normalized_decision,
    decided_by_user_id = btrim(p_decided_by_user_id),
    decided_at = now(),
    decision_note = btrim(p_decision_note),
    effective_from = case
      when normalized_decision = 'approved' then effective_from_value
      else null
    end,
    expires_at = case
      when normalized_decision = 'approved' then p_expires_at
      else null
    end,
    updated_at = now()
  where exception_record.organization_id = p_organization_id
    and exception_record.id = p_activation_exception_id;

  insert into public.provider_activation_events (
    organization_id,
    activation_id,
    activation_requirement_id,
    activation_exception_id,
    event_type,
    actor_type,
    actor_user_id,
    correlation_id,
    payload
  ) values (
    p_organization_id,
    exception_row.activation_id,
    exception_row.activation_requirement_id,
    p_activation_exception_id,
    'exception_decided',
    normalized_actor_type,
    btrim(p_decided_by_user_id),
    coalesce(p_correlation_id, gen_random_uuid()),
    jsonb_strip_nulls(jsonb_build_object(
      'decision', normalized_decision,
      'decision_note', btrim(p_decision_note),
      'effective_from', case when normalized_decision = 'approved' then effective_from_value else null end,
      'expires_at', case when normalized_decision = 'approved' then p_expires_at else null end
    ))
  );

  perform public.provider_service_refresh_activation_state(
    p_organization_id,
    exception_row.activation_id,
    normalized_actor_type,
    p_decided_by_user_id,
    p_correlation_id
  );

  return normalized_decision;
end;
$$;

create or replace function public.provider_service_revoke_exception(
  p_organization_id uuid,
  p_activation_exception_id uuid,
  p_revoked_by_user_id text,
  p_revocation_reason text,
  p_actor_type text default 'user',
  p_correlation_id uuid default gen_random_uuid()
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  exception_row public.provider_activation_exceptions%rowtype;
  normalized_actor_type text;
begin
  normalized_actor_type := lower(btrim(coalesce(p_actor_type, 'user')));

  if normalized_actor_type not in ('user', 'agent', 'system', 'integration') then
    raise exception 'Unsupported Provider Service actor type.' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_revoked_by_user_id, '')), '') is null
    or nullif(btrim(coalesce(p_revocation_reason, '')), '') is null then
    raise exception 'Exception revocation requires an identified reviewer and reason.'
      using errcode = '22023';
  end if;

  select exception_record.*
    into exception_row
  from public.provider_activation_exceptions exception_record
  where exception_record.organization_id = p_organization_id
    and exception_record.id = p_activation_exception_id
  for update;

  if not found then
    raise exception 'Provider Service exception not found.' using errcode = 'P0002';
  end if;

  if exception_row.status <> 'approved' then
    raise exception 'Only approved Provider Service exceptions can be revoked.'
      using errcode = '23514';
  end if;

  update public.provider_activation_exceptions exception_record
  set
    status = 'revoked',
    revoked_by_user_id = btrim(p_revoked_by_user_id),
    revoked_at = now(),
    revocation_reason = btrim(p_revocation_reason),
    updated_at = now()
  where exception_record.organization_id = p_organization_id
    and exception_record.id = p_activation_exception_id;

  insert into public.provider_activation_events (
    organization_id,
    activation_id,
    activation_requirement_id,
    activation_exception_id,
    event_type,
    actor_type,
    actor_user_id,
    correlation_id,
    payload
  ) values (
    p_organization_id,
    exception_row.activation_id,
    exception_row.activation_requirement_id,
    p_activation_exception_id,
    'exception_revoked',
    normalized_actor_type,
    btrim(p_revoked_by_user_id),
    coalesce(p_correlation_id, gen_random_uuid()),
    jsonb_build_object('revocation_reason', btrim(p_revocation_reason))
  );

  perform public.provider_service_refresh_activation_state(
    p_organization_id,
    exception_row.activation_id,
    normalized_actor_type,
    p_revoked_by_user_id,
    p_correlation_id
  );

  return true;
end;
$$;

create or replace function public.provider_service_activate_relationship(
  p_organization_id uuid,
  p_activation_id uuid,
  p_actor_user_id text,
  p_actor_type text default 'user',
  p_correlation_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  activation_row public.provider_activations%rowtype;
  relationship_row public.provider_relationships%rowtype;
  readiness_row public.provider_activation_readiness%rowtype;
  normalized_actor_type text;
  target_lifecycle_status text;
begin
  normalized_actor_type := lower(btrim(coalesce(p_actor_type, 'user')));

  if normalized_actor_type not in ('user', 'agent', 'system', 'integration') then
    raise exception 'Unsupported Provider Service actor type.' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_actor_user_id, '')), '') is null then
    raise exception 'Provider activation requires an identified actor.' using errcode = '22023';
  end if;

  select activation.*
    into activation_row
  from public.provider_activations activation
  where activation.organization_id = p_organization_id
    and activation.id = p_activation_id
  for update;

  if not found then
    raise exception 'Provider activation not found.' using errcode = 'P0002';
  end if;

  if activation_row.status = 'activated' then
    return activation_row.provider_relationship_id;
  end if;

  if activation_row.status in ('cancelled', 'superseded', 'closed') then
    raise exception 'Closed Provider Service activation cannot activate a relationship.'
      using errcode = '23514';
  end if;

  select relationship.*
    into relationship_row
  from public.provider_relationships relationship
  where relationship.organization_id = p_organization_id
    and relationship.id = activation_row.provider_relationship_id
  for update;

  if not found then
    raise exception 'Provider relationship not found.' using errcode = 'P0002';
  end if;

  if relationship_row.lifecycle_status not in (
    'approved',
    'activated',
    'executed',
    'recurrent',
    'compliance_hold',
    'finance_hold',
    'suspended'
  ) then
    raise exception 'Provider relationship lifecycle must be approved or reactivateable before activation. Current lifecycle: %',
      relationship_row.lifecycle_status
      using errcode = '23514';
  end if;

  target_lifecycle_status := case
    when relationship_row.lifecycle_status in ('executed', 'recurrent')
      then relationship_row.lifecycle_status
    else 'activated'
  end;

  select readiness.*
    into readiness_row
  from public.provider_activation_readiness readiness
  where readiness.organization_id = p_organization_id
    and readiness.activation_id = p_activation_id;

  if not found or readiness_row.readiness_state <> 'ready' then
    raise exception 'Provider relationship cannot activate. Readiness: %, blockers: %',
      coalesce(readiness_row.readiness_state, 'unknown'),
      coalesce(readiness_row.blocker_requirement_codes, array[]::text[])
      using errcode = '23514';
  end if;

  update public.provider_activations activation
  set
    status = 'activated',
    ready_at = coalesce(activation.ready_at, now()),
    activated_at = now(),
    updated_at = now()
  where activation.organization_id = p_organization_id
    and activation.id = p_activation_id;

  update public.provider_relationships relationship
  set
    lifecycle_status = target_lifecycle_status,
    activation_status = 'activated',
    activated_at = coalesce(relationship.activated_at, now()),
    primary_blocker = null,
    updated_at = now()
  where relationship.organization_id = p_organization_id
    and relationship.id = activation_row.provider_relationship_id;

  insert into public.provider_activation_events (
    organization_id,
    activation_id,
    event_type,
    actor_type,
    actor_user_id,
    correlation_id,
    payload
  ) values (
    p_organization_id,
    p_activation_id,
    'relationship_activated',
    normalized_actor_type,
    btrim(p_actor_user_id),
    coalesce(p_correlation_id, gen_random_uuid()),
    jsonb_build_object(
      'provider_relationship_id', activation_row.provider_relationship_id,
      'completion_percentage', readiness_row.completion_percentage
    )
  );

  insert into public.provider_relationship_events (
    organization_id,
    provider_relationship_id,
    event_type,
    previous_lifecycle_status,
    lifecycle_status,
    previous_activation_status,
    activation_status,
    actor_type,
    actor_user_id,
    source,
    correlation_id,
    payload
  ) values (
    p_organization_id,
    activation_row.provider_relationship_id,
    'relationship_activated',
    relationship_row.lifecycle_status,
    target_lifecycle_status,
    relationship_row.activation_status,
    'activated',
    normalized_actor_type,
    btrim(p_actor_user_id),
    'provider_service',
    coalesce(p_correlation_id, gen_random_uuid()),
    jsonb_build_object('activation_id', p_activation_id)
  );

  return activation_row.provider_relationship_id;
end;
$$;
