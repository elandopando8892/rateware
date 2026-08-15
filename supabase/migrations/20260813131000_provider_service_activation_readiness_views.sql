-- Provider Service Build 2: deterministic readiness projections.
-- Readiness is calculated from requirement states and currently effective exceptions.

create or replace view public.provider_activation_effective_exceptions
with (security_invoker = true)
as
select
  exception_row.id,
  exception_row.organization_id,
  exception_row.activation_id,
  exception_row.scope_type,
  exception_row.activation_requirement_id,
  exception_row.track_code,
  exception_row.effective_from,
  exception_row.expires_at,
  exception_row.decided_by_user_id,
  exception_row.decision_note,
  exception_row.metadata
from public.provider_activation_exceptions exception_row
where exception_row.status = 'approved'
  and exception_row.effective_from <= current_timestamp
  and exception_row.expires_at > current_timestamp
  and exception_row.revoked_at is null;

create or replace view public.provider_activation_requirement_readiness
with (security_invoker = true)
as
with exception_flags as (
  select
    requirement.organization_id,
    requirement.activation_id,
    requirement.id as activation_requirement_id,
    exists (
      select 1
      from public.provider_activation_effective_exceptions exception_row
      where exception_row.organization_id = requirement.organization_id
        and exception_row.activation_id = requirement.activation_id
        and (
          exception_row.scope_type = 'activation'
          or (
            exception_row.scope_type = 'track'
            and exception_row.track_code = requirement.track_code
          )
          or (
            exception_row.scope_type = 'requirement'
            and exception_row.activation_requirement_id = requirement.id
          )
        )
    ) as has_effective_exception
  from public.provider_activation_requirements requirement
), evaluated as (
  select
    requirement.organization_id,
    requirement.activation_id,
    requirement.id as activation_requirement_id,
    requirement.track_code,
    requirement.requirement_code,
    requirement.requirement_name,
    requirement.requirement_type,
    requirement.is_required,
    requirement.is_blocking,
    requirement.evidence_required,
    requirement.sequence_number,
    requirement.state,
    case
      when requirement.state = 'passed'
        and requirement.expires_at is not null
        and requirement.expires_at <= current_timestamp
        then 'expired'
      else requirement.state
    end as effective_state,
    requirement.owner_user_id,
    requirement.due_at,
    requirement.submitted_at,
    requirement.reviewed_at,
    requirement.reviewed_by_user_id,
    requirement.satisfied_at,
    requirement.expires_at,
    requirement.failure_reason,
    requirement.correction_note,
    exception_flags.has_effective_exception,
    (
      (
        requirement.state = 'passed'
        and (requirement.expires_at is null or requirement.expires_at > current_timestamp)
      )
      or (
        requirement.state = 'not_applicable'
        and requirement.reviewed_at is not null
        and nullif(btrim(coalesce(requirement.reviewed_by_user_id, '')), '') is not null
      )
      or exception_flags.has_effective_exception
    ) as is_satisfied
  from public.provider_activation_requirements requirement
  join exception_flags
    on exception_flags.organization_id = requirement.organization_id
   and exception_flags.activation_id = requirement.activation_id
   and exception_flags.activation_requirement_id = requirement.id
)
select
  evaluated.*,
  (
    evaluated.is_required
    and evaluated.is_blocking
    and not evaluated.is_satisfied
    and evaluated.effective_state in ('failed', 'correction_required', 'expired')
  ) as is_blocking_failure
from evaluated;

create or replace view public.provider_activation_track_readiness
with (security_invoker = true)
as
with canonical_tracks(track_code) as (
  values
    ('provider_readiness'::text),
    ('xbf_customer_setup'::text),
    ('commercial_operational_readiness'::text)
), track_rollup as (
  select
    activation.organization_id,
    activation.id as activation_id,
    activation.provider_relationship_id,
    canonical_tracks.track_code,
    count(requirement.activation_requirement_id)::integer as total_requirement_count,
    count(requirement.activation_requirement_id)
      filter (where requirement.is_required)::integer as required_requirement_count,
    count(requirement.activation_requirement_id)
      filter (where requirement.is_required and requirement.is_satisfied)::integer
      as satisfied_required_count,
    count(requirement.activation_requirement_id)
      filter (where requirement.is_required and not requirement.is_satisfied)::integer
      as unsatisfied_required_count,
    count(requirement.activation_requirement_id)
      filter (where requirement.is_blocking_failure)::integer as blocker_count,
    count(requirement.activation_requirement_id)
      filter (where requirement.effective_state in ('submitted', 'under_review'))::integer
      as review_queue_count,
    coalesce(
      array_agg(requirement.requirement_code order by requirement.sequence_number, requirement.requirement_code)
        filter (where requirement.is_blocking_failure),
      array[]::text[]
    ) as blocker_requirement_codes
  from public.provider_activations activation
  cross join canonical_tracks
  left join public.provider_activation_requirement_readiness requirement
    on requirement.organization_id = activation.organization_id
   and requirement.activation_id = activation.id
   and requirement.track_code = canonical_tracks.track_code
  group by
    activation.organization_id,
    activation.id,
    activation.provider_relationship_id,
    canonical_tracks.track_code
), evaluated as (
  select
    track_rollup.*,
    case
      when track_rollup.total_requirement_count = 0
        or track_rollup.required_requirement_count = 0
        then 'not_configured'
      when track_rollup.blocker_count > 0
        then 'blocked'
      when track_rollup.satisfied_required_count = track_rollup.required_requirement_count
        then 'ready'
      else 'in_progress'
    end as readiness_state,
    case
      when track_rollup.required_requirement_count = 0 then 0::numeric
      else round(
        track_rollup.satisfied_required_count::numeric
        / track_rollup.required_requirement_count::numeric
        * 100,
        2
      )
    end as completion_percentage
  from track_rollup
)
select * from evaluated;

