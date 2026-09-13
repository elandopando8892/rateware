-- Explicit bridge between the local MARKSMAN Loads agreement and the
-- canonical Rateware event/vendor invitation. The read-only context resolver
-- consumes this table; a separate reviewed command must populate it.
create table if not exists public.marksman_loads_rateware_agreement_bindings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  carrier_organization_id text not null,
  rateware_vendor_id uuid not null references public.vendors(id) on delete restrict,
  rfx_event_id uuid not null references public.rfx_events(id) on delete restrict,
  rfx_lane_vendor_id uuid not null references public.rfx_lane_vendors(id) on delete restrict,
  marksman_post_id text not null,
  marksman_offer_id text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  bound_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint marksman_loads_binding_local_key_unique unique (carrier_organization_id, marksman_post_id, marksman_offer_id),
  constraint marksman_loads_binding_rateware_invitation_unique unique (carrier_organization_id, rfx_lane_vendor_id),
  constraint marksman_loads_binding_revoked_at_check check ((status = 'active' and revoked_at is null) or (status = 'revoked' and revoked_at is not null))
);

create index if not exists marksman_loads_binding_lookup_idx
  on public.marksman_loads_rateware_agreement_bindings (carrier_organization_id, marksman_post_id, marksman_offer_id, status);
create index if not exists marksman_loads_binding_rateware_idx
  on public.marksman_loads_rateware_agreement_bindings (rateware_vendor_id, rfx_event_id, rfx_lane_vendor_id, status);

alter table public.marksman_loads_rateware_agreement_bindings enable row level security;

comment on table public.marksman_loads_rateware_agreement_bindings is
  'Server-owned Loads to Rateware agreement bridge. The Shipper Context resolver reads it; browser roles have no policies or write access.';
