/** Reviewed daily operations watch surface (supabase/functions/ops-daily-watch). Static reviewed fingerprints. */
const authorizationFingerprint = "23b084480802262f74763fe02175e6c5b5015ad2f5c26a91ce487146df43bf9f";
const surfaces = [{
  "contractVersion": "1.3.0",
  "canonicalId": "edge.ops-daily-watch.ops_daily_watch",
  "actionName": "ops_daily_watch",
  "sourceKind": "edge-method",
  "sourceFile": "supabase/functions/ops-daily-watch/index.ts",
  "handler": "Deno.serve",
  "endpoint": "POST /functions/v1/ops-daily-watch x-cron-secret",
  "businessModule": "Commercial",
  "operation": "communicate",
  "resource": "ops-watch",
  "access": "write",
  "exposure": "internal/service-role",
  "sensitivity": "medium",
  "tenantRelevance": "platform-scoped",
  "proposedPermissionKey": "service.ops.watch",
  "functionalOwner": "Commercial",
  "decisionStatus": "internal_only",
  "lifecycle": "active",
  "replacementAction": null,
  "sourceFingerprint": "936fc956b1ae7abfd14b5503b5c24da4c13ad8445b1e7d1a2cff4ad624548fe4",
  "notes": "Daily pg_cron job with the shared SYNC_CRON_SECRET; reads (read-only, SUPABASE_DB_URL) the cron run log, fcm_sync_runs, Banxico FX and US diesel freshness, the sales@ Gmail mailbox status and 24 h delivery failures/bounces, and posts what needs a look (plus a Monday all-clear) to the team's Google Chat space through the existing Chat connection. Writes nothing else; `x-watch-dry-run: 1` returns the message without posting.",
  "analysisCoverage": "shared-observed",
  "dependencyFiles": [
    "supabase/functions/_shared/bid-room-google-chat.ts",
    "supabase/functions/_shared/kinde.ts",
    "supabase/functions/ops-daily-watch/index.ts",
    "supabase/functions/ops-daily-watch/watch.mjs"
  ],
  "rpcSignature": null,
  "coverageSignals": [
    "shared_dependency_observed",
    "external_dependency"
  ]
}];

export const OPS_WATCH_ACTION_CONTRACT_EXTENSION = {
  expectedCountsDelta: { governable: 1, edge: 1, postgres: 0, ratewareApi: 0 },
  reviewedMetadataFingerprints: {"edge.ops-daily-watch.ops_daily_watch":"082de0899f7f75e27077d95eaaff4f5bcdc2f4c0a14782d6d0d79f9f7fcfaa08"},
  reviewedAuthorizationFingerprints: Object.fromEntries(surfaces.map((entry) => [entry.canonicalId, authorizationFingerprint])),
  surfaces
};
