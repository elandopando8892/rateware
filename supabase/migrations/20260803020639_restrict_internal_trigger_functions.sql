-- Trigger functions execute through their registered trigger bindings and must
-- never be exposed as Data API RPC endpoints.
revoke all on function public.rateware_inherit_rate_owner()
  from public, anon, authenticated, service_role;

revoke all on function public.rls_auto_enable()
  from public, anon, authenticated, service_role;

comment on function public.rateware_inherit_rate_owner() is
  'Internal rate_staging ownership trigger. Direct execution is prohibited.';

comment on function public.rls_auto_enable() is
  'Internal DDL event trigger that enables RLS. Direct execution is prohibited.';

-- New public functions start closed. Backend RPC migrations must grant only
-- their exact signature to service_role after creation.
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;
