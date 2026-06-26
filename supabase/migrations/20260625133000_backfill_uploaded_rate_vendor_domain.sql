update public.rate_staging rs
set
  vendor_id = ru.vendor_id,
  vendor_domain = coalesce(
    nullif(v.domain, ''),
    nullif(split_part(v.primary_email, '@', 2), ''),
    nullif(rs.vendor_domain, ''),
    case
      when ru.vendor_hint ~* '(@|[a-z0-9-]+\.[a-z]{2,})' then nullif(ru.vendor_hint, '')
      else null
    end
  )
from public.raw_uploads ru
left join public.vendors v on v.id = ru.vendor_id
where rs.raw_upload_id = ru.id
  and ru.vendor_id is not null
  and (
    rs.vendor_id is distinct from ru.vendor_id
    or rs.vendor_domain is null
    or btrim(rs.vendor_domain) = ''
    or lower(rs.vendor_domain) like '%heymarksman%'
    or lower(rs.vendor_domain) like '%marksmanxbf%'
  );

update public.raw_uploads ru
set
  vendor_hint = coalesce(nullif(ru.vendor_hint, ''), nullif(v.domain, ''), nullif(v.primary_email, ''), nullif(v.vendor_name, '')),
  vendor_match_source = coalesce(ru.vendor_match_source, 'manual')
from public.vendors v
where ru.vendor_id = v.id
  and ru.vendor_id is not null;
