-- Provider Service Build 3: immutable document file provenance.

create or replace function public.provider_service_guard_document_version_file_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.provider_document_id is distinct from old.provider_document_id
    or new.provider_relationship_id is distinct from old.provider_relationship_id
    or new.legal_entity_id is distinct from old.legal_entity_id
    or new.version_number is distinct from old.version_number
    or new.original_filename is distinct from old.original_filename
    or new.storage_bucket is distinct from old.storage_bucket
    or new.storage_path is distinct from old.storage_path
    or new.mime_type is distinct from old.mime_type
    or new.file_size_bytes is distinct from old.file_size_bytes
    or new.file_sha256 is distinct from old.file_sha256
    or new.source_channel is distinct from old.source_channel
    or new.source_reference is distinct from old.source_reference
    or new.registered_by_actor_type is distinct from old.registered_by_actor_type
    or new.registered_by_user_id is distinct from old.registered_by_user_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Provider document file identity and provenance are immutable.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists provider_service_guard_document_version_file_identity on public.provider_document_versions;
create trigger provider_service_guard_document_version_file_identity
before update on public.provider_document_versions
for each row execute function public.provider_service_guard_document_version_file_identity();

revoke all on function public.provider_service_guard_document_version_file_identity() from public, anon, authenticated;
