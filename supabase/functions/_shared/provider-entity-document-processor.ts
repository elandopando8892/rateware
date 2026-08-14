const VAULT_BUCKET = 'provider-entity-vault';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SENSITIVITIES = new Set(['public','internal','confidential','restricted','highly_restricted']);
const DOCUMENT_TYPE = /^[a-z][a-z0-9_]{1,127}$/;

function requireUuid(value: unknown, field: string) {
  const text = String(value || '').trim();
  if (!UUID_PATTERN.test(text)) throw new Error(`${field} must be a valid UUID.`);
  return text;
}
function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2,'0')).join('');
}
async function event(supabase: any, organizationId: string, ingestionId: string, type: string, status: string, payload: Record<string,unknown>={}) {
  const result=await supabase.from('provider_entity_document_ingestion_events').insert({
    organization_id:organizationId,ingestion_id:ingestionId,event_type:type,
    ingestion_status:status,actor_type:'system',payload,
  });
  if(result.error) throw result.error;
}
async function quarantine(supabase:any,row:Record<string,any>,reason:string,payload:Record<string,unknown>={}) {
  const now=new Date().toISOString();
  const result=await supabase.from('provider_entity_document_ingestions').update({
    ingestion_status:'quarantined',quarantine_reason:reason,
    processing_lease_token:null,processing_lease_expires_at:null,
    last_processing_error:null,updated_at:now,
  }).eq('organization_id',row.organization_id).eq('id',row.id);
  if(result.error) throw result.error;
  await event(supabase,row.organization_id,row.id,'document_quarantined','quarantined',{reason,...payload});
  return {ingestion_id:row.id,ingestion_status:'quarantined',reason};
}

export type ProviderEntityDocumentProcessor = {
  scan(bytes: Uint8Array, context: { mimeType:string; filename:string }): Promise<{status:'clean'|'infected'|'error'; engine:string; reference?:string}>;
  classify(bytes: Uint8Array, context: { mimeType:string; filename:string }): Promise<{
    status:'classified'|'needs_review'|'rejected';
    documentType?:string;
    sensitivity?:string;
    confidence?:number;
    issuerName?:string|null;
    effectiveDate?:string|null;
    expirationDate?:string|null;
  }>;
};

