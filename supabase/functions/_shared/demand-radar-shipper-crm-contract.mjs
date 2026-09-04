export const DEMAND_RADAR_SOURCE = "marksman_demand_radar";
export const DEMAND_RADAR_COMMIT_PHRASE = "ESCRIBIR EN RATEWARE";
export const RATEWARE_CANONICAL_VALIDITY = "first_class_canonical";

const RELATIONSHIP_STAGES = new Set(["target", "qualified", "customer", "at_risk", "inactive"]);
const PROHIBITED_CONTACT_FIELDS = new Set([
  "email", "phone", "mobile", "whatsapp", "personal_email", "primary_contact_email",
  "primary_contact_phone", "contact_email", "contact_phone",
]);

function clean(value, max = 500) {
  if (value === null || value === undefined) return null;
  const output = String(value).trim().replace(/\s+/g, " ");
  return output ? output.slice(0, max) : null;
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanHttps(value) {
  const output = clean(value, 400);
  if (!output) return null;
  try {
    const url = new URL(output);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function cleanProvenance(value) {
  const source = plainObject(value);
  return {
    denue_ids: Array.isArray(source.denueIds) ? source.denueIds.map((item) => clean(item, 80)).filter(Boolean).slice(0, 100) : [],
    campaign_ids: Array.isArray(source.campaignIds) ? source.campaignIds.map((item) => clean(item, 100)).filter(Boolean).slice(0, 25) : [],
    geofence: clean(source.geofence, 160),
    evidence_basis: clean(source.evidenceBasis, 300),
  };
}

export function normalizeDemandRadarShipperPatch(value) {
  const source = plainObject(value);
  const prohibited = Object.keys(source).filter((key) => PROHIBITED_CONTACT_FIELDS.has(key.toLowerCase()));
  const relationshipStage = clean(source.relationship_stage, 40)?.toLowerCase() || null;
  const patch = {
    shipper_name: clean(source.shipper_name, 240),
    legal_name: clean(source.legal_name, 240),
    domain: clean(source.domain, 240)?.toLowerCase() || null,
    website: cleanHttps(source.website),
    relationship_stage: relationshipStage && RELATIONSHIP_STAGES.has(relationshipStage) ? relationshipStage : null,
    account_owner_email: clean(source.account_owner_email, 240)?.toLowerCase() || null,
    next_action: clean(source.next_action, 500),
    notes: clean(source.notes, 1500),
    external_source_id: clean(source.external_source_id, 180),
    source_campaign: clean(source.source_campaign, 180),
    intelligence_summary: clean(source.intelligence_summary, 2000),
    primary_contact_ref: clean(source.primary_contact_ref, 300),
    demand_radar_provenance: cleanProvenance(source.demand_radar_provenance),
  };
  return {
    patch: Object.fromEntries(Object.entries(patch).filter(([, item]) => item !== null && item !== "")),
    issues: [
      ...prohibited.map((field) => `contact_field_not_allowed:${field}`),
      ...(relationshipStage && !RELATIONSHIP_STAGES.has(relationshipStage) ? ["relationship_stage_invalid"] : []),
    ],
  };
}

export function safeDemandRadarShipperProjection(value) {
  const source = plainObject(value);
  const city = clean(source.headquarters_city, 120);
  const state = clean(source.headquarters_state, 120);
  const country = clean(source.headquarters_country, 120);
  return {
    ratewareShipperId: clean(source.id, 80),
    shipperName: clean(source.shipper_name, 240),
    legalName: clean(source.legal_name, 240),
    domain: clean(source.domain, 240)?.toLowerCase() || null,
    industry: clean(source.industry, 240),
    status: clean(source.status, 40),
    relationshipStage: clean(source.relationship_stage, 40),
    accountOwner: clean(source.account_owner_email, 240),
    primaryContactName: clean(source.primary_contact_name, 240),
    locality: [city, state, country].filter(Boolean).join(", "),
    source: "rateware",
    sourceRevision: clean(source.updated_at, 80),
    createdAt: clean(source.created_at, 80),
    updatedAt: clean(source.updated_at, 80),
    externalSource: clean(source.external_source, 100),
    externalSourceId: clean(source.external_source_id, 180),
  };
}

export function demandRadarGatewayCursor(value) {
  const offset = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(offset) && offset >= 0 ? offset : 0;
}

export function stableGatewayPayload(value) {
  if (Array.isArray(value)) return value.map(stableGatewayPayload);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableGatewayPayload(value[key])]));
}
