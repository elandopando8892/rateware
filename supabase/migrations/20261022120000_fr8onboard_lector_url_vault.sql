-- Fr8Onboard reader URL kept in Vault (the project is at its edge-secret limit).
-- Only service_role can read it; fr8onboard-aptos calls it with the service key.
-- The secret itself is stored outside migrations: vault.create_secret(<url>, 'fr8onboard_lector_url').
create or replace function public.fr8onboard_lector_url()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'fr8onboard_lector_url' limit 1;
$$;

revoke all on function public.fr8onboard_lector_url() from public, anon, authenticated;
grant execute on function public.fr8onboard_lector_url() to service_role;
