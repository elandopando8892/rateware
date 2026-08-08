-- Splits pasted email lists out of vendors.primary_email.
--
-- The Google Sheet import wrote whatever the spreadsheet cell held, so 180
-- carriers ended up with a semicolon-separated list in primary_email — and 103
-- with a trailing ';' or space. Nothing was broken by it at send time
-- (normalizeEmailList extracts every address with a regex), but it defeated
-- duplicate detection: the same carrier with one address and with five produced
-- two different natural keys, so 167 duplicates survived the first merge. One
-- pair differed by a single trailing semicolon.
--
-- Applied to production on 2026-08-07 alongside the second merge pass; the
-- previous values are preserved in vendor_email_normalization_log. Idempotent —
-- rows already holding a single clean address are not matched.
--
-- normalizeVendor() in supabase/functions/rateware-api has always produced a
-- single primary_email via normalizeVendorEmails(), so new writes were never
-- affected. This only repairs legacy rows.

create table if not exists public.vendor_email_normalization_log (
  vendor_id uuid primary key,
  normalized_at timestamptz not null default now(),
  old_primary_email text,
  old_secondary_emails text[]
);

insert into public.vendor_email_normalization_log (vendor_id, old_primary_email, old_secondary_emails)
select id, primary_email, secondary_emails
from public.vendors
where primary_email is not null
  and (primary_email like '%;%' or primary_email <> trim(both ' ;,' from primary_email))
on conflict (vendor_id) do nothing;

with extraidos as (
  select v.id,
    (select array_agg(distinct e order by e)
     from unnest(
       array(select lower(m[1])
             from regexp_matches(coalesce(v.primary_email, ''),
                                 '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}', 'gi') as m)
       || coalesce(v.secondary_emails, '{}')
     ) as e
     where e is not null and e <> ''
    ) as todos,
    (select lower(m[1])
     from regexp_matches(coalesce(v.primary_email, ''),
                         '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}', 'gi') as m
     limit 1) as primero
  from public.vendors v
  where v.primary_email is not null
    and (v.primary_email like '%;%' or v.primary_email <> trim(both ' ;,' from v.primary_email))
)
update public.vendors v
set primary_email = e.primero,
    -- Every other address is kept, never dropped.
    secondary_emails = coalesce(
      (select array_agg(x order by x) from unnest(e.todos) x where x <> e.primero), '{}'
    ),
    updated_at = now()
from extraidos e
where v.id = e.id and e.primero is not null;
