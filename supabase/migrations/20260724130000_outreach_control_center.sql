-- Outreach Control Center: workspace-scoped audience, contact policy and next-action ledger.
-- All writes are made through rateware-api with the service role; credentials never live here.

alter table public.outreach_campaigns
  add column if not exists audience_policy jsonb not null default '{"mode":"all_eligible","require_contact":true}'::jsonb,
  add column if not exists contact_policy jsonb not null default '{"max_touches_per_event":1,"cooldown_hours":72,"daily_limit":100}'::jsonb,
  add column if not exists sequence_policy jsonb not null default '{"mode":"manual","follow_up_delay_hours":48,"follow_up_channel":"whatsapp"}'::jsonb,
  add column if not exists audience_snapshot jsonb not null default '{}'::jsonb;

alter table public.outreach_messages
  add column if not exists contact_key text,
  add column if not exists outcome_reason text,
  add column if not exists next_action text,
  add column if not exists next_action_at timestamptz,
  add column if not exists suppressed_at timestamptz,
  add column if not exists suppression_reason text;

update public.outreach_messages
set contact_key = coalesce(
  nullif(contact_key, ''),
  case
    when vendor_id is not null and coalesce(recipient_email, '') <> '' then 'vendor:' || vendor_id::text || '|email:' || lower(recipient_email)
    when vendor_id is not null and coalesce(normalized_recipient_phone, recipient_phone, '') <> '' then 'vendor:' || vendor_id::text || '|phone:' || coalesce(normalized_recipient_phone, recipient_phone)
    when vendor_id is not null then 'vendor:' || vendor_id::text
    when coalesce(normalized_recipient_phone, recipient_phone, '') <> '' then 'phone:' || coalesce(normalized_recipient_phone, recipient_phone)
    when coalesce(recipient_email, '') <> '' then 'email:' || lower(recipient_email)
    else 'message:' || id::text
  end
)
where contact_key is null or contact_key = '';

update public.outreach_messages
set next_action = case lower(coalesce(status, 'drafted'))
  when 'bounced' then 'Replace contact'
  when 'failed' then 'Review delivery failure'
  when 'replied' then 'Review reply'
  when 'quoted' then 'Review quote'
  when 'sent' then 'Await response'
  when 'delivered' then 'Await response'
  when 'read' then 'Await response'
  when 'queued' then 'Send when approved'
  when 'sending' then 'Wait for delivery result'
  when 'archived' then 'No action'
  else 'Review and send'
end
where next_action is null or next_action = '';

-- A carrier can have more than one valid contact. Keep the prior message as
-- evidence, but allow a recovery draft for a different email/phone after a
-- bounce or suppression. The old key was too broad for that workflow.
alter table public.outreach_messages
  drop constraint if exists outreach_messages_campaign_lane_vendor_channel_unique;
drop index if exists public.outreach_messages_campaign_lane_vendor_channel_unique;

create unique index if not exists outreach_messages_campaign_lane_contact_channel_unique
  on public.outreach_messages (campaign_id, rfx_lane_vendor_id, channel, contact_key);

create index if not exists outreach_messages_owner_event_contact_channel_idx
  on public.outreach_messages (owner_email, rfx_event_id, contact_key, channel, updated_at desc);
create index if not exists outreach_messages_owner_next_action_idx
  on public.outreach_messages (owner_email, next_action, updated_at desc);

alter table public.outreach_templates
  add column if not exists template_scope text not null default 'legacy',
  add column if not exists canonical_language text;

create unique index if not exists outreach_templates_canonical_owner_channel_language_idx
  on public.outreach_templates (owner_email, channel, canonical_language)
  where active and template_scope = 'canonical' and canonical_language is not null;

create table if not exists public.outreach_audience_segments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_id text,
  owner_email text not null,
  organization_id text,
  name text not null,
  rfx_event_id uuid references public.rfx_events(id) on delete cascade,
  filters jsonb not null default '{}'::jsonb,
  vendor_ids uuid[] not null default '{}'::uuid[],
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists outreach_audience_segments_owner_event_idx
  on public.outreach_audience_segments (owner_email, rfx_event_id, active, updated_at desc);

create table if not exists public.outreach_contact_suppressions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_id text,
  owner_email text not null,
  organization_id text,
  vendor_id uuid references public.vendors(id) on delete set null,
  channel text not null default 'all' check (channel in ('all', 'email', 'whatsapp', 'whatsapp_group')),
  contact_value text not null,
  reason text not null,
  source text not null default 'manual',
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
);

drop index if exists public.outreach_contact_suppressions_active_contact_idx;
create unique index if not exists outreach_contact_suppressions_active_contact_idx
  on public.outreach_contact_suppressions (
    owner_email,
    channel,
    (coalesce(vendor_id::text, '')),
    contact_value
  )
  where active;
create index if not exists outreach_contact_suppressions_owner_vendor_idx
  on public.outreach_contact_suppressions (owner_email, vendor_id, active);

alter table public.outreach_audience_segments enable row level security;
alter table public.outreach_contact_suppressions enable row level security;

-- The browser does not receive these tables directly. rateware-api applies the workspace owner
-- filter and runs with the service role, matching the existing outreach tables.
