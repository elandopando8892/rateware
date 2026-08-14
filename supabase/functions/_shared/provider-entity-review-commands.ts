const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELD_CODE=/^[a-z][a-z0-9_]{1,127}$/;
const FIELD_DECISIONS=new Set(['accepted','corrected','rejected','withheld']);
const REVIEW_DECISIONS=new Set(['approved','rejected','changes_required']);

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
  if(!Number.isInteger(number)||number<1) throw new Error('expected_revision must be a positive integer.');
  return number;
}
async function recordEvent(supabase:any,row:Record<string,any>,type:string,previousRevision:number,payload:Record<string,unknown>={}){
  const result=await supabase.from('provider_entity_document_review_events').insert({
    organization_id:row.organization_id,review_id:row.id,event_type:type,
    previous_revision:previousRevision,revision:previousRevision+1,
    actor_user_id:row.assigned_reviewer_user_id,payload,
  });
  if(result.error) throw result.error;
}
async function ownedReview(supabase:any,organizationId:string,reviewId:string,reviewerUserId:string,expectedRevision:number){
  const result=await supabase.from('provider_entity_document_reviews')
    .select('id,organization_id,document_asset_id,review_status,assigned_reviewer_user_id,revision,requested_by_user_id')
    .eq('organization_id',organizationId).eq('id',reviewId).eq('review_status','in_review')
    .eq('assigned_reviewer_user_id',reviewerUserId).eq('revision',expectedRevision).maybeSingle();
  if(result.error) throw result.error;
  if(!result.data) throw new Error('Review ownership or revision conflict.');
  return result.data as Record<string,any>;
}

export async function claimProviderEntityDocumentReview(supabase:any,input:Record<string,unknown>,reviewerUserId:string){
  const organizationId=uuid(input.organization_id,'organization_id');
  const reviewId=uuid(input.review_id,'review_id');
  const actor=required(reviewerUserId,'reviewer_user_id');
  const expectedRevision=revision(input.expected_revision);
  const now=new Date().toISOString();
  const claimed=await supabase.from('provider_entity_document_reviews').update({
    assigned_reviewer_user_id:actor,claimed_at:now,started_at:now,
    review_status:'in_review',revision:expectedRevision+1,updated_at:now,
  }).eq('organization_id',organizationId).eq('id',reviewId)
    .eq('review_status','pending').is('assigned_reviewer_user_id',null)
    .eq('revision',expectedRevision).select('*').maybeSingle();
  if(claimed.error) throw claimed.error;
  if(!claimed.data) throw new Error('Review is not claimable or its revision changed.');
  await recordEvent(supabase,claimed.data,'review_claimed',expectedRevision);
  return {review_id:reviewId,review_status:'in_review',revision:expectedRevision+1};
}

