create index if not exists contact_history_support_owner_idx
  on public.contact_history (owner_email, status, occurred_at desc)
  where status in ('support_ticket', 'support_open', 'support_in_progress', 'support_resolved', 'support_archived');

create index if not exists contact_history_support_vendor_idx
  on public.contact_history (owner_email, vendor_id, occurred_at desc)
  where status in ('support_ticket', 'support_open', 'support_in_progress', 'support_resolved', 'support_archived');

create index if not exists contact_history_support_event_idx
  on public.contact_history (owner_email, rfx_event_id, occurred_at desc)
  where status in ('support_ticket', 'support_open', 'support_in_progress', 'support_resolved', 'support_archived');
