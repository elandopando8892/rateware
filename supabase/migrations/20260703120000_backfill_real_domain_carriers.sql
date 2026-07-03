-- Data backfill: create the real-domain carriers that appear in the approved
-- rate book but have no CRM vendor record, then link their rows.
--
-- Context: 22,019 approved rows had no linked vendor. 286 of them carry a valid
-- corporate domain that matched no existing vendor (see
-- docs/unmatched-carriers-analysis-2026-07-02.md). This creates those vendors
-- under the current workspace owner and links the ~4,794 rows by exact domain.
--
-- Scope guards:
--   * owner_email is the current session's canonical owner (645 procurement +
--     629 sourcing vendors = the dashboard's numbers).
--   * Only valid domains (regex) excluding personal / disposable email hosts.
--   * source='domain_backfill_2026_07_03' tags every created row for rollback.
--   * Linking only happens where a domain maps to exactly ONE owner vendor.
--
-- Idempotent: re-running creates nothing new (NOT EXISTS guard) and only links
-- still-unlinked rows.
--
-- Rollback:
--   update public.rate_staging rs set vendor_id = null
--     from public.vendors v
--     where rs.vendor_id = v.id and v.source = 'domain_backfill_2026_07_03';
--   delete from public.vendors where source = 'domain_backfill_2026_07_03';

do $$
declare
  v_owner text := 'kp_a636ecabd92d4fb3805bfd79590f5237';
begin
  -- 1. Create the missing carriers.
  with candidates as (
    select distinct lower(btrim(rs.vendor_domain)) as domain
    from public.rate_staging rs
    where rs.status = 'approved'
      and rs.vendor_id is null
      and lower(btrim(rs.vendor_domain)) ~ '^[a-z0-9.-]+\.[a-z]{2,}$'
      and lower(rs.vendor_domain) not in (
        'gmail.com','hotmail.com','yahoo.com','outlook.com','hotmail.com.mx',
        'yahoo.com.mx','live.com','icloud.com','prodigy.net.mx','yopmail.com'
      )
  )
  insert into public.vendors (domain, vendor_name, name, owner_email, base_stage, source, status, active)
  select
    c.domain,
    initcap(split_part(c.domain, '.', 1)),
    initcap(split_part(c.domain, '.', 1)),
    v_owner,
    'sourcing',
    'domain_backfill_2026_07_03',
    'active',
    true
  from candidates c
  where not exists (
    select 1 from public.vendors v
    where v.owner_email = v_owner
      and lower(v.domain) = c.domain
  );

  -- 2. Link approved rows to the owner's vendor for their domain, but only when
  --    that domain maps to exactly one vendor (deterministic).
  update public.rate_staging rs
  set vendor_id = m.vendor_id,
      updated_at = now()
  from (
    select lower(v.domain) as domain, (array_agg(v.id order by v.id))[1] as vendor_id, count(*) as n
    from public.vendors v
    where v.owner_email = v_owner
      and nullif(btrim(v.domain), '') is not null
    group by lower(v.domain)
  ) m
  where rs.status = 'approved'
    and rs.vendor_id is null
    and m.n = 1
    and lower(btrim(rs.vendor_domain)) = m.domain;
end $$;
