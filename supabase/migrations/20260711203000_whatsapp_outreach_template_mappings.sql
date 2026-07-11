create table if not exists public.whatsapp_outreach_template_mappings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  organization_id text,
  whatsapp_connection_id uuid not null
    references public.whatsapp_business_connections(id) on delete cascade,
  outreach_template_id uuid not null
    references public.outreach_templates(id) on delete cascade,
  meta_template_id text,
  meta_template_name text not null,
  meta_template_language text not null default 'en_US',
  meta_template_category text not null default 'UTILITY',
  meta_template_status text not null default 'not_published',
  source_fingerprint text,
  source_placeholders text[] not null default '{}'::text[],
  meta_template_components jsonb not null default '[]'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  unique (whatsapp_connection_id, outreach_template_id)
);

create index if not exists whatsapp_outreach_template_mappings_workspace_idx
  on public.whatsapp_outreach_template_mappings (organization_id, owner_email, updated_at desc);

create index if not exists whatsapp_outreach_template_mappings_meta_idx
  on public.whatsapp_outreach_template_mappings (whatsapp_connection_id, meta_template_name, meta_template_language);

alter table public.whatsapp_outreach_template_mappings enable row level security;

create policy "workspace users can read whatsapp outreach mappings"
  on public.whatsapp_outreach_template_mappings for select
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

create policy "workspace users can insert whatsapp outreach mappings"
  on public.whatsapp_outreach_template_mappings for insert
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

create policy "workspace users can update whatsapp outreach mappings"
  on public.whatsapp_outreach_template_mappings for update
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

create policy "workspace users can delete whatsapp outreach mappings"
  on public.whatsapp_outreach_template_mappings for delete
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
