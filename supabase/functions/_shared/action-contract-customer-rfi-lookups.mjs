/** Reviewed customer RFI lookups (supabase/functions/rfx-bid-api): the shipper's own form reads places and freight lists behind its link. Static reviewed fingerprints. */
const authorizationFingerprint = "3a4394c4405cf9c4f1a3b60d2ac653a09c2492fcb3b54bf89bffa834a9c47c4e";
const surfaces = [
  {
    "contractVersion": "1.3.0",
    "canonicalId": "edge.rfx-bid-api.customer_rfi_options",
    "actionName": "customer_rfi_options",
    "sourceKind": "edge-selector",
    "sourceFile": "supabase/functions/rfx-bid-api/index.ts",
    "handler": "customerRfiOptions",
    "endpoint": "POST /functions/v1/rfx-bid-api body.action",
    "businessModule": "Commercial",
    "operation": "read",
    "resource": "catalog",
    "access": "read",
    "exposure": "external-tokenized",
    "sensitivity": "low",
    "tenantRelevance": "record-derived",
    "proposedPermissionKey": "external.catalog.read",
    "functionalOwner": "Commercial",
    "decisionStatus": "explicitly_allowed",
    "lifecycle": "active",
    "replacementAction": null,
    "sourceFingerprint": "57df0aa83c927f9c66965832a031703a59b0a6dd116e0116552a11f0b8ee2d46",
    "notes": "Shipper form behind its customer RFI link (active, unexpired rfx_rfi_magic_links token). Read-only: the same equipment/trailer/config/operation/service catalog QuoteDesk uses (active values; other workspaces' manual items and the internal Backhaul service excluded) plus active border crossing names. Returns no shipper, carrier or rate data.",
    "analysisCoverage": "shared-observed",
    "dependencyFiles": [
      "supabase/functions/_shared/bid-room-google-chat.ts",
      "supabase/functions/_shared/kinde.ts",
      "supabase/functions/rfx-bid-api/index.ts"
    ],
    "rpcSignature": null,
    "coverageSignals": [
      "shared_dependency_observed",
      "external_dependency"
    ]
  },
  {
    "contractVersion": "1.3.0",
    "canonicalId": "edge.rfx-bid-api.customer_rfi_search_locations",
    "actionName": "customer_rfi_search_locations",
    "sourceKind": "edge-selector",
    "sourceFile": "supabase/functions/rfx-bid-api/index.ts",
    "handler": "customerRfiSearchLocations",
    "endpoint": "POST /functions/v1/rfx-bid-api body.action",
    "businessModule": "Commercial",
    "operation": "read",
    "resource": "catalog",
    "access": "read",
    "exposure": "external-tokenized",
    "sensitivity": "low",
    "tenantRelevance": "record-derived",
    "proposedPermissionKey": "external.catalog.read",
    "functionalOwner": "Commercial",
    "decisionStatus": "explicitly_allowed",
    "lifecycle": "active",
    "replacementAction": null,
    "sourceFingerprint": "57529f4b97410db5098f71a0bd0ed4c6b576f869e61fc6f12343c9749309a250",
    "notes": "Shipper form behind its customer RFI link (active, unexpired rfx_rfi_magic_links token). Read-only place search over the shared rateware_locations catalog (same query as search_staging_locations; search text stripped of filter syntax, at most 20 rows). Returns no shipper, carrier or rate data.",
    "analysisCoverage": "shared-observed",
    "dependencyFiles": [
      "supabase/functions/_shared/bid-room-google-chat.ts",
      "supabase/functions/_shared/kinde.ts",
      "supabase/functions/rfx-bid-api/index.ts"
    ],
    "rpcSignature": null,
    "coverageSignals": [
      "shared_dependency_observed",
      "external_dependency"
    ]
  }
];

export const CUSTOMER_RFI_LOOKUPS_ACTION_CONTRACT_EXTENSION = {
  expectedCountsDelta: { governable: 2, edge: 2, postgres: 0, ratewareApi: 0 },
  reviewedMetadataFingerprints: {"edge.rfx-bid-api.customer_rfi_options":"6efa6850abf5c920c8398885ed4bccdca78af33522cacfa1d9babc19d3f866e2","edge.rfx-bid-api.customer_rfi_search_locations":"5d70c41f8e6e3e0a7a725850f27d17d21bf1e4314c21c054cca37fced6e3ce7b"},
  reviewedAuthorizationFingerprints: Object.fromEntries(surfaces.map((entry) => [entry.canonicalId, authorizationFingerprint])),
  surfaces
};
