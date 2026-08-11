do $$
declare
  function_definition text;
  updated_definition text;
begin
  select pg_get_functiondef(
    'public.consolidate_exact_workspace_vendor_duplicates(text,text,boolean,integer)'::regprocedure
  ) into function_definition;

  if position('duplicate_keys_all as (' in function_definition) = 0 then
    updated_definition := replace(
      function_definition,
      E'  duplicate_keys as (\n',
      E'  duplicate_keys_all as (\n'
    );

    updated_definition := replace(
      updated_definition,
      E'    having count(*) > 1\n  ),\n  candidate_ids as (',
      E'    having count(*) > 1\n'
        || E'  ),\n'
        || E'  duplicate_keys as (\n'
        || E'    select *\n'
        || E'    from duplicate_keys_all\n'
        || E'    order by organization_key, normalized_name, normalized_domain\n'
        || E'    limit case\n'
        || E'      when p_dry_run then 2147483647\n'
        || E'      else greatest(1, least(coalesce(p_preview_limit, 50), 100))\n'
        || E'    end\n'
        || E'  ),\n'
        || E'  candidate_ids as ('
    );

    if updated_definition = function_definition
       or position('duplicate_keys_all as (' in updated_definition) = 0 then
      raise exception 'Could not add bounded batching to vendor consolidation function.';
    end if;

    execute updated_definition;
  end if;
end;
$$;

create or replace function public.count_exact_workspace_vendor_duplicates(
  p_owner_email text,
  p_organization_id text default null
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $function$
  with scoped as (
    select
      v.owner_email,
      v.organization_id,
      regexp_replace(
        translate(lower(btrim(coalesce(nullif(v.vendor_name, ''), nullif(v.legal_name, ''), nullif(v.name, '')))),
          U&'\00E1\00E9\00ED\00F3\00FA\00FC\00F1', 'aeiouun'),
        '[^a-z0-9]+', '', 'g'
      ) as normalized_name,
      regexp_replace(
        split_part(
          regexp_replace(
            lower(btrim(coalesce(nullif(v.domain, ''), split_part(v.primary_email, '@', 2)))),
            '^https?://', '', 'i'
          ),
          '/', 1
        ),
        '^www\.', '', 'i'
      ) as normalized_domain
    from public.vendors v
    where v.owner_email = p_owner_email
      and (
        nullif(btrim(p_organization_id), '') is null
        or v.organization_id = p_organization_id
        or v.organization_id is null
      )
  ),
  duplicate_groups as (
    select count(*)::integer as group_size
    from scoped
    where normalized_name <> ''
      and normalized_domain <> ''
      and normalized_domain not in (
        'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com',
        'yahoo.com', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com',
        'msn.com', 'gmx.com', 'mail.com'
      )
    group by
      owner_email,
      coalesce(organization_id, nullif(btrim(p_organization_id), ''), ''),
      normalized_name,
      normalized_domain
    having count(*) > 1
  )
  select jsonb_build_object(
    'duplicate_groups', count(*)::integer,
    'duplicates_to_remove', coalesce(sum(group_size - 1), 0)::integer
  )
  from duplicate_groups;
$function$;

revoke all on function public.count_exact_workspace_vendor_duplicates(text, text) from public;
revoke all on function public.count_exact_workspace_vendor_duplicates(text, text) from anon;
revoke all on function public.count_exact_workspace_vendor_duplicates(text, text) from authenticated;
grant execute on function public.count_exact_workspace_vendor_duplicates(text, text) to service_role;
