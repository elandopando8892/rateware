-- Provider Service Build 3: document events are append-only.

create or replace function public.provider_service_reject_document_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Provider document events are append-only.' using errcode = '23514';
end;
$$;

drop trigger if exists provider_service_reject_document_event_mutation on public.provider_document_events;
create trigger provider_service_reject_document_event_mutation
before update or delete on public.provider_document_events
for each row execute function public.provider_service_reject_document_event_mutation();

revoke all on function public.provider_service_reject_document_event_mutation() from public, anon, authenticated;
