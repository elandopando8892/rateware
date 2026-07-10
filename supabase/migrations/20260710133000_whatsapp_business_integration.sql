create table if not exists public.whatsapp_business_connections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  provider text not null default 'meta' check (provider in ('meta')),
  connection_mode text not null default 'internal_managed'
    check (connection_mode in ('internal_managed', 'tenant_connected', 'manual_setup')),
  status text not null default 'not_configured'
    check (status in ('not_configured', 'connected', 'revoked', 'error', 'manual_setup')),
  phone_number_id text,
  display_phone_number text,
  verified_name text,
  business_account_id text,
  waba_id text,
  graph_api_version text,
  scopes text[] not null default '{}'::text[],
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  webhook_verified_at timestamptz,
  templates_last_synced_at timestamptz,
  quality_rating text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  unique (owner_email, provider, connection_mode)
);

create index if not exists whatsapp_business_connections_owner_idx
  on public.whatsapp_business_connections (owner_email, status);

create unique index if not exists whatsapp_business_connections_unique_idx
  on public.whatsapp_business_connections (owner_email, provider, connection_mode);

create table if not exists public.vendor_whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  vendor_id uuid references public.vendors(id) on delete cascade,
  contact_name text,
  phone_e164 text not null,
  label text,
  permission_basis text not null default 'contractual'
    check (permission_basis in ('contractual', 'consent', 'manual', 'unknown')),
  do_not_contact boolean not null default false,
  is_primary boolean not null default false,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'invalid', 'blocked')),
  source text not null default 'crm',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists vendor_whatsapp_contacts_vendor_idx
  on public.vendor_whatsapp_contacts (vendor_id, status);

create unique index if not exists vendor_whatsapp_contacts_unique_phone_idx
  on public.vendor_whatsapp_contacts (owner_email, vendor_id, phone_e164);

create table if not exists public.vendor_whatsapp_groups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  vendor_id uuid references public.vendors(id) on delete cascade,
  group_name text,
  group_url text,
  meta_group_id text,
  verification_status text not null default 'manual_only'
    check (verification_status in ('pending', 'manual_only', 'api_ready', 'verified', 'blocked', 'error')),
  permission_basis text not null default 'contractual'
    check (permission_basis in ('contractual', 'consent', 'manual', 'unknown')),
  do_not_contact boolean not null default false,
  last_verified_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists vendor_whatsapp_groups_vendor_idx
  on public.vendor_whatsapp_groups (vendor_id, verification_status);

create unique index if not exists vendor_whatsapp_groups_unique_idx
  on public.vendor_whatsapp_groups (owner_email, vendor_id, coalesce(meta_group_id, group_url, group_name));

alter table public.vendors
  add column if not exists whatsapp_permission_basis text not null default 'contractual',
  add column if not exists whatsapp_do_not_contact boolean not null default false,
  add column if not exists whatsapp_opt_in_status text not null default 'contractual',
  add column if not exists whatsapp_last_verified_at timestamptz,
  add column if not exists whatsapp_group_url text,
  add column if not exists whatsapp_group_name text,
  add column if not exists whatsapp_meta_group_id text,
  add column if not exists whatsapp_group_status text not null default 'manual_only',
  add column if not exists whatsapp_notes text;

alter table public.vendors
  drop constraint if exists vendors_preferred_channel_check,
  add constraint vendors_preferred_channel_check
  check (preferred_channel in ('email', 'whatsapp', 'whatsapp_group', 'multi', 'portal'));

alter table public.vendors
  drop constraint if exists vendors_whatsapp_permission_basis_check,
  add constraint vendors_whatsapp_permission_basis_check
  check (whatsapp_permission_basis in ('contractual', 'consent', 'manual', 'unknown'));

alter table public.vendors
  drop constraint if exists vendors_whatsapp_opt_in_status_check,
  add constraint vendors_whatsapp_opt_in_status_check
  check (whatsapp_opt_in_status in ('contractual', 'opted_in', 'manual', 'unknown', 'opted_out'));

alter table public.vendors
  drop constraint if exists vendors_whatsapp_group_status_check,
  add constraint vendors_whatsapp_group_status_check
  check (whatsapp_group_status in ('pending', 'manual_only', 'api_ready', 'verified', 'blocked', 'error'));

create index if not exists vendors_whatsapp_channel_idx
  on public.vendors (owner_email, preferred_channel, whatsapp_do_not_contact);

alter table public.outreach_templates
  add column if not exists whatsapp_group_body text,
  add column if not exists meta_template_name text,
  add column if not exists meta_template_language text,
  add column if not exists meta_template_namespace text,
  add column if not exists meta_template_status text,
  add column if not exists meta_template_category text,
  add column if not exists meta_template_components jsonb not null default '[]'::jsonb;

