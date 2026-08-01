-- Bid Room invitation links are bearer credentials. Keep a digest for lookup
-- and an encrypted copy for server-side resend/recovery. Legacy plaintext
-- tokens remain nullable only until they are opened or resent and migrated.
alter table public.rfx_lane_vendors
  add column if not exists invitation_token_hash text,
  add column if not exists invitation_token_encrypted text;

alter table public.rfx_lane_vendors
  alter column invitation_token drop not null,
  alter column invitation_token drop default;

create unique index if not exists rfx_lane_vendors_invitation_token_hash_unique_idx
  on public.rfx_lane_vendors (invitation_token_hash)
  where invitation_token_hash is not null;

create index if not exists rfx_lane_vendors_legacy_invitation_token_idx
  on public.rfx_lane_vendors (invitation_token)
  where invitation_token is not null;

comment on column public.rfx_lane_vendors.invitation_token is
  'Legacy plaintext invitation token. New tokens must be stored in invitation_token_hash and invitation_token_encrypted only.';
