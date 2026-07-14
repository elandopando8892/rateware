-- Preserve a recoverable copy of new Customer RFI tokens for the authenticated
-- project owner. The public endpoint still validates only token_hash.
alter table public.rfx_rfi_magic_links
  add column if not exists token_encrypted text;
