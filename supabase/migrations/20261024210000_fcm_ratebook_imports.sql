-- Bandeja de tarifas en revisión que entrega Fr8Quote (contrato fr8quote.rateware-rate.v1, docs/contrato-rateware-v0.md
-- en Fr8Quote). Llegan por la entrada firmada de quotedesk-api (op «ratebook_import»), quedan pending_review y nada se
-- publica ni se promueve: no toca rate_staging, rfx_ratebooks ni quotedesk_quotes. Solo service_role.
create table if not exists public.fcm_ratebook_imports (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_email text not null,
  organization_id text,
  idempotency_key text not null,
  contract_version text not null,
  source_system text not null default 'fr8quote',
  source_organization_id text,
  source_quote_id text not null,
  source_quote_version int,
  payload_checksum text not null,
  payload jsonb not null,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected', 'superseded')),
  reviewed_at timestamptz,
  reviewed_by_email text,
  review_note text,
  unique (owner_email, idempotency_key)
);
create index if not exists fcm_ratebook_imports_quote on public.fcm_ratebook_imports (owner_email, source_quote_id, status);
alter table public.fcm_ratebook_imports enable row level security;
revoke all on public.fcm_ratebook_imports from anon, authenticated;
grant all on public.fcm_ratebook_imports to service_role;

comment on table public.fcm_ratebook_imports is
  'Fr8Quote: tarifas en revisión (fr8quote.rateware-rate.v1) recibidas por quotedesk-api. Service role only; no se promueven a ningún objeto productivo.';
