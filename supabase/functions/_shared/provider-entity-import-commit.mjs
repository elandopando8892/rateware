// Commit half of the private Entity Vault importer.
//
// Planning lives in provider-entity-import.mjs and is pure. This performs the writes:
// create the ingestion row, upload the bytes to the private bucket at the path the
// row's own constraint demands, then confirm. Raw fetch against Supabase REST and
// Storage — no SDK, so the tool stays dependency-free.
//
// Safety rails are structural, not advisory:
//   - a batch containing refused key material is never committed, at all;
//   - the storage path is derived from the ingestion id, matching the DB constraint;
//   - upload uses no-upsert, so a re-run cannot overwrite a stored document;
//   - no document byte and no filename is ever logged.

const VAULT_BUCKET = 'provider-entity-vault';

const text = (value) => String(value ?? '').trim();

/** Builds the deterministic ingestion key: stable across retries, unique per file. */
export function ingestionKeyFor(sha256) {
  return `import-${text(sha256).slice(0, 32)}`;
}

async function restRequest(config, path, init = {}) {
  const response = await config.fetch(`${config.supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      // Postgres error fields are safe to surface; the request body is not echoed.
      detail = text(body?.message || body?.error || body?.msg);
    } catch { detail = ''; }
    throw new Error(`Supabase responded ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return response;
}

/**
 * Commits one planned file.
 *
 * @returns { ingestion_id, storage_path, status }
 */
export async function commitPlannedDocument(config, plan, bytes) {
  const organizationId = text(config.organizationId);
  const legalEntityId = text(plan.legal_entity_id || config.legalEntityId);
  if (!organizationId || !legalEntityId) throw new Error('organization and legal entity are required.');

  // The row's own id is part of the storage path its check constraint enforces, so
  // the id must be known before the insert rather than returned by it. Generate it
  // client-side and pass it explicitly.
  const ingestionId = crypto.randomUUID();
  const storagePath = `${organizationId}/${legalEntityId}/${ingestionId}/${plan.filename}`;

  const insert = await restRequest(config, '/rest/v1/provider_entity_document_ingestions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify({
      id: ingestionId,
      organization_id: organizationId,
      legal_entity_id: legalEntityId,
      ingestion_key: ingestionKeyFor(plan.sha256),
      original_filename: plan.filename,
      declared_mime_type: plan.mime_type,
      declared_size_bytes: plan.size_bytes,
      expected_sha256: plan.sha256,
      source_channel: 'manual',
      source_reference: 'import-entity-vault',
      requested_by_actor_type: 'user',
      requested_by_user_id: config.actorUserId,
      storage_path: storagePath,
    }),
  });
  const [row] = await insert.json();

  // 2. Upload the bytes. x-upsert false: a re-run must never overwrite a stored
  //    document — duplicates are caught at planning time by hash.
  await restRequest(config, `/storage/v1/object/${VAULT_BUCKET}/${encodeURI(storagePath)}`, {
    method: 'POST',
    headers: { 'content-type': plan.mime_type, 'x-upsert': 'false' },
    body: bytes,
  });

  // 3. Mark the row uploaded now that the object exists.
  await restRequest(config, `/rest/v1/provider_entity_document_ingestions?id=eq.${row.id}&organization_id=eq.${organizationId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ingestion_status: 'uploaded',
      upload_completed_at: new Date().toISOString(),
    }),
  });

  return { ingestion_id: row.id, storage_path: storagePath, status: 'uploaded' };
}

/**
 * Commits a planned batch.
 *
 * Refuses outright if the plan carried any key-material rejection: a batch that
 * contained a signing key is not a batch to trust file-by-file.
 */
export async function commitEntityVaultImport(config, planResult, bytesByFilename) {
  const keyMaterial = planResult.rejections.filter((entry) => entry.reason === 'key_material_refused');
  if (keyMaterial.length) {
    throw new Error(`Refusing to commit: ${keyMaterial.length} file(s) in this batch are cryptographic key material.`);
  }
  const committed = [];
  const failed = [];
  for (const plan of planResult.plans) {
    const bytes = bytesByFilename.get(plan.filename);
    if (!bytes) { failed.push({ document_type: plan.document_type, error: 'bytes_missing' }); continue; }
    try {
      committed.push({ ...(await commitPlannedDocument(config, plan, bytes)), document_type: plan.document_type });
    } catch (error) {
      // Filenames are identifying; the failure is reported by document type.
      failed.push({ document_type: plan.document_type, error: text(error?.message).slice(0, 200) });
    }
  }
  return Object.freeze({ committed: Object.freeze(committed), failed: Object.freeze(failed) });
}
