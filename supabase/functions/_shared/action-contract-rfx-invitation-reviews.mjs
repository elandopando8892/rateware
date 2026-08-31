/**
 * RFx Invitation Review extension to the governed backend action contract.
 * Decisions are explicit and fingerprints are committed, never discovered at runtime.
 */

const CONTRACT_VERSION = "1.3.0";
const SOURCE_FILE = "supabase/functions/rateware-api/index.ts";
const AUTHORIZATION_FINGERPRINT = "057fe2d9bf90410209d1bc1b7152776412433ada9fa5fd69b884cf2378044c8b";
const DEPENDENCY_FILES = [
  "supabase/functions/_shared/identity-contract.mjs",
  "supabase/functions/_shared/kinde.ts",
  "supabase/functions/_shared/runtime-identity.ts",
  "supabase/functions/_shared/workspace.ts",
  "supabase/functions/rateware-api/carrier-list-templates.ts",
  "supabase/functions/rateware-api/growth.ts",
  SOURCE_FILE
];

const DEFINITIONS = [
  ["list_rfx_invitation_wave_reviews", "read", "read", "rfx.invitation_review.read", "20405a3d1d2b66ea6b41c8ff4c3a178197fbb12198292af2276e06493ed0b0b7"],
  ["record_rfx_invitation_wave_review", "manage", "write", "rfx.invitation_review.manage", "71e03078aea49cfe66e53283591cb6cddc93ae30364b3c70adf1dbc77691db66"]
];

const surfaces = DEFINITIONS.map(([actionName, operation, access, proposedPermissionKey, sourceFingerprint]) => ({
  contractVersion: CONTRACT_VERSION,
  canonicalId: `edge.rateware-api.${actionName}`,
  actionName,
  sourceKind: "edge-selector",
  sourceFile: SOURCE_FILE,
  handler: "inline",
  endpoint: "POST /functions/v1/rateware-api body.action",
  businessModule: "Procurement",
  operation,
  resource: "rfx-invitation-reviews",
  access,
  exposure: "human",
  sensitivity: access === "write" ? "high" : "medium-high",
  tenantRelevance: "tenant-scoped",
  proposedPermissionKey,
  functionalOwner: "Procurement",
  decisionStatus: "pending_human_approval",
  lifecycle: "active",
  replacementAction: null,
  sourceFingerprint,
  notes: "RFx-scoped carrier review evidence. Permission and final ownership remain PENDING HUMAN APPROVAL.",
  analysisCoverage: "shared-observed",
  dependencyFiles: DEPENDENCY_FILES,
  rpcSignature: null,
  coverageSignals: ["shared_dependency_observed", "external_dependency"]
}));

export const RFX_INVITATION_REVIEW_ACTION_CONTRACT_EXTENSION = {
  contractVersion: CONTRACT_VERSION,
  expectedCountsDelta: { governable: 2, edge: 2, postgres: 0, ratewareApi: 2 },
  reviewedMetadataFingerprints: {
    "edge.rateware-api.list_rfx_invitation_wave_reviews": "3d73496ef0c5bd28f20fd388bf8d5f19764ad0b4710a2d5e32271890d0f5da77",
    "edge.rateware-api.record_rfx_invitation_wave_review": "8c89adb58405556cd7fb95d56ddd802f13cd6e87d8d856e0e251931760d575b5"
  },
  reviewedAuthorizationFingerprints: Object.fromEntries(surfaces.map((entry) => [entry.canonicalId, AUTHORIZATION_FINGERPRINT])),
  surfaces
};
