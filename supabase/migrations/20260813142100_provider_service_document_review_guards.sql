-- Provider Service Build 3: immutable terminal extraction and review decisions.

create or replace function public.provider_service_guard_extraction_terminal_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('completed', 'failed', 'needs_review') then
    raise exception 'Completed Provider Service extraction attempts are immutable.' using errcode = '23514';
  end if;
  if new.organization_id is distinct from old.organization_id
    or new.document_version_id is distinct from old.document_version_id
    or new.extraction_type is distinct from old.extraction_type
    or new.extractor_type is distinct from old.extractor_type
    or new.extractor_name is distinct from old.extractor_name
    or new.started_at is distinct from old.started_at then
    raise exception 'Provider Service extraction identity is immutable.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.provider_service_guard_review_terminal_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.decision <> 'pending' then
    raise exception 'Completed Provider Service document reviews are immutable.' using errcode = '23514';
  end if;
  if new.organization_id is distinct from old.organization_id
    or new.document_version_id is distinct from old.document_version_id
    or new.review_type is distinct from old.review_type
    or new.created_at is distinct from old.created_at then
    raise exception 'Provider Service document review identity is immutable.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists provider_service_guard_extraction_terminal_state on public.provider_document_extractions;
create trigger provider_service_guard_extraction_terminal_state
before update on public.provider_document_extractions
for each row execute function public.provider_service_guard_extraction_terminal_state();

drop trigger if exists provider_service_guard_review_terminal_state on public.provider_document_reviews;
create trigger provider_service_guard_review_terminal_state
before update on public.provider_document_reviews
for each row execute function public.provider_service_guard_review_terminal_state();

revoke all on function public.provider_service_guard_extraction_terminal_state() from public, anon, authenticated;
revoke all on function public.provider_service_guard_review_terminal_state() from public, anon, authenticated;
