create or replace function public.provider_service_reject_portal_event_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'Provider portal events are append-only.' using errcode='23514';
end;
$$;
drop trigger if exists provider_service_reject_portal_event_mutation on public.provider_portal_events;
create trigger provider_service_reject_portal_event_mutation before update or delete on public.provider_portal_events for each row execute function public.provider_service_reject_portal_event_mutation();
