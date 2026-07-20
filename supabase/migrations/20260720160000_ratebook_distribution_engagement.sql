-- Sprint 6: controlled asynchronous Ratebook distribution and engagement.
-- Reuse the existing Outreach campaign/message history instead of creating a
-- parallel delivery queue. A message is scoped to one private Ratebook share.

alter table public.outreach_campaigns
  add column if not exists ratebook_id uuid references public.rfx_ratebooks(id) on delete cascade;

alter table public.outreach_messages
  add column if not exists ratebook_share_id uuid references public.rfx_ratebook_shares(id) on delete set null;

alter table public.rfx_ratebook_shares
  add column if not exists access_count integer not null default 0,
  add column if not exists last_accessed_at timestamptz,
  add column if not exists last_quote_at timestamptz;

create index if not exists outreach_campaigns_ratebook_idx
  on public.outreach_campaigns (owner_email, ratebook_id, created_at desc)
  where ratebook_id is not null;

create index if not exists outreach_messages_ratebook_share_idx
  on public.outreach_messages (owner_email, ratebook_share_id, status, created_at desc)
  where ratebook_share_id is not null;

create index if not exists rfx_ratebook_shares_engagement_idx
  on public.rfx_ratebook_shares (ratebook_id, status, last_accessed_at desc);

comment on column public.outreach_campaigns.ratebook_id is
  'The asynchronous Ratebook that owns this Outreach campaign, when applicable.';
comment on column public.outreach_messages.ratebook_share_id is
  'The private Ratebook carrier share delivered by this Outreach message.';
comment on column public.rfx_ratebook_shares.access_count is
  'Private carrier portal access count. This is engagement telemetry, not a delivery receipt.';
