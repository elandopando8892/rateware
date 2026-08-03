-- Rateware authorizes Kinde users inside Edge Functions. Browser Supabase roles
-- must not retain unrestricted write policies that bypass that API boundary.
do $migration$
declare
  policy_record record;
  matched_count integer;
begin
  select count(*)
  into matched_count
  from pg_policies policies
  join (
    values
      ('bid_room_chat_messages', 'authenticated users can write bid room chat messages'),
      ('bid_room_chat_threads', 'authenticated users can write bid room chat threads'),
      ('contact_history', 'authenticated users can create contact history'),
      ('email_suppression_list', 'authenticated users can create email suppressions'),
      ('email_suppression_list', 'authenticated users can update email suppressions'),
      ('google_chat_connections', 'authenticated users can write google chat connections'),
      ('google_chat_oauth_states', 'authenticated users can write google chat oauth states'),
      ('onboarding_checklist', 'authenticated users can create onboarding checklist'),
      ('onboarding_checklist', 'authenticated users can update onboarding checklist'),
      ('organizations', 'authenticated users can create organizations'),
      ('organizations', 'authenticated users can update organizations'),
      ('outreach_campaigns', 'authenticated users can create outreach campaigns'),
      ('outreach_campaigns', 'authenticated users can update outreach campaigns'),
      ('outreach_messages', 'authenticated users can create outreach messages'),
      ('outreach_messages', 'authenticated users can update outreach messages'),
      ('outreach_templates', 'authenticated users can create outreach templates'),
      ('outreach_templates', 'authenticated users can update outreach templates'),
      ('rate_staging', 'authenticated users can review rate staging'),
      ('rateware_book_versions', 'authenticated users can create rateware book versions'),
      ('rfx_events', 'authenticated users can create rfx events'),
      ('rfx_events', 'authenticated users can update rfx events'),
      ('rfx_lane_vendors', 'authenticated users can create rfx lane vendors'),
      ('rfx_lane_vendors', 'authenticated users can update rfx lane vendors'),
      ('rfx_lanes', 'authenticated users can create rfx lanes'),
      ('rfx_lanes', 'authenticated users can update rfx lanes'),
      ('rfx_package_segments', 'authenticated users can write rfx package segments'),
      ('rfx_segment_confirmations', 'authenticated users can write rfx segment confirmations'),
      ('saas_audit_log', 'authenticated users can create saas audit log'),
      ('user_profiles', 'authenticated users can create user profiles'),
      ('user_profiles', 'authenticated users can update user profiles'),
      ('vendor_improvement_cases', 'authenticated users can manage vendor improvement cases'),
      ('vendor_value_scorecards', 'authenticated users can manage vendor value scorecards'),
      ('vendor_whatsapp_contacts', 'authenticated users can write vendor whatsapp contacts'),
      ('vendor_whatsapp_groups', 'authenticated users can write vendor whatsapp groups')
  ) as targets(table_name, policy_name)
    on targets.table_name = policies.tablename
   and targets.policy_name = policies.policyname
  where policies.schemaname = 'public';

  if matched_count <> 34 then
    raise exception 'Expected 34 permissive browser write policies, found %', matched_count;
  end if;

  for policy_record in
    select *
    from (
      values
        ('bid_room_chat_messages', 'authenticated users can write bid room chat messages'),
        ('bid_room_chat_threads', 'authenticated users can write bid room chat threads'),
        ('contact_history', 'authenticated users can create contact history'),
        ('email_suppression_list', 'authenticated users can create email suppressions'),
        ('email_suppression_list', 'authenticated users can update email suppressions'),
        ('google_chat_connections', 'authenticated users can write google chat connections'),
        ('google_chat_oauth_states', 'authenticated users can write google chat oauth states'),
        ('onboarding_checklist', 'authenticated users can create onboarding checklist'),
        ('onboarding_checklist', 'authenticated users can update onboarding checklist'),
        ('organizations', 'authenticated users can create organizations'),
        ('organizations', 'authenticated users can update organizations'),
        ('outreach_campaigns', 'authenticated users can create outreach campaigns'),
        ('outreach_campaigns', 'authenticated users can update outreach campaigns'),
        ('outreach_messages', 'authenticated users can create outreach messages'),
        ('outreach_messages', 'authenticated users can update outreach messages'),
        ('outreach_templates', 'authenticated users can create outreach templates'),
        ('outreach_templates', 'authenticated users can update outreach templates'),
        ('rate_staging', 'authenticated users can review rate staging'),
        ('rateware_book_versions', 'authenticated users can create rateware book versions'),
        ('rfx_events', 'authenticated users can create rfx events'),
        ('rfx_events', 'authenticated users can update rfx events'),
        ('rfx_lane_vendors', 'authenticated users can create rfx lane vendors'),
        ('rfx_lane_vendors', 'authenticated users can update rfx lane vendors'),
        ('rfx_lanes', 'authenticated users can create rfx lanes'),
        ('rfx_lanes', 'authenticated users can update rfx lanes'),
        ('rfx_package_segments', 'authenticated users can write rfx package segments'),
        ('rfx_segment_confirmations', 'authenticated users can write rfx segment confirmations'),
        ('saas_audit_log', 'authenticated users can create saas audit log'),
        ('user_profiles', 'authenticated users can create user profiles'),
        ('user_profiles', 'authenticated users can update user profiles'),
        ('vendor_improvement_cases', 'authenticated users can manage vendor improvement cases'),
        ('vendor_value_scorecards', 'authenticated users can manage vendor value scorecards'),
        ('vendor_whatsapp_contacts', 'authenticated users can write vendor whatsapp contacts'),
        ('vendor_whatsapp_groups', 'authenticated users can write vendor whatsapp groups')
    ) as targets(table_name, policy_name)
  loop
    execute format(
      'drop policy %I on public.%I',
      policy_record.policy_name,
      policy_record.table_name
    );
  end loop;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and cmd <> 'SELECT'
      and (
        trim(coalesce(qual, '')) in ('true', '(true)')
        or trim(coalesce(with_check, '')) in ('true', '(true)')
      )
  ) then
    raise exception 'A permissive browser write policy remains in the public schema';
  end if;
end;
$migration$;

-- Preserve the default-deny Data API boundary even if grants drifted after the
-- original hardening migration. Edge Functions continue to use service_role.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter default privileges in schema public
  revoke all on tables from anon, authenticated;

alter default privileges in schema public
  revoke all on sequences from anon, authenticated;
