-- The Operations mailbox is an automation identity, not a human OSP login.
-- Suspend only its reviewed browser principal. Gmail intake and osp-worker
-- use their existing service credentials and are not changed by this update.
do $$
declare
  affected integer;
begin
  update osp_private.auth_principal_bindings binding
     set status = 'suspended',
         review_note = 'Operations mailbox is automation-only; Sales retains human superuser access.'
   where binding.organization_id = 'ca0a8f30-1382-4316-9bd5-cb76d9ab4920'::uuid
     and binding.email = 'ops@xbfreight.com'
     and binding.primary_permission = 'osp:operate'
     and binding.status = 'active'
     and exists (
       select 1 from auth.users auth_user
       where auth_user.id = binding.auth_user_id
         and lower(btrim(auth_user.email)) = binding.email
     );

  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception using errcode = 'P0001', message = 'OSP_OPERATIONS_BROWSER_BINDING_NOT_EXACT';
  end if;
end;
$$;
