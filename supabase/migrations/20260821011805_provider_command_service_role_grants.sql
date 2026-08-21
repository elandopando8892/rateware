-- Recovered from rateware-prod: applied there, never committed. See
-- docs/osp-recovered-migrations.md.
--
-- The four write privileges the commands were missing. Found by executing the commands
-- against the database rather than by reading the migrations: a command that had never
-- been run had never needed its grant, so the gap was invisible until the command ran.
grant select, update on table public.provider_legal_entity_fact_promotions to service_role;

grant insert on table
  public.provider_onboarding_readiness_evaluations,
  public.provider_onboarding_readiness_results
to service_role;

grant insert on table public.provider_onboarding_release_package_approvals to service_role;
