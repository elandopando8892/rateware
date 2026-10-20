// Pure callback rules; persistence and signature verification belong to the handler.
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const invalid = () => { throw new Error('INVALID_CALLBACK'); };
function identity(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value)) invalid();
  return value.trim();
}
export function normalizeMetaPhone(value) {
  if (typeof value !== 'string' || !/^\+?[1-9]\d{10,14}$/.test(value)) return '';
  const digits = value.replace(/^\+/, '');
  return /^521\d{10}$/.test(digits) ? `52${digits.slice(3)}` : digits;
}
export function parseCallback(kind, row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) invalid();
  const status = kind === 'inbound' ? 'replied' : typeof row.status === 'string' ? row.status.toLowerCase() : '';
  if (kind === 'status' && !['sent','delivered','read','failed'].includes(status)) return null;
  if (!['status','inbound'].includes(kind)) invalid();
  const id = identity(row.id);
  if (typeof row.timestamp !== 'string' || !/^\d+$/.test(row.timestamp)) invalid();
  const seconds = Number(row.timestamp);
  if (!Number.isSafeInteger(seconds) || seconds <= 0 || seconds > 253402300799) invalid();
  const phone = kind === 'inbound' ? normalizeMetaPhone(row.from) : row.recipient_id === undefined ? '' : normalizeMetaPhone(row.recipient_id);
  if ((kind === 'inbound' || row.recipient_id !== undefined) && !phone) invalid();
  let context = '';
  if (kind === 'inbound' && row.context !== undefined) {
    if (!row.context || typeof row.context !== 'object' || Array.isArray(row.context)) invalid();
    if ('id' in row.context) context = identity(row.context.id);
  }
  const text = record(row.text), button = record(row.button), interactive = record(row.interactive);
  const candidates = [text.body, button.text, record(interactive.button_reply).title, record(interactive.list_reply).title, row.type];
  const body = kind === 'inbound' ? candidates.find(value => typeof value === 'string') ?? 'Inbound WhatsApp message'
    : (Array.isArray(row.errors) ? row.errors.map(item => {
      const error = record(item); return String(error.message ?? error.title ?? error.code ?? '');
    }).filter(Boolean).join(' | ') : '') || status;
  return {kind,provider_message_id:id,status,occurred_at:new Date(seconds * 1000).toISOString(),timestamp:String(seconds),from_phone:phone,context_id:context,body};
}
export async function callbackReceiptId(connection, event) {
  if (!connection.id || (!connection.owner_email && !connection.owner_user_id)) invalid();
  const key = ['bidware.whatsapp-callback.v1',connection.id,connection.owner_email || '',connection.owner_user_id || '',event.kind,event.provider_message_id,event.kind === 'status' ? event.status : '',event.kind === 'status' ? event.timestamp : ''];
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(key)))).slice(0,16);
  bytes[6] = (bytes[6] & 15) | 128; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function selectInboundAssociation(candidates, event) {
  const eligible = candidates.filter(row => row.channel === 'whatsapp' && row.rfx_event_id && row.provider_message_id && row.sent_at
    && !['drafted','queued','sending'].includes(row.status) && Number.isFinite(Date.parse(row.sent_at))
    // Meta reports whole seconds; local persistence retains milliseconds.
    && Math.floor(Date.parse(row.sent_at) / 1000) <= Math.floor(Date.parse(event.occurred_at) / 1000));
  if (event.context_id) {
    const matches = eligible.filter(row => row.provider_message_id === event.context_id);
    return matches.length === 1 ? {message:matches[0],reason:'context'} : {message:null,reason:'context_unresolved'};
  }
  const groups = new Set(eligible.map(row => JSON.stringify([row.rfx_event_id,row.vendor_id ?? null])));
  if (groups.size !== 1) return {message:null,reason:groups.size ? 'ambiguous' : 'no_candidate'};
  return {message:[...eligible].sort((a,b) => Date.parse(b.sent_at)-Date.parse(a.sent_at) || String(a.id).localeCompare(String(b.id)))[0],reason:'single_conversation'};
}
export function callbackProjection(target, receipt, receivedAt) {
  const rank = {sent:1,failed:2,delivered:3,read:4,replied:5};
  const current = Math.max(rank[target.status] || 0,rank[target.delivery_status] || 0);
  if (!rank[receipt.status] || rank[receipt.status] <= current) return null;
  const event = record(record(receipt.metadata).callback);
  const patch = {status:receipt.status,delivery_status:receipt.status,provider_response_status:receipt.status,provider:'meta',updated_at:receivedAt,
    delivery_error:receipt.status === 'failed' ? receipt.body_preview : null,
    send_result:{...record(target.send_result),webhook:{receipt_id:receipt.id,outreach_message_id:target.id,status:receipt.status,provider_message_id:event.provider_message_id,occurred_at:receipt.occurred_at,received_at:receivedAt}}};
  const field = {sent:'sent_at',failed:'failed_at',delivered:'delivered_at',read:'read_at'}[receipt.status];
  if (field) patch[field] = receipt.occurred_at;
  if (receipt.status === 'sent') patch.last_contacted_at = receipt.occurred_at;
  return patch;
}
