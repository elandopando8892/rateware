\set ON_ERROR_STOP on
set bounce_test.require_preservation = :'require_preservation';
begin;
do $$
declare s text; v uuid; op uuid; e text; reply jsonb; before_row jsonb; before_vendor jsonb; preserved boolean;
begin
  if current_database() <> 'bidware_bounce_test' then raise exception 'Wrong test database'; end if;
  foreach s in array array['hard_bounce','soft_bounce','delivery_incomplete','complaint','unsubscribed','manual'] loop
    v := md5('vendor:' || s)::uuid;
    op := md5('operation:' || s)::uuid;
    e := s || '@example.test';
    insert into public.vendors(id,owner_email,primary_email,secondary_emails,tags,profile_data)
      values(v,'org:test',e,'{}',array['email_bounce'],jsonb_build_object('bounced_emails',jsonb_build_array(jsonb_build_object('email',e))));
    insert into public.email_suppression_list(id,owner_email,email,status)
      values(md5('suppression:' || s)::uuid,'org:test',e,s);
    select to_jsonb(t) into before_row from public.email_suppression_list t where owner_email='org:test' and email=e;
    set local role service_role;
    reply := public.resolve_vendor_email_bounce('org:test',v,e,'replacement@example.test',op);
    reset role;
    if (reply->>'replayed')::boolean is distinct from false then raise exception 'Expected first correction'; end if;
    select to_jsonb(t)=before_row into preserved from public.email_suppression_list t where owner_email='org:test' and email=e;
    raise notice 'status=%, suppression_preserved=%',s,preserved;
    if current_setting('bounce_test.require_preservation')='true' then
      if s in ('complaint','unsubscribed','manual') and preserved is distinct from true then
        raise exception 'FAIL: protected suppression changed: %',s;
      elsif s in ('hard_bounce','soft_bounce','delivery_incomplete') and not exists(select 1 from public.email_suppression_list where owner_email='org:test' and email=e and resolved_at is not null and replacement_email='replacement@example.test') then
        raise exception 'FAIL: bounce suppression not resolved: %',s;
      end if;
    end if;
    set local role service_role;
    reply := public.resolve_vendor_email_bounce('org:test',v,e,'replacement@example.test',op);
    reset role;
    if (reply->>'replayed')::boolean is distinct from true then raise exception 'FAIL: same UUID not replayed: %',s; end if;
    if (select count(*) from public.vendor_email_bounce_resolutions where owner_email='org:test' and operation_id=op)<>1 then raise exception 'FAIL: duplicate receipt'; end if;
    if s in ('complaint','unsubscribed','manual') then
      insert into public.email_suppression_list(id,owner_email,email,status)
        values(md5('replacement:' || s)::uuid,'org:test','replacement@example.test',s);
      select to_jsonb(t) into before_vendor from public.vendors t where id=v;
      begin
        set local role service_role;
        perform public.resolve_vendor_email_bounce('org:test',v,e,'replacement@example.test',op);
        raise exception 'FAIL: newly protected replacement admitted on replay';
      exception when others then
        if sqlerrm <> 'bounce_resolution_state_changed' then raise; end if;
      end;
      reset role;
      if before_vendor is distinct from (select to_jsonb(t) from public.vendors t where id=v)
        or (select count(*) from public.vendor_email_bounce_resolutions where owner_email='org:test' and operation_id=op)<>1 then
        raise exception 'FAIL: rejected replay changed vendor or receipt';
      end if;
      raise notice 'replacement_status=%, replay_blocked=true, vendor_unchanged=true',s;
      delete from public.email_suppression_list where owner_email='org:test' and email='replacement@example.test';
    end if;
  end loop;
end $$;
rollback;
