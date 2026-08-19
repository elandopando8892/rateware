-- Mailbox policy: every allowed recipient domain must actually be a domain.
--
-- The table already refused an empty string, and the delivery module lowercases both
-- sides before comparing, so a wildcard like '*' could never match a real recipient.
-- What was still possible was storing something that is not a domain at all -- an email
-- address, a leading '@', a bare label, trailing whitespace -- which reads as a
-- configured allowance while matching nothing. A send policy that looks broader than it
-- is, or narrower than it is, is the wrong thing to be guessing about.
--
-- The sender side is not expressible here: which mailbox may send is pinned to a single
-- account resolved from the environment, and the database cannot read it. That check
-- lives in provider-onboarding-gmail-delivery.ts and runs before this policy is read.

create or replace function public.provider_onboarding_valid_recipient_domains(domains text[])
returns boolean
language sql
immutable
as $$
  -- bool_and over an empty array is NULL, which a CHECK would treat as passing; an empty
  -- list is genuinely fine here (it allows nothing), so it is coalesced to true
  -- deliberately rather than by accident.
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

-- An enabled policy that allows no recipient is a misconfiguration rather than a deny:
-- it reads as switched on while refusing everything. The delivery module refuses it too;
-- this stops it being written in the first place.
--
-- cardinality(), not array_length(). array_length of an empty array is NULL, so
-- `array_length(...) >= 1` is NULL for exactly the case this is meant to catch, and a
-- CHECK only rejects on false -- the first version of this constraint accepted an
-- enabled policy with no domains at all. cardinality() returns 0.
alter table public.provider_onboarding_mailbox_policies
  drop constraint if exists provider_onboarding_mailbox_enabled_domains_check;
alter table public.provider_onboarding_mailbox_policies
  add constraint provider_onboarding_mailbox_enabled_domains_check check (
    enabled is false or cardinality(allowed_recipient_domains) >= 1
  );

-- The predicate is only ever called by the CHECK above, and a CHECK executes as the user
-- performing the write. Only service_role can write this table, so service_role is the
-- only role that needs EXECUTE; PUBLIC's default EXECUTE on new functions is revoked.
revoke all on function public.provider_onboarding_valid_recipient_domains(text[])
  from public,anon,authenticated,service_role;
grant execute on function public.provider_onboarding_valid_recipient_domains(text[]) to service_role;
