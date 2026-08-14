-- Build 16: isolated inbound Gmail connection for Provider Service.
-- Purpose-bound to provider onboarding/service intake. No outbound Gmail scopes.

create table if not exists public.provider_gmail_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_entity_id uuid not null,
  mailbox_email text not null,
  purpose text not null default 'provider_onboarding',
  status text not null default 'not_connected',
  scopes text[] not null default '{}'::text[],
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  google_sub text,
  history_id text,
  watch_expiration_at timestamptz,
  last_sync_started_at timestamptz,
  last_sync_completed_at timestamptz,
  last_message_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_gmail_connections_entity_fkey
    foreign key (organization_id, legal_entity_id)
    references public.legal_entities(organization_id, id)
    on delete restrict,
  constraint provider_gmail_connections_unique
    unique (organization_id, legal_entity_id, mailbox_email),
  constraint provider_gmail_connections_mailbox_normalized
    check (mailbox_email = lower(btrim(mailbox_email)) and mailbox_email like '%@%'),
  constraint provider_gmail_connections_purpose_check
    check (purpose = 'provider_onboarding'),
  constraint provider_gmail_connections_status_check
    check (status in ('not_connected', 'connected', 'watching', 'revoked', 'error')),
  constraint provider_gmail_connections_readonly_scopes_check
    check (
      not scopes && array[
        'https://mail.google.com/',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.modify'
      ]::text[]
    )
);

create index if not exists provider_gmail_connections_scope_idx
  on public.provider_gmail_connections (organization_id, legal_entity_id, status, mailbox_email);
create index if not exists provider_gmail_connections_watch_idx
  on public.provider_gmail_connections (watch_expiration_at)
  where status = 'watching';

create table if not exists public.provider_gmail_oauth_states (
  state text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legal_entity_id uuid not null,
  mailbox_email text not null,
  requested_by_user_id text,
  requested_by_email text,
  redirect_after text not null default 'provider-gmail.html',
  expires_at timestamptz not null,
  used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint provider_gmail_oauth_states_entity_fkey
    foreign key (organization_id, legal_entity_id)
    references public.legal_entities(organization_id, id)
    on delete cascade,
  constraint provider_gmail_oauth_states_mailbox_normalized
    check (mailbox_email = lower(btrim(mailbox_email)) and mailbox_email like '%@%'),
  constraint provider_gmail_oauth_states_state_not_blank
    check (btrim(state) <> ''),
  constraint provider_gmail_oauth_states_expiry_check
    check (expires_at > created_at)
);

create index if not exists provider_gmail_oauth_states_expiry_idx
  on public.provider_gmail_oauth_states (expires_at)
  where used_at is null;

create table if not exists public.provider_gmail_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legal_entity_id uuid not null,
  connection_id uuid not null,
  sync_mode text not null,
  status text not null default 'running',
  start_history_id text,
  end_history_id text,
  discovered_message_count integer not null default 0,
  inserted_message_count integer not null default 0,
  duplicate_message_count integer not null default 0,
  inserted_attachment_count integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint provider_gmail_sync_runs_entity_fkey
    foreign key (organization_id, legal_entity_id)
    references public.legal_entities(organization_id, id)
    on delete restrict,
  constraint provider_gmail_sync_runs_connection_fkey
    foreign key (connection_id)
    references public.provider_gmail_connections(id)
    on delete restrict,
  constraint provider_gmail_sync_runs_mode_check
    check (sync_mode in ('recent', 'history')),
  constraint provider_gmail_sync_runs_status_check
    check (status in ('running', 'completed', 'failed')),
  constraint provider_gmail_sync_runs_counts_check
    check (
      discovered_message_count >= 0
      and inserted_message_count >= 0
      and duplicate_message_count >= 0
      and inserted_attachment_count >= 0
    ),
  constraint provider_gmail_sync_runs_completion_check
    check ((status = 'running' and completed_at is null) or (status <> 'running' and completed_at is not null)),
  constraint provider_gmail_sync_runs_error_check
    check (status <> 'failed' or nullif(btrim(coalesce(error_message, '')), '') is not null)
);

create index if not exists provider_gmail_sync_runs_connection_idx
  on public.provider_gmail_sync_runs (connection_id, started_at desc);

alter table public.provider_gmail_connections enable row level security;
alter table public.provider_gmail_oauth_states enable row level security;
alter table public.provider_gmail_sync_runs enable row level security;

revoke all on table public.provider_gmail_connections from public, anon, authenticated, service_role;
revoke all on table public.provider_gmail_oauth_states from public, anon, authenticated, service_role;
revoke all on table public.provider_gmail_sync_runs from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.provider_gmail_connections to service_role;
grant select, insert, update, delete on table public.provider_gmail_oauth_states to service_role;
grant select, insert, update on table public.provider_gmail_sync_runs to service_role;

comment on table public.provider_gmail_connections is
  'Build 16 isolated Provider Service Gmail intake credentials. Service-role only; read-only Gmail scopes enforced.';
comment on table public.provider_gmail_oauth_states is
  'Build 16 single-use OAuth state for Provider Service Gmail intake.';
comment on table public.provider_gmail_sync_runs is
  'Build 16 append-oriented audit of manual/incremental Gmail intake synchronization.';
