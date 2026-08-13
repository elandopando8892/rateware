alter table public.provider_communication_attachments
  add constraint provider_communication_attachments_message_entity_fkey
  foreign key (organization_id, message_id, legal_entity_id)
  references public.provider_communication_messages(organization_id, id, legal_entity_id)
  on delete cascade;
