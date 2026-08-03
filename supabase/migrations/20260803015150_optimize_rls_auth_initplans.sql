-- Evaluate immutable request claims once per statement instead of once per row.
-- The policy predicates and workspace boundaries remain unchanged.
do $migration$
declare
  policy_record record;
  updated_policy_count integer := 0;
  optimized_qual text;
  optimized_with_check text;
begin
  for policy_record in
    with target_policies(table_name, policy_name) as (
      values
        ('growth_campaign_members', 'workspace users can manage growth campaign members'),
        ('growth_campaign_messages', 'workspace users can manage growth campaign messages'),
        ('growth_campaigns', 'workspace users can manage growth campaigns'),
        ('growth_results', 'workspace users can manage growth results'),
        ('growth_segments', 'workspace users can manage growth segments'),
        ('rfx_ratebook_segments', 'authenticated users can access ratebook segments'),
        ('rfx_ratebook_shares', 'authenticated users can access ratebook shares'),
        ('rfx_ratebooks', 'authenticated users can access ratebooks'),
        ('shipper_account_actions', 'workspace users can manage shipper account actions'),
        ('shipper_contacts', 'workspace users can manage shipper contacts'),
        ('shipper_lanes', 'workspace users can manage shipper lanes'),
        ('shipper_locations', 'workspace users can manage shipper locations'),
        ('shipper_opportunities', 'workspace users can manage shipper opportunities'),
        ('shipper_profile_requests', 'workspace users can read shipper profile requests'),
        ('shipper_profile_submissions', 'workspace users can read shipper profile submissions'),
        ('shipper_rfis', 'workspace users can manage shipper rfis'),
        ('shippers', 'workspace users can manage shippers'),
        ('whatsapp_business_connections', 'workspace users can read whatsapp connections'),
        ('whatsapp_business_connections', 'workspace users can insert whatsapp connections'),
        ('whatsapp_business_connections', 'workspace users can update whatsapp connections'),
        ('whatsapp_business_connections', 'workspace users can delete whatsapp connections'),
        ('whatsapp_outreach_template_mappings', 'workspace users can read whatsapp outreach mappings'),
        ('whatsapp_outreach_template_mappings', 'workspace users can insert whatsapp outreach mappings'),
        ('whatsapp_outreach_template_mappings', 'workspace users can update whatsapp outreach mappings'),
        ('whatsapp_outreach_template_mappings', 'workspace users can delete whatsapp outreach mappings')
    )
    select policies.*
    from target_policies targets
    join pg_policies policies
      on policies.schemaname = 'public'
     and policies.tablename = targets.table_name
     and policies.policyname = targets.policy_name
    order by policies.tablename, policies.policyname
  loop
    optimized_qual := case
      when policy_record.qual is null then null
      else replace(policy_record.qual, 'auth.jwt()', '(select auth.jwt())')
    end;
    optimized_with_check := case
      when policy_record.with_check is null then null
      else replace(policy_record.with_check, 'auth.jwt()', '(select auth.jwt())')
    end;

    if optimized_qual is not null and optimized_with_check is not null then
      execute format(
        'alter policy %I on public.%I using (%s) with check (%s)',
        policy_record.policyname,
        policy_record.tablename,
        optimized_qual,
        optimized_with_check
      );
    elsif optimized_qual is not null then
      execute format(
        'alter policy %I on public.%I using (%s)',
        policy_record.policyname,
        policy_record.tablename,
        optimized_qual
      );
    elsif optimized_with_check is not null then
      execute format(
        'alter policy %I on public.%I with check (%s)',
        policy_record.policyname,
        policy_record.tablename,
        optimized_with_check
      );
    end if;

    updated_policy_count := updated_policy_count + 1;
  end loop;

  if updated_policy_count <> 25 then
    raise exception 'Expected to optimize 25 RLS policies, optimized %', updated_policy_count;
  end if;
end;
$migration$;
