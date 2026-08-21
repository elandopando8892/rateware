-- Sanitized read models for the Document Review, Approval Center and Delivery
-- Workspace operator surfaces. All three are views over existing tables; no new
-- table is introduced and no data is duplicated.
--
-- Redaction follows the precedent already set by the communications inbox and
-- the onboarding workspace: an operator sees enough posture to make a decision,
-- never the underlying values, addresses, bodies or hashes.

-- 1. Document review field detail ------------------------------------------
-- The review list already exists as provider_entity_document_review_queue.
-- This adds the per-field provenance the review screen needs. Proposed values
-- for restricted and highly restricted fields are withheld entirely: the
-- reviewer works from the field code, source and status, and opens the document
-- itself through the separate, audited disclosure path when a value is needed.
create or replace view public.provider_onboarding_field_review
with (security_invoker = true)
as
select
  f.organization_id,
  f.review_id,
  f.id as field_id,
  r.legal_entity_id,
  r.document_asset_id,
  a.document_type,
  f.field_code,
  f.sensitivity,
  f.field_status,
  (f.sensitivity in ('restricted','highly_restricted')) as value_withheld,
  case
    when f.sensitivity in ('restricted','highly_restricted') then null
    else f.proposed_value
  end as proposed_value,
  (f.proposed_value is not null) as has_proposed_value,
  (f.reviewer_value is not null) as has_reviewer_correction,
  f.decided_by_user_id,
  f.decided_at,
  f.created_at,
  f.updated_at,
  count(*) over (partition by f.organization_id, f.review_id)::integer as review_field_count,
  count(*) filter (where f.field_status = 'pending')
    over (partition by f.organization_id, f.review_id)::integer as review_pending_count
from public.provider_entity_document_review_fields f
join public.provider_entity_document_reviews r
  on r.organization_id = f.organization_id and r.id = f.review_id
join public.provider_legal_entity_document_assets a
  on a.organization_id = r.organization_id and a.id = r.document_asset_id;

-- 2. Approval Center --------------------------------------------------------
-- Projects approval posture, not the manifest itself. manifest_sha256 is never
-- exposed; the surface reports only that a manifest is bound, so a tampered or
-- re-cut package is still caught server-side rather than compared by eye.
create or replace view public.provider_onboarding_approval_queue
with (security_invoker = true)
as
select
  p.organization_id,
  p.id as package_id,
  p.case_id,
  p.package_version,
  p.package_status,
  p.revision,
  p.purpose_code,
  p.required_approval_count,
  (p.manifest_sha256 is not null) as manifest_bound,
  p.requested_by_actor_id,
  p.requested_at,
  p.approved_at,
  p.expires_at,
  p.revoked_at,
  p.revocation_reason_code,
  coalesce(d.approved_count, 0)::integer as approved_count,
  coalesce(d.rejected_count, 0)::integer as rejected_count,
  (coalesce(d.approved_count, 0) >= p.required_approval_count) as approval_complete,
  (p.expires_at is not null and p.expires_at <= now()) as authorization_expired,
  -- An approver who is also the requester cannot satisfy separation of duties.
  -- The table constraint already rejects that write; surfacing it here lets the
  -- operator see why an otherwise-complete package is still not actionable.
  (p.requested_by_actor_id = any(coalesce(d.approver_actor_ids, array[]::text[]))) as separation_conflict,
  count(*) filter (where p.package_status = 'pending_approval')
    over (partition by p.organization_id)::integer as pending_packages,
  count(*) filter (where p.expires_at is not null and p.expires_at <= now())
    over (partition by p.organization_id)::integer as expired_packages
from public.provider_onboarding_release_packages p
left join lateral (
  select
    count(*) filter (where v.decision = 'approved') as approved_count,
    count(*) filter (where v.decision = 'rejected') as rejected_count,
    array_agg(v.approver_actor_id) filter (where v.decision = 'approved') as approver_actor_ids
  from public.provider_onboarding_release_package_approvals v
  where v.organization_id = p.organization_id
    and v.package_id = p.id
    and v.package_revision = p.revision
) d on true;

-- 3. Delivery Workspace -----------------------------------------------------
-- Mailbox address, recipient address, subject and body are never projected.
-- The recipient domain is retained because recipient-domain policy is an
-- explicit operator approval gate; the local part is not.
create or replace view public.provider_onboarding_delivery_workspace
with (security_invoker = true)
as
select
  m.organization_id,
  m.id as message_id,
  m.case_id,
  m.package_id,
  m.assembly_id,
  m.message_status,
  m.revision,
  split_part(m.recipient_email, '@', 2) as recipient_domain,
  split_part(m.mailbox_email, '@', 2) as mailbox_domain,
  (m.attachment_sha256 is not null) as has_attachment,
  m.requested_by_actor_id,
  m.approved_by_actor_id,
  (m.approved_by_actor_id is not null) as send_approved,
  m.followup_number,
  m.next_followup_at,
  m.scheduled_at,
  m.sent_at,
  (m.gmail_thread_id is not null) as thread_bound,
  m.send_attempts,
  m.last_error_code,
  m.created_at,
  m.updated_at,
  count(*) filter (where m.message_status in ('draft','pending_approval'))
    over (partition by m.organization_id)::integer as awaiting_approval,
  count(*) filter (where m.message_status = 'failed')
    over (partition by m.organization_id)::integer as failed_messages,
  count(*) filter (where m.next_followup_at is not null and m.next_followup_at <= now())
    over (partition by m.organization_id)::integer as followups_due
from public.provider_onboarding_outbound_messages m;

revoke all on public.provider_onboarding_field_review from public, anon, authenticated;
revoke all on public.provider_onboarding_approval_queue from public, anon, authenticated;
revoke all on public.provider_onboarding_delivery_workspace from public, anon, authenticated;

grant select on
  public.provider_onboarding_field_review,
  public.provider_onboarding_approval_queue,
  public.provider_onboarding_delivery_workspace
to service_role;

-- security_invoker views run with the caller's privileges, so the backend role
-- needs read access to each underlying table as well.
grant select on table
  public.provider_entity_document_review_fields,
  public.provider_entity_document_reviews
to service_role;

comment on view public.provider_onboarding_field_review is
'Sanitized service-role read model for onboarding field review; withholds proposed values for restricted and highly restricted fields and never exposes value hashes.';
comment on view public.provider_onboarding_approval_queue is
'Sanitized service-role read model for the onboarding Approval Center; reports manifest binding and separation-of-duties posture without exposing the manifest hash.';
comment on view public.provider_onboarding_delivery_workspace is
'Sanitized service-role read model for the onboarding Delivery Workspace; exposes recipient and mailbox domains only and never the local part, subject, body or attachment hash.';
