alter table public.provider_communication_messages add constraint provider_communication_messages_org_fkey foreign key (organization_id) references public.organizations(id) on delete restrict;
alter table public.provider_communication_messages add constraint provider_communication_messages_org_id_unique unique (organization_id, id);
alter table public.provider_communication_messages add constraint provider_communication_messages_thread_fkey foreign key (organization_id, thread_id) references public.provider_communication_threads(organization_id, id) on delete cascade;
alter table public.provider_communication_messages add constraint provider_communication_messages_external_unique unique (organization_id, channel, mailbox_reference, external_message_id);