export async function processProviderEntityDocument(
  supabase:any,
  input:Record<string,unknown>,
  processor:ProviderEntityDocumentProcessor,
) {
  const organizationId=requireUuid(input.organization_id,'organization_id');
  const legalEntityId=requireUuid(input.legal_entity_id,'legal_entity_id');
  const ingestionId=requireUuid(input.ingestion_id,'ingestion_id');
  const leaseToken=crypto.randomUUID();
  const leaseExpiresAt=new Date(Date.now()+5*60*1000).toISOString();

  const claimed=await supabase.from('provider_entity_document_ingestions').update({
    ingestion_status:'scanning',malware_status:'scanning',
    processing_lease_token:leaseToken,processing_lease_expires_at:leaseExpiresAt,
    processing_attempts:1,last_processing_error:null,
  }).eq('organization_id',organizationId).eq('legal_entity_id',legalEntityId)
    .eq('id',ingestionId).eq('ingestion_status','uploaded')
    .select('*').maybeSingle();
  if(claimed.error) throw claimed.error;
  if(!claimed.data) throw new Error('Ingestion is not claimable.');
  const row=claimed.data as Record<string,any>;
  if(row.storage_bucket!==VAULT_BUCKET) return await quarantine(supabase,row,'invalid_storage_bucket');

  try {
    const downloaded=await supabase.storage.from(VAULT_BUCKET).download(row.storage_path);
    if(downloaded.error||!downloaded.data) throw downloaded.error||new Error('Vault object download failed.');
    const bytes=new Uint8Array(await downloaded.data.arrayBuffer());
    if(bytes.byteLength!==Number(row.declared_size_bytes)) {
      return await quarantine(supabase,row,'observed_size_mismatch',{observed_size_bytes:bytes.byteLength});
    }

    const observedSha256=hex(await crypto.subtle.digest('SHA-256',bytes));
    const expected=String(row.expected_sha256||'').toLowerCase();
    const hashStatus=expected ? (expected===observedSha256?'matched':'mismatched') : 'unavailable';
    if(hashStatus==='mismatched') {
      await supabase.from('provider_entity_document_ingestions').update({
        observed_sha256:observedSha256,hash_status:hashStatus,
      }).eq('organization_id',organizationId).eq('id',ingestionId);
      return await quarantine(supabase,{...row,observed_sha256:observedSha256},'sha256_mismatch');
    }

    const scan=await processor.scan(bytes,{mimeType:row.declared_mime_type,filename:row.original_filename});
    if(scan.status!=='clean') {
      await supabase.from('provider_entity_document_ingestions').update({
        observed_sha256:observedSha256,hash_status:hashStatus,malware_status:scan.status,
      }).eq('organization_id',organizationId).eq('id',ingestionId);
      return await quarantine(supabase,row,scan.status==='infected'?'malware_detected':'malware_scan_error',{scan_engine:scan.engine});
    }

    const classification=await processor.classify(bytes,{mimeType:row.declared_mime_type,filename:row.original_filename});
    const documentType=String(classification.documentType||'').trim();
    const sensitivity=String(classification.sensitivity||'').trim();
    const confidence=Number(classification.confidence);
    if(
      classification.status==='rejected' || !DOCUMENT_TYPE.test(documentType) ||
      !SENSITIVITIES.has(sensitivity) || !Number.isFinite(confidence) || confidence<0 || confidence>1 ||
      confidence<0.8
    ) {
      await supabase.from('provider_entity_document_ingestions').update({
        observed_sha256:observedSha256,hash_status:hashStatus,malware_status:'clean',
        classification_status:'needs_review',classification_confidence:Number.isFinite(confidence)?confidence:null,
      }).eq('organization_id',organizationId).eq('id',ingestionId);
      return await quarantine(supabase,row,'classification_review_required');
    }

    const documentKey=`ingestion_${ingestionId.replace(/-/g,'_')}`;
    const releasePolicy=['restricted','highly_restricted'].includes(sensitivity)?'approval_required':'review_required';
    const asset=await supabase.from('provider_legal_entity_document_assets').insert({
      organization_id:organizationId,legal_entity_id:legalEntityId,
      document_type:documentType,document_key:documentKey,document_name:row.original_filename,
      storage_bucket:VAULT_BUCKET,storage_path:row.storage_path,original_filename:row.original_filename,
      mime_type:row.declared_mime_type,file_size_bytes:bytes.byteLength,file_sha256:observedSha256,
      sensitivity,release_policy:releasePolicy,lifecycle_status:'active',verification_status:'needs_review',
      issuer_name:classification.issuerName||null,effective_date:classification.effectiveDate||null,
      expiration_date:classification.expirationDate||null,
      metadata:{ingestion_id:ingestionId,classification_confidence:confidence},
    }).select('id').single();
    if(asset.error) throw asset.error;

    const readyAt=new Date().toISOString();
    const ready=await supabase.from('provider_entity_document_ingestions').update({
      observed_sha256:observedSha256,hash_status:hashStatus,malware_status:'clean',
      classification_status:'classified',classified_document_type:documentType,
      classified_sensitivity:sensitivity,classification_confidence:confidence,
      provider_document_asset_id:asset.data.id,ingestion_status:'ready',ready_at:readyAt,
      processing_lease_token:null,processing_lease_expires_at:null,last_processing_error:null,
    }).eq('organization_id',organizationId).eq('id',ingestionId)
      .eq('processing_lease_token',leaseToken).select('id').maybeSingle();
    if(ready.error) throw ready.error;
    if(!ready.data) throw new Error('Processing lease was lost.');
    await event(supabase,organizationId,ingestionId,'document_processed','ready',{
      document_asset_id:asset.data.id,hash_status:hashStatus,malware_status:'clean',
      classification_status:'classified',verification_status:'needs_review',
    });
    return {ingestion_id:ingestionId,ingestion_status:'ready',document_asset_id:asset.data.id};
  } catch(error) {
    const message=error instanceof Error?error.message:String(error);
    await supabase.from('provider_entity_document_ingestions').update({
      ingestion_status:'failed',failed_at:new Date().toISOString(),
      processing_lease_token:null,processing_lease_expires_at:null,
      last_processing_error:message.slice(0,2000),
    }).eq('organization_id',organizationId).eq('id',ingestionId).eq('processing_lease_token',leaseToken);
    await event(supabase,organizationId,ingestionId,'document_processing_failed','failed',{message:message.slice(0,500)});
    throw error;
  }
}
