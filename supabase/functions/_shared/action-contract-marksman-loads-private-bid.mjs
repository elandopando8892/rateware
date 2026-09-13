/**
 * MARKSMAN Loads private Bid Room connector extension.
 * Both actions are service-to-service only and remain disabled at runtime until
 * separately authorized feature flags and secrets are provisioned.
 */

const CONTRACT_VERSION = "1.3.0";
const SOURCE_FILE = "supabase/functions/rfx-internal-bid-api/index.ts";
const READBACK_SOURCE_FILE = "supabase/functions/rfx-internal-bid-read-api/index.ts";
const FIT_SOURCE_FILE = "supabase/functions/rfx-internal-fit-api/index.ts";
const AUTHORIZATION_FINGERPRINT = "524bb383d47d18285a5ebfeb66f98edaa5e8777d0fb586ff6a60e8b30914622c";
const DEPENDENCY_FILES = [
  "supabase/functions/_shared/marksman-loads-bid-contract.ts",
  "supabase/functions/_shared/rfx-invitation-token.ts",
  SOURCE_FILE,
];

const surfaces = [
  {
    contractVersion: CONTRACT_VERSION,
    canonicalId: "edge.rfx-internal-bid-api.resolve_and_submit_bid_canary",
    actionName: "resolve_and_submit_bid_canary",
    sourceKind: "edge-selector",
    sourceFile: SOURCE_FILE,
    handler: "handleCanaryRequest",
    endpoint: "POST /functions/v1/rfx-internal-bid-api body.action",
    businessModule: "Procurement",
    operation: "read",
    resource: "rfx-bids",
    access: "read",
    exposure: "external-tokenized",
    sensitivity: "high",
    tenantRelevance: "tenant-scoped",
    proposedPermissionKey: "internal.rfx.marksman_loads_bid.resolve",
    functionalOwner: "Procurement",
    decisionStatus: "pending_human_approval",
    lifecycle: "active",
    replacementAction: null,
    sourceFingerprint: "011933d7047082dc46a46c8373f49e2c155305d6e3ad85d2e5a4b6ef1883855b",
    notes: "HMAC-authenticated, read-only private invitation resolution. Runtime canary flag defaults disabled.",
    analysisCoverage: "shared-observed",
    dependencyFiles: DEPENDENCY_FILES,
    rpcSignature: null,
    coverageSignals: ["shared_dependency_observed", "external_dependency"],
  },
  {
    contractVersion: CONTRACT_VERSION,
    canonicalId: "edge.rfx-internal-bid-api.resolve_and_submit_bid",
    actionName: "resolve_and_submit_bid",
    sourceKind: "edge-selector",
    sourceFile: SOURCE_FILE,
    handler: "handleLiveRequest",
    endpoint: "POST /functions/v1/rfx-internal-bid-api body.action",
    businessModule: "Procurement",
    operation: "execute",
    resource: "rfx-bids",
    access: "write",
    exposure: "external-tokenized",
    sensitivity: "critical",
    tenantRelevance: "tenant-scoped",
    proposedPermissionKey: "internal.rfx.marksman_loads_bid.submit",
    functionalOwner: "Procurement",
    decisionStatus: "pending_human_approval",
    lifecycle: "active",
    replacementAction: null,
    sourceFingerprint: "07c954ca773642b8c837694b79efe478372034b5250e2d795bd178d815c5a50d",
    notes: "HMAC-authenticated delegation to canonical submit_bid with durable idempotency. Runtime live flag defaults disabled and a signed human confirmation is required.",
    analysisCoverage: "shared-observed",
    dependencyFiles: DEPENDENCY_FILES,
    rpcSignature: null,
    coverageSignals: ["shared_dependency_observed", "external_dependency"],
  },
  {
    contractVersion: CONTRACT_VERSION,
    canonicalId: "edge.rfx-internal-bid-read-api.read_operation_observation",
    actionName: "read_operation_observation",
    sourceKind: "edge-method",
    sourceFile: READBACK_SOURCE_FILE,
    handler: "Deno.serve",
    endpoint: "POST /functions/v1/rfx-internal-bid-read-api",
    businessModule: "Procurement",
    operation: "read",
    resource: "rfx-bid-operation-evidence",
    access: "read",
    exposure: "external-tokenized",
    sensitivity: "high",
    tenantRelevance: "tenant-scoped",
    proposedPermissionKey: "internal.rfx.marksman_loads_bid.readback",
    functionalOwner: "Procurement",
    decisionStatus: "pending_human_approval",
    lifecycle: "active",
    replacementAction: null,
    sourceFingerprint: "8e289da89f4701570fbe840faa771f34d23a24ad18eb09b567dab9defca787f9",
    notes: "HMAC-authenticated, read-only observation of operation receipts. Absence never authorizes a retry; runtime readback flag defaults disabled.",
    analysisCoverage: "shared-observed",
    dependencyFiles: [
      "supabase/functions/_shared/marksman-loads-bid-contract.ts",
      "supabase/functions/_shared/marksman-loads-fit-contract.ts",
      "supabase/functions/_shared/marksman-loads-readback-contract.ts",
      READBACK_SOURCE_FILE,
    ],
    rpcSignature: null,
    coverageSignals: ["shared_dependency_observed", "external_dependency"],
  },
  {
    contractVersion: CONTRACT_VERSION,
    canonicalId: "edge.rfx-internal-fit-api.resolve_and_save_fit",
    actionName: "resolve_and_save_fit",
    sourceKind: "edge-method",
    sourceFile: FIT_SOURCE_FILE,
    handler: "Deno.serve",
    endpoint: "POST /functions/v1/rfx-internal-fit-api",
    businessModule: "Procurement",
    operation: "execute",
    resource: "rfx-operational-fit",
    access: "write",
    exposure: "external-tokenized",
    sensitivity: "critical",
    tenantRelevance: "tenant-scoped",
    proposedPermissionKey: "internal.rfx.marksman_loads_fit.submit",
    functionalOwner: "Procurement",
    decisionStatus: "pending_human_approval",
    lifecycle: "active",
    replacementAction: null,
    sourceFingerprint: "592b76cd33917619e0c7effcad9432357c4fef25af79e62d3a7027ed074a8672",
    notes: "HMAC-authenticated delegation to canonical save_segment_confirmations with deterministic operation identity and independent readback. Runtime Fit flag defaults disabled.",
    analysisCoverage: "shared-observed",
    dependencyFiles: [
      "supabase/functions/_shared/marksman-loads-bid-contract.ts",
      "supabase/functions/_shared/marksman-loads-fit-contract.ts",
      "supabase/functions/_shared/rfx-invitation-token.ts",
      FIT_SOURCE_FILE,
    ],
    rpcSignature: null,
    coverageSignals: ["shared_dependency_observed", "external_dependency"],
  },
];

