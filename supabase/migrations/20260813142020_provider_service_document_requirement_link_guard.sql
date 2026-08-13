-- Provider Service Build 3 requirement-link guard.

create or replace function public.provider_service_guard_requirement_link_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.provider_relationship_id is distinct from old.provider_relationship_id
    or new.legal_entity_id is distinct from old.legal_entity_id
    or new.activation_id is distinct from old.activation_id
    or new.activation_requirement_id is distinct from old.activation_requirement_id
    or new.document_version_id is distinct from old.document_version_id
    or new.link_role is distinct from old.link_role then
    raise exception 'Provider document requirement link identity is immutable.' using errcode = '23514';
  end if;
  return new;
end;
$$;
