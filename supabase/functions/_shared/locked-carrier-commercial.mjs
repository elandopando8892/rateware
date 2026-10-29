const object = v => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const relation = v => Array.isArray(v) ? object(v[0]) : object(v);
export function lockedBrokeragePolicy(value) {
  const row = object(value);
  const candidates = [row, object(row.rfx_master_package), object(row.event), relation(row.rfx_events),
    object(object(row.event).rfx_master_package), object(relation(row.rfx_events).rfx_master_package)];
  return candidates.some(c => {
    const p = object(c.carrier_commercial_policy);
    return p.locked === true && p.model === "brokerage";
  }) ? { model: "brokerage", locked: true } : null;
}
export const INTERNAL_COMMERCIAL_FIELDS = new Set([
  "marksman_margin_pct", "carrier_share_pct", "markup_pct", "markup_fee",
  "commission_pct", "commission_fee", "client_fee_amount", "commercial_rounding_increment",
  "board_rate", "rate_visibility", "fee_label", "economics", "rateware_capture"
]);
export function lockedCommercialViolation(input, context) {
  if (!lockedBrokeragePolicy(context)) return null;
  const body = object(input);
  if (body.commercial_model != null && !["brokerage", "xbf_buy_sell"].includes(body.commercial_model))
    return { code: "COMMERCIAL_MODEL_LOCKED", error: "Este evento opera únicamente en XBF compra-venta." };
  if ([...INTERNAL_COMMERCIAL_FIELDS].some(k => body[k] != null))
    return { code: "INTERNAL_COMMERCIAL_FIELD", error: "El margen y las condiciones internas no se capturan por el transportista." };
  return null;
}
// Projection at the carrier response boundary. Never changes stored owner economics.
export function projectLockedCarrierPayload(payload, scope = null) {
  const policies = new Map();
  if (scope?.eventId && scope.policy) policies.set(scope.eventId, scope.policy);
  function collect(v) {
    if (Array.isArray(v)) return v.forEach(collect);
    const o = object(v);
    if (o.id && lockedBrokeragePolicy(o)) policies.set(String(o.id), lockedBrokeragePolicy(o));
    Object.values(o).forEach(x => { if (x && typeof x === "object") collect(x); });
  }
  collect(payload);
  function visit(v, inherited) {
    if (Array.isArray(v)) return v.map(x => visit(x, inherited));
    if (!v || typeof v !== "object") return v;
    const o = object(v);
    const event = object(o.event), related = relation(o.rfx_events);
    const eventId = o.rfx_event_id || event.id || related.id;
    const policy = eventId ? policies.get(String(eventId)) || null
      : policies.get(String(o.id || "")) || (lockedBrokeragePolicy(o) ? lockedBrokeragePolicy(o) : inherited);
    const out = {};
    for (const [key, value] of Object.entries(o)) {
      if (key === "carrier_preselection_internal") continue;
      if (policy && INTERNAL_COMMERCIAL_FIELDS.has(key)) continue;
      out[key] = visit(value, policy);
    }
    if (policy && ("commercial_model" in o || "invitation_id" in o)) {
      out.commercial_model = "brokerage";
      out.commercial_model_locked = true;
    }
    return out;
  }
  return visit(payload, scope?.policy || null);
}
