-- Add one private kind to the existing ledger. No new tables, public grants or
-- edits to existing receipts. Check the live schema before applying this file.
begin;
alter table public.demand_radar_spot_jobs
  drop constraint demand_radar_spot_jobs_job_key_check,
  add constraint demand_radar_spot_jobs_job_key_check check
    (job_key ~ '^(bidware_lead_request|bidware_approval|bidware_project|bidware_intake_review):[a-f0-9]{64}$'),
  drop constraint demand_radar_spot_job_kind,
  add constraint demand_radar_spot_job_kind check (
    (provider='radar' and action='bidware_lead_request_confirm' and job_key like 'bidware_lead_request:%') or
    (provider='radar' and action='bidware_requirement_approve' and job_key like 'bidware_approval:%') or
    (provider='radar' and action='bidware_intake_review' and job_key like 'bidware_intake_review:%') or
    (provider='rateware' and action='bidware_project_create' and job_key like 'bidware_project:%'));

create function public.demand_radar_guard_spot_review() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if old.action='bidware_intake_review' and new.receipt_text is distinct from old.receipt_text
  then raise exception 'SPOT_REVIEW_IMMUTABLE'; end if;
  return new;
end $$;
revoke all on function public.demand_radar_guard_spot_review() from public,anon,authenticated;
grant execute on function public.demand_radar_guard_spot_review() to service_role;
create trigger demand_radar_spot_review_guard before update on public.demand_radar_spot_jobs
  for each row execute function public.demand_radar_guard_spot_review();
create index demand_radar_spot_review_lookup on public.demand_radar_spot_jobs(owner_user_id,subject_id,job_key)
  where action='bidware_intake_review' and provider='radar';
commit;
