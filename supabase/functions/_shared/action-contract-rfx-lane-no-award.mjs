/**
 * RFx lane void ("desierto") extension to the governed backend action contract.
 * Decisions are explicit and fingerprints are committed, never discovered at runtime.
 */

const CONTRACT_VERSION = "1.3.0";
const SOURCE_FILE = "supabase/functions/rateware-api/index.ts";
const AUTHORIZATION_FINGERPRINT = "983dcea9e9a5c138fa06f6307e4211aea9e753a2181ac83acc05f259731070c6";
const DEPENDENCY_FILES = [
  "supabase/functions/_shared/auth.ts",
  "supabase/functions/_shared/bid-room-google-chat.ts",
  "supabase/functions/_shared/identity-contract.mjs",
  "supabase/functions/_shared/kinde.ts",
  "supabase/functions/_shared/runtime-identity.ts",
  "supabase/functions/_shared/source-download-routing.mjs",
  "supabase/functions/_shared/team-roles.ts",
  "supabase/functions/_shared/workspace.ts",
  "supabase/functions/rateware-api/carrier-list-templates.ts",
  "supabase/functions/rateware-api/growth.ts",
  SOURCE_FILE,
  "supabase/functions/rateware-api/outreach-pagination.js"
];

const surface = {
  contractVersion: CONTRACT_VERSION,
  canonicalId: "edge.rateware-api.set_rfx_lane_no_award",
  actionName: "set_rfx_lane_no_award",
  sourceKind: "edge-selector",
  sourceFile: SOURCE_FILE,
  handler: "inline",
  endpoint: "POST /functions/v1/rateware-api body.action",
  businessModule: "Procurement",
  operation: "approve",
  resource: "rfx",
  access: "write",
  exposure: "human",
  sensitivity: "high",
  tenantRelevance: "tenant-scoped",
  proposedPermissionKey: "rfx.approve",
  functionalOwner: "Procurement",
  decisionStatus: "pending_human_approval",
  lifecycle: "active",
  replacementAction: null,
  sourceFingerprint: "de2c6833d97392b9c1d3f9f579891ceebe1ba49f8befef18a9ee92709a656a1b",
  notes: "Declares RFx lanes void (closed without an award) or reopens them, so the event closes with every lane decided. Refuses lanes that carry a primary or a backup and events already closed; records who decided and why, and the reason never reaches carriers. Administrador-only in the team roles (decided 2026-09-29). Permission and final ownership remain PENDING HUMAN APPROVAL.",
  analysisCoverage: "shared-observed",
  dependencyFiles: DEPENDENCY_FILES,
  rpcSignature: null,
  coverageSignals: ["shared_dependency_observed", "external_dependency"]
};

export const RFX_LANE_NO_AWARD_ACTION_CONTRACT_EXTENSION = {
  contractVersion: CONTRACT_VERSION,
  expectedCountsDelta: { governable: 1, edge: 1, postgres: 0, ratewareApi: 1 },
  reviewedMetadataFingerprints: {
    "edge.rateware-api.set_rfx_lane_no_award": "85eb3e235cd90ea569db50ad5a31a89bb5ae9fc71aa01d02835fc555599539b8"
  },
  reviewedAuthorizationFingerprints: { [surface.canonicalId]: AUTHORIZATION_FINGERPRINT },
  surfaces: [surface]
};
