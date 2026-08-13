-- Provider Service Build 2: require identified review decisions and linked evidence.

create or replace function public.provider_service_set_requirement_state(
  p_organization_id uuid,
  p_activation_requirement_id uuid,
  p_new_state text,
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
  requirement_row public.provider_activation_requirements%rowtype;
  activation_status text;
  normalized_state text;
  normalized_actor_type text;
  normalized_reason text;
begin
  normalized_state := lower(btrim(coalesce(p_new_state, '')));
  normalized_actor_type := lower(btrim(coalesce(p_actor_type, 'user')));
  normalized_reason := nullif(btrim(coalesce(p_reason, '')), '');

  if normalized_actor_type not in ('user', 'agent', 'system', 'integration') then
    raise exception 'Unsupported Provider Service actor type.' using errcode = '22023';
  end if;

  select requirement, activation.status
    into requirement_row, activation_status
  from public.provider_activation_requirements requirement
  join public.provider_activations activation
    on activation.organization_id = requirement.organization_id
   and activation.id = requirement.activation_id
  where requirement.organization_id = p_organization_id
    and requirement.id = p_activation_requirement_id
  for update of requirement, activation;

  if not found then
    raise exception 'Provider Service requirement not found.' using errcode = 'P0002';
  end if;

  if activation_status not in ('in_progress', 'under_review', 'blocked', 'ready') then
    raise exception 'Requirement state cannot change on a closed Provider Service activation.'
      using errcode = '23514';
  end if;

  if not public.provider_service_requirement_transition_allowed(requirement_row.state, normalized_state) then
    raise exception 'Invalid Provider Service requirement transition: % -> %',
      requirement_row.state,
      normalized_state
      using errcode = '23514';
  end if;

  if normalized_state in ('failed', 'correction_required', 'not_applicable')
    and normalized_reason is null then
    raise exception 'A reason is required for failed, correction-required, or not-applicable states.'
      using errcode = '22023';
  end if;

  if normalized_state in ('passed', 'failed', 'correction_required', 'not_applicable')
    and nullif(btrim(coalesce(p_actor_user_id, '')), '') is null then
    raise exception 'A Provider Service review decision requires an identified reviewer.'
      using errcode = '22023';
  end if;

  if normalized_state = 'passed'
    and requirement_row.evidence_required
    and not exists (
      select 1
      from public.provider_activation_evidence_links evidence
      where evidence.organization_id = p_organization_id
        and evidence.activation_id = requirement_row.activation_id
        and evidence.activation_requirement_id = p_activation_requirement_id
        and evidence.status = 'active'
    ) then
    raise exception 'Required evidence must be linked before a Provider Service requirement can pass.'
      using errcode = '23514';
  end if;

  update public.provider_activation_requirements requirement
  set
    state = normalized_state,
    state_changed_at = now(),
    submitted_at = case
      when normalized_state = 'submitted' then coalesce(requirement.submitted_at, now())
      else requirement.submitted_at
    end,
    reviewed_at = case
      when normalized_state in ('passed', 'failed', 'correction_required', 'not_applicable')
        then now()
      else requirement.reviewed_at
    end,
    reviewed_by_user_id = case
      when normalized_state in ('passed', 'failed', 'correction_required', 'not_applicable')
        then nullif(btrim(coalesce(p_actor_user_id, '')), '')
      else requirement.reviewed_by_user_id
    end,
    satisfied_at = case
      when normalized_state in ('passed', 'not_applicable') then now()
      when normalized_state in ('failed', 'correction_required', 'expired', 'pending', 'in_progress', 'submitted', 'under_review')
        then null
      else requirement.satisfied_at
    end,
    expires_at = case
      when normalized_state = 'passed' and requirement.validity_days_snapshot is not null
        then now() + make_interval(days => requirement.validity_days_snapshot)
      when normalized_state = 'passed' then null
      when normalized_state = 'expired' then coalesce(requirement.expires_at, now())
      else requirement.expires_at
    end,
    failure_reason = case
      when normalized_state = 'failed' then normalized_reason
      when normalized_state <> 'failed' then null
      else requirement.failure_reason
    end,
    correction_note = case
      when normalized_state = 'correction_required' then normalized_reason
      when normalized_state <> 'correction_required' then null
      else requirement.correction_note
    end,
    metadata = case
      when normalized_state = 'not_applicable'
        then requirement.metadata || jsonb_build_object('not_applicable_reason', normalized_reason)
      else requirement.metadata
    end,
    updated_at = now()
  where requirement.organization_id = p_organization_id
    and requirement.id = p_activation_requirement_id;

  insert into public.provider_activation_events (
    organization_id,
    activation_id,
    activation_requirement_id,
    event_type,
    actor_type,
    actor_user_id,
    correlation_id,
    payload
  ) values (
    p_organization_id,
    requirement_row.activation_id,
    p_activation_requirement_id,
    'requirement_state_changed',
    normalized_actor_type,
    nullif(btrim(coalesce(p_actor_user_id, '')), ''),
    coalesce(p_correlation_id, gen_random_uuid()),
    jsonb_strip_nulls(jsonb_build_object(
      'previous_state', requirement_row.state,
      'state', normalized_state,
      'reason', normalized_reason
    ))
  );

  perform public.provider_service_refresh_activation_state(
    p_organization_id,
    requirement_row.activation_id,
    normalized_actor_type,
    p_actor_user_id,
    p_correlation_id
  );

  return normalized_state;
end;
$$;

revoke all on function public.provider_service_set_requirement_state(uuid, uuid, text, text, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.provider_service_set_requirement_state(uuid, uuid, text, text, text, text, uuid)
  to service_role;
