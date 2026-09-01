-- Service-role-only operational health for the durable private resolver ledger.
-- Deliberately exposes aggregate counts and timestamps only. Retention remains
-- an explicit deployment policy decision; this migration performs no purge.

create index if not exists rfx_private_resolver_requests_status_updated_idx
  on public.rfx_private_resolver_requests (status, updated_at desc);

create or replace function public.get_rfx_private_resolver_ledger_health()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'processingCurrent', count(*) filter (where status = 'processing' and expires_at >= now()),
    'processingExpired', count(*) filter (where status = 'processing' and expires_at < now()),
    'completed24h', count(*) filter (where status = 'resolution_canary_passed' and completed_at >= now() - interval '24 hours'),
    'failed24h', count(*) filter (where status = 'failed' and completed_at >= now() - interval '24 hours'),
    'oldestProcessingAt', min(claimed_at) filter (where status = 'processing'),
    'checkedAt', now(),
    'requestBodyStored', false,
    'credentialMaterialStored', false,
    'externalExecutionPossible', false
  )
  from public.rfx_private_resolver_requests;
$$;

comment on function public.get_rfx_private_resolver_ledger_health() is
  'Aggregate resolver-ledger health only; returns no request, carrier, lane, quote, token, or signature data.';

revoke all on function public.get_rfx_private_resolver_ledger_health() from public, anon, authenticated;
grant execute on function public.get_rfx_private_resolver_ledger_health() to service_role;
