-- Harden workspace-scoped vendor search for Carrier CRM, Bid Room participant
-- selection, and Vendor CI. The search must find carriers by commercial name,
-- legal name, domain, primary/secondary emails, tags, notes, and structured
-- profile fields without leaking other workspaces.
alter table public.vendors
  add column if not exists name text;

create or replace function public.search_workspace_vendors(
  p_owner_email text,
  p_search text,
  p_limit integer default 1000,
  p_offset integer default 0
)
returns table (
  id uuid,
  match_rank integer,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with input as (
    select public.rateware_vendor_search_key(p_search) as search_key
  ),
  tokens as (
    select array_remove(regexp_split_to_array(search_key, '[[:space:]]+'), '') as values
    from input
  ),
  scoped as (
    select
      v.id,
      public.rateware_vendor_search_key(concat_ws(' ',
        v.vendor_name,
        v.name,
        v.legal_name,
        v.contact_name,
        v.domain,
        v.primary_email,
        array_to_string(coalesce(v.secondary_emails, '{}'::text[]), ' '),
        v.whatsapp_phone,
        array_to_string(coalesce(v.tags, '{}'::text[]), ' '),
        v.coverage_notes,
        v.notes,
        coalesce(v.profile_data::text, '')
      )) as search_text,
      public.rateware_vendor_search_key(v.vendor_name) as vendor_name_key,
      public.rateware_vendor_search_key(v.name) as name_key,
      public.rateware_vendor_search_key(v.legal_name) as legal_name_key,
      public.rateware_vendor_search_key(v.domain) as domain_key,
      public.rateware_vendor_search_key(v.primary_email) as primary_email_key,
      array(
        select public.rateware_vendor_search_key(email)
        from unnest(coalesce(v.secondary_emails, '{}'::text[])) as email
      ) as secondary_email_keys
    from public.vendors v
    where lower(v.owner_email) = lower(p_owner_email)
  ),
  matches as (
    select
      scoped.id,
      case
        when scoped.domain_key = input.search_key
          or scoped.primary_email_key = input.search_key
          or input.search_key = any(scoped.secondary_email_keys) then 0
        when scoped.vendor_name_key = input.search_key
          or scoped.name_key = input.search_key
          or scoped.legal_name_key = input.search_key then 1
        when scoped.domain_key like input.search_key || '%'
          or scoped.primary_email_key like input.search_key || '%'
          or exists (
            select 1
            from unnest(scoped.secondary_email_keys) as secondary_key
            where secondary_key like input.search_key || '%'
          ) then 2
        when scoped.vendor_name_key like input.search_key || '%'
          or scoped.name_key like input.search_key || '%'
          or scoped.legal_name_key like input.search_key || '%' then 3
        else 4
      end as match_rank,
      coalesce(nullif(scoped.vendor_name_key, ''), scoped.name_key, scoped.legal_name_key, scoped.domain_key) as sort_key
    from scoped
    cross join input
    cross join tokens
    where input.search_key <> ''
      and not exists (
        select 1
        from unnest(tokens.values) as token
        where token <> '' and scoped.search_text not like '%' || token || '%'
      )
  )
  select
    id,
    match_rank,
    count(*) over() as total_count
  from matches
  order by match_rank, sort_key, id
  limit least(greatest(coalesce(p_limit, 75), 1), 1000)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.search_workspace_vendors(text, text, integer, integer) from public;
grant execute on function public.search_workspace_vendors(text, text, integer, integer) to service_role;
