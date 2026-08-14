const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELD_CODE=/^[a-z][a-z0-9_]{1,127}$/;

function required(value:unknown,field:string){
  const text=String(value||'').trim();
  if(!text) throw new Error(`${field} is required.`);
  return text;
}
function uuid(value:unknown,field:string){
  const text=required(value,field);
  if(!UUID_PATTERN.test(text)) throw new Error(`${field} must be a valid UUID.`);
  return text;
}
function revision(value:unknown){
  const number=Number(value);
  if(!Number.isInteger(number)||number<1) throw new Error('expected_review_revision must be a positive integer.');
  return number;
}
function canonical(value:any):string{
  if(value===null||typeof value!=='object') return JSON.stringify(value);
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
async function sha256(value:unknown){
  const bytes=new TextEncoder().encode(canonical(value));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map((item)=>item.toString(16).padStart(2,'0')).join('');
}
async function factEvent(supabase:any,input:Record<string,any>){
  const result=await supabase.from('provider_legal_entity_fact_events').insert(input);
  if(result.error) throw result.error;
}

export async function promoteApprovedProviderEntityReviewFacts(
  supabase:any,input:Record<string,unknown>,actorId:string,
){
  const organizationId=uuid(input.organization_id,'organization_id');
  const reviewId=uuid(input.review_id,'review_id');
  const actor=required(actorId,'actor_id');
  const expectedRevision=revision(input.expected_review_revision);
  const expectedCurrent=(input.expected_current_fact_ids||{}) as Record<string,string>;

  const review=await supabase.from('provider_entity_document_reviews')
    .select('id,organization_id,legal_entity_id,review_status,revision')
    .eq('organization_id',organizationId).eq('id',reviewId)
    .eq('review_status','approved').eq('revision',expectedRevision).maybeSingle();
  if(review.error) throw review.error;
  if(!review.data) throw new Error('Approved review or expected revision was not found.');

  const fields=await supabase.from('provider_entity_document_review_fields')
    .select('id,field_code,field_status,proposed_value,reviewer_value,sensitivity')
    .eq('organization_id',organizationId).eq('review_id',reviewId);
  if(fields.error) throw fields.error;

  const candidates=[] as Array<Record<string,any>>;
  const withheld=[] as Array<Record<string,any>>;
  for(const field of fields.data||[]){
    if(!FIELD_CODE.test(String(field.field_code||''))) throw new Error('Review contains an invalid field code.');
    if(field.field_status==='withheld'){withheld.push(field);continue;}
    if(!['accepted','corrected'].includes(field.field_status)) continue;
    const value=field.field_status==='corrected'?field.reviewer_value:field.proposed_value;
    if(value===null||value===undefined) throw new Error(`Approved field ${field.field_code} has no value.`);
    candidates.push({...field,value,value_sha256:await sha256(value)});
  }

  let currents=[] as Array<Record<string,any>>;
  if(candidates.length){
    const currentResult=await supabase.from('provider_legal_entity_facts')
      .select('id,field_code,fact_value_sha256').eq('organization_id',organizationId)
      .eq('legal_entity_id',review.data.legal_entity_id).eq('fact_status','current')
      .in('field_code',candidates.map((item)=>item.field_code));
    if(currentResult.error) throw currentResult.error;
    currents=currentResult.data||[];
  }
  const byCode=new Map(currents.map((item)=>[item.field_code,item]));
  const conflicts=candidates.filter((item)=>{
    const current=byCode.get(item.field_code);
    return current&&current.fact_value_sha256!==item.value_sha256&&expectedCurrent[item.field_code]!==current.id;
  });

  const promotion=await supabase.from('provider_legal_entity_fact_promotions').insert({
    organization_id:organizationId,legal_entity_id:review.data.legal_entity_id,
    review_id:reviewId,expected_review_revision:expectedRevision,
    promotion_status:conflicts.length?'conflict':'pending',
    conflict_fact_count:conflicts.length,promoted_by_actor_id:actor,
  }).select('id').single();
  if(promotion.error) throw promotion.error;
  const promotionId=promotion.data.id;

  if(conflicts.length){
    for(const field of conflicts){
      await factEvent(supabase,{
        organization_id:organizationId,legal_entity_id:review.data.legal_entity_id,
        promotion_id:promotionId,event_type:'fact_conflict',field_code:field.field_code,
        actor_id:actor,payload:{expected_current_fact_id:expectedCurrent[field.field_code]||null},
      });
    }
    return {promotion_id:promotionId,promotion_status:'conflict',conflict_fact_count:conflicts.length};
  }

  let promoted=0,unchanged=0;
  for(const field of withheld){
    await factEvent(supabase,{
      organization_id:organizationId,legal_entity_id:review.data.legal_entity_id,
      promotion_id:promotionId,event_type:'field_withheld',field_code:field.field_code,
      actor_id:actor,payload:{sensitivity:field.sensitivity},
    });
  }
  for(const field of candidates){
    const current=byCode.get(field.field_code);
    if(current&&current.fact_value_sha256===field.value_sha256){
      unchanged++;
      await factEvent(supabase,{
        organization_id:organizationId,legal_entity_id:review.data.legal_entity_id,
        fact_id:current.id,promotion_id:promotionId,event_type:'fact_unchanged',
        field_code:field.field_code,actor_id:actor,
      });
      continue;
    }
    const now=new Date().toISOString();
    if(current){
      const retired=await supabase.from('provider_legal_entity_facts').update({
        fact_status:'superseded',superseded_at:now,
      }).eq('organization_id',organizationId).eq('id',current.id)
        .eq('fact_status','current').select('id').maybeSingle();
      if(retired.error) throw retired.error;
      if(!retired.data) throw new Error(`Current fact changed for ${field.field_code}.`);
    }
    const inserted=await supabase.from('provider_legal_entity_facts').insert({
      organization_id:organizationId,legal_entity_id:review.data.legal_entity_id,
      field_code:field.field_code,fact_value:field.value,fact_value_sha256:field.value_sha256,
      sensitivity:field.sensitivity,source_review_id:reviewId,
      source_review_field_id:field.id,source_promotion_id:promotionId,effective_at:now,
    }).select('id').single();
    if(inserted.error) throw inserted.error;
    if(current){
      const linked=await supabase.from('provider_legal_entity_facts')
        .update({superseded_by_fact_id:inserted.data.id})
        .eq('organization_id',organizationId).eq('id',current.id).eq('fact_status','superseded');
      if(linked.error) throw linked.error;
      await factEvent(supabase,{
        organization_id:organizationId,legal_entity_id:review.data.legal_entity_id,
        fact_id:current.id,promotion_id:promotionId,event_type:'fact_superseded',
        field_code:field.field_code,actor_id:actor,payload:{superseded_by_fact_id:inserted.data.id},
      });
    }
    promoted++;
    await factEvent(supabase,{
      organization_id:organizationId,legal_entity_id:review.data.legal_entity_id,
      fact_id:inserted.data.id,promotion_id:promotionId,event_type:'fact_promoted',
      field_code:field.field_code,actor_id:actor,payload:{source_review_field_id:field.id},
    });
  }

  const completed=await supabase.from('provider_legal_entity_fact_promotions').update({
    promotion_status:'applied',promoted_fact_count:promoted,
    unchanged_fact_count:unchanged,completed_at:new Date().toISOString(),
  }).eq('organization_id',organizationId).eq('id',promotionId).eq('promotion_status','pending');
  if(completed.error) throw completed.error;
  return {promotion_id:promotionId,promotion_status:'applied',promoted_fact_count:promoted,unchanged_fact_count:unchanged,withheld_field_count:withheld.length};
}
