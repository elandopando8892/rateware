-- Convergence hardening: terminal response review invariants and event-table boundary.
alter table public.provider_portal_requirement_responses
  add constraint provider_portal_requirement_responses_submission_time_check
  check (status='draft' or submitted_at is not null);

alter table public.provider_portal_requirement_responses
  add constraint provider_portal_requirement_responses_terminal_review_check
  check (
    status not in ('accepted','rejected','correction_required')
    or (
      reviewed_at is not null
      and nullif(btrim(coalesce(reviewed_by_user_id,'')),'') is not null
      and reviewed_at >= submitted_at
    )
  );

alter table public.provider_portal_requirement_responses
  add constraint provider_portal_requirement_responses_negative_review_note_check
  check (
    status not in ('rejected','correction_required')
    or nullif(btrim(coalesce(review_note,'')),'') is not null
  );

alter table public.provider_portal_requirement_responses
  add constraint provider_portal_requirement_responses_draft_review_check
  check (
    status <> 'draft'
    or (submitted_at is null and reviewed_at is null and reviewed_by_user_id is null and review_note is null)
  );

alter table public.provider_portal_events enable row level security;
revoke all on table public.provider_portal_events from public,anon,authenticated,service_role;
