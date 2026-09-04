/**
 * Demand Radar Shipper CRM gateway extension to the current Rateware contract.
 * The gateway is read-only by default; its write surface remains pending human approval.
 */

const CONTRACT_VERSION = "1.3.0";
const EDGE_SOURCE = "supabase/functions/demand-radar-shipper-crm-gateway/index.ts";
const EDGE_AUTHORIZATION_FINGERPRINT = "e817f96ed28e5d82701d32a5c6687f791338dd59874302af9c651ed70d5d77b7";
const EDGE_DEPENDENCIES = [
  "supabase/functions/_shared/auth.ts",
  "supabase/functions/_shared/demand-radar-shipper-crm-contract.mjs",
  "supabase/functions/_shared/identity-contract.mjs",
  "supabase/functions/_shared/kinde.ts",
  "supabase/functions/_shared/runtime-identity.ts",
  "supabase/functions/_shared/workspace.ts",
  EDGE_SOURCE,
];

const EDGE_DEFINITIONS = [
  ["commit_change", "sha256", "manage", "write", "critical", "integration.demand-radar.shippers.manage", "34f04f58b2fa77a4901f801c7f592b2e448eb958f870e91e1e6cdd29b6e2fc98"],
  ["health", "inline", "read", "read", "low", "integration.demand-radar.shippers.read", "98cfa2846885f65189e8c9d99b89c0282d1b3d5ab34abae65b665d6f59ed07c3"],
  ["pull_accounts", "inline", "read", "read", "medium-high", "integration.demand-radar.shippers.read", "2f75b00cbbbdf9a3f84b31121ab428dd0f72ef1464a87dd1d0afd52fc09419a6"],
];

function edgeSurface([actionName, handler, operation, access, sensitivity, proposedPermissionKey, sourceFingerprint]) {
  return {
    contractVersion: CONTRACT_VERSION,
    canonicalId: `edge.demand-radar-shipper-crm-gateway.${actionName}`,
    actionName,
    sourceKind: "edge-selector",
    sourceFile: EDGE_SOURCE,
    handler,
    endpoint: "POST /functions/v1/demand-radar-shipper-crm-gateway body.action",
    businessModule: "Commercial",
    operation,
    resource: "shippers",
    access,
    exposure: "external-tokenized",
    sensitivity,
    tenantRelevance: "tenant-scoped",
    proposedPermissionKey,
    functionalOwner: "Commercial",
    decisionStatus: "pending_human_approval",
    lifecycle: "active",
    replacementAction: null,
    sourceFingerprint,
    notes: access === "write"
      ? "Write path is disabled by default and still requires an exact human confirmation, CAS, idempotency and a canonical Rateware receipt."
      : "Authenticated read-only Demand Radar gateway surface; production use remains explicitly controlled.",
    analysisCoverage: "shared-observed",
    dependencyFiles: EDGE_DEPENDENCIES,
    rpcSignature: null,
    coverageSignals: ["shared_dependency_observed", "external_dependency"],
  };
}

const rpcSurface = {
  contractVersion: CONTRACT_VERSION,
  canonicalId: "rpc.public.apply_demand_radar_shipper_crm_change(text,text,text,text,text,text,uuid,timestamptz,text,jsonb)",
  actionName: "public.apply_demand_radar_shipper_crm_change",
  sourceKind: "postgres-function",
  sourceFile: "supabase/migrations/20260902120000_demand_radar_shipper_crm_gateway.sql",
  handler: "public.apply_demand_radar_shipper_crm_change(text,text,text,text,text,text,uuid,timestamptz,text,jsonb)",
  endpoint: "PostgreSQL function / PostgREST RPC surface public.apply_demand_radar_shipper_crm_change(text,text,text,text,text,text,uuid,timestamptz,text,jsonb)",
  businessModule: "Commercial",
  operation: "manage",
  resource: "shippers",
  access: "write",
  exposure: "internal/service-role",
  sensitivity: "critical",
  tenantRelevance: "tenant-scoped",
  proposedPermissionKey: "internal.rpc.apply_demand_radar_shipper_crm_change",
  functionalOwner: "Commercial",
  decisionStatus: "internal_only",
  lifecycle: "active",
  replacementAction: null,
  sourceFingerprint: "c5b2cf2b46d731450f5bc7b65c3dfde0d41c68441ae7296778835d8074b50577",
  notes: "Service-role-only atomic Demand Radar change with CAS, idempotency and canonical acceptance receipt.",
  analysisCoverage: "direct",
  dependencyFiles: ["supabase/migrations/20260902120000_demand_radar_shipper_crm_gateway.sql"],
  rpcSignature: "text,text,text,text,text,text,uuid,timestamptz,text,jsonb",
  coverageSignals: ["direct"],
};

const SURFACES = [...EDGE_DEFINITIONS.map(edgeSurface), rpcSurface];

export const DEMAND_RADAR_GATEWAY_ACTION_CONTRACT_EXTENSION = {
  contractVersion: CONTRACT_VERSION,
  expectedCountsDelta: { governable: 4, edge: 3, postgres: 1, ratewareApi: 0 },
  reviewedMetadataFingerprints: {
    "edge.demand-radar-shipper-crm-gateway.commit_change": "2ccc6f9a8dae3d846a2a1c027b38762635ba78b4453874a63d6c5deefa01b027",
    "edge.demand-radar-shipper-crm-gateway.health": "a7a473dee99cdd7ac839b010c30c59f782f4b28c7d5b7297fcf289490913791c",
    "edge.demand-radar-shipper-crm-gateway.pull_accounts": "c5658ca2f13a08323d334c187007f414897717fb2d02af5fc588dc5ca727e78a",
    "rpc.public.apply_demand_radar_shipper_crm_change(text,text,text,text,text,text,uuid,timestamptz,text,jsonb)": "d78c0f594fd48c5cbe3a715c5bdc271d7de26272901e00e3ac4280b2d47b1688",
  },
  reviewedAuthorizationFingerprints: Object.fromEntries(SURFACES.map((entry) => [
    entry.canonicalId,
    entry.canonicalId.startsWith("edge.") ? EDGE_AUTHORIZATION_FINGERPRINT : entry.sourceFingerprint,
  ])),
  surfaces: SURFACES,
};