alter table public.outreach_templates
  drop constraint if exists outreach_templates_channel_check,
  add constraint outreach_templates_channel_check
  check (channel in ('email', 'whatsapp', 'whatsapp_group', 'multi', 'email_whatsapp', 'email_whatsapp_group', 'whatsapp_direct_group'));

alter table public.outreach_campaigns
  add column if not exists whatsapp_target_mode text not null default 'direct_vendor',
  add column if not exists group_delivery_policy text not null default 'manual_or_api',
  add column if not exists whatsapp_connection_id uuid references public.whatsapp_business_connections(id) on delete set null;

alter table public.outreach_campaigns
  drop constraint if exists outreach_campaigns_channel_check,
  add constraint outreach_campaigns_channel_check
  check (channel in ('email', 'whatsapp', 'whatsapp_group', 'multi', 'email_whatsapp', 'email_whatsapp_group', 'whatsapp_direct_group'));

alter table public.outreach_campaigns
  drop constraint if exists outreach_campaigns_whatsapp_target_mode_check,
  add constraint outreach_campaigns_whatsapp_target_mode_check
  check (whatsapp_target_mode in ('direct_vendor', 'vendor_group', 'direct_and_group'));

alter table public.outreach_campaigns
  drop constraint if exists outreach_campaigns_group_delivery_policy_check,
  add constraint outreach_campaigns_group_delivery_policy_check
  check (group_delivery_policy in ('manual_only', 'api_only', 'manual_or_api'));

alter table public.outreach_messages
  add column if not exists whatsapp_target_mode text,
  add column if not exists whatsapp_connection_id uuid references public.whatsapp_business_connections(id) on delete set null,
  add column if not exists normalized_recipient_phone text,
  add column if not exists vendor_whatsapp_group_id uuid references public.vendor_whatsapp_groups(id) on delete set null,
  add column if not exists provider text,
  add column if not exists meta_whatsapp_group_id text,
  add column if not exists whatsapp_body text,
  add column if not exists whatsapp_template_name text,
  add column if not exists whatsapp_template_language text,
  add column if not exists delivery_status text,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists manual_sent_at timestamptz,
  add column if not exists manual_sent_by text;

alter table public.outreach_messages
  drop constraint if exists outreach_messages_channel_check,
  add constraint outreach_messages_channel_check
  check (channel in ('email', 'whatsapp', 'whatsapp_group'));

alter table public.outreach_messages
  drop constraint if exists outreach_messages_status_check,
  add constraint outreach_messages_status_check
  check (status in ('drafted', 'queued', 'sent', 'delivered', 'read', 'replied', 'failed', 'bounced', 'manual_sent', 'archived'));

alter table public.outreach_messages
  drop constraint if exists outreach_messages_whatsapp_target_mode_check,
  add constraint outreach_messages_whatsapp_target_mode_check
  check (whatsapp_target_mode is null or whatsapp_target_mode in ('direct_vendor', 'vendor_group', 'direct_and_group'));

create index if not exists outreach_messages_whatsapp_idx
  on public.outreach_messages (owner_email, channel, status, updated_at desc)
  where channel in ('whatsapp', 'whatsapp_group');

create index if not exists outreach_messages_whatsapp_provider_idx
  on public.outreach_messages (provider_message_id)
  where provider_message_id is not null;

create index if not exists outreach_messages_whatsapp_group_idx
  on public.outreach_messages (vendor_whatsapp_group_id, status);

alter table public.contact_history
  drop constraint if exists contact_history_channel_check,
  add constraint contact_history_channel_check
  check (channel in ('email', 'whatsapp', 'whatsapp_group', 'phone', 'portal', 'other'));

alter table public.whatsapp_business_connections enable row level security;
alter table public.vendor_whatsapp_contacts enable row level security;
alter table public.vendor_whatsapp_groups enable row level security;

create policy "authenticated users can read whatsapp connections"
  on public.whatsapp_business_connections for select
  to authenticated
  using (true);

create policy "authenticated users can write whatsapp connections"
  on public.whatsapp_business_connections for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read vendor whatsapp contacts"
  on public.vendor_whatsapp_contacts for select
  to authenticated
  using (true);

create policy "authenticated users can write vendor whatsapp contacts"
  on public.vendor_whatsapp_contacts for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read vendor whatsapp groups"
  on public.vendor_whatsapp_groups for select
  to authenticated
  using (true);

create policy "authenticated users can write vendor whatsapp groups"
  on public.vendor_whatsapp_groups for all
  to authenticated
  using (true)
  with check (true);
