create table if not exists public.google_chat_connections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  account_email text not null,
  provider text not null default 'google_chat',
  status text not null default 'not_connected'
    check (status in ('not_connected', 'connected', 'revoked', 'error')),
  scopes text[] not null default '{}'::text[],
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  google_sub text,
  default_space_name text,
  default_space_display_name text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  unique (owner_email, account_email)
);

create index if not exists google_chat_connections_owner_idx
  on public.google_chat_connections (owner_email, status);

create table if not exists public.google_chat_oauth_states (
  state text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  owner_user_id text,
  owner_email text not null,
  account_email text not null,
  redirect_after text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists google_chat_oauth_states_owner_idx
  on public.google_chat_oauth_states (owner_email, expires_at);

alter table public.google_chat_connections enable row level security;
alter table public.google_chat_oauth_states enable row level security;

create policy "authenticated users can read google chat connections"
  on public.google_chat_connections for select
  to authenticated
  using (true);

create policy "authenticated users can write google chat connections"
  on public.google_chat_connections for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read google chat oauth states"
  on public.google_chat_oauth_states for select
  to authenticated
  using (true);

create policy "authenticated users can write google chat oauth states"
  on public.google_chat_oauth_states for all
  to authenticated
  using (true)
  with check (true);
