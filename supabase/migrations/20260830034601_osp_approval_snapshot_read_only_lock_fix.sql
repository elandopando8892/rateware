create or replace function osp_private.assert_package_snapshot_hash_current(
  p_organization_id uuid,
  p_case_id uuid,
  p_snapshot_sha256 text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_snapshot osp_private.case_package_input_snapshots%rowtype;
  document_version_id uuid;
begin
  if nullif(pg_catalog.current_setting('osp.organization_id', true), '')::uuid is distinct from p_organization_id then
    raise exception using errcode = '42501', message = 'OSP_APPROVAL_FORBIDDEN';
  end if;

  -- The case lock serializes package snapshots and approval transitions for this case.
  perform 1
  from osp_private.customer_registration_cases case_record
  where case_record.organization_id = p_organization_id
    and case_record.id = p_case_id
  for update;
  if not found then
    raise exception using errcode = '23514', message = 'OSP_SNAPSHOT_MISMATCH';
  end if;

  -- Package snapshots are append-only. A row lock here would unnecessarily require
  -- UPDATE on the read-only workflow role; the latest-snapshot predicate and case
  -- lock preserve the same authority boundary.
  select * into current_snapshot
  from osp_private.case_package_input_snapshots snapshot
  where snapshot.organization_id = p_organization_id
    and snapshot.case_id = p_case_id
    and snapshot.canonical_sha256 = p_snapshot_sha256
    and not exists (
      select 1
      from osp_private.case_package_input_snapshots later
      where later.organization_id = snapshot.organization_id
        and later.case_id = snapshot.case_id
        and (later.created_at, later.id) > (snapshot.created_at, snapshot.id)
    );
  if not found then
    raise exception using errcode = '23514', message = 'OSP_SNAPSHOT_MISMATCH';
  end if;

  -- Document lifecycle mutations take the same advisory locks, so the final
  -- currentness check cannot race with an approval/supersession transition.
  foreach document_version_id in array current_snapshot.document_version_ids loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      pg_catalog.json_build_array(
        p_organization_id, 'document_effect', document_version_id
      )::text,
      0
    ));
  end loop;

  if not osp_private.package_snapshot_hash_is_current(
    p_organization_id,
    p_case_id,
    p_snapshot_sha256
  ) then
    raise exception using errcode = '23514', message = 'OSP_SNAPSHOT_MISMATCH';
  end if;
end;
$$;

revoke all on function osp_private.assert_package_snapshot_hash_current(uuid, uuid, text)
  from public, anon, authenticated, service_role, osp_worker;
grant execute on function osp_private.assert_package_snapshot_hash_current(uuid, uuid, text)
  to osp_workflow_api;

comment on function osp_private.assert_package_snapshot_hash_current(uuid, uuid, text) is
  'Validates current package evidence using the case lock and document advisory locks without broadening the workflow role beyond SELECT.';
