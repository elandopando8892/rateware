do $$
begin
  if exists (
    select 1
    from osp_private.release_evidence_consumptions
    group by environment, release_id, nonce
    having pg_catalog.count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'RELEASE_EVIDENCE_HISTORICAL_NONCE_CONFLICT';
  end if;
end;
$$;

alter table osp_private.release_evidence_consumptions
  drop constraint release_evidence_consumptions_replay_key,
  add constraint release_evidence_consumptions_replay_key
    unique (environment, release_id, nonce);
