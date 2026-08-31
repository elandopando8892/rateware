-- Align the database approval boundary with the reviewed OSP Sales superuser.
-- This changes authorization validation only; it does not create approvals,
-- send messages, enqueue jobs, or invoke external providers.

create or replace function osp_private.assert_approval_actor(
  p_organization_id uuid,
  p_action text,
  p_actor_subject text,
  p_actor_email text,
  p_permissions text[],
  p_actor_role text,
  p_session_id text,
  p_session_issued_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tenant_id uuid := nullif(current_setting('osp.organization_id', true), '')::uuid;
  consequential_count integer;
  expected_role text;
  expected_email text;
  expected_permission text;
  is_superuser boolean;
  session_window interval;
begin
  if tenant_id is null or tenant_id <> p_organization_id or
     p_actor_subject is null or
     p_actor_subject !~ '^[A-Za-z0-9:_@.-]+$' or
     length(p_actor_subject) not between 1 and 256 or
     p_actor_email is null or p_actor_email <> lower(p_actor_email) or
     p_session_id is null or
     p_session_id !~ '^[A-Za-z0-9:_-]+$' or
     length(p_session_id) not between 1 and 256 or
     p_session_issued_at is null or
     p_permissions is null or cardinality(p_permissions) = 0 or
     cardinality(p_permissions) <>
       (select count(distinct permission) from unnest(p_permissions) permission)
  then
    raise exception using errcode = '42501', message = 'OSP_APPROVAL_FORBIDDEN';
  end if;

  is_superuser := p_actor_email = 'sales@heymarksman.com' and
    'osp:superuser' = any(p_permissions);
  session_window := case
    when is_superuser then interval '30 minutes'
    else interval '5 minutes'
  end;

  if p_session_issued_at > statement_timestamp() + interval '30 seconds' or
     p_session_issued_at < statement_timestamp() - session_window
  then
    raise exception using errcode = '42501', message = 'OSP_APPROVAL_FORBIDDEN';
  end if;

  select count(*) into consequential_count
  from unnest(p_permissions) permission
  where permission = any(array[
    'osp:operate',
    'osp:signature-approve',
    'osp:sales-authorize',
    'osp:send-authorized',
    'osp:superuser'
  ]);

  if p_action = 'complete_operations_review' then
    expected_role := 'operations_reviewer';
    expected_permission := 'osp:operate';
  elsif p_action = 'approve_signature' then
    expected_role := 'signature_approver';
    expected_email := 'jgonzalez@xbfreight.com';
    expected_permission := 'osp:signature-approve';
  elsif p_action = 'authorize_outbound' then
    expected_role := 'sales_authorizer';
    expected_email := 'sales@heymarksman.com';
    expected_permission := 'osp:sales-authorize';
  elsif p_action = 'request_authorized_send' then
    expected_role := 'carriers_sender';
    expected_email := 'carriers@xbfreight.com';
    expected_permission := 'osp:send-authorized';
  else
    raise exception using errcode = '42501', message = 'OSP_APPROVAL_FORBIDDEN';
  end if;

  if p_actor_role <> expected_role or consequential_count <> 1 then
    raise exception using errcode = '42501', message = 'OSP_APPROVAL_FORBIDDEN';
  end if;

  if is_superuser then
    if not ('osp:superuser' = any(p_permissions)) then
      raise exception using errcode = '42501', message = 'OSP_APPROVAL_FORBIDDEN';
    end if;
  elsif not (expected_permission = any(p_permissions)) or
        (expected_email is not null and p_actor_email <> expected_email)
  then
    raise exception using errcode = '42501', message = 'OSP_APPROVAL_FORBIDDEN';
  end if;
end;
$$;

revoke all on function osp_private.assert_approval_actor(
  uuid, text, text, text, text[], text, text, timestamptz
) from public, anon, authenticated;
grant execute on function osp_private.assert_approval_actor(
  uuid, text, text, text, text[], text, text, timestamptz
) to osp_workflow_api;

-- Pure validation probes: no business row is inserted or modified.
do $$
declare
  organization_id constant uuid := 'ca0a8f30-1382-4316-9bd5-cb76d9ab4920';
  sales_subject constant text := '76f75fce-fbdc-497a-9667-9a3825dc44e5';
  sales_session constant text := 'd6cd8339-1f63-4c5f-a2f6-17462123e01a';
  command record;
begin
  perform set_config('osp.organization_id', organization_id::text, true);

  for command in
    select * from (values
      ('complete_operations_review', 'operations_reviewer'),
      ('approve_signature', 'signature_approver'),
      ('authorize_outbound', 'sales_authorizer'),
      ('request_authorized_send', 'carriers_sender')
    ) allowed(action_name, actor_role)
  loop
    perform osp_private.assert_approval_actor(
      organization_id,
      command.action_name,
      sales_subject,
      'sales@heymarksman.com',
      array['osp:read', 'osp:superuser'],
      command.actor_role,
      sales_session,
      statement_timestamp() - interval '29 minutes'
    );
  end loop;

  perform osp_private.assert_approval_actor(
    organization_id,
    'authorize_outbound',
    sales_subject,
    'sales@heymarksman.com',
    array['osp:read', 'osp:sales-authorize'],
    'sales_authorizer',
    sales_session,
    statement_timestamp() - interval '4 minutes'
  );

  begin
    perform osp_private.assert_approval_actor(
      organization_id,
      'authorize_outbound',
      sales_subject,
      'sales@heymarksman.com',
      array['osp:read', 'osp:superuser'],
      'sales_authorizer',
      sales_session,
      statement_timestamp() - interval '31 minutes'
    );
    raise exception 'OSP_SUPERUSER_STALE_SESSION_ACCEPTED';
  exception when sqlstate '42501' then
    null;
  end;

  begin
    perform osp_private.assert_approval_actor(
      organization_id,
      'authorize_outbound',
      sales_subject,
      'sales@heymarksman.com',
      array['osp:read', 'osp:superuser', 'osp:sales-authorize'],
      'sales_authorizer',
      sales_session,
      statement_timestamp()
    );
    raise exception 'OSP_MIXED_AUTHORITY_ACCEPTED';
  exception when sqlstate '42501' then
    null;
  end;

  begin
    perform osp_private.assert_approval_actor(
      organization_id,
      'authorize_outbound',
      sales_subject,
      'ops@xbfreight.com',
      array['osp:read', 'osp:superuser'],
      'sales_authorizer',
      sales_session,
      statement_timestamp()
    );
    raise exception 'OSP_NON_SALES_SUPERUSER_ACCEPTED';
  exception when sqlstate '42501' then
    null;
  end;
end;
$$;

