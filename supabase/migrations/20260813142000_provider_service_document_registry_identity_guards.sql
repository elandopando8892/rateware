-- Provider Service Build 3: document identity guards.

create or replace function public.provider_service_guard_document_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.provider_relationship_id is distinct from old.provider_relationship_id
    or new.legal_entity_id is distinct from old.legal_entity_id
    or new.document_type is distinct from old.document_type
    or new.document_key is distinct from old.document_key then
    raise exception 'Provider document identity is immutable.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists provider_service_guard_document_identity on public.provider_documents;
create trigger provider_service_guard_document_identity
before update on public.provider_documents
for each row execute function public.provider_service_guard_document_identity();

revoke all on function public.provider_service_guard_document_identity() from public, anon, authenticated;
