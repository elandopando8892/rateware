/**
 * MARKSMAN Loads private Bid Room connector extension.
 * Both actions are service-to-service only and remain disabled at runtime until
 * separately authorized feature flags and secrets are provisioned.
 */

const CONTRACT_VERSION = "1.3.0";
const SOURCE_FILE = "supabase/functions/rfx-internal-bid-api/index.ts";
const AUTHORIZATION_FINGERPRINT = "fe622453a3b00ba77d35ee8014e1a8180726418aae7489ace3bf30c57754c2d1";
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
    sourceFingerprint: "7291b807185b5655915eaf9a0275702fdce8b2b441902238f63964f25a15c84c",
    notes: "HMAC-authenticated delegation to canonical submit_bid with durable idempotency. Runtime live flag defaults disabled and a signed human confirmation is required.",
    analysisCoverage: "shared-observed",
    dependencyFiles: DEPENDENCY_FILES,
    rpcSignature: null,
    coverageSignals: ["shared_dependency_observed", "external_dependency"],
  },
];

export const MARKSMAN_LOADS_PRIVATE_BID_ACTION_CONTRACT_EXTENSION = {
  contractVersion: CONTRACT_VERSION,
  expectedCountsDelta: { governable: 2, edge: 2, postgres: 0, ratewareApi: 0 },
  reviewedMetadataFingerprints: {
    "edge.rfx-internal-bid-api.resolve_and_submit_bid_canary": "183380df1eeeba0e801bf726b0915f36483f10c612a824f616d47d2ad4b8dd21",
    "edge.rfx-internal-bid-api.resolve_and_submit_bid": "d02e88e27370e26055dd0c7f366e3ac0a660b9c546dcb6fd75a2da1fd9cf4694",
  },
  reviewedAuthorizationFingerprints: Object.fromEntries(
    surfaces.map((entry) => [entry.canonicalId, AUTHORIZATION_FINGERPRINT]),
  ),
  surfaces,
};
