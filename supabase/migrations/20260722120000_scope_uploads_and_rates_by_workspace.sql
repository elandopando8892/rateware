alter table public.raw_uploads
  add column if not exists owner_email text;

alter table public.rate_staging
  add column if not exists owner_email text;

update public.raw_uploads ru
set owner_email = coalesce(
  ru.owner_email,
  (select v.owner_email from public.vendors v where v.id = ru.vendor_id),
  'sales@heymarksman.com'
)
where ru.owner_email is null;

update public.rate_staging rs
set owner_email = coalesce(
  rs.owner_email,
  (select ru.owner_email from public.raw_uploads ru where ru.id = rs.raw_upload_id),
  (select v.owner_email from public.vendors v where v.id = rs.vendor_id),
  'sales@heymarksman.com'
)
where rs.owner_email is null;

create index if not exists raw_uploads_owner_created_idx
  on public.raw_uploads (owner_email, created_at desc);

create index if not exists rate_staging_owner_status_created_idx
  on public.rate_staging (owner_email, status, created_at desc);

create or replace function public.rateware_inherit_rate_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_email is null and new.raw_upload_id is not null then
    select ru.owner_email into new.owner_email
    from public.raw_uploads ru
    where ru.id = new.raw_upload_id;
  end if;

  if new.owner_email is null and new.vendor_id is not null then
    select v.owner_email into new.owner_email
    from public.vendors v
    where v.id = new.vendor_id;
  end if;

  return new;
end;
$$;

drop trigger if exists rateware_inherit_rate_owner_trigger on public.rate_staging;
create trigger rateware_inherit_rate_owner_trigger
before insert or update of raw_upload_id, vendor_id, owner_email
on public.rate_staging
for each row
execute function public.rateware_inherit_rate_owner();

drop function if exists public.rateware_filtered_rate_ids(
  text, text, text, text, text, text, text, text, jsonb, boolean, integer, integer
);

create or replace function public.rateware_filtered_rate_ids(
  p_mode text default 'staging',
  p_status text default null,
  p_raw_upload_id text default null,
  p_search text default null,
  p_operation text default null,
  p_service text default null,
  p_quick_filter text default 'all',
  p_review_filter text default 'all',
  p_column_filters jsonb default '{}'::jsonb,
  p_exclude_archived boolean default false,
  p_owner_email text default null,
  p_limit integer default 50000,
  p_offset integer default 0
)
returns table(row_id uuid, total_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select rs.*
    from public.rate_staging rs
    left join public.vendors v on v.id = rs.vendor_id
    where lower(trim(rs.owner_email)) = lower(trim(p_owner_email))
      and public.rateware_rate_matches_filters(
        rs,
        v,
        p_mode,
        p_status,
        p_raw_upload_id,
        p_search,
        p_operation,
        p_service,
        p_quick_filter,
        p_review_filter,
        p_column_filters,
        p_exclude_archived
      )
  )
  select filtered.id as row_id, count(*) over() as total_count
  from filtered
  order by
    case when coalesce(p_mode, 'staging') = 'rateware' then filtered.quote_date end desc nulls last,
    filtered.created_at desc,
    filtered.id desc
  limit least(greatest(coalesce(p_limit, 50000), 1), 50000)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.rateware_filtered_rate_ids(
  text, text, text, text, text, text, text, text, jsonb, boolean, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.rateware_filtered_rate_ids(
  text, text, text, text, text, text, text, text, jsonb, boolean, text, integer, integer
) to service_role;
