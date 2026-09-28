-- Bid Rooms launched from an RFx Package after 20260801033000 were created
-- without their project's Shipper (launch_rfx_package_to_bid_room passed only
-- the name), so Shipper Ratebooks could only find them by text. The launch now
-- copies customer_id; this repeats that migration's one-time backfill for the
-- events created in between. It only fills empty links.
update public.rfx_events event
set customer_id = project.customer_id,
    updated_at = now()
from public.rfx_projects project
where event.customer_id is null
  and project.customer_id is not null
  and (
    project.linked_rfx_event_id = event.id
    or project.id = event.source_rfx_process_project_id
  );
