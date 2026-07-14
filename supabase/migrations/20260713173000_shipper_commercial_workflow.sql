-- Links a Shipper RFI to the commercial opportunity it produced. The link keeps
-- the original RFI as the source of truth while allowing the deal to advance.
alter table public.shipper_opportunities
  add column if not exists rfi_id uuid references public.shipper_rfis(id) on delete set null;

create index if not exists shipper_opportunities_owner_rfi_idx
  on public.shipper_opportunities (owner_email, rfi_id)
  where rfi_id is not null;

create index if not exists shipper_opportunities_owner_open_due_idx
  on public.shipper_opportunities (owner_email, stage, due_date, updated_at desc);
