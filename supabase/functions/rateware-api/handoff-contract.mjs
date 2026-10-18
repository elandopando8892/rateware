// Pure handoff contract for RFx award closeout. No I/O, no input mutation,
// no repricing and no implicit commercial defaults.

const CONFLICT_CODE = 'RFX_HANDOFF_CONFLICT';
const CONFLICT_MESSAGE = 'La versión preparada para revisión no coincide con la oferta vigente.';

function conflict() {
  const error = new Error(CONFLICT_MESSAGE);
  error.status = 409;
  error.code = CONFLICT_CODE;
  return error;
}

const SNAPSHOT_FIELDS = [
  'id', 'vendor_id', 'bid_rate', 'currency', 'weekly_capacity', 'transit_days', 'valid_through',
  'commercial_model', 'marksman_margin_pct', 'carrier_share_pct', 'client_fee_amount',
  'commercial_rounding_increment', 'current_unit_location', 'deadhead_distance', 'deadhead_unit',
  'notes', 'best_alternative_offered', 'alternative_equipment', 'alternative_units',
  'alternative_notes', 'equipment_available', 'unit_details', 'eta_pickup', 'eta_delivery',
  'responded_at',
];
const NUMERIC_FIELDS = new Set([
  'bid_rate', 'weekly_capacity', 'transit_days', 'marksman_margin_pct', 'carrier_share_pct',
  'client_fee_amount', 'commercial_rounding_increment', 'deadhead_distance',
]);
const OPTIONAL_TIMESTAMP_FIELDS = new Set(['eta_pickup', 'eta_delivery']);
const ROUTE_FIELDS = [
  'origin', 'destination', 'equipment', 'trailer', 'config', 'operation', 'service',
  'origin_state', 'origin_country', 'destination_state', 'destination_country',
];
const MODEL_ALIASES = { direct_cost_plus: 'cost_plus', carrier_share: 'sell_share', xbf_buy_sell: 'brokerage' };
const KNOWN_MODELS = new Set(['sell_share', 'cost_plus', 'brokerage', 'fee_plus']);

// Exact decimal canonicalization without float rounding. Returns null for missing.
function canonDecimal(value) {
  if (value === undefined || value === null) return null;
  let text;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw conflict();
    text = String(value);
  } else if (typeof value === 'string') {
    text = value.trim();
  } else {
    throw conflict();
  }
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match || (match[2] + (match[3] ?? '')).length === 0) throw conflict();
  const exponent = match[4] === undefined ? 0 : Number(match[4]);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) throw conflict();
  let digits = match[2] + (match[3] ?? '');
  let point = match[2].length + exponent;
  while (digits.length && digits[0] === '0') { digits = digits.slice(1); point -= 1; }
  while (digits.endsWith('0')) digits = digits.slice(0, -1);
  if (!digits) return '0';
  let body;
  if (point <= 0) body = `0.${'0'.repeat(-point)}${digits}`;
  else if (point >= digits.length) body = digits + '0'.repeat(point - digits.length);
  else body = `${digits.slice(0, point)}.${digits.slice(point)}`;
  return match[1] === '-' ? `-${body}` : body;
}

function toNumber(value) {
  const canonical = canonDecimal(value);
  if (canonical === null) return null;
  const number = Number(canonical);
  if (!Number.isFinite(number) || canonDecimal(number) !== canonical) throw conflict();
  return number === 0 ? 0 : number;
}

const TIMESTAMP_RE = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?\s*([Zz]|[+-]\d{2}(?::?\d{2})?)$/;

// Canonical UTC timestamp with microsecond (or finer) precision; null if not parseable.
function parseTimestamp(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    value = value.toISOString();
  }
  if (typeof value !== 'string') return null;
  const match = TIMESTAMP_RE.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s = '00', frac = '', zone] = match;
  const parts = [y, mo, d, h, mi, s].map(Number);
  const base = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
  const check = new Date(base);
  if (check.getUTCFullYear() !== parts[0] || check.getUTCMonth() !== parts[1] - 1
    || check.getUTCDate() !== parts[2] || check.getUTCHours() !== parts[3]
    || check.getUTCMinutes() !== parts[4] || check.getUTCSeconds() !== parts[5]) return null;
  let offsetMinutes = 0;
  if (zone.toUpperCase() !== 'Z') {
    const sign = zone[0] === '-' ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    const hours = Number(digits.slice(0, 2));
    const minutes = digits.length > 2 ? Number(digits.slice(2, 4)) : 0;
    if (hours > 23 || minutes > 59) return null;
    offsetMinutes = sign * (hours * 60 + minutes);
  }
  const utc = new Date(base - offsetMinutes * 60000);
  if (Number.isNaN(utc.getTime())) return null;
  let fraction = frac.padEnd(6, '0');
  while (fraction.length > 6 && fraction.endsWith('0')) fraction = fraction.slice(0, -1);
  return `${utc.toISOString().slice(0, 19)}.${fraction}Z`;
}

