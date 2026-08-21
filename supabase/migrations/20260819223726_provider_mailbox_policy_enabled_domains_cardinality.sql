-- array_length of an empty array is NULL, so `array_length(...) >= 1` was NULL for
-- exactly the case the constraint was written to catch, and a CHECK only rejects on
-- false. cardinality() returns 0 for an empty array.
alter table public.provider_onboarding_mailbox_policies
  drop constraint if exists provider_onboarding_mailbox_enabled_domains_check;
alter table public.provider_onboarding_mailbox_policies
  add constraint provider_onboarding_mailbox_enabled_domains_check check (
    enabled is false or cardinality(allowed_recipient_domains) >= 1
  );;
