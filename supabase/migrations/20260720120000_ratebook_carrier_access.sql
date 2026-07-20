-- Sprint 2: independent private carrier access for asynchronous Ratebooks.
-- Tokens are deliberately stored only as SHA-256 hashes.  A Ratebook share is
-- linked to the Carrier CRM vendor, but it does not create or depend on a
-- live Bid Room invitation.

alter table public.rfx_ratebook_shares
  add column if not exists access_token_hash text,
  add column if not exists access_token_last4 text,
  add column if not exists access_granted_at timestamptz,
  add column if not exists access_revoked_at timestamptz;

create unique index if not exists rfx_ratebook_shares_access_token_hash_unique_idx
  on public.rfx_ratebook_shares(access_token_hash)
  where access_token_hash is not null and btrim(access_token_hash) <> '';

create index if not exists rfx_ratebook_shares_active_access_idx
  on public.rfx_ratebook_shares(ratebook_id, vendor_id, status, last_viewed_at desc);

comment on column public.rfx_ratebook_shares.access_token_hash is
  'SHA-256 hash of the opaque Ratebook carrier link token. Raw tokens are never persisted.';
