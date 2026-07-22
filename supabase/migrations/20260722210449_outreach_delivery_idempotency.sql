alter table public.outreach_campaigns
  add column if not exists idempotency_key text;

create unique index if not exists outreach_campaigns_owner_idempotency_unique
  on public.outreach_campaigns (owner_email, idempotency_key)
  where idempotency_key is not null;

alter table public.outreach_messages
  add column if not exists send_attempt_id uuid,
  add column if not exists send_started_at timestamptz,
  add column if not exists send_completed_at timestamptz;

alter table public.outreach_messages
  drop constraint if exists outreach_messages_status_check,
  add constraint outreach_messages_status_check
  check (status in (
    'drafted', 'queued', 'sending', 'sent', 'delivered', 'read', 'replied',
    'failed', 'delivery_unknown', 'bounced', 'manual_sent', 'archived'
  ));

create index if not exists outreach_messages_delivery_claim_idx
  on public.outreach_messages (owner_email, status, send_started_at)
  where status in ('sending', 'delivery_unknown');

comment on column public.outreach_campaigns.idempotency_key is
  'Client request key used to reuse the same outreach wave after a retry.';

comment on column public.outreach_messages.send_attempt_id is
  'Atomic provider-send claim. A retry must not send while another attempt owns this id.';

comment on column public.outreach_messages.send_started_at is
  'Time the provider-send claim was acquired.';

comment on column public.outreach_messages.send_completed_at is
  'Time provider acceptance was durably recorded.';
