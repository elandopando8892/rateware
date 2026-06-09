alter table public.rate_staging
  add column if not exists hazmat boolean not null default false,
  add column if not exists temperature_controlled boolean not null default false;

update public.rate_staging
set hazmat = true
where coalesce(hazmat, false) = false
  and upper(coalesce(trailer, '') || ' ' || coalesce(notes, '') || ' ' || coalesce(accessorials, '')) like '%HAZMAT%';

update public.rate_staging
set temperature_controlled = true
where coalesce(temperature_controlled, false) = false
  and (
    upper(coalesce(trailer, '') || ' ' || coalesce(notes, '') || ' ' || coalesce(accessorials, '')) like '%REEFER%'
    or upper(coalesce(trailer, '') || ' ' || coalesce(notes, '') || ' ' || coalesce(accessorials, '')) like '%REFRIG%'
    or upper(coalesce(trailer, '') || ' ' || coalesce(notes, '') || ' ' || coalesce(accessorials, '')) like '%TEMPERATURE%'
  );
