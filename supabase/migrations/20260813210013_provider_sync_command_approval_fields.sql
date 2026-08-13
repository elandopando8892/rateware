-- Provider Service Build 10: sync-command approval and retry metadata.
alter table public.provider_sync_commands add column sensitivity text not null default 'internal';
alter table public.provider_sync_commands add column approval_request_id uuid;
alter table public.provider_sync_commands add column correlation_id uuid not null default gen_random_uuid();
alter table public.provider_sync_commands add column requested_by_actor_type text not null default 'system';
alter table public.provider_sync_commands add column requested_by_user_id text;
alter table public.provider_sync_commands add column next_attempt_at timestamptz;
alter table public.provider_sync_commands add column last_attempt_at timestamptz;
alter table public.provider_sync_commands add column completed_at timestamptz;
alter table public.provider_sync_commands add column last_error text;

alter table public.provider_sync_commands
  add constraint provider_sync_commands_approval_fkey
  foreign key (organization_id,approval_request_id,provider_relationship_id,legal_entity_id)
  references public.provider_approval_requests(organization_id,id,provider_relationship_id,legal_entity_id)
  on delete restrict;

alter table public.provider_sync_commands
  add constraint provider_sync_commands_sensitivity_check
  check (sensitivity in ('public','internal','confidential','restricted','highly_restricted'));

alter table public.provider_sync_commands
  add constraint provider_sync_commands_actor_check
  check (requested_by_actor_type in ('user','agent','system','integration'));

alter table public.provider_sync_commands
  add constraint provider_sync_commands_restricted_approval_check
  check (sensitivity not in ('restricted','highly_restricted') or approval_request_id is not null);

alter table public.provider_sync_commands
  add constraint provider_sync_commands_terminal_time_check
  check (status not in ('succeeded','failed','cancelled') or completed_at is not null);

alter table public.provider_sync_commands
  add constraint provider_sync_commands_error_check
  check (status <> 'failed' or nullif(btrim(coalesce(last_error,'')),'') is not null);

create index if not exists provider_sync_commands_worker_idx
  on public.provider_sync_commands (organization_id,status,next_attempt_at,created_at,id)
  where status in ('pending','processing');
