alter table public.vendors
  add column if not exists logo_url text,
  add column if not exists logo_storage_bucket text,
  add column if not exists logo_storage_path text,
  add column if not exists logo_source text;

create index if not exists vendors_logo_source_idx on public.vendors (logo_source);

insert into storage.buckets (id, name, public)
values ('vendor-logos', 'vendor-logos', true)
on conflict (id) do update set public = true;

create policy "public can read vendor logos"
  on storage.objects for select
  to public
  using (bucket_id = 'vendor-logos');