export async function decideProviderEntityReviewField(supabase:any,input:Record<string,unknown>,reviewerUserId:string){
  const organizationId=uuid(input.organization_id,'organization_id');
  const reviewId=uuid(input.review_id,'review_id');
  const fieldId=uuid(input.field_id,'field_id');
  const actor=required(reviewerUserId,'reviewer_user_id');
  const expectedRevision=revision(input.expected_revision);
  const decision=required(input.decision,'decision');
  const note=required(input.decision_note,'decision_note');
  if(!FIELD_DECISIONS.has(decision)) throw new Error('Unsupported field decision.');
  if(decision==='corrected'&&(input.reviewer_value===null||input.reviewer_value===undefined)) throw new Error('reviewer_value is required for a correction.');

  const row=await ownedReview(supabase,organizationId,reviewId,actor,expectedRevision);
  const field=await supabase.from('provider_entity_document_review_fields')
    .select('id,field_code,sensitivity,field_status').eq('organization_id',organizationId)
    .eq('review_id',reviewId).eq('id',fieldId).eq('field_status','pending').maybeSingle();
  if(field.error) throw field.error;
  if(!field.data) throw new Error('Review field is not pending.');
  if(!FIELD_CODE.test(String(field.data.field_code||''))) throw new Error('Review field code is invalid.');
  if(decision==='withheld'&&!['restricted','highly_restricted'].includes(field.data.sensitivity)) throw new Error('Only restricted fields may be withheld.');

  const now=new Date().toISOString();
  const guard=await supabase.from('provider_entity_document_reviews').update({
    revision:expectedRevision+1,updated_at:now,
  }).eq('organization_id',organizationId).eq('id',reviewId).eq('review_status','in_review')
    .eq('assigned_reviewer_user_id',actor).eq('revision',expectedRevision).select('id').maybeSingle();
  if(guard.error) throw guard.error;
  if(!guard.data) throw new Error('Review revision changed.');

  const decided=await supabase.from('provider_entity_document_review_fields').update({
    field_status:decision,reviewer_value:decision==='corrected'?input.reviewer_value:null,
    decided_by_user_id:actor,decided_at:now,decision_note:note,updated_at:now,
  }).eq('organization_id',organizationId).eq('review_id',reviewId).eq('id',fieldId)
    .eq('field_status','pending').select('id').maybeSingle();
  if(decided.error) throw decided.error;
  if(!decided.data) throw new Error('Review field changed before the decision was stored.');
  await recordEvent(supabase,{...row,assigned_reviewer_user_id:actor},'field_decided',expectedRevision,{field_id:fieldId,field_code:field.data.field_code,decision});
  return {review_id:reviewId,field_id:fieldId,field_status:decision,revision:expectedRevision+1};
}

export async function finalizeProviderEntityDocumentReview(supabase:any,input:Record<string,unknown>,reviewerUserId:string){
  const organizationId=uuid(input.organization_id,'organization_id');
  const reviewId=uuid(input.review_id,'review_id');
  const actor=required(reviewerUserId,'reviewer_user_id');
  const expectedRevision=revision(input.expected_revision);
  const decision=required(input.decision,'decision');
  const note=required(input.decision_note,'decision_note');
  if(!REVIEW_DECISIONS.has(decision)) throw new Error('Unsupported review decision.');
  const row=await ownedReview(supabase,organizationId,reviewId,actor,expectedRevision);
  if(row.requested_by_user_id&&row.requested_by_user_id===actor) throw new Error('Requester cannot finalize their own review.');

  const fields=await supabase.from('provider_entity_document_review_fields')
    .select('field_status').eq('organization_id',organizationId).eq('review_id',reviewId);
  if(fields.error) throw fields.error;
  const statuses=(fields.data||[]).map((item:any)=>item.field_status);
  if(statuses.includes('pending')) throw new Error('All review fields must be decided first.');
  if(decision==='approved'&&statuses.includes('rejected')) throw new Error('A review with rejected fields cannot be approved.');

  const now=new Date().toISOString();
  const finalized=await supabase.from('provider_entity_document_reviews').update({
    review_status:decision,decided_by_user_id:actor,decided_at:now,
    decision_note:note,revision:expectedRevision+1,updated_at:now,
  }).eq('organization_id',organizationId).eq('id',reviewId).eq('review_status','in_review')
    .eq('assigned_reviewer_user_id',actor).eq('revision',expectedRevision).select('id').maybeSingle();
  if(finalized.error) throw finalized.error;
  if(!finalized.data) throw new Error('Review revision changed.');

  const verificationStatus=decision==='approved'?'verified':decision==='rejected'?'rejected':'needs_review';
  const asset=await supabase.from('provider_legal_entity_document_assets').update({
    verification_status:verificationStatus,updated_at:now,
  }).eq('organization_id',organizationId).eq('id',row.document_asset_id);
  if(asset.error) throw asset.error;
  await recordEvent(supabase,{...row,assigned_reviewer_user_id:actor},'review_decided',expectedRevision,{decision,verification_status:verificationStatus});
  return {review_id:reviewId,review_status:decision,verification_status:verificationStatus,revision:expectedRevision+1};
}
