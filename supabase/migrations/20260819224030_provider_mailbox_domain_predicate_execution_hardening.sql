-- Recovered from rateware-prod: applied there, never committed. See
-- docs/osp-recovered-migrations.md.
--
-- The domain predicate backs a CHECK constraint, so anyone who can execute it can probe
-- the policy shape. Only the runtime role needs it.
revoke all on function public.provider_onboarding_valid_recipient_domains(text[])
  from public,anon,authenticated,service_role;
grant execute on function public.provider_onboarding_valid_recipient_domains(text[]) to service_role;
