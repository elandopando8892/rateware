create index if not exists user_profiles_owner_user_id_idx
  on public.user_profiles (owner_user_id)
  where owner_user_id is not null;
