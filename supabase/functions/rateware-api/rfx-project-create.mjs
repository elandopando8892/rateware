// Authentication and workspace authorization stay in the existing handler.
export function projectOperationId(header, body) {
  const values = [header, body].filter((v) => v !== undefined && v !== null);
  if (!values.length) return null;
  const normalized = values.map((v) => typeof v === 'string' ? v.trim().toLowerCase() : '');
  if (normalized.some((v) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)) || new Set(normalized).size !== 1) {
    throw Object.assign(new Error('A matching UUID operation_id is required.'), { code: '400' });
  }
  return normalized[0];
}

async function projectFingerprint(row) {
  const { updated_at, owner_user_id, ...payload } = row;
  const canonical = JSON.stringify(Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b))));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function readRfxProjectCreationReceipt(client, row, operationId) {
  if (!row.owner_email) throw Object.assign(new Error('Workspace is required.'), { code: '403' });
  if (!operationId) throw Object.assign(new Error('Operation id is required.'), { code: '400' });
  const result = await client.from('rfx_projects').select('id,operation_payload_fingerprint')
    .eq('owner_email', row.owner_email).eq('operation_id', operationId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return { receipt: null };
  if (result.data.operation_payload_fingerprint !== await projectFingerprint(row)) {
    throw Object.assign(new Error('Project operation id was already used with a different payload.'), { code: '409' });
  }
  return { receipt: { projectId: result.data.id, operationId, shipperId: row.customer_id } };
}

export async function createRfxProjectOnce(client, row, operationId) {
  if (!operationId) {
    const result = await client.from('rfx_projects').insert(row).select().single();
    if (result.error) throw result.error;
    return { row: result.data, idempotent: false };
  }
  if (!row.owner_email) throw Object.assign(new Error('Workspace is required.'), { code: '403' });
  const fingerprint = await projectFingerprint(row);
  const read = () => client.from('rfx_projects').select('*').eq('owner_email', row.owner_email).eq('operation_id', operationId).maybeSingle();
  let result = await read();
  if (result.error) throw result.error;
  let idempotent = Boolean(result.data);
  if (!result.data) {
    result = await client.from('rfx_projects').insert({ ...row, operation_id: operationId, operation_payload_fingerprint: fingerprint }).select().single();
    if (result.error?.code === '23505') {
      result = await read();
      idempotent = true;
    }
    if (result.error) throw result.error;
  }
  if (!result.data) throw new Error('Project receipt unavailable. Retry the same operation_id.');
  if (result.data.operation_payload_fingerprint !== fingerprint) {
    throw Object.assign(new Error('Project operation id was already used with a different payload.'), { code: '409' });
  }
  return { row: result.data, idempotent, operation_id: operationId };
}
