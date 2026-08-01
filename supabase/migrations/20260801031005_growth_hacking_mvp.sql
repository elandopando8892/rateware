-- Growth Hacking extends Shipper CRM; it does not create a second customer master.
-- Campaigns prepare/export outreach, but this schema intentionally has no send queue.

alter table public.shippers
  add column if not exists linkedin_url text,
  add column if not exists employee_count integer,
  add column if not exists annual_revenue numeric,
  add column if not exists account_type text not null default 'unknown',
  add column if not exists data_status text not null default 'needs_review',
  add column if not exists logistics_fit text[] not null default '{}'::text[],
  add column if not exists source_file_name text,
  add column if not exists source_list_name text,
  add column if not exists imported_at timestamptz,
  add column if not exists original_row_json jsonb not null default '{}'::jsonb;

alter table public.shippers
  drop constraint if exists shippers_account_type_check,
  add constraint shippers_account_type_check
    check (account_type in ('shipper', 'carrier', 'broker_forwarder', 'vendor', 'unknown')),
  drop constraint if exists shippers_data_status_check,
  add constraint shippers_data_status_check
    check (data_status in ('ready', 'needs_review', 'duplicate', 'excluded', 'not_shipper')),
  drop constraint if exists shippers_employee_count_check,
  add constraint shippers_employee_count_check
    check (employee_count is null or employee_count >= 0),
  drop constraint if exists shippers_annual_revenue_check,
  add constraint shippers_annual_revenue_check
    check (annual_revenue is null or annual_revenue >= 0);

alter table public.shipper_contacts
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists linkedin_url text,
  add column if not exists persona text,
  add column if not exists buying_role text,
  add column if not exists email_quality text not null default 'unknown',
  add column if not exists data_status text not null default 'needs_review',
  add column if not exists source_file_name text,
  add column if not exists source_list_name text,
  add column if not exists imported_at timestamptz,
  add column if not exists original_row_json jsonb not null default '{}'::jsonb;

alter table public.shipper_contacts
  drop constraint if exists shipper_contacts_email_quality_check,
  add constraint shipper_contacts_email_quality_check
    check (email_quality in ('valid', 'generic', 'invalid', 'missing', 'unknown')),
  drop constraint if exists shipper_contacts_data_status_check,
  add constraint shipper_contacts_data_status_check
    check (data_status in ('ready', 'needs_review', 'duplicate', 'excluded', 'not_shipper'));

create table if not exists public.growth_segments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  organization_id text,
  name text not null,
  description text,
  criteria jsonb not null default '{}'::jsonb,
  account_count integer not null default 0 check (account_count >= 0),
  contact_count integer not null default 0 check (contact_count >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'used', 'archived')),
  last_previewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.growth_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  organization_id text,
  segment_id uuid references public.growth_segments(id) on delete set null,
  name text not null,
  objective text not null default 'start_conversation',
  offer_hook text,
  channels text[] not null default array['email']::text[],
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'exported', 'launched', 'completed', 'archived')),
  exported_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.growth_campaign_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  organization_id text,
  campaign_id uuid not null references public.growth_campaigns(id) on delete cascade,
  shipper_id uuid not null references public.shippers(id) on delete cascade,
  contact_id uuid references public.shipper_contacts(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'exported', 'contacted', 'replied', 'interested', 'not_interested', 'wrong_person', 'referral', 'send_info', 'meeting_booked', 'rfq', 'opportunity', 'unsubscribed', 'bounced', 'excluded', 'do_not_contact')),
  last_activity_at timestamptz,
  result_notes text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.growth_campaign_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  organization_id text,
  campaign_id uuid not null references public.growth_campaigns(id) on delete cascade,
  step_type text not null default 'email_1'
    check (step_type in ('email_1', 'follow_up_1', 'follow_up_2', 'linkedin_note', 'call_script', 'whatsapp_message', 'custom')),
  channel text not null default 'email'
    check (channel in ('email', 'linkedin', 'call', 'whatsapp')),
  variant text not null default 'A',
  subject text,
  body text not null default '',
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.growth_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  organization_id text,
  campaign_id uuid references public.growth_campaigns(id) on delete set null,
  campaign_member_id uuid references public.growth_campaign_members(id) on delete set null,
  shipper_id uuid not null references public.shippers(id) on delete cascade,
  contact_id uuid references public.shipper_contacts(id) on delete set null,
  outcome text not null default 'no_response'
    check (outcome in ('no_response', 'replied', 'interested', 'not_interested', 'wrong_person', 'referral', 'send_info', 'meeting_booked', 'rfq_received', 'opportunity_created', 'unsubscribe', 'bounce')),
  notes text,
  next_action text,
  follow_up_at timestamptz,
  converted_opportunity_id uuid references public.shipper_opportunities(id) on delete set null,
  converted_rfi_id uuid references public.shipper_rfis(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists growth_segments_owner_name_unique_idx
  on public.growth_segments (owner_email, lower(name))
  where status <> 'archived';
create index if not exists growth_segments_workspace_status_idx
  on public.growth_segments (owner_email, organization_id, status, updated_at desc);
create index if not exists growth_campaigns_workspace_status_idx
  on public.growth_campaigns (owner_email, organization_id, status, updated_at desc);
create unique index if not exists growth_campaign_members_unique_idx
  on public.growth_campaign_members (
    campaign_id,
    shipper_id,
    coalesce(contact_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
create index if not exists growth_campaign_members_campaign_status_idx
  on public.growth_campaign_members (campaign_id, status, updated_at desc);
create unique index if not exists growth_campaign_messages_unique_idx
  on public.growth_campaign_messages (campaign_id, step_type, channel, variant);
create index if not exists growth_results_workspace_outcome_idx
  on public.growth_results (owner_email, organization_id, outcome, updated_at desc);
create index if not exists growth_results_campaign_idx
  on public.growth_results (campaign_id, updated_at desc);
create index if not exists shippers_growth_filters_idx
  on public.shippers (owner_email, account_type, data_status, headquarters_country, headquarters_state);
create index if not exists shipper_contacts_growth_filters_idx
  on public.shipper_contacts (owner_email, data_status, email_quality, persona, title);
create index if not exists shipper_contacts_owner_email_lookup_idx
  on public.shipper_contacts (owner_email, lower(email))
  where email is not null and btrim(email) <> '' and status = 'active';

alter table public.growth_segments enable row level security;
alter table public.growth_campaigns enable row level security;
alter table public.growth_campaign_members enable row level security;
alter table public.growth_campaign_messages enable row level security;
alter table public.growth_results enable row level security;

create policy "workspace users can manage growth segments"
  on public.growth_segments for all to authenticated
  using (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  )
  with check (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  );

create policy "workspace users can manage growth campaigns"
  on public.growth_campaigns for all to authenticated
  using (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  )
  with check (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  );

create policy "workspace users can manage growth campaign members"
  on public.growth_campaign_members for all to authenticated
  using (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  )
  with check (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  );

create policy "workspace users can manage growth campaign messages"
  on public.growth_campaign_messages for all to authenticated
  using (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  )
  with check (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  );

create policy "workspace users can manage growth results"
  on public.growth_results for all to authenticated
  using (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  )
  with check (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  );
