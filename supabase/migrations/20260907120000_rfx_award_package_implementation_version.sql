-- P3: optimistic concurrency for the final RFx award implementation transition.

alter table public.rfx_award_packages
  add column if not exists version bigint not null default 1;

alter table public.rfx_award_packages
  drop constraint if exists rfx_award_packages_version_check;

alter table public.rfx_award_packages
  add constraint rfx_award_packages_version_check
  check (version >= 1);

comment on column public.rfx_award_packages.version is
  'Optimistic concurrency version for governed award-package transitions.';
