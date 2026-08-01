-- Persist the Shipper relationship on Bid Room events. Text matching remains a
-- legacy fallback, but Ratebook consolidation must use this stable account key.
alter table public.rfx_events
  add column if not exists customer_id uuid references public.shippers(id) on delete set null;

create index if not exists rfx_events_owner_customer_idx
  on public.rfx_events(owner_email, customer_id, updated_at desc);

-- Existing event/project links already identify the owning shipper. Backfill
-- them once so historical Bid Room events appear in each Shipper Ratebook.
update public.rfx_events event
set customer_id = project.customer_id
from public.rfx_projects project
where event.customer_id is null
  and project.customer_id is not null
  and (
    project.linked_rfx_event_id = event.id
    or project.id = event.source_rfx_process_project_id
  );
