-- Provider Service Build 2: controlled activation commands and immutability guards.

create or replace function public.provider_service_requirement_transition_allowed(
  p_from_state text,
  p_to_state text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case lower(coalesce(p_from_state, ''))
    when 'pending' then lower(coalesce(p_to_state, '')) = any (
      array['pending', 'in_progress', 'submitted', 'under_review', 'passed', 'failed', 'not_applicable']
    )
    when 'in_progress' then lower(coalesce(p_to_state, '')) = any (
      array['in_progress', 'submitted', 'under_review', 'passed', 'failed', 'correction_required', 'expired', 'not_applicable']
    )
    when 'submitted' then lower(coalesce(p_to_state, '')) = any (
      array['submitted', 'in_progress', 'under_review', 'passed', 'failed', 'correction_required', 'expired']
    )
    when 'under_review' then lower(coalesce(p_to_state, '')) = any (
      array['under_review', 'in_progress', 'passed', 'failed', 'correction_required', 'expired', 'not_applicable']
    )
    when 'passed' then lower(coalesce(p_to_state, '')) = any (
      array['passed', 'under_review', 'correction_required', 'expired']
    )
    when 'failed' then lower(coalesce(p_to_state, '')) = any (
      array['failed', 'in_progress', 'submitted', 'under_review', 'passed', 'correction_required', 'expired']
    )
    when 'correction_required' then lower(coalesce(p_to_state, '')) = any (
      array['correction_required', 'in_progress', 'submitted', 'under_review', 'passed', 'failed', 'expired']
    )
    when 'expired' then lower(coalesce(p_to_state, '')) = any (
      array['expired', 'in_progress', 'submitted', 'under_review', 'passed', 'not_applicable']
    )
    when 'not_applicable' then lower(coalesce(p_to_state, '')) = any (
      array['not_applicable', 'pending', 'under_review']
    )
    else false
  end;
$$;

create or replace function public.provider_service_guard_template_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Published or retired Provider Service templates are immutable.'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if old.status = 'retired' then
    raise exception 'Retired Provider Service templates are immutable.'
      using errcode = '23514';
  end if;

  if old.status = 'published' then
    if new.status not in ('published', 'retired') then
      raise exception 'A published Provider Service template can only remain published or be retired.'
        using errcode = '23514';
    end if;

    if new.organization_id is distinct from old.organization_id
      or new.legal_entity_id is distinct from old.legal_entity_id
      or new.template_code is distinct from old.template_code
      or new.template_name is distinct from old.template_name
      or new.version is distinct from old.version
      or new.effective_from is distinct from old.effective_from
      or new.effective_to is distinct from old.effective_to
      or new.published_at is distinct from old.published_at
      or new.published_by_user_id is distinct from old.published_by_user_id
      or new.metadata is distinct from old.metadata then
      raise exception 'Published Provider Service template identity and content cannot be edited.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.provider_service_guard_template_requirement_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  target_template_id uuid;
  target_organization_id uuid;
  template_status text;
begin
  if tg_op = 'DELETE' then
    target_template_id := old.activation_template_id;
    target_organization_id := old.organization_id;
  else
    target_template_id := new.activation_template_id;
    target_organization_id := new.organization_id;
  end if;

  select template.status
    into template_status
  from public.provider_activation_templates template
  where template.organization_id = target_organization_id
    and template.id = target_template_id;

  if template_status is not null and template_status <> 'draft' then
    raise exception 'Requirements for a published or retired Provider Service template are immutable.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.provider_service_guard_activation_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.provider_relationship_id is distinct from old.provider_relationship_id
    or new.legal_entity_id is distinct from old.legal_entity_id
    or new.activation_template_id is distinct from old.activation_template_id
    or new.template_code_snapshot is distinct from old.template_code_snapshot
    or new.template_name_snapshot is distinct from old.template_name_snapshot
    or new.template_version_snapshot is distinct from old.template_version_snapshot
    or new.activation_type is distinct from old.activation_type
    or new.opened_at is distinct from old.opened_at then
    raise exception 'Provider activation identity and template snapshot are immutable.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.provider_service_guard_requirement_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.activation_id is distinct from old.activation_id
    or new.template_requirement_id is distinct from old.template_requirement_id
    or new.track_code is distinct from old.track_code
    or new.requirement_code is distinct from old.requirement_code
    or new.requirement_name is distinct from old.requirement_name
    or new.requirement_description is distinct from old.requirement_description
    or new.requirement_type is distinct from old.requirement_type
    or new.is_required is distinct from old.is_required
    or new.is_blocking is distinct from old.is_blocking
    or new.evidence_required is distinct from old.evidence_required
    or new.sequence_number is distinct from old.sequence_number
    or new.validity_days_snapshot is distinct from old.validity_days_snapshot
    or new.reviewer_role_code is distinct from old.reviewer_role_code then
    raise exception 'Provider activation requirement snapshot is immutable.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.provider_service_reject_activation_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Provider activation events are append-only.'
    using errcode = '23514';
end;
$$;

drop trigger if exists provider_service_guard_template_mutation
  on public.provider_activation_templates;
create trigger provider_service_guard_template_mutation
before update or delete on public.provider_activation_templates
for each row execute function public.provider_service_guard_template_mutation();

drop trigger if exists provider_service_guard_template_requirement_mutation
  on public.provider_activation_template_requirements;
create trigger provider_service_guard_template_requirement_mutation
before insert or update or delete on public.provider_activation_template_requirements
for each row execute function public.provider_service_guard_template_requirement_mutation();

drop trigger if exists provider_service_guard_activation_identity
  on public.provider_activations;
create trigger provider_service_guard_activation_identity
before update on public.provider_activations
for each row execute function public.provider_service_guard_activation_identity();

drop trigger if exists provider_service_guard_requirement_snapshot
  on public.provider_activation_requirements;
create trigger provider_service_guard_requirement_snapshot
before update on public.provider_activation_requirements
for each row execute function public.provider_service_guard_requirement_snapshot();

drop trigger if exists provider_service_reject_activation_event_mutation
  on public.provider_activation_events;
create trigger provider_service_reject_activation_event_mutation
before update or delete on public.provider_activation_events
for each row execute function public.provider_service_reject_activation_event_mutation();