function requiredTimestamp(value) {
  if (value === undefined || value === null) return null;
  const canonical = parseTimestamp(value);
  if (canonical === null) throw conflict();
  return canonical;
}

function canonCurrency(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw conflict();
  const text = value.trim().toUpperCase();
  return text || null;
}

function canonModel(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw conflict();
  const text = value.trim().toLowerCase();
  if (!text) return null;
  return MODEL_ALIASES[text] ?? text;
}

function knownModel(value) {
  const model = canonModel(value);
  if (model !== null && !KNOWN_MODELS.has(model)) throw conflict();
  return model;
}

function canonDate(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw conflict();
  return value.trim() || null;
}

function canonText(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' && typeof value !== 'number') throw conflict();
  return String(value).trim() || null;
}

function cloneValue(value) {
  if (value === undefined || value === null) return null;
  return typeof value === 'object' ? structuredClone(value) : value;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function same(a, b) {
  return stable(a) === stable(b);
}

function sameId(a, b) {
  const left = canonText(a);
  const right = canonText(b);
  return left !== null && left === right;
}

function expect(condition) {
  if (!condition) throw conflict();
}

/** @returns {Record<string, unknown>} */
export function bidSnapshot(award) {
  const source = award && typeof award === 'object' ? award : {};
  const snapshot = {};
  for (const field of SNAPSHOT_FIELDS) {
    const raw = source[field];
    let value;
    if (NUMERIC_FIELDS.has(field)) value = toNumber(raw);
    else if (field === 'currency') value = canonCurrency(raw);
    else if (field === 'commercial_model') value = canonModel(raw);
    else if (field === 'valid_through') value = canonDate(raw);
    else if (field === 'responded_at') value = requiredTimestamp(raw);
    else if (OPTIONAL_TIMESTAMP_FIELDS.has(field)) value = parseTimestamp(raw) ?? cloneValue(raw);
    else value = cloneValue(raw);
    snapshot[field] = value;
  }
  return snapshot;
}

function expectedPercentages(model, award) {
  return {
    commission_pct: model === 'sell_share' ? canonDecimal(award.carrier_share_pct)
      : model === 'cost_plus' ? canonDecimal(award.marksman_margin_pct) : null,
    markup_pct: model === 'brokerage' ? canonDecimal(award.marksman_margin_pct) : null,
  };
}

export function requireHandoffParity(award, event, staging, ownerEmail) {
  expect(award && typeof award === 'object' && event && typeof event === 'object');
  const owner = typeof ownerEmail === 'string' ? ownerEmail.trim() : '';
  expect(owner !== '' && canonText(event.owner_email) === owner);
  expect(canonText(award.id) !== null && sameId(award.rfx_event_id, event.id));

  const lane = award.rfx_lanes;
  expect(lane && typeof lane === 'object' && sameId(award.rfx_lane_id, lane.id));

  const linkA = canonText(award.rate_staging_id);
  const linkB = canonText(award.bid_rate_staging_id);
  expect(linkA === null || linkB === null || linkA === linkB);
  const link = linkA ?? linkB;
  if (staging === undefined || staging === null) {
    expect(link === null);
    const current = bidSnapshot(award);
    expect(current.responded_at !== null && current.bid_rate > 0 && current.currency !== null);
    return;
  }
  expect(typeof staging === 'object' && link !== null && sameId(staging.id, link));
  expect(canonText(staging.owner_email) === owner);
  expect(['pending_review', 'approved'].includes(canonText(staging.status)));
  expect(sameId(staging.rfx_id, event.rfx_id));
  expect(sameId(staging.vendor_id, award.vendor_id));

  const evidence = staging.source_evidence;
  const payload = staging.extracted_payload;
  expect(evidence && typeof evidence === 'object' && payload && typeof payload === 'object');
  const payloadBid = payload.bid;
  const payloadLane = payload.lane;
  expect(payloadBid && typeof payloadBid === 'object' && payloadLane && typeof payloadLane === 'object');
  expect(sameId(evidence.rfx_event_id, event.id));
  expect(sameId(evidence.rfx_lane_id, lane.id));
  expect(sameId(evidence.rfx_lane_vendor_id, award.id));
  expect(sameId(payloadBid.id, award.id));
  expect(sameId(payloadLane.id, lane.id));
  if (evidence.vendor_id !== undefined && evidence.vendor_id !== null) expect(sameId(evidence.vendor_id, staging.vendor_id));
  if (payloadBid.vendor_id !== undefined && payloadBid.vendor_id !== null) expect(sameId(payloadBid.vendor_id, staging.vendor_id));

  // Bid revision: responded_at only (updated_at moves with awards/links).
  const current = bidSnapshot(award);
  const historic = bidSnapshot(payloadBid);
  const sourceResponded = requiredTimestamp(evidence.responded_at);
  expect(current.responded_at !== null);
  expect(sourceResponded !== null || historic.responded_at !== null);
  if (sourceResponded !== null && historic.responded_at !== null) expect(sourceResponded === historic.responded_at);
  expect((sourceResponded ?? historic.responded_at) === current.responded_at);

  for (const field of SNAPSHOT_FIELDS) {
    if (field === 'vendor_id' || field === 'responded_at') continue;
    if (NUMERIC_FIELDS.has(field)) expect(canonDecimal(award[field]) === canonDecimal(payloadBid[field]));
    else expect(same(current[field], historic[field]));
  }

  for (const field of ROUTE_FIELDS) {
    const values = [canonText(lane[field]), canonText(payloadLane[field]), canonText(staging[field])];
    const known = values.filter((value) => value !== null);
    expect(known.every((value) => value === known[0]));
    if (values[0] !== null) expect(known.length === values.length);
  }

  const model = knownModel(award.commercial_model);
  expect(knownModel(staging.commercial_model) === model);
  const rate = canonDecimal(award.bid_rate);
  expect(canonDecimal(staging.carrier_cost_rate) === rate);
  expect(canonDecimal(staging.all_in_rate) === rate);
  expect(canonCurrency(staging.currency) === current.currency);
  expect(canonDecimal(staging.weekly_capacity) === canonDecimal(award.weekly_capacity));
  expect(canonDate(staging.valid_through) === current.valid_through);
  expect(canonDecimal(staging.client_fee_amount) === canonDecimal(award.client_fee_amount));
  expect(canonDecimal(staging.commercial_rounding_increment) === canonDecimal(award.commercial_rounding_increment));
  const percentages = expectedPercentages(model, award);
  if (model === 'sell_share' || model === 'cost_plus') expect(canonDecimal(staging.commission_pct) === percentages.commission_pct);
  if (model === 'brokerage') expect(canonDecimal(staging.markup_pct) === percentages.markup_pct);
}

export function handoffCommercialPatch(award) {
  const snapshot = bidSnapshot(award);
  const model = knownModel(snapshot.commercial_model);
  const percentages = expectedPercentages(model, award ?? {});
  const rate = canonDecimal(award?.bid_rate);
  const capacity = canonDecimal(award?.weekly_capacity);
  return {
    carrier_cost_rate: snapshot.bid_rate,
    all_in_rate: rate,
    currency: snapshot.currency,
    weekly_capacity: capacity,
    valid_through: snapshot.valid_through,
    commercial_model: model,
    commission_pct: percentages.commission_pct === null ? null : Number(percentages.commission_pct),
    markup_pct: percentages.markup_pct === null ? null : Number(percentages.markup_pct),
    client_fee_amount: snapshot.client_fee_amount,
    commercial_rounding_increment: snapshot.commercial_rounding_increment,
    current_unit_location: snapshot.current_unit_location,
    deadhead_distance: snapshot.deadhead_distance,
    deadhead_unit: snapshot.deadhead_unit,
    rate_basis: 'rfx_award_closeout',
    source_bid_status: 'awarded',
    rfx_bid_outcome: 'awarded',
  };
}
