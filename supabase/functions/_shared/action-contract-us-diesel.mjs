/** Reviewed weekly EIA diesel sync surface (supabase/functions/sync-us-diesel). Static reviewed fingerprints. */
const authorizationFingerprint = "f5dd888f40e8e6e8ea51916392c0a6f0b8c8282a43402084c26ecd921c5b0f35";
const surfaces = [{
  "contractVersion": "1.3.0",
  "canonicalId": "edge.sync-us-diesel.sync_us_diesel",
  "actionName": "sync_us_diesel",
  "sourceKind": "edge-method",
  "sourceFile": "supabase/functions/sync-us-diesel/index.ts",
  "handler": "Deno.serve",
  "endpoint": "POST /functions/v1/sync-us-diesel x-cron-secret",
  "businessModule": "Commercial",
  "operation": "execute",
  "resource": "fuel-reference",
  "access": "write",
  "exposure": "internal/service-role",
  "sensitivity": "medium",
  "tenantRelevance": "platform-scoped",
  "proposedPermissionKey": "service.fuel.sync",
  "functionalOwner": "Commercial",
  "decisionStatus": "internal_only",
  "lifecycle": "active",
  "replacementAction": null,
  "sourceFingerprint": "fabc6ee9c40d31894e09c8ade432be618307027c653b725927606c77540a1176",
  "notes": "Weekly pg_cron job with the shared SYNC_CRON_SECRET; reads EIA's public diesel RSS and writes rateware_fsc_trend / rateware_fuel_regions (platform reference data, no tenant rows).",
  "analysisCoverage": "shared-observed",
  "dependencyFiles": [
    "supabase/functions/_shared/kinde.ts",
    "supabase/functions/sync-us-diesel/diesel.mjs",
    "supabase/functions/sync-us-diesel/index.ts"
  ],
  "rpcSignature": null,
  "coverageSignals": [
    "shared_dependency_observed",
    "external_dependency"
  ]
}];

export const US_DIESEL_ACTION_CONTRACT_EXTENSION = {
  expectedCountsDelta: { governable: 1, edge: 1, postgres: 0, ratewareApi: 0 },
  reviewedMetadataFingerprints: {"edge.sync-us-diesel.sync_us_diesel":"e4931d719101c042a4be721354eaafe1d4925c8e7871cdd6e72e047a1b63d376"},
  reviewedAuthorizationFingerprints: Object.fromEntries(surfaces.map((entry) => [entry.canonicalId, authorizationFingerprint])),
  surfaces
};
