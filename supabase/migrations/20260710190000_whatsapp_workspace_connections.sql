alter table public.whatsapp_business_connections
  add column if not exists organization_id text,
  add column if not exists meta_business_id text,
  add column if not exists meta_waba_id text,
  add column if not exists meta_phone_number_id text,
  add column if not exists webhook_verify_token_encrypted text;

update public.whatsapp_business_connections
set
  meta_business_id = coalesce(meta_business_id, business_account_id),
  meta_waba_id = coalesce(meta_waba_id, waba_id),
  meta_phone_number_id = coalesce(meta_phone_number_id, phone_number_id)
where
  meta_business_id is null
  or meta_waba_id is null
  or meta_phone_number_id is null;

create index if not exists whatsapp_business_connections_workspace_idx
  on public.whatsapp_business_connections (organization_id, provider, connection_mode, status);

create unique index if not exists whatsapp_business_connections_org_mode_unique_idx
  on public.whatsapp_business_connections (organization_id, provider, connection_mode)
  where organization_id is not null;

create unique index if not exists whatsapp_business_connections_meta_phone_unique_idx
  on public.whatsapp_business_connections (meta_phone_number_id)
  where meta_phone_number_id is not null and status <> 'revoked';

create index if not exists whatsapp_business_connections_meta_waba_idx
  on public.whatsapp_business_connections (meta_waba_id, status)
  where meta_waba_id is not null;

alter table public.contact_history
  add column if not exists whatsapp_connection_id uuid
    references public.whatsapp_business_connections(id) on delete set null;

create index if not exists contact_history_whatsapp_connection_idx
  on public.contact_history (whatsapp_connection_id, occurred_at desc)
  where whatsapp_connection_id is not null;

drop policy if exists "authenticated users can read whatsapp connections"
  on public.whatsapp_business_connections;
drop policy if exists "authenticated users can write whatsapp connections"
  on public.whatsapp_business_connections;

create policy "workspace users can read whatsapp connections"
  on public.whatsapp_business_connections for select
  to authenticated
  using (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (
      organization_id is not null
      and organization_id = coalesce(
        auth.jwt() ->> 'org_code',
        auth.jwt() ->> 'organization_id',
        auth.jwt() ->> 'org_id'
      )
    )
  );

create policy "workspace users can insert whatsapp connections"
  on public.whatsapp_business_connections for insert
  to authenticated
  with check (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (
      organization_id is not null
      and organization_id = coalesce(
        auth.jwt() ->> 'org_code',
        auth.jwt() ->> 'organization_id',
        auth.jwt() ->> 'org_id'
      )
    )
  );

create policy "workspace users can update whatsapp connections"
  on public.whatsapp_business_connections for update
  to authenticated
  using (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (
      organization_id is not null
      and organization_id = coalesce(
        auth.jwt() ->> 'org_code',
        auth.jwt() ->> 'organization_id',
        auth.jwt() ->> 'org_id'
      )
    )
  )
  with check (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (
      organization_id is not null
      and organization_id = coalesce(
        auth.jwt() ->> 'org_code',
        auth.jwt() ->> 'organization_id',
        auth.jwt() ->> 'org_id'
      )
    )
  );

create policy "workspace users can delete whatsapp connections"
  on public.whatsapp_business_connections for delete
  to authenticated
  using (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (
      organization_id is not null
      and organization_id = coalesce(
        auth.jwt() ->> 'org_code',
        auth.jwt() ->> 'organization_id',
        auth.jwt() ->> 'org_id'
      )
    )
  );