create or replace view public.provider_activation_readiness
with (security_invoker = true)
as
with track_totals as (
  select
    track.organization_id,
    track.activation_id,
    track.provider_relationship_id,
    sum(track.total_requirement_count)::integer as total_requirement_count,
    sum(track.required_requirement_count)::integer as required_requirement_count,
    sum(track.satisfied_required_count)::integer as satisfied_required_count,
    sum(track.unsatisfied_required_count)::integer as unsatisfied_required_count,
    sum(track.blocker_count)::integer as blocker_count,
    sum(track.review_queue_count)::integer as review_queue_count,
    count(*) filter (where track.readiness_state = 'ready')::integer as ready_track_count,
    count(*) filter (where track.readiness_state = 'blocked')::integer as blocked_track_count,
    count(*) filter (where track.readiness_state = 'not_configured')::integer
      as not_configured_track_count
  from public.provider_activation_track_readiness track
  group by
    track.organization_id,
    track.activation_id,
    track.provider_relationship_id
), blockers as (
  select
    requirement.organization_id,
    requirement.activation_id,
    coalesce(
      array_agg(requirement.requirement_code order by requirement.track_code, requirement.requirement_code)
        filter (where requirement.is_blocking_failure),
      array[]::text[]
    ) as blocker_requirement_codes
  from public.provider_activation_requirement_readiness requirement
  group by requirement.organization_id, requirement.activation_id
), overall as (
  select
    activation.organization_id,
    activation.id as activation_id,
    activation.provider_relationship_id,
    activation.legal_entity_id,
    activation.activation_template_id,
    activation.status as activation_status,
    track_totals.total_requirement_count,
    track_totals.required_requirement_count,
    track_totals.satisfied_required_count,
    track_totals.unsatisfied_required_count,
    track_totals.blocker_count,
    track_totals.review_queue_count,
    track_totals.ready_track_count,
    track_totals.blocked_track_count,
    track_totals.not_configured_track_count,
    coalesce(blockers.blocker_requirement_codes, array[]::text[])
      as blocker_requirement_codes,
    case
      when track_totals.blocked_track_count > 0 then 'blocked'
      when track_totals.not_configured_track_count > 0 then 'not_configured'
      when track_totals.ready_track_count = 3 then 'ready'
      else 'in_progress'
    end as readiness_state,
    case
      when track_totals.required_requirement_count = 0 then 0::numeric
      else round(
        track_totals.satisfied_required_count::numeric
        / track_totals.required_requirement_count::numeric
        * 100,
        2
      )
    end as completion_percentage
  from public.provider_activations activation
  join track_totals
    on track_totals.organization_id = activation.organization_id
   and track_totals.activation_id = activation.id
  left join blockers
    on blockers.organization_id = activation.organization_id
   and blockers.activation_id = activation.id
)
select
  overall.*,
  overall.readiness_state = 'ready' as can_activate
from overall;

comment on view public.provider_activation_effective_exceptions is
  'Approved, unrevoked Provider Service exceptions that are effective at query time.';
comment on view public.provider_activation_requirement_readiness is
  'Requirement-level satisfaction and blocking evaluation. Passed, reviewed not-applicable, or currently excepted requirements are satisfied.';
comment on view public.provider_activation_track_readiness is
  'Readiness projection for Provider Readiness, XBF Customer Setup, and Commercial & Operational Readiness.';
comment on view public.provider_activation_readiness is
  'Overall activation readiness. Ready requires all three canonical tracks to be configured and ready.';
