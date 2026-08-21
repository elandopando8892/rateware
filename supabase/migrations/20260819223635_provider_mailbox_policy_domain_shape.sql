create or replace function public.provider_onboarding_valid_recipient_domains(domains text[])
returns boolean
language sql
immutable
as $$
  select coalesce(bool_and(
    entry = lower(entry)
    and entry = btrim(entry)
    and entry ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  ), true)
  from unnest(coalesce(domains, '{}'::text[])) as entry
$$;

comment on function public.provider_onboarding_valid_recipient_domains(text[]) is
'True when every entry is a lowercase, trimmed, dotted domain name. Used by the mailbox policy CHECK; an empty list is valid and allows nothing.';

alter table public.provider_onboarding_mailbox_policies
  drop constraint if exists provider_onboarding_mailbox_domain_shape_check;
alter table public.provider_onboarding_mailbox_policies
  add constraint provider_onboarding_mailbox_domain_shape_check check (
    public.provider_onboarding_valid_recipient_domains(allowed_recipient_domains)
  );

alter table public.provider_onboarding_mailbox_policies
  drop constraint if exists provider_onboarding_mailbox_enabled_domains_check;
alter table public.provider_onboarding_mailbox_policies
  add constraint provider_onboarding_mailbox_enabled_domains_check check (
    enabled is false or array_length(allowed_recipient_domains, 1) >= 1
  );;
