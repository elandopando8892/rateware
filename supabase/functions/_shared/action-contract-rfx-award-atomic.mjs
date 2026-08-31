/**
 * Atomic RFx award RPC extension to the governed backend action contract.
 * Static reviewed decision; the function is service-role only.
 */

const SOURCE_FILE = "supabase/migrations/20260831022000_atomic_rfx_lane_vendor_award.sql";
const SOURCE_FINGERPRINT = "c4a68254363cb50ef2418838ae97f1e48c9619f68d2e353dc87d8bfabec97506";
const CANONICAL_ID = "rpc.public.rateware_award_rfx_lane_vendor(text,uuid,uuid,text,text,text,text)";

const surface = {
  contractVersion: "1.3.0",
  canonicalId: CANONICAL_ID,
  actionName: "public.rateware_award_rfx_lane_vendor",
  sourceKind: "postgres-function",
  sourceFile: SOURCE_FILE,
  handler: "public.rateware_award_rfx_lane_vendor(text,uuid,uuid,text,text,text,text)",
  endpoint: "PostgreSQL function / PostgREST RPC surface public.rateware_award_rfx_lane_vendor(text,uuid,uuid,text,text,text,text)",
  businessModule: "Procurement",
  operation: "execute",
  resource: "rfx-awards",
  access: "write",
  exposure: "internal/service-role",
  sensitivity: "high",
  tenantRelevance: "tenant-scoped",
  proposedPermissionKey: "internal.rpc.rateware_award_rfx_lane_vendor",
  functionalOwner: "Procurement",
  decisionStatus: "internal_only",
  lifecycle: "active",
  replacementAction: null,
  sourceFingerprint: SOURCE_FINGERPRINT,
  notes: "Service-role-only transactional helper for a human-approved carrier award; direct browser execution is revoked.",
  analysisCoverage: "direct",
  dependencyFiles: [SOURCE_FILE],
  rpcSignature: "text,uuid,uuid,text,text,text,text",
  coverageSignals: ["direct"]
};

export const RFX_ATOMIC_AWARD_ACTION_CONTRACT_EXTENSION = {
  contractVersion: "1.3.0",
  expectedCountsDelta: { governable: 1, edge: 0, postgres: 1, ratewareApi: 0 },
  reviewedMetadataFingerprints: {
    [CANONICAL_ID]: "2f66e12df094dd3816e9ec59e9aa4a9f73c320de68993d49de8e9af465ec8e89"
  },
  reviewedAuthorizationFingerprints: {
    [CANONICAL_ID]: SOURCE_FINGERPRINT
  },
  surfaces: [surface]
};
