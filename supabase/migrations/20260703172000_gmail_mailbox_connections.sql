create table if not exists gmail_mailbox_connections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  mailbox_email text not null,
  provider text not null default 'gmail',
  status text not null default 'not_connected' check (status in ('not_connected', 'connected', 'revoked', 'error')),
  scopes text[] not null default '{}'::text[],
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  google_sub text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  unique (owner_email, mailbox_email)
);

create index if not exists gmail_mailbox_connections_owner_idx
  on gmail_mailbox_connections (owner_email, status);

create table if not exists gmail_oauth_states (
  state text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  owner_user_id text,
  owner_email text not null,
  mailbox_email text not null,
  redirect_after text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists gmail_oauth_states_owner_idx
  on gmail_oauth_states (owner_email, expires_at);
