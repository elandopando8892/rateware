/**
 * P7 Carrier Provider Service advisory adapter (read-only, nonblocking).
 *
 * Never read this adapter in RFQ shortlist, bid, award, contact authorization or
 * shipment execution. It is an optional, separately requested UI enrichment.
 * A relationship or a few uploaded documents do NOT prove legal compliance.
 */
import {
  normalizeVerifiedIdentity,
  normalizeVerifiedKindeIdentity,
  resolveCanonicalTenant,
} from "../_shared/identity-contract.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const CARRIER_PROVIDER_ADVISORY_STATUSES = Object.freeze([
  "NOT_ASSESSED", "PENDING", "VALID", "OBSERVED", "EXPIRED", "REJECTED", "UNAVAILABLE",
]);

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function normalize(value) {
  return (text(value) || "").toLowerCase();
}
function uuid(value) {
  const v = normalize(value);
  return UUID.test(v) ? v : null;
}
function advisory(vendorId, status, reason, detail = {}) {
  return Object.freeze({
    vendor_id: vendorId,
    status,
    blocking: false,
    advisory_only: true,
    prevents_rfq: false,
    prevents_award: false,
    authorizes_transport: false,
    authorizes_contact: false,
    reason,
    ...detail,
  });
}

/**
 * Limit even privileged service-role reads by exact tenant / vendor / legal entity.
 * Read only .select() queries; no writes, HTTP calls or outbound side effects.
 */
async function rows(client, table, fields, conditions, limit = 3) {
  let query = client.from(table).select(fields);
  for (const [field, value] of conditions) query = query.eq(field, value);
  const result = await query.limit(limit);
  if (result?.error) throw new Error("PROVIDER_ADVISORY_QUERY_UNAVAILABLE");
  if (!Array.isArray(result?.data)) throw new Error("PROVIDER_ADVISORY_DATA_INVALID");
  return result.data;
}

/**
 * The provider's UUID tenant ID must come from an already verified canonical
 * identity. Never cast the Rateware/Kinde text organization_id into a UUID or
 * infer a tenant from a carrier's email, name, or arbitrary vendor input.
 */
async function canonicalTenant(client, verifiedClaims, workspace, resolver) {
  const claimsIdentity = normalize(verifiedClaims?.auth_provider) === "supabase"
    ? normalizeVerifiedIdentity(verifiedClaims)
    : normalizeVerifiedKindeIdentity(verifiedClaims);
  const externalOrganizationId = normalize(workspace?.organization_id);
  if (!externalOrganizationId || claimsIdentity.externalOrganizationId !== externalOrganizationId) {
    throw new Error("TENANT_IDENTITY_MISMATCH");
  }
  const canonicalFromVerifiedRuntime = uuid(workspace?.canonical_tenant_id);
  const enforcementMode = normalize(workspace?.tenant_enforcement_mode);
  if (canonicalFromVerifiedRuntime && ["required", "shadow"].includes(enforcementMode)) {
    return { canonicalTenantId: canonicalFromVerifiedRuntime, externalOrganizationId };
  }
  if (normalize(verifiedClaims?.auth_provider) !== "supabase") {
    throw new Error("CANONICAL_IDENTITY_UNAVAILABLE");
  }
  const resolved = await resolver(client, verifiedClaims);
  if (normalize(resolved?.externalOrganizationId) !== externalOrganizationId ||
      !uuid(resolved?.canonicalTenantId)) throw new Error("CANONICAL_IDENTITY_MISMATCH");
  return { canonicalTenantId: uuid(resolved.canonicalTenantId), externalOrganizationId };
}

export function summarizeProviderRelationship(relationship, documents = [], today = new Date().toISOString().slice(0, 10)) {
  const lifecycle = normalize(relationship?.lifecycle_status);
  const activation = normalize(relationship?.activation_status);
  const expiredDocuments = documents.filter(doc => {
    const expiry = text(doc?.expiration_date);
    return Boolean(expiry && /^\d{4}-\d{2}-\d{2}$/.test(expiry) && expiry < today);
  });
  const reviewedProblem = documents.some(doc =>
    ["rejected", "declined", "changes_required", "needs_correction", "observed"].includes(normalize(doc?.latest_review_decision)));
  const rejected = ["rejected", "declined", "terminated"].includes(lifecycle);
  const observed = ["suspended", "observed", "blocked"].includes(lifecycle) ||
    ["suspended", "rejected", "observed"].includes(activation) || reviewedProblem;
  const status = rejected ? "REJECTED" : expiredDocuments.length ? "EXPIRED"
    : observed ? "OBSERVED" : "PENDING";
  // Deliberately never assert VALID from a provider relationship and
  // a subset of documents; there is no complete compliance-policy verdict.
  return {
    status,
    document_count: documents.length,
    expired_document_count: expiredDocuments.length,
    relationship_lifecycle_status: lifecycle || null,
    activation_status: activation || null,
    assessment_complete: false,
  };
}

