-- Provider Service Build 2: independent and time-bounded exception approval.

create or replace function public.provider_service_guard_exception_approval()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'approved' then
    if lower(btrim(new.requested_by_user_id)) = lower(btrim(coalesce(new.decided_by_user_id, ''))) then
      raise exception 'A Provider Service exception requester cannot approve the same exception.'
        using errcode = '23514';
    end if;

    if new.expires_at is null or new.expires_at <= current_timestamp then
      raise exception 'An approved Provider Service exception requires a future expiration.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists provider_service_guard_exception_approval
  on public.provider_activation_exceptions;
create trigger provider_service_guard_exception_approval
before insert or update on public.provider_activation_exceptions
for each row execute function public.provider_service_guard_exception_approval();

revoke all on function public.provider_service_guard_exception_approval()
  from public, anon, authenticated, service_role;
