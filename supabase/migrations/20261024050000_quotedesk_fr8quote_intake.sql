-- Entrada de Fr8Quote a QuoteDesk (contrato fr8quote.quotedesk.v1): bitácora idempotente de entregas y el secreto
-- HMAC compartido desde Vault (fr8quote_quotedesk_secret). El proyecto está en el límite de secretos de Edge Functions.
create table if not exists public.quotedesk_fr8quote_imports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  organization_id text,
  idempotency_key text not null,
  payload_checksum text not null,
  status text not null check (status in ('processing', 'done', 'failed')),
  exported_by text,
  receipt jsonb,
  error text,
  unique (owner_email, idempotency_key)
);
alter table public.quotedesk_fr8quote_imports enable row level security;
revoke all on public.quotedesk_fr8quote_imports from anon, authenticated;

create or replace function public.quotedesk_fr8quote_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'fr8quote_quotedesk_secret'
  order by updated_at desc nulls last
  limit 1;
$$;

revoke all on function public.quotedesk_fr8quote_secret() from public, anon, authenticated;
grant execute on function public.quotedesk_fr8quote_secret() to service_role;

comment on function public.quotedesk_fr8quote_secret() is
  'Bidware QuoteDesk: secreto HMAC de la entrada de Fr8Quote desde Vault (name fr8quote_quotedesk_secret). Service role only.';
