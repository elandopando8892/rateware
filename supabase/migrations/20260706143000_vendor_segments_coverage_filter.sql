alter table public.vendor_segments
  add column if not exists coverage_filter text;

create index if not exists vendor_segments_coverage_filter_idx
  on public.vendor_segments (coverage_filter);
