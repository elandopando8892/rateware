alter table public.provider_sync_receipts add constraint provider_sync_receipts_command_fkey foreign key (organization_id,command_id) references public.provider_sync_commands(organization_id,id) on delete restrict;
alter table public.provider_sync_receipts add constraint provider_sync_receipts_status_check check (receipt_status in ('accepted','rejected','error'));
alter table public.provider_sync_receipts add constraint provider_sync_receipts_hash_check check (response_fingerprint is null or response_fingerprint ~ '^[0-9a-f]{64}$');
alter table public.provider_sync_receipts add constraint provider_sync_receipts_accepted_check check (receipt_status <> 'accepted' or nullif(btrim(coalesce(external_reference,'')),'') is not null);
alter table public.provider_sync_receipts add constraint provider_sync_receipts_error_check check (receipt_status <> 'error' or nullif(btrim(coalesce(error_message,'')),'') is not null);
create index if not exists provider_sync_receipts_command_idx on public.provider_sync_receipts (command_id,received_at desc,id desc);
