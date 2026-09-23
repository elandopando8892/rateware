-- Original carrier rate sheets stay private. No browser role may list or read them.
insert into storage.buckets (id, name, public, file_size_limit)
values ('website-carrier-rate-sheets', 'website-carrier-rate-sheets', false, 1500000)
on conflict (id) do update set public = false, file_size_limit = 1500000;
