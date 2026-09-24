-- QuoteDesk reads its Google Maps (Routes API) key from Vault. The project is
-- at Supabase's limit of 100 Edge Function secrets, so the key is stored in
-- Vault under the name google_maps_api_key instead of an environment variable.
-- Only the service role (the quotedesk-api edge function) may call this.
create or replace function public.quotedesk_google_maps_api_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'google_maps_api_key'
  order by updated_at desc nulls last
  limit 1;
$$;

revoke all on function public.quotedesk_google_maps_api_key() from public, anon, authenticated;
grant execute on function public.quotedesk_google_maps_api_key() to service_role;

comment on function public.quotedesk_google_maps_api_key() is
  'Bidware QuoteDesk: Google Maps (Routes API) key from Vault (name google_maps_api_key). Service role only.';
