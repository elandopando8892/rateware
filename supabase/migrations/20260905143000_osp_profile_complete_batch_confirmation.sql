-- Local/preview preparation. No business rows are changed by this migration.
-- Reuse the existing whole-review ledger command; never publish a single selected answer.
create function osp_private.load_profile_review_promotion_batch(p_org uuid,p_review uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  with source as (
    select r.*, e.status entity_status, to_jsonb(r) review_snapshot, to_jsonb(e) entity_snapshot,
      to_jsonb(d) asset_snapshot, d.lifecycle_status, d.verification_status, d.effective_date, d.expiration_date
    from public.provider_entity_document_reviews r
    join public.legal_entities e on e.organization_id=r.organization_id and e.id=r.legal_entity_id
    join public.provider_legal_entity_document_assets d on d.organization_id=r.organization_id
      and d.id=r.document_asset_id and d.legal_entity_id=r.legal_entity_id
    where r.organization_id=p_org and r.id=p_review
  ), fields as (
    select f.*, c.id current_id, c.fact_value current_value, c.sensitivity current_sensitivity,
      case when f.field_status='corrected' then f.reviewer_value else f.proposed_value end next_value,
      to_jsonb(f) field_snapshot, to_jsonb(c) current_snapshot
    from source s join public.provider_entity_document_review_fields f on f.organization_id=s.organization_id and f.review_id=s.id
    left join public.provider_legal_entity_facts c on c.organization_id=s.organization_id
      and c.legal_entity_id=s.legal_entity_id and c.field_code=f.field_code and c.fact_status='current'
  ), classified as (
    select *, case
      when field_status='withheld' then 'withheld'
      when field_status='rejected' then 'rejected'
      when field_status not in ('accepted','corrected') or next_value is null or next_value in ('null'::jsonb,'""'::jsonb)
        or length(next_value::text)>4000 or length(current_value::text)>4000
        or sensitivity not in ('public','internal','confidential')
        or coalesce(current_sensitivity,'internal') not in ('public','internal','confidential') then 'blocked'
      when current_id is null then 'new'
      when current_value=next_value then 'unchanged'
      else 'replace' end disposition
    from fields
  ), aggregate as (
    select count(*) n, count(distinct field_code) distinct_codes,
      count(*) filter(where disposition='blocked') blocked,
      count(*) filter(where disposition in ('new','replace','unchanged')) eligible,
      coalesce(jsonb_agg(jsonb_build_object('fieldId',id,'fieldCode',field_code,'decision',field_status,'change',disposition,
        'currentFactId',current_id,
        'before',case when disposition in ('withheld','rejected','blocked') then null else current_value #>> '{}' end,
        'after',case when disposition in ('withheld','rejected','blocked') then null else next_value #>> '{}' end
      ) order by field_code,id),'[]'::jsonb) rows,
      coalesce(jsonb_agg(jsonb_build_object('field',field_snapshot,'current',current_snapshot) order by field_code,id),'[]'::jsonb) snapshot
    from classified
  )
  select jsonb_build_object('reviewId',s.id,'reviewRevision',s.revision,
    'comparisonSha256',encode(extensions.digest(convert_to(osp_private.canonical_jsonb_text(jsonb_build_object(
      'version',1,'on',current_date,'org',p_org,'review',s.review_snapshot,'entity',s.entity_snapshot,
      'asset',s.asset_snapshot,'fields',a.snapshot)),'UTF8'),'sha256'),'hex'),
    'ready',s.review_status='approved' and s.entity_status='active' and s.decided_at is not null
      and s.lifecycle_status='active' and s.verification_status='verified'
      and (s.effective_date is null or s.effective_date<=current_date)
      and (s.expiration_date is null or s.expiration_date>=current_date)
      and a.n between 1 and 128 and a.n=a.distinct_codes and a.blocked=0 and a.eligible>0,
    'totalFields',a.n,'rows',case when a.n<=128 then a.rows else '[]'::jsonb end,
    'readOnly',true,'externalEffects',false)
  from source s cross join aggregate a;
$$;
revoke all on function osp_private.load_profile_review_promotion_batch(uuid,uuid) from public,anon,authenticated,service_role,osp_worker;
grant execute on function osp_private.load_profile_review_promotion_batch(uuid,uuid) to osp_workflow_api;

create function osp_private.promote_profile_review_complete_batch(
  p_org uuid,p_review uuid,p_revision integer,p_candidate_sha text,p_expected_ids jsonb,
  p_subject text,p_permission text,p_comparison_sha text
) returns table(promotion_id uuid,promotion_status text,promoted_fact_count integer,unchanged_fact_count integer,
  withheld_field_count integer,review_id uuid,review_revision integer,replayed boolean)
language plpgsql security definer set search_path='' as $$
declare
  target public.provider_entity_document_reviews%rowtype;
  prior public.provider_legal_entity_fact_promotions%rowtype;
  batch jsonb;
begin
  if nullif(current_setting('osp.organization_id',true),'')::uuid is distinct from p_org
    or p_permission is distinct from 'osp:operate' or p_subject is null or p_subject !~ '^[A-Za-z0-9:_@.-]+$'
    or p_comparison_sha is null or p_comparison_sha !~ '^[0-9a-f]{64}$'
    or p_candidate_sha is null or p_candidate_sha !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_expected_ids) is distinct from 'object' then
    raise exception using errcode='42501',message='PROFILE_FACT_PROMOTION_FORBIDDEN';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || ':' || p_review::text,0));
  select * into target from public.provider_entity_document_reviews where organization_id=p_org and id=p_review;
  if not found then raise exception using errcode='40001',message='PROFILE_FACT_REVIEW_VERSION_CONFLICT'; end if;
  perform 1 from public.legal_entities where organization_id=p_org and id=target.legal_entity_id for share nowait;
  perform 1 from public.provider_entity_document_reviews where organization_id=p_org and id=p_review for update nowait;
  select * into prior from public.provider_legal_entity_fact_promotions where organization_id=p_org and public.provider_legal_entity_fact_promotions.review_id=p_review;
  if found then
    if prior.metadata->>'comparison_sha256' is distinct from p_comparison_sha
      or prior.metadata->'batch_expected_ids' is distinct from p_expected_ids
      or prior.metadata->>'batch_actor_subject' is distinct from p_subject then
      raise exception using errcode='40001',message='PROFILE_FACT_PROMOTION_CONFLICT';
    end if;
    return query select * from osp_private.promote_profile_review_facts_command(p_org,p_review,p_revision,p_candidate_sha,p_expected_ids,p_subject,p_permission);
    return;
  end if;
  perform 1 from public.provider_entity_document_review_fields where organization_id=p_org and public.provider_entity_document_review_fields.review_id=p_review order by id for share nowait;
  perform 1 from public.provider_legal_entity_document_assets where organization_id=p_org and id=target.document_asset_id for share nowait;
  perform 1 from public.provider_legal_entity_facts f where f.organization_id=p_org and f.legal_entity_id=target.legal_entity_id and f.fact_status='current'
    and f.field_code in (select field_code from public.provider_entity_document_review_fields where organization_id=p_org and public.provider_entity_document_review_fields.review_id=p_review)
    order by f.field_code,f.id for update nowait;
  batch:=osp_private.load_profile_review_promotion_batch(p_org,p_review);
  if batch is null or batch->>'comparisonSha256' is distinct from p_comparison_sha or batch->>'ready' is distinct from 'true'
    or (batch->>'reviewRevision')::integer is distinct from p_revision then
    raise exception using errcode='40001',message='PROFILE_FACT_BATCH_CHANGED';
  end if;
  if p_expected_ids is distinct from (select jsonb_object_agg(row->>'fieldCode',row->'currentFactId')
    from jsonb_array_elements(batch->'rows') row where row->>'change' in ('new','replace','unchanged')) then
    raise exception using errcode='40001',message='PROFILE_FACT_EXPECTATION_INCOMPLETE';
  end if;
  -- Existing command validates every expected current ID, hashes the reviewed
  -- candidates, supersedes atomically, and preserves unchanged provenance.
  return query select * from osp_private.promote_profile_review_facts_command(p_org,p_review,p_revision,p_candidate_sha,p_expected_ids,p_subject,p_permission);
  update public.provider_legal_entity_fact_promotions set metadata=metadata || jsonb_build_object(
    'comparison_sha256',p_comparison_sha,'batch_expected_ids',p_expected_ids,'batch_actor_subject',p_subject)
    where organization_id=p_org and public.provider_legal_entity_fact_promotions.review_id=p_review;
exception when lock_not_available or unique_violation then
  raise exception using errcode='40001',message='PROFILE_FACT_PROMOTION_CONFLICT';
end;
$$;
revoke all on function osp_private.promote_profile_review_complete_batch(uuid,uuid,integer,text,jsonb,text,text,text) from public,anon,authenticated,service_role,osp_worker;
grant execute on function osp_private.promote_profile_review_complete_batch(uuid,uuid,integer,text,jsonb,text,text,text) to osp_workflow_api;
-- The old implementation remains available only to its owner / definer wrapper.
revoke execute on function osp_private.promote_profile_review_facts_command(uuid,uuid,integer,text,jsonb,text,text) from osp_workflow_api,service_role,osp_worker;
