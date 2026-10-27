// Adapted from markos-bid-room-release (September read-only slice) for API v717.
// Internal operator read contract. Never call board repair, token hydration or RPCs.
export const MARKOS_SNAPSHOT_ACTION = 'get_markos_bid_room_snapshot';
export const EVENT_FIELDS = ['id','rfx_id','name','status','due_date','updated_at'];
export const LANE_FIELDS = ['id','rfx_event_id','lane_number','origin','destination','equipment','trailer','config','operation','service','weekly_volume','annual_volume','target_rate','currency','logistics_model','operation_criteria','business_rules','service_specifications','carrier_requirements','other_notes','updated_at'];
export const BID_FIELDS = ['id','rfx_event_id','rfx_lane_id','invitation_status','bid_rate','currency','weekly_capacity','transit_days','commercial_model','marksman_margin_pct','carrier_share_pct','client_fee_amount','commercial_rounding_increment','valid_through','updated_at'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pick = (row, fields) => Object.fromEntries(fields.map(k => [k, typeof row[k] === 'string' ? row[k].slice(0,2000) : typeof row[k] === 'number' && Number.isFinite(row[k]) ? row[k] : null]));
const offset = v => v === undefined ? 0 : Number.isSafeInteger(v) && v >= 0 && v <= 10000 ? v : null;
const fail = (status,error) => ({ status, body: { error, execution:'not_executed' } });
export async function handleMarkosSnapshot(db, user, input, now = () => new Date()) {
  if (typeof user?.owner_email !== 'string' || !user.owner_email.trim()) return fail(403,'No hay un espacio de trabajo autorizado.');
  if (!input || Array.isArray(input) || typeof input !== 'object' || input.action !== MARKOS_SNAPSHOT_ACTION ||
      Object.keys(input).some(k=>!['action','event_id','lane_id','lane_offset','bid_offset'].includes(k))) return fail(400,'Campos de consulta no permitidos.');
  if (!uuid.test(input.event_id || '') || (input.lane_id != null && !uuid.test(input.lane_id))) return fail(400,'Selecciona una oportunidad y ruta válidas.');
  const laneOffset = offset(input.lane_offset), bidOffset = offset(input.bid_offset);
  if (laneOffset === null || bidOffset === null || (!input.lane_id && bidOffset !== 0)) return fail(400,'Paginación no válida.');
  try {
    const eventResult = await db.from('rfx_events').select(EVENT_FIELDS.join(',')).eq('id',input.event_id).eq('owner_email',user.owner_email).maybeSingle();
    if (eventResult.error) return fail(502,'No se pudo verificar la oportunidad.');
    if (!eventResult.data || eventResult.data.id !== input.event_id) return fail(404,'La oportunidad no está disponible para tu cuenta.');
    const lanesResult = await db.from('rfx_lanes').select(LANE_FIELDS.join(',')).eq('rfx_event_id',input.event_id).order('lane_number',{ascending:true}).order('id',{ascending:true}).range(laneOffset,laneOffset+50);
    if (lanesResult.error || !Array.isArray(lanesResult.data) || lanesResult.data.length > 51 || new Set(lanesResult.data.map(r=>r?.id)).size !== lanesResult.data.length) return fail(502,'No se pudo consultar el detalle de rutas.');
    if (lanesResult.data.some(r=>r.rfx_event_id!==input.event_id || !uuid.test(r.id))) return fail(502,'El detalle no corresponde a la oportunidad.');
    const lanes = lanesResult.data.slice(0,50).map(r=>pick(r,LANE_FIELDS));
    let selectedLane = null, bids = [], bidsMore = false;
    if (input.lane_id) {
      // Independent ownership join allows a selected route to survive list pagination.
      const laneResult = await db.from('rfx_lanes').select(LANE_FIELDS.join(',')).eq('rfx_event_id',input.event_id).eq('id',input.lane_id).maybeSingle();
      if (laneResult.error) return fail(502,'No se pudo verificar la ruta.');
      if (!laneResult.data || laneResult.data.rfx_event_id!==input.event_id || laneResult.data.id!==input.lane_id) return fail(404,'La ruta no pertenece a esta oportunidad.');
      selectedLane = pick(laneResult.data,LANE_FIELDS);
      const bidsResult = await db.from('rfx_lane_vendors').select(BID_FIELDS.join(',')).eq('rfx_event_id',input.event_id).eq('rfx_lane_id',input.lane_id).not('bid_rate','is',null).not('invitation_status','in','(archived,declined,rejected,withdrawn)').order('id',{ascending:true}).range(bidOffset,bidOffset+25);
      if (bidsResult.error || !Array.isArray(bidsResult.data) || bidsResult.data.length > 26 || new Set(bidsResult.data.map(r=>r?.id)).size !== bidsResult.data.length) return fail(502,'No se pudieron consultar las propuestas registradas.');
      if (bidsResult.data.some(r=>r.rfx_event_id!==input.event_id || r.rfx_lane_id!==input.lane_id || !uuid.test(r.id))) return fail(502,'Las propuestas no corresponden a esta ruta.');
      // The live schema has no economics_version. Never label historical bids as v1.
      bids = bidsResult.data.slice(0,25).map(r=>({...pick(r,BID_FIELDS),economics_version:null})); bidsMore=bidsResult.data.length>25;
    }
    return {status:200,body:{contract:'markos.bid-room.read.v1',event:pick(eventResult.data,EVENT_FIELDS),lanes,selectedLane,bids,
      coverage:{laneOffset,laneLimit:50,lanesMore:lanesResult.data.length>50,bidOffset,bidLimit:25,bidsMore,bidsQueried:Boolean(input.lane_id)},
      retrievedAt:now().toISOString(),execution:'not_executed',limitations:[
        'Lectura interna: no compartir precios o condiciones de terceros con carriers sin una política de divulgación aprobada.',
        'Modelos observados en propuestas, no modelos aprobados para todo el negocio. Los importes pueden tener bases distintas: no son un ranking comparable ni una oferta en firme.',
        'Cada texto largo se limita a 2,000 caracteres. Los campos vacíos son desconocidos. Sin benchmark, contactos ni tokens privados.',
        'La fuente no registra economics_version; no se reinterpretan modelos económicos históricos.',
        'Lecturas paginadas independientes, no un snapshot transaccional.'
      ]}};
  } catch { return fail(502,'El detalle no pudo consultarse. Sin reintento ni cambios.'); }
}
