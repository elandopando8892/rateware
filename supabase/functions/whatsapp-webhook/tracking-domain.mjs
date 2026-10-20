import { createHash } from 'node:crypto';

export class TrackingError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = message => { throw new TrackingError(400, message); };
export const MAX_AGE_MS = 30 * 60 * 1000;
export const CYCLE_MS = 3 * 60 * 60 * 1000;
const states = ['In transit', 'In carrier yard', 'At origin', 'At destination', 'Cancelled', 'Completed', 'Unloaded', 'Replaced'];
export const terminalStates = new Set(['Cancelled', 'Completed', 'Unloaded', 'Replaced']);
const blockedReasons = ['session_unavailable', 'gps_unavailable', 'assignment_changed', 'coordinates_unverified'];
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

// Capture time is not GPS time. The original offset is retained verbatim.
export function validateObservation(input, binding, now = new Date(), { allowExpiredCapture = false } = {}) {
  const allowed = ['cycleId', 'cycleStartedAt', 'bindingId', 'assignmentVersion', 'unit', 'observedAt', 'tmsStatus', 'gps', 'evidenceRef', 'blockReason'];
  if (!input || Array.isArray(input) || Object.keys(input).some(k => !allowed.includes(k))) fail('Campos de observación no permitidos.');
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(input.cycleId || '') || !/^[a-zA-Z0-9_.-]{1,120}$/.test(input.evidenceRef || '')) fail('Falta un ciclo o recibo verificable.');
  if (input.bindingId !== binding.id || input.assignmentVersion !== binding.assignment_version || input.unit !== binding.unit || !binding.active) throw new TrackingError(409, 'La asignación cambió o no está habilitada.');
  for (const key of ['cycleStartedAt', 'observedAt']) if (!stamp(input[key]) || Date.parse(input[key]) > +now) fail('La hora de observación o ciclo no es válida.');
  const observed = Date.parse(input.observedAt), started = Date.parse(input.cycleStartedAt);
  if (observed < started || observed - started > MAX_AGE_MS || (!allowExpiredCapture && +now - observed > MAX_AGE_MS)) fail('La captura está vencida; solicita una lectura nueva.');
  if (input.tmsStatus !== null && !states.includes(input.tmsStatus)) fail('Estado TMS no reconocido.');
  if (input.blockReason != null && !blockedReasons.includes(input.blockReason)) fail('Motivo de bloqueo no permitido.');
  if (input.tmsStatus === null && !input.blockReason) fail('Falta verificación del estado TMS.');
  let gps = null, quality = input.blockReason || 'verified';
  if (input.gps != null) {
    const g = input.gps;
    if (Object.keys(g).some(k => !['timestamp', 'latitude', 'longitude', 'motion'].includes(k)) || !stamp(g.timestamp)) fail('Lectura GPS no válida.');
    if (![g.latitude, g.longitude].every(Number.isFinite) || Math.abs(g.latitude) > 90 || Math.abs(g.longitude) > 180 || !['moving', 'stopped', 'unknown'].includes(g.motion)) fail('Coordenadas o movimiento no válidos.');
    if (Date.parse(g.timestamp) > observed) fail('La lectura GPS está en el futuro.');
    gps = { timestamp: g.timestamp, latitude: g.latitude, longitude: g.longitude, motion: g.motion };
    if (observed - Date.parse(g.timestamp) > MAX_AGE_MS) quality = 'gps_stale';
  } else if (!terminalStates.has(input.tmsStatus)) quality = input.blockReason || 'gps_unavailable';
  return { cycleId: input.cycleId, cycleStartedAt: input.cycleStartedAt, bindingId: binding.id,
    assignmentVersion: binding.assignment_version, unit: binding.unit, observedAt: input.observedAt,
    tmsStatus: input.tmsStatus, gps, evidenceRef: input.evidenceRef, quality };
}

