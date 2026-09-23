-- OSP browser access belongs to Sales alone. The carrier and operations
-- mailboxes remain service identities for Gmail/worker protocol; this changes
-- only reviewed Supabase Auth browser bindings, never OAuth grants or jobs.
do $$
declare
  changed integer;
begin
  if (select count(*)
      from osp_private.auth_principal_bindings binding
      join auth.users auth_user on auth_user.id = binding.auth_user_id
      where binding.organization_id = 'ca0a8f30-1382-4316-9bd5-cb76d9ab4920'::uuid
        and binding.email = 'sales@heymarksman.com'
        and binding.status = 'active'
        and binding.primary_permission = 'osp:superuser'
        and lower(btrim(auth_user.email)) = binding.email) <> 1 then
    raise exception using errcode = 'P0001', message = 'OSP_SALES_SUPERUSER_NOT_EXACT';
  end if;

  update osp_private.auth_principal_bindings binding
     set status = 'suspended',
         review_note = 'OSP browser access is Sales-only; Gmail mailbox and worker protocol are unchanged.'
   where binding.organization_id = 'ca0a8f30-1382-4316-9bd5-cb76d9ab4920'::uuid
     and binding.email = 'carriers@xbfreight.com'
     and binding.primary_permission is null
     and binding.status = 'active'
     and exists (select 1 from auth.users auth_user
                 where auth_user.id = binding.auth_user_id
                   and lower(btrim(auth_user.email)) = binding.email);
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception using errcode = 'P0001', message = 'OSP_CARRIERS_BROWSER_BINDING_NOT_EXACT';
  end if;

  update osp_private.auth_principal_bindings binding
     set status = 'suspended',
         review_note = 'OSP browser access is Sales-only; Sales superuser retains internal approval authority.'
   where binding.organization_id = 'ca0a8f30-1382-4316-9bd5-cb76d9ab4920'::uuid
     and binding.email = 'jgonzalez@xbfreight.com'
     and binding.primary_permission = 'osp:signature-approve'
     and binding.status = 'active'
     and exists (select 1 from auth.users auth_user
                 where auth_user.id = binding.auth_user_id
                   and lower(btrim(auth_user.email)) = binding.email);
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception using errcode = 'P0001', message = 'OSP_SIGNATURE_BROWSER_BINDING_NOT_EXACT';
  end if;
end;
$$;
