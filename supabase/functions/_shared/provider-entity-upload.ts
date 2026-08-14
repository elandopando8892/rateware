const VAULT_BUCKET = 'provider-entity-vault';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const UPLOAD_TTL_SECONDS = 10 * 60;

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function requireUuid(value: unknown, field: string) {
  const normalized = cleanText(value);
  if (!normalized || !UUID_PATTERN.test(normalized)) throw new Error(`${field} must be a valid UUID.`);
  return normalized;
}

function requireFilename(value: unknown) {
  const filename = cleanText(value);
  if (!filename || filename.length > 240 || /[\\/]/.test(filename) || filename === '.' || filename === '..') {
    throw new Error('original_filename is invalid.');
  }
  return filename;
}

function requireMimeType(value: unknown) {
  const mimeType = cleanText(value)?.toLowerCase();
  if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) throw new Error('Unsupported document MIME type.');
  return mimeType;
}

function requireFileSize(value: unknown) {
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE_SIZE) {
    throw new Error('declared_size_bytes must be between 1 and 26214400.');
  }
  return size;
}

function requireIngestionKey(value: unknown) {
  const key = cleanText(value);
  if (!key || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/.test(key)) throw new Error('ingestion_key is invalid.');
  return key;
}

function optionalSha256(value: unknown) {
  const hash = cleanText(value)?.toLowerCase() || null;
  if (hash && !/^[0-9a-f]{64}$/.test(hash)) throw new Error('expected_sha256 must be lowercase SHA-256.');
  return hash;
}

async function recordEvent(
  supabase: any,
  organizationId: string,
  ingestionId: string,
  eventType: string,
  ingestionStatus: string,
  actorType: string,
  actorUserId: string | null,
  payload: Record<string, unknown> = {},
) {
  const event = await supabase.from('provider_entity_document_ingestion_events').insert({
    organization_id: organizationId,
    ingestion_id: ingestionId,
    event_type: eventType,
    ingestion_status: ingestionStatus,
    actor_type: actorType,
    actor_user_id: actorUserId,
    payload,
  });
  if (event.error) throw event.error;
}

export async function beginProviderEntitySignedUpload(
  supabase: any,
  input: Record<string, unknown>,
  actor: { type: 'user' | 'agent' | 'system' | 'integration'; userId?: string | null },
) {
  const organizationId = requireUuid(input.organization_id, 'organization_id');
  const legalEntityId = requireUuid(input.legal_entity_id, 'legal_entity_id');
  const ingestionKey = requireIngestionKey(input.ingestion_key);
  const originalFilename = requireFilename(input.original_filename);
  const mimeType = requireMimeType(input.declared_mime_type);
  const fileSize = requireFileSize(input.declared_size_bytes);
  const expectedSha256 = optionalSha256(input.expected_sha256);
  const actorUserId = cleanText(actor.userId);
  if (actor.type === 'user' && !actorUserId) throw new Error('User uploads require an identified user.');

  const ingestionId = crypto.randomUUID();
  const uploadSessionId = crypto.randomUUID();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + UPLOAD_TTL_SECONDS * 1000);
  const storagePath = `${organizationId}/${legalEntityId}/${ingestionId}/${originalFilename}`;

  const inserted = await supabase.from('provider_entity_document_ingestions').insert({
    id: ingestionId,
    organization_id: organizationId,
    legal_entity_id: legalEntityId,
    ingestion_key: ingestionKey,
    source_channel: cleanText(input.source_channel) || 'manual',
    source_reference: cleanText(input.source_reference),
    original_filename: originalFilename,
    declared_mime_type: mimeType,
    declared_size_bytes: fileSize,
    storage_bucket: VAULT_BUCKET,
    storage_path: storagePath,
    expected_sha256: expectedSha256,
    requested_by_actor_type: actor.type,
    requested_by_user_id: actorUserId,
    upload_session_id: uploadSessionId,
    upload_issued_at: issuedAt.toISOString(),
    upload_expires_at: expiresAt.toISOString(),
  }).select('id').single();
  if (inserted.error) throw inserted.error;

  try {
    const signed = await supabase.storage.from(VAULT_BUCKET).createSignedUploadUrl(storagePath);
    if (signed.error || !signed.data?.signedUrl || !signed.data?.token) {
      throw signed.error || new Error('Signed upload URL was not created.');
    }
    await recordEvent(supabase, organizationId, ingestionId, 'signed_upload_issued', 'requested', actor.type, actorUserId, {
      upload_session_id: uploadSessionId,
      expires_at: expiresAt.toISOString(),
      declared_mime_type: mimeType,
      declared_size_bytes: fileSize,
    });
    return {
      ingestion_id: ingestionId,
      upload_session_id: uploadSessionId,
      expires_at: expiresAt.toISOString(),
      signed_url: signed.data.signedUrl,
      token: signed.data.token,
    };
  } catch (error) {
    await supabase.from('provider_entity_document_ingestions').update({
      ingestion_status: 'failed',
      failed_at: new Date().toISOString(),
      quarantine_reason: 'signed_upload_issue_failed',
    }).eq('organization_id', organizationId).eq('id', ingestionId);
    throw error;
  }
}

