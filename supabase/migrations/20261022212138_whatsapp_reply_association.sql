-- Sprint23: local candidate. No data repair, no provider call, no commercial mutation.
begin;

create or replace function public.whatsapp_reply_phone(p_value text)
returns text language sql immutable set search_path = '' as $$
 select case when p_value ~ '^\+?[1-9][0-9]{10,14}$' then
   case when ltrim(p_value, '+') ~ '^521[0-9]{10}$'
     then '52' || substring(ltrim(p_value, '+') from 4) else ltrim(p_value, '+') end else null end
$$;

create or replace function public.whatsapp_reply_candidates(p_owner text, p_receipt uuid)
returns table(message_id uuid, event_id uuid, event_code text, event_name text, vendor_name text,
 subject text, sent_at timestamptz, version text)
language sql stable security invoker set search_path = '' as $$
 select m.id, e.id, e.rfx_id, e.name, v.vendor_name, m.subject, m.sent_at,
   md5(to_jsonb(m)::text || to_jsonb(e)::text || to_jsonb(v)::text || to_jsonb(c)::text)
 from public.contact_history h
 join public.whatsapp_business_connections c on c.id = h.whatsapp_connection_id and c.owner_email = p_owner
 join public.outreach_messages m on m.owner_email = p_owner and m.whatsapp_connection_id = c.id
 join public.rfx_events e on e.id = m.rfx_event_id and e.owner_email = p_owner
 join public.vendors v on v.id = m.vendor_id and v.owner_email = p_owner
 where h.id = p_receipt and h.owner_email = p_owner and h.channel = 'whatsapp' and h.direction = 'inbound'
 and h.metadata->>'provider' = 'meta' and h.metadata->'callback'->>'kind' = 'inbound'
 and nullif(h.metadata->'callback'->>'context_id', '') is null
 and h.metadata->'association'->>'state' = 'pending'
 and h.rfx_event_id is null and h.outreach_message_id is null
 and (c.owner_user_id is null or (h.owner_user_id = c.owner_user_id and m.owner_user_id = c.owner_user_id))
 and m.channel = 'whatsapp' and nullif(m.provider_message_id, '') is not null
 and m.sent_at is not null and date_trunc('second',m.sent_at) <= date_trunc('second',h.occurred_at)
 and m.status in ('sent','delivered','read','replied','failed','delivery_unknown','archived')
 and (m.send_attempt_id is null or m.send_completed_at is not null)
 and public.whatsapp_reply_phone(m.normalized_recipient_phone) = public.whatsapp_reply_phone(h.metadata->>'from_phone')
 and public.whatsapp_reply_phone(h.metadata->'callback'->>'from_phone') = public.whatsapp_reply_phone(h.metadata->>'from_phone')
 order by m.sent_at desc, m.id
$$;