/**
 * This method intentionally catches tenant-resolution and source errors:
 * Provider Service is advisory only and must never abort Bidware workflows.
 * The caller must pass claims verified by the existing Rateware authenticator.
 */
/**
 * @param {{
 *   client?: any,
 *   verifiedClaims?: Record<string, unknown>,
 *   workspace?: Record<string, unknown>,
 *   vendorId?: unknown,
 *   legalEntityId?: string | null,
 *   enabled?: boolean,
 *   resolveTenant?: (client: any, verifiedClaims: any) => Promise<any>,
 *   today?: string
 * }} options
 */
export async function readCarrierProviderAdvisory({
  client,
  verifiedClaims,
  workspace,
  vendorId,
  legalEntityId = null,
  enabled = false,
  resolveTenant = resolveCanonicalTenant,
  today = new Date().toISOString().slice(0, 10),
} = {}) {
  const selectedVendorId = uuid(vendorId);
  if (!selectedVendorId) return advisory(null, "NOT_ASSESSED", "VENDOR_ID_REQUIRED");
  if (enabled !== true) return advisory(selectedVendorId, "NOT_ASSESSED", "FEATURE_DISABLED");
  if (legalEntityId !== null && !uuid(legalEntityId)) {
    return advisory(selectedVendorId, "UNAVAILABLE", "LEGAL_ENTITY_INVALID");
  }
  try {
    if (!client || typeof client.from !== "function") {
      return advisory(selectedVendorId, "UNAVAILABLE", "SOURCE_UNAVAILABLE");
    }
    const tenant = await canonicalTenant(client, verifiedClaims, workspace, resolveTenant);
    const vendors = await rows(client, "vendors", "id,organization_id",
      [["id", selectedVendorId], ["organization_id", tenant.externalOrganizationId]], 2);
    if (vendors.length !== 1) {
      return advisory(selectedVendorId, "NOT_ASSESSED", "VENDOR_NOT_IN_CANONICAL_WORKSPACE");
    }
    const conditions = [
      ["organization_id", tenant.canonicalTenantId],
      ["vendor_id", selectedVendorId],
    ];
    if (legalEntityId) conditions.push(["legal_entity_id", uuid(legalEntityId)]);
    const relationships = await rows(client, "provider_relationships",
      "id,organization_id,vendor_id,legal_entity_id,lifecycle_status,activation_status", conditions, 3);
    if (!relationships.length) return advisory(selectedVendorId, "NOT_ASSESSED", "NO_PROVIDER_RELATIONSHIP");
    if (relationships.length !== 1) {
      return advisory(selectedVendorId, "UNAVAILABLE", "AMBIGUOUS_LEGAL_ENTITY");
    }
    const relationship = relationships[0];
    if (!uuid(relationship.id) || !uuid(relationship.legal_entity_id) ||
        uuid(relationship.organization_id) !== tenant.canonicalTenantId ||
        uuid(relationship.vendor_id) !== selectedVendorId) {
      return advisory(selectedVendorId, "UNAVAILABLE", "RELATIONSHIP_SCOPE_MISMATCH");
    }
    const docs = await rows(client, "provider_current_document_versions",
      "document_version_id,document_type,expiration_date,latest_review_decision,effective_state",
      [["organization_id", tenant.canonicalTenantId],
       ["provider_relationship_id", uuid(relationship.id)],
       ["legal_entity_id", uuid(relationship.legal_entity_id)]], 101);
    if (docs.length > 100) {
      return advisory(selectedVendorId, "UNAVAILABLE", "TOO_MANY_DOCUMENTS_FOR_ADVISORY");
    }
    const summary = summarizeProviderRelationship(relationship, docs, today);
    return advisory(selectedVendorId, summary.status, "ADVISORY_EVIDENCE",
      { legal_entity_id: uuid(relationship.legal_entity_id), ...summary });
  } catch {
    return advisory(selectedVendorId, "UNAVAILABLE", "TENANT_OR_SOURCE_UNAVAILABLE");
  }
}
