-- Provider Service Build 29: bounded Gmail delivery and follow-up scheduling.
create table if not exists public.provider_onboarding_mailbox_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  mailbox_email text not null,
  enabled boolean not null default false,
  allowed_recipient_domains text[] not null default '{}'::text[],
  require_human_approval boolean not null default true,
  max_attachment_bytes bigint not null default 10485760,
  max_followups integer not null default 3,
  followup_interval_hours integer not null default 72,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_onboarding_mailbox_policies_unique unique (organization_id,mailbox_email),
  constraint provider_onboarding_mailbox_email_check check (mailbox_email=lower(mailbox_email) and mailbox_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint provider_onboarding_mailbox_domains_check check (array_position(allowed_recipient_domains,'') is null),
  constraint provider_onboarding_mailbox_attachment_check check (max_attachment_bytes between 1 and 26214400),
  constraint provider_onboarding_mailbox_followups_check check (max_followups between 0 and 10 and followup_interval_hours between 1 and 720)
);

create table if not exists public.provider_onboarding_message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  template_code text not null,
  template_version integer not null,
  message_kind text not null,
  locale text not null default 'en-US',
  subject_template text not null,
  body_text_template text not null,
  allowed_variables text[] not null default '{}'::text[],
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint provider_onboarding_message_templates_org_id_unique unique (organization_id,id),
  constraint provider_onboarding_message_templates_unique unique (organization_id,template_code,template_version),
  constraint provider_onboarding_message_templates_code_check check (template_code ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_onboarding_message_templates_version_check check (template_version>0),
  constraint provider_onboarding_message_templates_kind_check check (message_kind in ('initial_submission','missing_information','status_followup','correction','completion')),
  constraint provider_onboarding_message_templates_locale_check check (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  constraint provider_onboarding_message_templates_content_check check (btrim(subject_template)<>'' and btrim(body_text_template)<>'')
);

create table if not exists public.provider_onboarding_outbound_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  case_id uuid not null,
  package_id uuid,
  assembly_id uuid,
  template_id uuid not null,
  parent_message_id uuid,
  message_status text not null default 'draft',
  revision integer not null default 1,
  mailbox_email text not null,
  recipient_email text not null,
  subject_text text not null,
  body_text text not null,
  attachment_sha256 text,
  idempotency_key text not null,
  requested_by_actor_id text not null,
  approved_by_actor_id text,
  approval_note text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  gmail_message_id text,
  gmail_thread_id text,
  followup_number integer not null default 0,
  next_followup_at timestamptz,
  send_attempts integer not null default 0,
  processing_lease_token uuid,
  processing_lease_expires_at timestamptz,
  last_error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_outbound_messages_org_id_unique unique (organization_id,id),
  constraint provider_outbound_messages_case_fkey foreign key (organization_id,case_id)
    references public.provider_onboarding_cases(organization_id,id) on delete restrict,
  constraint provider_outbound_messages_package_fkey foreign key (organization_id,package_id)
    references public.provider_onboarding_release_packages(organization_id,id) on delete restrict,
  constraint provider_outbound_messages_assembly_fkey foreign key (organization_id,assembly_id)
    references public.provider_onboarding_form_assemblies(organization_id,id) on delete restrict,
  constraint provider_outbound_messages_template_fkey foreign key (organization_id,template_id)
    references public.provider_onboarding_message_templates(organization_id,id) on delete restrict,
  constraint provider_outbound_messages_parent_fkey foreign key (organization_id,parent_message_id)
    references public.provider_onboarding_outbound_messages(organization_id,id) on delete restrict,
  constraint provider_outbound_messages_idempotency_unique unique (organization_id,idempotency_key),
  constraint provider_outbound_messages_status_check check (message_status in ('draft','pending_approval','approved','queued','sending','sent','failed','cancelled')),
  constraint provider_outbound_messages_revision_check check (revision>0),
  constraint provider_outbound_messages_mailbox_check check (mailbox_email=lower(mailbox_email) and mailbox_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint provider_outbound_messages_recipient_check check (recipient_email=lower(recipient_email) and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint provider_outbound_messages_content_check check (btrim(subject_text)<>'' and btrim(body_text)<>''),
  constraint provider_outbound_messages_attachment_check check (
    (assembly_id is null and attachment_sha256 is null) or (assembly_id is not null and attachment_sha256 ~ '^[0-9a-f]{64}$' and package_id is not null)
  ),
  constraint provider_outbound_messages_requester_check check (btrim(requested_by_actor_id)<>''),
  constraint provider_outbound_messages_separation_check check (approved_by_actor_id is null or approved_by_actor_id<>requested_by_actor_id),
  constraint provider_outbound_messages_approval_check check (
    message_status not in ('approved','queued','sending','sent') or approved_by_actor_id is not null
  ),
  constraint provider_outbound_messages_sent_check check (
    message_status<>'sent' or (sent_at is not null and gmail_message_id is not null and gmail_thread_id is not null)
  ),
  constraint provider_outbound_messages_followup_check check (followup_number between 0 and 10),
  constraint provider_outbound_messages_attempts_check check (send_attempts between 0 and 10),
  constraint provider_outbound_messages_lease_check check (
    processing_lease_token is null or (message_status='sending' and processing_lease_expires_at is not null)
  )
);

create table if not exists public.provider_onboarding_outbound_message_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  message_id uuid not null,
  event_type text not null,
  actor_id text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint provider_outbound_message_events_message_fkey foreign key (organization_id,message_id)
    references public.provider_onboarding_outbound_messages(organization_id,id) on delete restrict,
  constraint provider_outbound_message_events_type_check check (event_type in (
    'message_drafted','message_approved','message_rejected','message_queued',
    'message_send_started','message_sent','message_failed','followup_scheduled','message_cancelled'
  )),
  constraint provider_outbound_message_events_actor_check check (btrim(actor_id)<>'')
);
create index if not exists provider_outbound_messages_queue_idx
  on public.provider_onboarding_outbound_messages (organization_id,message_status,scheduled_at,created_at);
create index if not exists provider_outbound_messages_followup_idx
  on public.provider_onboarding_outbound_messages (organization_id,next_followup_at)
  where message_status='sent' and next_followup_at is not null;
alter table public.provider_onboarding_mailbox_policies enable row level security;
alter table public.provider_onboarding_message_templates enable row level security;
alter table public.provider_onboarding_outbound_messages enable row level security;
alter table public.provider_onboarding_outbound_message_events enable row level security;
revoke all on table public.provider_onboarding_mailbox_policies from public,anon,authenticated,service_role;
revoke all on table public.provider_onboarding_message_templates from public,anon,authenticated,service_role;
revoke all on table public.provider_onboarding_outbound_messages from public,anon,authenticated,service_role;
revoke all on table public.provider_onboarding_outbound_message_events from public,anon,authenticated,service_role;