create or replace function public.review_whatsapp_reply(p_owner text, p_receipt uuid, p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare h public.contact_history%rowtype; rows jsonb; n bigint; linked jsonb;
begin
 if nullif(p_owner,'') is null or p_receipt is null or p_offset is null or p_offset < 0 or p_offset > 10000 then
   raise exception using errcode='PT400', message='Invalid association review.'; end if;
 select * into h from public.contact_history where id=p_receipt and owner_email=p_owner and channel='whatsapp' and direction='inbound';
 if not found then raise exception using errcode='PT404',message='Reply not found.'; end if;
 select jsonb_build_object('code',e.rfx_id,'name',e.name) into linked from public.rfx_events e
   join public.outreach_messages m on m.id=h.outreach_message_id and m.rfx_event_id=e.id and m.owner_email=p_owner
   where e.id=h.rfx_event_id and e.owner_email=p_owner;
 select count(*) into n from public.whatsapp_reply_candidates(p_owner,p_receipt);
 select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into rows from
   (select * from public.whatsapp_reply_candidates(p_owner,p_receipt) limit 25 offset p_offset) q;
 return jsonb_build_object('contract','bidware.whatsapp-association.v1','receipt',jsonb_build_object(
   'id',h.id,'body_preview',left(h.body_preview,2000),'occurred_at',h.occurred_at,'received_at',h.metadata->>'received_at',
   'from_phone',public.whatsapp_reply_phone(h.metadata->>'from_phone'),'version',md5(to_jsonb(h)::text),
   'state',h.metadata->'association'->>'state','reason',h.metadata->'association'->>'reason',
   'event_id',h.rfx_event_id,'message_id',h.outreach_message_id,'event_code',linked->>'code','event_name',linked->>'name',
   'resolved_at',h.metadata->'manual_association'->>'resolved_at','resolved_by',h.metadata->'manual_association'->>'actor_email'),
   'candidates',rows,'total',n,'offset',p_offset,'has_more',p_offset+jsonb_array_length(rows)<n);
end
$$;

create or replace function public.associate_whatsapp_reply(p_owner text,p_actor text,p_receipt uuid,p_message uuid,
 p_receipt_version text,p_message_version text,p_operation uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare h public.contact_history%rowtype; m public.outreach_messages%rowtype; choice record;
 c public.whatsapp_business_connections%rowtype; prior jsonb; decision jsonb; target jsonb; stamp timestamptz:=clock_timestamp();
begin
 if nullif(p_owner,'') is null or nullif(p_actor,'') is null or length(p_actor)>320 or p_receipt is null or p_message is null
   or p_operation is null or p_receipt_version is null or p_message_version is null
   or p_receipt_version !~ '^[0-9a-f]{32}$' or p_message_version !~ '^[0-9a-f]{32}$' then
   raise exception using errcode='PT400',message='Invalid association request.'; end if;
 select * into h from public.contact_history where id=p_receipt and owner_email=p_owner and channel='whatsapp' and direction='inbound' for update;
 if not found then raise exception using errcode='PT404',message='Reply not found.'; end if;
 prior:=h.metadata->'manual_association';
 if h.outreach_message_id is not null or h.rfx_event_id is not null then
   if prior->>'operation_id'=p_operation::text and prior->>'actor_email'=p_actor and h.outreach_message_id=p_message
     and prior->>'receipt_version'=p_receipt_version and prior->>'message_version'=p_message_version then
     return jsonb_build_object('contract','bidware.whatsapp-association.v1','receipt_id',h.id,'message_id',h.outreach_message_id,
       'event_id',h.rfx_event_id,'replayed',true,'resolved_at',prior->>'resolved_at');
   end if;
   raise exception using errcode='PT409',message='Reply already associated. Refresh before deciding.';
 end if;
 if h.metadata->'association'->>'state' is distinct from 'pending' or md5(to_jsonb(h)::text)<>p_receipt_version then
   raise exception using errcode='PT409',message='Reply changed. Review again.'; end if;
 select * into m from public.outreach_messages where id=p_message and owner_email=p_owner for update;
 if not found then raise exception using errcode='PT404',message='Invitation not found.'; end if;
 -- Hold ownership/identity dependencies through the commit, not just through preview.
 select * into c from public.whatsapp_business_connections where id=h.whatsapp_connection_id and owner_email=p_owner for share;
 if not found then raise exception using errcode='PT409',message='Connection changed. Review again.'; end if;
 perform 1 from public.rfx_events where id=m.rfx_event_id and owner_email=p_owner for share;
 if not found then raise exception using errcode='PT404',message='Invitation not found.'; end if;
 perform 1 from public.vendors where id=m.vendor_id and owner_email=p_owner for share;
 if not found then raise exception using errcode='PT404',message='Invitation not found.'; end if;
 select * into choice from public.whatsapp_reply_candidates(p_owner,p_receipt) where message_id=p_message;
 if not found or choice.version<>p_message_version then
   raise exception using errcode='PT409',message='Invitation changed or incompatible. Review again.'; end if;
 decision:=jsonb_build_object('operation_id',p_operation,'actor_email',p_actor,'resolved_at',stamp,
   'receipt_version',p_receipt_version,'message_version',p_message_version,
   'previous_association',h.metadata->'association','event_code',choice.event_code,'event_name',choice.event_name);
 target:=jsonb_build_object('id',m.id,'owner_email',m.owner_email,'owner_user_id',m.owner_user_id,
   'provider_message_id',m.provider_message_id,'normalized_recipient_phone',m.normalized_recipient_phone,
   'whatsapp_connection_id',m.whatsapp_connection_id,'rfx_event_id',m.rfx_event_id,'vendor_id',m.vendor_id,'campaign_id',m.campaign_id);
 update public.contact_history set outreach_message_id=m.id,rfx_event_id=m.rfx_event_id,vendor_id=m.vendor_id,campaign_id=m.campaign_id,
   metadata=h.metadata || jsonb_build_object('target_binding',target,'manual_association',decision,
     'association',jsonb_build_object('state','linked','reason','manual','initial_reason',h.metadata->'association'->>'reason','resolved_at',stamp))
   where id=h.id;
 -- Receipt and tracking commit together; preserve original content/approval/provider evidence.
 update public.outreach_messages set status=case when status='archived' then status else 'replied' end,
   delivery_status='replied',updated_at=stamp,
   send_result=coalesce(send_result,'{}'::jsonb)||jsonb_build_object('manual_reply_association',jsonb_build_object(
     'contract','bidware.whatsapp-association.v1','receipt_id',h.id,'operation_id',p_operation,'resolved_at',stamp,
     'outreach_message_id',m.id,'rfx_event_id',m.rfx_event_id,'outbound_provider_message_id',m.provider_message_id,
     'occurred_at',h.occurred_at))
   where id=m.id;
 insert into public.saas_audit_log(owner_email,actor_email,action,entity_type,entity_id,summary,metadata)
   values(p_owner,p_actor,'associate_whatsapp_reply','contact_history',h.id::text,'WhatsApp reply associated by an operator',
     decision||jsonb_build_object('outreach_message_id',m.id,'rfx_event_id',m.rfx_event_id));
 return jsonb_build_object('contract','bidware.whatsapp-association.v1','receipt_id',h.id,'message_id',m.id,
   'event_id',m.rfx_event_id,'replayed',false,'resolved_at',stamp);
end
$$;

revoke all on function public.whatsapp_reply_phone(text), public.whatsapp_reply_candidates(text,uuid),
 public.review_whatsapp_reply(text,uuid,integer), public.associate_whatsapp_reply(text,text,uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.whatsapp_reply_phone(text), public.whatsapp_reply_candidates(text,uuid),
 public.review_whatsapp_reply(text,uuid,integer), public.associate_whatsapp_reply(text,text,uuid,uuid,text,text,uuid) to service_role;
commit;
