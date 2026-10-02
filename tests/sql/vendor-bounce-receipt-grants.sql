\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'bidware_bounce_test' then raise exception 'Wrong test database'; end if;
  if not has_table_privilege('service_role','public.vendor_email_bounce_resolutions','SELECT')
    or not has_table_privilege('service_role','public.vendor_email_bounce_resolutions','INSERT')
    or has_table_privilege('service_role','public.vendor_email_bounce_resolutions','UPDATE')
    or has_table_privilege('service_role','public.vendor_email_bounce_resolutions','DELETE')
    or has_table_privilege('service_role','public.vendor_email_bounce_resolutions','TRUNCATE')
    or has_table_privilege('service_role','public.vendor_email_bounce_resolutions','REFERENCES')
    or has_table_privilege('service_role','public.vendor_email_bounce_resolutions','TRIGGER')
    or has_table_privilege('service_role','public.vendor_email_bounce_resolutions','MAINTAIN')
    or has_table_privilege('anon','public.vendor_email_bounce_resolutions','SELECT')
    or has_table_privilege('authenticated','public.vendor_email_bounce_resolutions','SELECT') then
    raise exception 'FAIL: receipt ACL does not match SELECT/INSERT-only contract';
  end if;
end $$;
select 'PASS: exact service_role SELECT/INSERT only; browser roles denied';
