-- A shipper request can be a program (a long, many-lane RFx) apart from a
-- mini-bid ("contract"): the team names them apart, and a launched program
-- becomes an "RFx · Programa" event while a mini-bid becomes a "Mini-bid" one.
alter table public.rfx_projects drop constraint if exists rfx_projects_opportunity_type_check;
alter table public.rfx_projects add constraint rfx_projects_opportunity_type_check
  check (opportunity_type = any (array['benchmark', 'new_provider', 'capacity_addition', 'dedicated', 'spot', 'contract', 'program', 'backup']));
