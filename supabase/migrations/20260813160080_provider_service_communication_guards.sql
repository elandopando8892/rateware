create or replace function public.provider_service_guard_communication_message_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.thread_id is distinct from old.thread_id
    or new.legal_entity_id is distinct from old.legal_entity_id
    or new.channel is distinct from old.channel
    or new.mailbox_reference is distinct from old.mailbox_reference
    or new.external_message_id is distinct from old.external_message_id
    or new.direction is distinct from old.direction
    or new.message_at is distinct from old.message_at then
    raise exception 'Provider communication message identity is immutable.' using errcode='23514';
  end if;
  return new;
end;
$$;

create or replace function public.provider_service_reject_communication_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Provider communication events are append-only.' using errcode='23514';
end;
$$;

drop trigger if exists provider_service_guard_communication_message_identity on public.provider_communication_messages;
create trigger provider_service_guard_communication_message_identity before update on public.provider_communication_messages for each row execute function public.provider_service_guard_communication_message_identity();

drop trigger if exists provider_service_reject_communication_event_mutation on public.provider_communication_events;
create trigger provider_service_reject_communication_event_mutation before update or delete on public.provider_communication_events for each row execute function public.provider_service_reject_communication_event_mutation();
