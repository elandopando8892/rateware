alter table public.whatsapp_business_connections
  add column if not exists meta_app_id text,
  add column if not exists app_secret_encrypted text;

create index if not exists whatsapp_business_connections_meta_app_idx
  on public.whatsapp_business_connections (meta_app_id)
  where meta_app_id is not null and status <> 'revoked';
