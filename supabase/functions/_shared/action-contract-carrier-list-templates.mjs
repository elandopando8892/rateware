/**
 * Carrier List Templates extension to the Phase 0 backend action contract.
 * Static reviewed decisions; fingerprints are deliberately committed, never discovered at runtime.
 */

const CONTRACT_VERSION = "1.3.0";
const RATEWARE_API_SOURCE = "supabase/functions/rateware-api/index.ts";
const RATEWARE_API_AUTHORIZATION_FINGERPRINT = "23ad51228f3cc24759f313a2d8a5210f6b677e5cd4ef99a73fd4adb8d790d963";
const RATEWARE_API_DEPENDENCIES = [
  "supabase/functions/_shared/identity-contract.mjs",
  "supabase/functions/_shared/kinde.ts",
  "supabase/functions/_shared/runtime-identity.ts",
  "supabase/functions/_shared/workspace.ts",
  "supabase/functions/rateware-api/carrier-list-templates.ts",
  "supabase/functions/rateware-api/growth.ts",
  RATEWARE_API_SOURCE
];

const EDGE_DEFINITIONS = [
  ["archive_carrier_list_template", "manage", "write", "vendors.manage"],
  ["create_carrier_list_template", "manage", "write", "vendors.manage"],
  ["duplicate_carrier_list_template", "manage", "write", "vendors.manage"],
  ["get_carrier_list_template", "read", "read", "vendors.read"],
  ["list_carrier_list_templates", "read", "read", "vendors.read"],
  ["resolve_carrier_list_template_rows", "read", "read", "vendors.read"],
  ["restore_carrier_list_template", "manage", "write", "vendors.manage"],
  ["update_carrier_list_template", "manage", "write", "vendors.manage"]
];

const RPC_DEFINITIONS = [
  [
    "rpc.public.rateware_duplicate_carrier_list_template(text,uuid,bigint,text,text,text,text,text)",
    "public.rateware_duplicate_carrier_list_template",
    "text,uuid,bigint,text,text,text,text,text",
    "0d6fa048cc17af313ef259c011273ffc6d8d5d73fb18b3c4a0201489e07bdc0f",
    "execute",
    "write",
    "carrier-list-templates",
    "tenant-scoped"
  ],
  [
    "rpc.public.rateware_validate_participant_template_membership()",
    "public.rateware_validate_participant_template_membership",
    "",
    "3a4fe3dcdec856eac91197eb476e5db183c2bf5f2874b0215ce25b127bd2c709",
    "execute",
    "write",
    "carrier-list-template-membership",
    "record-derived"
  ],
  [
    "rpc.public.search_workspace_vendors_keyset(text,text,text,timestamptz,uuid,integer)",
    "public.search_workspace_vendors_keyset",
    "text,text,text,timestamptz,uuid,integer",
    "c90d13dab1767091076b47f54c8630b3a6ad8ca4cea42f0324a0d4a0f14c9a64",
    "read",
    "read",
    "vendors",
    "tenant-scoped"
  ]
];

function edgeSurface([actionName, operation, access, proposedPermissionKey]) {
  return {
    contractVersion: CONTRACT_VERSION,
    canonicalId: `edge.rateware-api.${actionName}`,
    actionName,
    sourceKind: "edge-selector",
    sourceFile: RATEWARE_API_SOURCE,
    handler: "carrierTemplateApiResponse",
    endpoint: "POST /functions/v1/rateware-api body.action",
    businessModule: "Procurement",
    operation,
    resource: "vendors",
    access,
    exposure: "human",
    sensitivity: access === "write" ? "medium-high" : "medium",
    tenantRelevance: "tenant-scoped",
    proposedPermissionKey,
    functionalOwner: "Procurement",
    decisionStatus: "pending_human_approval",
    lifecycle: "active",
    replacementAction: null,
    sourceFingerprint: "fa8d53798bcfe9f013a25599dc3374cd0d2e08f9e379b452a8971fa7034a800e",
    notes: "Carrier CRM and Carrier Fit template action. Permission and final ownership remain PENDING HUMAN APPROVAL.",
    analysisCoverage: "shared-observed",
    dependencyFiles: RATEWARE_API_DEPENDENCIES,
    rpcSignature: null,
    coverageSignals: ["shared_dependency_observed", "external_dependency"]
  };
}

