create or replace function osp_private.complete_background_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_completed_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, osp_private
as $function$
declare
  changed integer;
begin
  update osp_private.background_jobs
     set completed_at = p_completed_at,
         retry_at = null,
         last_error_code = null,
         lease_token = null,
         leased_until = null
   where id = p_job_id
     and lease_token = p_lease_token
     and completed_at is null;
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception using errcode = 'P0001', message = 'LEASE_CONFLICT';
  end if;
end;
$function$;

revoke all on function osp_private.complete_background_job(uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role, osp_workflow_api;
grant execute on function osp_private.complete_background_job(uuid, uuid, timestamptz)
  to osp_worker;
