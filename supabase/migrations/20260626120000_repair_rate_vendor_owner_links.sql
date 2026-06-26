-- Repair historical rate/vendor links created before Kinde email ownership was stable.
-- Keep vendor rows intact; only make rate_staging links point to the user's email-owned vendor base.

with generic_domains(domain) as (
  values
    ('gmail.com'),
    ('googlemail.com'),
    ('hotmail.com'),
    ('outlook.com'),
    ('live.com'),
    ('msn.com'),
    ('yahoo.com'),
    ('yahoo.com.mx'),
    ('icloud.com'),
    ('me.com'),
    ('aol.com'),
    ('proton.me'),
    ('protonmail.com')
),
sales_targets as (
  select lower(domain) as domain, min(id::text)::uuid as vendor_id
  from public.vendors
  where owner_email = 'sales@heymarksman.com'
    and domain is not null
    and lower(domain) not in (select domain from generic_domains)
  group by lower(domain)
),
candidate_links as (
  select rs.id, target.vendor_id
  from public.rate_staging rs
  join public.vendors current_vendor on current_vendor.id = rs.vendor_id
  join sales_targets target on target.domain = lower(coalesce(current_vendor.domain, rs.vendor_domain))
  where current_vendor.owner_email is distinct from 'sales@heymarksman.com'
    and rs.vendor_id is distinct from target.vendor_id
)
update public.rate_staging rs
set vendor_id = candidate_links.vendor_id,
    updated_at = now()
from candidate_links
where rs.id = candidate_links.id;

with generic_domains(domain) as (
  values
    ('gmail.com'),
    ('googlemail.com'),
    ('hotmail.com'),
    ('outlook.com'),
    ('live.com'),
    ('msn.com'),
    ('yahoo.com'),
    ('yahoo.com.mx'),
    ('icloud.com'),
    ('me.com'),
    ('aol.com'),
    ('proton.me'),
    ('protonmail.com')
)
update public.rate_staging rs
set vendor_id = null,
    updated_at = now()
from public.vendors current_vendor
where current_vendor.id = rs.vendor_id
  and lower(coalesce(current_vendor.domain, rs.vendor_domain)) in (select domain from generic_domains);
