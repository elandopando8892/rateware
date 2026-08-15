-- RC production parity: the sanitized onboarding workspace view uses
-- security_invoker, so the backend service role requires explicit read access
-- to each underlying table. Browser roles remain revoked and RLS remains on.
grant select on table
  public.provider_onboarding_cases,
  public.provider_onboarding_case_tasks,
  public.provider_onboarding_release_packages,
  public.provider_onboarding_release_package_approvals,
  public.provider_onboarding_form_assemblies,
  public.provider_onboarding_outbound_messages,
  public.provider_onboarding_case_events
to service_role;
