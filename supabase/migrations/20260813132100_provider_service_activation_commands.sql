-- Provider Service Build 2: activation, evidence, and requirement commands.
-- Requirement-state review decisions are installed by 20260813132600.

create or replace function public.provider_service_refresh_activation_state(
  p_organization_id uuid,
  p_activation_id uuid,
  p_actor_type text default 'system',
  p_actor_user_id text default null,
  p_correlation_id uuid default gen_random_uuid()
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  activation_row public.provider_activations%rowtype;
  readiness_row public.provider_activation_readiness%rowtype;
  normalized_actor_type text;
  target_status text;
  target_relationship_status text;
begin
  normalized_actor_type := lower(btrim(coalesce(p_actor_type, 'system')));
  if normalized_actor_type not in ('user', 'agent', 'system', 'integration') then
    raise exception 'Unsupported Provider Service actor type.' using errcode = '22023';
  end if;

  select activation.* into activation_row
  from public.provider_activations activation
  where activation.organization_id = p_organization_id
    and activation.id = p_activation_id
  for update;

  if not found then
    raise exception 'Provider activation not found.' using errcode = 'P0002';
  end if;
  if activation_row.status in ('activated', 'cancelled', 'superseded', 'closed') then
    return activation_row.status;
  end if;

  select readiness.* into readiness_row
  from public.provider_activation_readiness readiness
  where readiness.organization_id = p_organization_id
    and readiness.activation_id = p_activation_id;

  if not found then
    raise exception 'Provider activation readiness could not be calculated.' using errcode = 'P0001';
  end if;

  target_status := case readiness_row.readiness_state
    when 'ready' then 'ready'
    when 'blocked' then 'blocked'
    else 'in_progress'
  end;
  target_relationship_status := target_status;

  update public.provider_activations activation
  set status = target_status,
      ready_at = case when target_status = 'ready' then coalesce(activation.ready_at, now()) else activation.ready_at end,
      updated_at = now()
  where activation.organization_id = p_organization_id
    and activation.id = p_activation_id;

  update public.provider_relationships relationship
  set activation_status = target_relationship_status,
      primary_blocker = case
        when readiness_row.readiness_state = 'blocked' then readiness_row.blocker_requirement_codes[1]
        when readiness_row.readiness_state = 'not_configured' then 'activation_not_configured'
        else null
      end,
      updated_at = now()
  where relationship.organization_id = p_organization_id
    and relationship.id = activation_row.provider_relationship_id;

  if activation_row.status is distinct from target_status then
    insert into public.provider_activation_events (
      organization_id, activation_id, event_type, actor_type, actor_user_id, correlation_id, payload
    ) values (
      p_organization_id,
      p_activation_id,
      'activation_readiness_changed',
      normalized_actor_type,
      nullif(btrim(coalesce(p_actor_user_id, '')), ''),
      coalesce(p_correlation_id, gen_random_uuid()),
      jsonb_build_object(
        'previous_status', activation_row.status,
        'status', target_status,
        'readiness_state', readiness_row.readiness_state,
        'completion_percentage', readiness_row.completion_percentage,
        'blocker_requirement_codes', readiness_row.blocker_requirement_codes
      )
    );
  end if;

  return target_status;
end;
$$;

create or replace function public.provider_service_create_activation(
  p_organization_id uuid,
  p_provider_relationship_id uuid,
  p_activation_template_id uuid,
  p_activation_type text default 'initial',
  p_activation_owner_user_id text default null,
  p_actor_type text default 'user',
  p_actor_user_id text default null,
  p_correlation_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  relationship_row public.provider_relationships%rowtype;
  template_row public.provider_activation_templates%rowtype;
  activation_id uuid;
  normalized_activation_type text;
  normalized_actor_type text;
begin
  normalized_activation_type := lower(btrim(coalesce(p_activation_type, 'initial')));
  normalized_actor_type := lower(btrim(coalesce(p_actor_type, 'user')));

  if normalized_activation_type !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception 'Invalid Provider Service activation type.' using errcode = '22023';
  end if;
  if normalized_actor_type not in ('user', 'agent', 'system', 'integration') then
    raise exception 'Unsupported Provider Service actor type.' using errcode = '22023';
  end if;

  select relationship.* into relationship_row
  from public.provider_relationships relationship
  where relationship.organization_id = p_organization_id
    and relationship.id = p_provider_relationship_id
    and relationship.lifecycle_status <> 'offboarded'
  for update;

  if not found then
    raise exception 'Provider relationship not found or is offboarded.' using errcode = 'P0002';
  end if;

  select template.* into template_row
  from public.provider_activation_templates template
  where template.organization_id = p_organization_id
    and template.id = p_activation_template_id
    and template.legal_entity_id = relationship_row.legal_entity_id
    and template.status = 'published'
    and (template.effective_from is null or template.effective_from <= now())
    and (template.effective_to is null or template.effective_to > now());

  if not found then
    raise exception 'Published Provider Service activation template not found for this legal entity.' using errcode = 'P0002';
  end if;

  insert into public.provider_activations (
    organization_id, provider_relationship_id, legal_entity_id, activation_template_id,
    template_code_snapshot, template_name_snapshot, template_version_snapshot,
    activation_type, status, opened_by_user_id, activation_owner_user_id
  ) values (
    p_organization_id,
    p_provider_relationship_id,
    relationship_row.legal_entity_id,
    p_activation_template_id,
    template_row.template_code,
    template_row.template_name,
    template_row.version,
    normalized_activation_type,
    'in_progress',
    nullif(btrim(coalesce(p_actor_user_id, '')), ''),
    nullif(btrim(coalesce(p_activation_owner_user_id, '')), '')
  ) returning id into activation_id;

  insert into public.provider_activation_requirements (
    organization_id, activation_id, template_requirement_id, track_code, requirement_code,
    requirement_name, requirement_description, requirement_type, is_required, is_blocking,
    evidence_required, sequence_number, validity_days_snapshot, reviewer_role_code, state,
    owner_user_id, due_at, metadata
  )
  select
    template_requirement.organization_id,
    activation_id,
    template_requirement.id,
    template_requirement.track_code,
    template_requirement.requirement_code,
    template_requirement.requirement_name,
    template_requirement.requirement_description,
    template_requirement.requirement_type,
    template_requirement.is_required,
    template_requirement.is_blocking,
    template_requirement.evidence_required,
    template_requirement.sequence_number,
    template_requirement.default_validity_days,
    template_requirement.reviewer_role_code,
    'pending',
    nullif(btrim(coalesce(p_activation_owner_user_id, '')), ''),
    case when template_requirement.default_due_days is null
      then null
      else now() + make_interval(days => template_requirement.default_due_days)
    end,
    jsonb_build_object(
      'template_requirement_metadata', template_requirement.metadata,
      'snapshot_source', 'provider_service_create_activation'
    )
  from public.provider_activation_template_requirements template_requirement
  where template_requirement.organization_id = p_organization_id
    and template_requirement.activation_template_id = p_activation_template_id
  order by template_requirement.track_code, template_requirement.sequence_number, template_requirement.id;

  update public.provider_relationships relationship
  set activation_status = 'in_progress', primary_blocker = null, updated_at = now()
  where relationship.organization_id = p_organization_id
    and relationship.id = p_provider_relationship_id;

  insert into public.provider_activation_events (
    organization_id, activation_id, event_type, actor_type, actor_user_id, correlation_id, payload
  ) values (
    p_organization_id,
    activation_id,
    'activation_created',
    normalized_actor_type,
    nullif(btrim(coalesce(p_actor_user_id, '')), ''),
    coalesce(p_correlation_id, gen_random_uuid()),
    jsonb_build_object(
      'provider_relationship_id', p_provider_relationship_id,
      'legal_entity_id', relationship_row.legal_entity_id,
      'activation_template_id', p_activation_template_id,
      'template_code', template_row.template_code,
      'template_version', template_row.version,
      'activation_type', normalized_activation_type
    )
  );

  perform public.provider_service_refresh_activation_state(
    p_organization_id, activation_id, normalized_actor_type, p_actor_user_id, p_correlation_id
  );
  return activation_id;
end;
$$;

create or replace function public.provider_service_add_evidence_link(
  p_organization_id uuid,
  p_activation_requirement_id uuid,
  p_evidence_type text,
  p_source_system text,
  p_source_reference text,
  p_source_url text default null,
  p_actor_type text default 'user',
  p_actor_user_id text default null,
  p_correlation_id uuid default gen_random_uuid(),
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  activation_id uuid;
  evidence_id uuid;
  normalized_evidence_type text;
  normalized_source_system text;
  normalized_actor_type text;
begin
  normalized_evidence_type := lower(btrim(coalesce(p_evidence_type, '')));
  normalized_source_system := lower(btrim(coalesce(p_source_system, '')));
  normalized_actor_type := lower(btrim(coalesce(p_actor_type, 'user')));

  if normalized_evidence_type !~ '^[a-z][a-z0-9_]{1,63}$'
    or normalized_source_system !~ '^[a-z][a-z0-9_]{1,63}$'
    or nullif(btrim(coalesce(p_source_reference, '')), '') is null then
    raise exception 'Evidence type, source system, and source reference are required.' using errcode = '22023';
  end if;
  if normalized_actor_type not in ('user', 'agent', 'system', 'integration') then
    raise exception 'Unsupported Provider Service actor type.' using errcode = '22023';
  end if;

  select requirement.activation_id into activation_id
  from public.provider_activation_requirements requirement
  join public.provider_activations activation
    on activation.organization_id = requirement.organization_id
   and activation.id = requirement.activation_id
  where requirement.organization_id = p_organization_id
    and requirement.id = p_activation_requirement_id
    and activation.status in ('in_progress', 'under_review', 'blocked', 'ready');

  if not found then
    raise exception 'Open Provider Service requirement not found.' using errcode = 'P0002';
  end if;

  insert into public.provider_activation_evidence_links (
    organization_id, activation_id, activation_requirement_id, evidence_type,
    source_system, source_reference, source_url, status, metadata
  ) values (
    p_organization_id,
    activation_id,
    p_activation_requirement_id,
    normalized_evidence_type,
    normalized_source_system,
    btrim(p_source_reference),
    nullif(btrim(coalesce(p_source_url, '')), ''),
    'active',
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (organization_id, activation_requirement_id, source_system, source_reference)
  do update set
    evidence_type = excluded.evidence_type,
    source_url = coalesce(excluded.source_url, provider_activation_evidence_links.source_url),
    status = 'active',
    metadata = provider_activation_evidence_links.metadata || excluded.metadata,
    updated_at = now()
  returning id into evidence_id;

  insert into public.provider_activation_events (
    organization_id, activation_id, activation_requirement_id, event_type,
    actor_type, actor_user_id, correlation_id, payload
  ) values (
    p_organization_id,
    activation_id,
    p_activation_requirement_id,
    'evidence_linked',
    normalized_actor_type,
    nullif(btrim(coalesce(p_actor_user_id, '')), ''),
    coalesce(p_correlation_id, gen_random_uuid()),
    jsonb_build_object(
      'evidence_id', evidence_id,
      'evidence_type', normalized_evidence_type,
      'source_system', normalized_source_system,
      'source_reference', btrim(p_source_reference)
    )
  );

  return evidence_id;
end;
$$;
