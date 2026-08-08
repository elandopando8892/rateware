-- Makes duplicate carriers impossible at the database level.
--
-- Until now the only unique index on vendors was the primary key, so nothing
-- stopped an import from inserting the same carrier again. Three import runs
-- left 1,758 duplicate records — 54% of the CRM — which were merged before this
-- index could be created.
--
-- The key is normalized name + domain, falling back to the contact email when
-- there is no domain. Name alone would be wrong: two divisions of one group can
-- share a name and quote separately (Transportes Potosinos has one on
-- potosinos.com.mx and another on potosinosespecializados.com.mx), and merging
-- them would put two independent bidders in a single record.
--
-- Must stay in sync with vendorNaturalKey() in supabase/functions/rateware-api.

create unique index if not exists vendors_owner_natural_key_unique_idx
  on public.vendors (
    owner_email,
    lower(regexp_replace(coalesce(vendor_name, ''), '[^a-z0-9]', '', 'gi')),
    coalesce(
      nullif(lower(regexp_replace(coalesce(domain, ''), '^(https?://)?(www\.)?', '', 'i')), ''),
      lower(coalesce(primary_email, ''))
    )
  )
  where lower(regexp_replace(coalesce(vendor_name, ''), '[^a-z0-9]', '', 'gi')) <> '';

comment on index public.vendors_owner_natural_key_unique_idx is
  'One record per carrier per owner. Keyed on normalized name plus domain (or contact email when no domain) so same-named divisions stay separate.';
