-- Gives the verified Sales principal one auditable OSP superuser permission.
-- The single permission replaces role switching; each command still records
-- the stage-specific approval role in the immutable approval ledger.

alter table osp_private.auth_principal_bindings
  drop constraint auth_principal_bindings_permission_check;

alter table osp_private.auth_principal_bindings
  add constraint auth_principal_bindings_permission_check check (
    primary_permission is null or primary_permission in (
      'osp:operate',
      'osp:signature-approve',
      'osp:sales-authorize',
      'osp:superuser'
    )
  );

do $$
declare
  affected integer;
begin
  update osp_private.auth_principal_bindings
     set primary_permission = 'osp:superuser',
         reviewed_at = statement_timestamp(),
         reviewed_by = 'osp-sales-superuser-migration',
         review_note = 'User-approved permanent OSP superuser for the verified Sales Google identity.'
   where organization_id = 'ca0a8f30-1382-4316-9bd5-cb76d9ab4920'::uuid
     and email = 'sales@heymarksman.com'
     and status = 'active';

  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception using errcode = 'P0001', message = 'OSP_SALES_SUPERUSER_BINDING_NOT_EXACT';
  end if;
end;
$$;

comment on table osp_private.auth_principal_bindings is
  'Reviewed Supabase Auth principals for OSP. Read is implicit; one consequential permission or the Sales superuser permission is allowed per identity.';
comment on column osp_private.auth_principal_bindings.primary_permission is
  'Fail-closed authority: one stage permission or osp:superuser for the reviewed Sales identity.';
