/** Reviewed hourly FCM bases sync surface (supabase/functions/sync-fcm-bases). Static reviewed fingerprints. */
const authorizationFingerprint = "2db52b0b5644461cfe41b97a715befe27f6478ae62e37f255218cc60655b0e7a";
const surfaces = [{
  "contractVersion": "1.3.0",
  "canonicalId": "edge.sync-fcm-bases.sync_fcm_bases",
  "actionName": "sync_fcm_bases",
  "sourceKind": "edge-method",
  "sourceFile": "supabase/functions/sync-fcm-bases/index.ts",
  "handler": "Deno.serve",
  "endpoint": "POST /functions/v1/sync-fcm-bases x-cron-secret",
  "businessModule": "Commercial",
  "operation": "execute",
  "resource": "fcm-reference",
  "access": "write",
  "exposure": "internal/service-role",
  "sensitivity": "medium",
  "tenantRelevance": "platform-scoped",
  "proposedPermissionKey": "service.fcm.sync",
  "functionalOwner": "Commercial",
  "decisionStatus": "internal_only",
  "lifecycle": "active",
  "replacementAction": null,
  "sourceFingerprint": "21b0fb24cc93dcbf4c8118b8e5eccfd43e7bca06d28afaac953b800541d3484f",
  "notes": "Hourly pg_cron job with the shared SYNC_CRON_SECRET; reads the FCM database through a read-only role (FCM_DATABASE_URL) and writes fcm_cost_bases (per workspace, mapped by the FCM users' emails through workspace_identity_aliases) plus the fcm_* reference tables; then checks that QuoteDesk's copy of the FCM engine still matches the FCM (the live release's formula files, read through the public FCM /health and GitHub raw, the parameters of the copied bases, and a replay of the FCM's latest saved calculations) and logs the run with that check in fcm_sync_runs.",
  "analysisCoverage": "shared-observed",
  "dependencyFiles": [
    "supabase/functions/_shared/kinde.ts",
    "supabase/functions/quotedesk-api/fcm.mjs",
    "supabase/functions/sync-fcm-bases/engine-check.mjs",
    "supabase/functions/sync-fcm-bases/fcm-sync.mjs",
    "supabase/functions/sync-fcm-bases/index.ts"
  ],
  "rpcSignature": null,
  "coverageSignals": [
    "shared_dependency_observed",
    "external_dependency"
  ]
}];

export const FCM_SYNC_ACTION_CONTRACT_EXTENSION = {
  expectedCountsDelta: { governable: 1, edge: 1, postgres: 0, ratewareApi: 0 },
  reviewedMetadataFingerprints: {"edge.sync-fcm-bases.sync_fcm_bases":"7cb108d5dfc76159929b7d9cf38000941f4ed3ff8bb28cee8a398839cec4f8ed"},
  reviewedAuthorizationFingerprints: Object.fromEntries(surfaces.map((entry) => [entry.canonicalId, authorizationFingerprint])),
  surfaces
};
