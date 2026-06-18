create table if not exists public.outreach_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  name text not null,
  channel text not null default 'multi' check (channel in ('email', 'whatsapp', 'multi')),
  subject text,
  html_body text,
  whatsapp_body text,
  active boolean not null default true,
  is_default boolean not null default false,
  placeholders text[] not null default '{}'
);

create table if not exists public.outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  rfx_event_id uuid references public.rfx_events(id) on delete set null,
  template_id uuid references public.outreach_templates(id) on delete set null,
  name text not null,
  channel text not null default 'multi' check (channel in ('email', 'whatsapp', 'multi')),
  status text not null default 'draft' check (status in ('draft', 'generated', 'queued', 'sent', 'closed', 'archived')),
  notes text
);

create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  campaign_id uuid not null references public.outreach_campaigns(id) on delete cascade,
  template_id uuid references public.outreach_templates(id) on delete set null,
  rfx_event_id uuid references public.rfx_events(id) on delete set null,
  rfx_lane_id uuid references public.rfx_lanes(id) on delete set null,
  rfx_lane_vendor_id uuid references public.rfx_lane_vendors(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  channel text not null default 'email' check (channel in ('email', 'whatsapp')),
  recipient_email text,
  recipient_phone text,
  subject text,
  html_body text,
  text_body text,
  whatsapp_text text,
  gmail_compose_url text,
  whatsapp_url text,
  tracking_token text not null default md5(random()::text || clock_timestamp()::text),
  status text not null default 'drafted' check (status in ('drafted', 'queued', 'sent', 'replied', 'failed', 'archived')),
  sent_at timestamptz,
  last_contacted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.contact_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  outreach_message_id uuid references public.outreach_messages(id) on delete set null,
  campaign_id uuid references public.outreach_campaigns(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  rfx_event_id uuid references public.rfx_events(id) on delete set null,
  channel text not null check (channel in ('email', 'whatsapp', 'phone', 'portal', 'other')),
  direction text not null default 'outbound' check (direction in ('outbound', 'inbound', 'internal')),
  status text not null default 'drafted',
  subject text,
  body_preview text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists outreach_templates_owner_idx on public.outreach_templates (owner_email, active);
create index if not exists outreach_campaigns_owner_idx on public.outreach_campaigns (owner_email, created_at desc);
create index if not exists outreach_campaigns_rfx_idx on public.outreach_campaigns (rfx_event_id);
create index if not exists outreach_messages_campaign_idx on public.outreach_messages (campaign_id);
create index if not exists outreach_messages_vendor_idx on public.outreach_messages (vendor_id, created_at desc);
create index if not exists outreach_messages_status_idx on public.outreach_messages (status);
create index if not exists contact_history_owner_idx on public.contact_history (owner_email, occurred_at desc);
create index if not exists contact_history_vendor_idx on public.contact_history (vendor_id, occurred_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.outreach_messages'::regclass
      and conname = 'outreach_messages_campaign_lane_vendor_channel_unique'
  ) then
    alter table public.outreach_messages
      add constraint outreach_messages_campaign_lane_vendor_channel_unique
      unique (campaign_id, rfx_lane_vendor_id, channel);
  end if;
end $$;

alter table public.outreach_templates enable row level security;
alter table public.outreach_campaigns enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.contact_history enable row level security;

create policy "authenticated users can read outreach templates"
  on public.outreach_templates for select
  to authenticated
  using (true);

create policy "authenticated users can create outreach templates"
  on public.outreach_templates for insert
  to authenticated
  with check (true);

create policy "authenticated users can update outreach templates"
  on public.outreach_templates for update
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read outreach campaigns"
  on public.outreach_campaigns for select
  to authenticated
  using (true);

create policy "authenticated users can create outreach campaigns"
  on public.outreach_campaigns for insert
  to authenticated
  with check (true);

create policy "authenticated users can update outreach campaigns"
  on public.outreach_campaigns for update
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read outreach messages"
  on public.outreach_messages for select
  to authenticated
  using (true);

create policy "authenticated users can create outreach messages"
  on public.outreach_messages for insert
  to authenticated
  with check (true);

create policy "authenticated users can update outreach messages"
  on public.outreach_messages for update
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read contact history"
  on public.contact_history for select
  to authenticated
  using (true);

create policy "authenticated users can create contact history"
  on public.contact_history for insert
  to authenticated
  with check (true);

insert into public.outreach_templates (
  owner_user_id,
  owner_email,
  name,
  channel,
  subject,
  html_body,
  whatsapp_body,
  active,
  is_default,
  placeholders
)
values (
  null,
  null,
  'RFx carrier invitation',
  'multi',
  'Invitation to quote {{rfx_id}} - {{lane_origin}} to {{lane_destination}}',
  '<p>Hello {{vendor_name}},</p><p>We would like to invite you to quote <strong>{{event_name}}</strong>.</p><p><strong>Lane:</strong> {{lane_origin}} to {{lane_destination}}<br><strong>Equipment:</strong> {{equipment}} {{trailer}}<br><strong>Operation:</strong> {{operation}}<br><strong>Service:</strong> {{service}}<br><strong>Due date:</strong> {{due_date}}</p><p>Please submit your bid here: <a href="{{bid_link}}">{{bid_link}}</a></p><p>Thank you,<br>Rateware Procurement</p>',
  'Hello {{vendor_name}}, we would like to invite you to quote {{rfx_id}}: {{lane_origin}} to {{lane_destination}}. Equipment: {{equipment}} {{trailer}}. Due date: {{due_date}}. Submit bid: {{bid_link}}',
  true,
  true,
  array['vendor_name','rfx_id','event_name','customer','due_date','lane_origin','lane_destination','equipment','trailer','operation','service','bid_link']
)
on conflict do nothing;