export const MARKSMAN_LOADS_PRIVATE_BID_ACTION_CONTRACT_EXTENSION = {
  contractVersion: CONTRACT_VERSION,
  expectedCountsDelta: { governable: 4, edge: 4, postgres: 0, ratewareApi: 0 },
  reviewedMetadataFingerprints: {
    "edge.rfx-internal-bid-api.resolve_and_submit_bid_canary": "183380df1eeeba0e801bf726b0915f36483f10c612a824f616d47d2ad4b8dd21",
    "edge.rfx-internal-bid-api.resolve_and_submit_bid": "d02e88e27370e26055dd0c7f366e3ac0a660b9c546dcb6fd75a2da1fd9cf4694",
    "edge.rfx-internal-bid-read-api.read_operation_observation": "f47f84fa9533f0526c77efddfcd089461df77c7705530c04ed0ad1f69162befa",
    "edge.rfx-internal-fit-api.resolve_and_save_fit": "49184cdb9854521f3698291adb67b903ef1932997e0b46dffd6fb6c8bb67daa2",
  },
  reviewedAuthorizationFingerprints: Object.fromEntries(
    surfaces.map((entry) => [entry.canonicalId,
      entry.canonicalId === "edge.rfx-internal-bid-read-api.read_operation_observation"
        ? "fbf7a8fc21cd987a1b57e24d73b0b157c317b777e613ea69f203dc9d15424620"
        : entry.canonicalId === "edge.rfx-internal-fit-api.resolve_and_save_fit"
          ? "5baaeb011098fb49b766eac614eedca962cad6d12b551bcf5f3b0c2ba220025e"
          : AUTHORIZATION_FINGERPRINT]),
  ),
  surfaces,
};