function rpcSurface([canonicalId, actionName, rpcSignature, sourceFingerprint, operation, access, resource, tenantRelevance]) {
  const handler = `${actionName}(${rpcSignature})`;
  return {
    contractVersion: CONTRACT_VERSION,
    canonicalId,
    actionName,
    sourceKind: "postgres-function",
    sourceFile: "supabase/migrations/20260825160000_carrier_list_templates.sql",
    handler,
    endpoint: `PostgreSQL function / PostgREST RPC surface ${handler}`,
    businessModule: "Procurement",
    operation,
    resource,
    access,
    exposure: "internal/service-role",
    sensitivity: "high",
    tenantRelevance,
    proposedPermissionKey: `internal.rpc.${actionName.replace(/^public\./, "")}`,
    functionalOwner: "Procurement",
    decisionStatus: "internal_only",
    lifecycle: "active",
    replacementAction: null,
    sourceFingerprint,
    notes: actionName === "public.rateware_validate_participant_template_membership"
      ? "Trigger-only membership invariant; not a user action."
      : "Service-role-only Carrier List Templates helper; direct browser execution revoked.",
    analysisCoverage: "direct",
    dependencyFiles: ["supabase/migrations/20260825160000_carrier_list_templates.sql"],
    rpcSignature,
    coverageSignals: ["direct"]
  };
}

const SURFACES = [...EDGE_DEFINITIONS.map(edgeSurface), ...RPC_DEFINITIONS.map(rpcSurface)];

export const CARRIER_LIST_TEMPLATE_ACTION_CONTRACT_EXTENSION = {
  contractVersion: CONTRACT_VERSION,
  expectedCountsDelta: { governable: 11, edge: 8, postgres: 3, ratewareApi: 8 },
  reviewedMetadataFingerprints: {
    "edge.rateware-api.archive_carrier_list_template": "3927c626bc13413c33089e817a2c0002e6edc6ab9189588a8bbf8e50eac968d8",
    "edge.rateware-api.create_carrier_list_template": "6198a09f92189b3ec09cacf14c723ada8a52be4572cfdd527f3031cf8f5ba5e0",
    "edge.rateware-api.duplicate_carrier_list_template": "35be7844f3897debfc4d50084c6f431e62a261ff5a8cea1ac52df26b8a7f76c8",
    "edge.rateware-api.get_carrier_list_template": "f6092e5415db342f05a24cc0241e249c6731500e818d9efb6a2deda60c5c062a",
    "edge.rateware-api.list_carrier_list_templates": "e830b5810029c52000f1793b5e6633991977c7d7152a7085898c74d4d45c9921",
    "edge.rateware-api.resolve_carrier_list_template_rows": "36e1c89733bb51627ab5a3b4de99cd407f140b45c6b488803f0ae49fb89a657e",
    "edge.rateware-api.restore_carrier_list_template": "acc36afa759296ebb0cb907073a4f5d774ace693965fc13319d3c881407d7703",
    "edge.rateware-api.update_carrier_list_template": "cacf9cc50b5f6c04a58826f938b38141ceb83ddff9c4bb7c42cf2ccb1966e06c",
    "rpc.public.rateware_duplicate_carrier_list_template(text,uuid,bigint,text,text,text,text,text)": "a15ae0165b0534c2ed7347c6b510512301fe93db35cead685ab7fa40ee92d6b2",
    "rpc.public.rateware_validate_participant_template_membership()": "aaee75134773e105a6dd649129448fb27c694f14430a39e5e95d96d22604d399",
    "rpc.public.search_workspace_vendors_keyset(text,text,text,timestamptz,uuid,integer)": "8c245a3ee69e880abe8b33d8e6021bbff96d78edc286ef509da7bb28d638f747"
  },
  reviewedAuthorizationFingerprints: Object.fromEntries(SURFACES.map((entry) => [
    entry.canonicalId,
    entry.canonicalId.startsWith("edge.") ? RATEWARE_API_AUTHORIZATION_FINGERPRINT : entry.sourceFingerprint
  ])),
  surfaces: SURFACES
};
