revoke all on function public.provider_onboarding_valid_recipient_domains(text[])
  from public,anon,authenticated,service_role;
grant execute on function public.provider_onboarding_valid_recipient_domains(text[]) to service_role;;
