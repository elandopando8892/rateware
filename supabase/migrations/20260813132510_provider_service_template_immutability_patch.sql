-- Provider Service Build 2: strengthen published-template immutability.

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
      or new.metadata is distinct from old.metadata
      or (new.status = 'published' and new.retired_at is distinct from old.retired_at) then
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
  old_template_status text;
  new_template_status text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select template.status
      into old_template_status
    from public.provider_activation_templates template
    where template.organization_id = old.organization_id
      and template.id = old.activation_template_id;

    if old_template_status is not null and old_template_status <> 'draft' then
      raise exception 'Requirements for a published or retired Provider Service template are immutable.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select template.status
      into new_template_status
    from public.provider_activation_templates template
    where template.organization_id = new.organization_id
      and template.id = new.activation_template_id;

    if new_template_status is not null and new_template_status <> 'draft' then
      raise exception 'Requirements can be written only to a draft Provider Service template.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.provider_service_guard_template_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.provider_service_guard_template_requirement_mutation()
  from public, anon, authenticated, service_role;
