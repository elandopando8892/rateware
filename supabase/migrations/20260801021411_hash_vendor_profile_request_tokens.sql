-- New carrier profile links store only a SHA-256 digest. Existing request_token
-- values are kept nullable for a controlled lazy migration when an old link is
-- opened, then cleared after its digest is saved.
alter table public.vendor_profile_requests
  add column if not exists request_token_hash text;

alter table public.vendor_profile_requests
  alter column request_token drop not null,
  alter column request_token drop default;

create unique index if not exists vendor_profile_requests_token_hash_unique_idx
  on public.vendor_profile_requests (request_token_hash)
  where request_token_hash is not null;

create index if not exists vendor_profile_requests_legacy_token_idx
  on public.vendor_profile_requests (request_token)
  where request_token is not null;