export async function confirmProviderEntitySignedUpload(
  supabase: any,
  input: Record<string, unknown>,
  actor: { type: 'user' | 'agent' | 'system' | 'integration'; userId?: string | null },
) {
  const organizationId = requireUuid(input.organization_id, 'organization_id');
  const legalEntityId = requireUuid(input.legal_entity_id, 'legal_entity_id');
  const ingestionId = requireUuid(input.ingestion_id, 'ingestion_id');
  const uploadSessionId = requireUuid(input.upload_session_id, 'upload_session_id');
  const actorUserId = cleanText(actor.userId);
  if (actor.type === 'user' && !actorUserId) throw new Error('User confirmation requires an identified user.');

  const row = await supabase.from('provider_entity_document_ingestions')
    .select('id,original_filename,declared_size_bytes,storage_bucket,storage_path,ingestion_status,upload_session_id,upload_expires_at')
    .eq('organization_id', organizationId)
    .eq('legal_entity_id', legalEntityId)
    .eq('id', ingestionId)
    .eq('upload_session_id', uploadSessionId)
    .maybeSingle();
  if (row.error) throw row.error;
  if (!row.data) throw new Error('Upload session was not found in this legal entity.');
  if (row.data.ingestion_status !== 'requested') throw new Error('Upload session is not confirmable.');
  if (!row.data.upload_expires_at || Date.parse(row.data.upload_expires_at) <= Date.now()) throw new Error('Upload session expired.');
  if (row.data.storage_bucket !== VAULT_BUCKET) throw new Error('Upload session bucket is invalid.');

  const prefix = `${organizationId}/${legalEntityId}/${ingestionId}`;
  const listed = await supabase.storage.from(VAULT_BUCKET).list(prefix, {
    limit: 2,
    search: row.data.original_filename,
  });
  if (listed.error) throw listed.error;
  const matches = (listed.data || []).filter((item: Record<string, any>) => item.name === row.data.original_filename);
  if (matches.length !== 1) throw new Error('Exactly one uploaded object is required.');
  const object = matches[0];
  const observedSize = Number(object?.metadata?.size ?? object?.metadata?.contentLength);
  if (!Number.isSafeInteger(observedSize) || observedSize !== Number(row.data.declared_size_bytes)) {
    throw new Error('Uploaded object size does not match the declared size.');
  }

  const completedAt = new Date().toISOString();
  const updated = await supabase.from('provider_entity_document_ingestions').update({
    ingestion_status: 'uploaded',
    upload_completed_at: completedAt,
    object_etag: cleanText(object?.metadata?.eTag || object?.metadata?.etag),
    object_last_modified_at: cleanText(object?.updated_at || object?.last_modified_at) || completedAt,
  })
    .eq('organization_id', organizationId)
    .eq('legal_entity_id', legalEntityId)
    .eq('id', ingestionId)
    .eq('upload_session_id', uploadSessionId)
    .eq('ingestion_status', 'requested')
    .select('id')
    .maybeSingle();
  if (updated.error) throw updated.error;
  if (!updated.data) throw new Error('Upload session was already consumed.');

  await recordEvent(supabase, organizationId, ingestionId, 'upload_confirmed', 'uploaded', actor.type, actorUserId, {
    declared_size_bytes: Number(row.data.declared_size_bytes),
    observed_size_bytes: observedSize,
  });
  return { ingestion_id: ingestionId, ingestion_status: 'uploaded', uploaded_at: completedAt };
}