// Verify the canonical shipment/segment binding. Fleet Rocket enforces the visitor's
// session and permissions; this URL action neither grants nor certifies their access.
// Provisioning is separate from GPS ingestion.
export function customerLoadAction(binding, now = new Date()) {
  if (!binding.customer_url || !binding.link_evidence_ref || !Number.isFinite(Date.parse(binding.link_verified_until)) || Date.parse(binding.link_verified_until) <= +now) return null;
  try {
    const u = new URL(binding.customer_url);
    if (u.protocol !== 'https:' || u.hostname !== 'my.fleetrocket.io' || u.port || u.username || u.password || u.hash ||
      u.pathname !== `/shipments/${binding.shipment_id}/show` ||
      [...u.searchParams.keys()].some(k => !['section', 'segment_id'].includes(k)) ||
      [...new Set(u.searchParams.keys())].some(k => u.searchParams.getAll(k).length !== 1) ||
      (u.searchParams.has('section') && !/^\d{1,2}$/.test(u.searchParams.get('section'))) ||
      (u.searchParams.has('segment_id') && u.searchParams.get('segment_id') !== String(binding.segment_id))) return null;
    return { label: 'Ver mi embarque', url: u.href, kind: 'url_button', access: 'requires_fleetrocket_session', verification: 'shipment_binding_verified', validUntil: binding.link_verified_until };
  } catch { return null; }
}
const localTime = value => new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short', timeStyle: 'medium', hour12: false }).format(new Date(value));
const reasons = {
  session_unavailable: 'No se pudo verificar la sesión del TMS.', gps_unavailable: 'Sin lectura GPS verificable.',
  assignment_changed: 'La asignación requiere revisión.', coordinates_unverified: 'Coordenadas pendientes de verificación.',
  gps_stale: 'Lectura GPS vencida.', observation_stale: 'Sin comprobación vigente del TMS.',
};
export function renderTrackingReport(binding, observation, now = new Date()) {
  const action = customerLoadAction(binding, now);
  const old = !observation || +now - Date.parse(observation.observedAt) > MAX_AGE_MS;
  let quality = observation?.quality || 'gps_unavailable';
  if (old) quality = 'observation_stale';
  else if (observation.gps && +now - Date.parse(observation.gps.timestamp) > MAX_AGE_MS) quality = 'gps_stale';
  const excluded = terminalStates.has(observation?.tmsStatus);
  const lines = [`Actualización de embarque ${binding.segment_label} · ${binding.unit}`];
  lines.push(`Estado TMS${old ? ' (último registrado)' : ''}: ${observation?.tmsStatus || 'sin verificar'}.`);
  if (observation?.observedAt) lines.push(`Comprobado: ${localTime(observation.observedAt)} CDMX.`);
  if (observation?.gps) {
    lines.push(`Última lectura GPS: ${localTime(observation.gps.timestamp)} CDMX.`);
    if (quality === 'verified') {
      lines.push(`GPS: ${{ moving: 'en movimiento', stopped: 'detenido', unknown: 'movimiento no determinado' }[observation.gps.motion]}.`);
      lines.push(`Coordenadas: ${observation.gps.latitude}, ${observation.gps.longitude}.`);
    }
  }
  if (quality !== 'verified') lines.push(reasons[quality] || 'Lectura pendiente de validación.');
  if (observation?.tmsStatus === 'At destination') lines.push('Llegada registrada por TMS; no confirma descarga ni entrega completada.');
  const blockers = ['group_transport_pending', 'cost_authorization_pending'];
  if (!action) blockers.push('customer_load_link_unverified');
  if (quality !== 'verified') blockers.push(quality);
  return { bindingId: binding.id, customerId: binding.customer_id, segment: binding.segment_label, unit: binding.unit,
    quality, cycleId: observation?.cycleId || null, observedAt: observation?.observedAt || null,
    gpsTimestamp: observation?.gps?.timestamp || null, body: lines.join('\n'), action,
    validUntil: new Date(quality === 'verified' && observation ? Math.min(Date.parse(observation.observedAt), observation.gps ? Date.parse(observation.gps.timestamp) : +now) + MAX_AGE_MS : +now + MAX_AGE_MS).toISOString(),
    disposition: excluded ? 'excluded' : 'prepared', blockers, execution: 'not_sent',
    whatsapp: { format: 'template_url_button_required', approval: 'pending', automaticSend: false } };
}
