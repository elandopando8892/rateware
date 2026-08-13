-- Every message inherits the immutable XBF legal entity of its thread.
alter table public.provider_communication_messages
  add column legal_entity_id uuid not null;

alter table public.provider_communication_messages
  add constraint provider_communication_messages_org_id_entity_unique
  unique (organization_id, id, legal_entity_id);

alter table public.provider_communication_messages
  add constraint provider_communication_messages_thread_entity_fkey
  foreign key (organization_id, thread_id, legal_entity_id)
  references public.provider_communication_threads(organization_id, id, legal_entity_id)
  on delete cascade;
