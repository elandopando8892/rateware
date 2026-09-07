/**
 * Confirmed shipment event ledger and Service Desk read projection.
 * Development is approved; migration and deployment remain separate gates.
 */

const CONTRACT_VERSION = "1.3.0";
const EDGE_SOURCE = "supabase/functions/shipment-context-api/index.ts";
const MIGRATION_SOURCE = "supabase/migrations/20260907030000_shipment_creation_event_ledger.sql";
const EDGE_SOURCE_FINGERPRINT = "977ab19f4bad620df7dad83d4034756a38a51544fa4c0fd7d8ded71358613b74";
const EDGE_AUTHORIZATION_FINGERPRINT = "7ffe19ac91028748899c2f0302db474831d934901ff96851a55059ec8ead8377";
const EDGE_DEPENDENCIES = [
  "supabase/functions/_shared/auth.ts",
  "supabase/functions/_shared/identity-contract.mjs",
  "supabase/functions/_shared/runtime-identity.ts",
  "supabase/functions/_shared/workspace.ts",
  "supabase/functions/shipment-context-api/handler.ts",
  EDGE_SOURCE
];

const edgeSurfaces = ["get_shipment_creation_event", "search_shipment_creation_events"].map(actionName => ({
  contractVersion: CONTRACT_VERSION,
  canonicalId: `edge.shipment-context-api.${actionName}`,
  actionName,
  sourceKind: "edge-selector",
  sourceFile: EDGE_SOURCE,
  handler: "delegate",
  endpoint: "POST /functions/v1/shipment-context-api body.action",
  businessModule: "Operations handoff",
  operation: "read",
  resource: "shipment-creation-events",
  access: "read",
  exposure: "external-tokenized",
  sensitivity: "medium",
  tenantRelevance: "tenant-scoped",
  proposedPermissionKey: "shipment.context.read",
  functionalOwner: "Operations",
  decisionStatus: "pending_human_approval",
  lifecycle: "active",
  replacementAction: null,
  sourceFingerprint: EDGE_SOURCE_FINGERPRINT,
  notes: "Confirmed shipment.created projection only; exact Service Desk origin, current Rateware identity and no writes.",
  analysisCoverage: "shared-observed",
  dependencyFiles: EDGE_DEPENDENCIES,
  rpcSignature: null,
  coverageSignals: ["shared_dependency_observed", "external_dependency"]
}));

const rpcDefinitions = [
  {
    canonicalId: "rpc.public.rateware_get_shipment_creation_event(text,uuid)",
    actionName: "public.rateware_get_shipment_creation_event",
    handler: "public.rateware_get_shipment_creation_event(text,uuid)",
    operation: "read", access: "read", sensitivity: "medium",
    permission: "internal.rpc.rateware_get_shipment_creation_event",
    sourceFingerprint: "7f91a3077920b97f681edb69ec0049a698f55d8f6fe38a0a0190f0613b999df6",
    signature: "text,uuid"
  },
  {
    canonicalId: "rpc.public.rateware_register_shipment_created(text,text,text,text,uuid,uuid,text,integer,text,boolean,timestamptz,text,text,text,text)",
    actionName: "public.rateware_register_shipment_created",
    handler: "public.rateware_register_shipment_created(text,text,text,text,uuid,uuid,text,integer,text,boolean,timestamptz,text,text,text,text)",
    operation: "execute", access: "write", sensitivity: "high",
    permission: "internal.rpc.rateware_register_shipment_created",
    sourceFingerprint: "67cd7bc9d9d0c0bd167238b288ee120b3bffd428bb75c107a4680cc7d0ab5405",
    signature: "text,text,text,text,uuid,uuid,text,integer,text,boolean,timestamptz,text,text,text,text"
  },
  {
    canonicalId: "rpc.public.rateware_search_shipment_creation_events(text,text,timestamptz,uuid,integer)",
    actionName: "public.rateware_search_shipment_creation_events",
    handler: "public.rateware_search_shipment_creation_events(text,text,timestamptz,uuid,integer)",
    operation: "read", access: "read", sensitivity: "medium",
    permission: "internal.rpc.rateware_search_shipment_creation_events",
    sourceFingerprint: "1eba95fa650dfa1581697ab89b6331087d1c645d9718aa2a89aaa07190b7085b",
    signature: "text,text,timestamptz,uuid,integer"
  }
];

const rpcSurfaces = rpcDefinitions.map(definition => ({
  contractVersion: CONTRACT_VERSION,
  canonicalId: definition.canonicalId,
  actionName: definition.actionName,
  sourceKind: "postgres-function",
  sourceFile: MIGRATION_SOURCE,
  handler: definition.handler,
  endpoint: `PostgreSQL function / PostgREST RPC surface ${definition.handler}`,
  businessModule: "Operations handoff",
  operation: definition.operation,
  resource: "shipment-creation-events",
  access: definition.access,
  exposure: "internal/service-role",
  sensitivity: definition.sensitivity,
  tenantRelevance: "tenant-scoped",
  proposedPermissionKey: definition.permission,
  functionalOwner: "Operations",
  decisionStatus: "internal_only",
  lifecycle: "active",
  replacementAction: null,
  sourceFingerprint: definition.sourceFingerprint,
  notes: definition.access === "write"
    ? "Idempotent append-only registration of confirmed executed receipts; not browser accessible."
    : "Organization-scoped safe projection used only by the authenticated context gateway.",
  analysisCoverage: "direct",
  dependencyFiles: [MIGRATION_SOURCE],
  rpcSignature: definition.signature,
  coverageSignals: ["direct"]
}));

const surfaces = [...edgeSurfaces, ...rpcSurfaces];

export const SHIPMENT_CONTEXT_ACTION_CONTRACT_EXTENSION = {
  contractVersion: CONTRACT_VERSION,
  expectedCountsDelta: { governable: 5, edge: 2, postgres: 3, ratewareApi: 0 },
  reviewedMetadataFingerprints: {
    "edge.shipment-context-api.get_shipment_creation_event": "948bc5f912eb64098201dca5c18cfd2f3cbff3b8edb9518803ea57f64fa95480",
    "edge.shipment-context-api.search_shipment_creation_events": "736d9ad3a05e13bb9e333ef53201fab81ea7bc4e8fc3923cbbc22d1741eae6b8",
    "rpc.public.rateware_get_shipment_creation_event(text,uuid)": "b4ea9299d4a2be091493867783615cad89b059fd771f2d419e970693df7b9dae",
    "rpc.public.rateware_register_shipment_created(text,text,text,text,uuid,uuid,text,integer,text,boolean,timestamptz,text,text,text,text)": "3ae83f73c0060bff64457d2346fff099e3ac8fad6abecd57126c55cf1802825f",
    "rpc.public.rateware_search_shipment_creation_events(text,text,timestamptz,uuid,integer)": "8137e0fac0699eaa1c531376603dbf2facbc865464a62abcb69f749a737ee434"
  },
  reviewedAuthorizationFingerprints: Object.fromEntries(surfaces.map(entry => [entry.canonicalId,
    entry.sourceKind === "edge-selector" ? EDGE_AUTHORIZATION_FINGERPRINT : entry.sourceFingerprint])),
  surfaces
};
