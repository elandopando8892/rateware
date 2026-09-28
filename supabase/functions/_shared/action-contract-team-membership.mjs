/** Reviewed team-membership trigger function (auth.users, by email domain). Static reviewed fingerprints. */
const surfaces = [{
  "contractVersion": "1.3.0",
  "canonicalId": "rpc.public.assign_team_workspace_membership()",
  "actionName": "public.assign_team_workspace_membership",
  "sourceKind": "postgres-function",
  "sourceFile": "supabase/migrations/20260925185917_team_workspace_membership.sql",
  "handler": "public.assign_team_workspace_membership()",
  "endpoint": "PostgreSQL function / PostgREST RPC surface public.assign_team_workspace_membership()",
  "businessModule": "Platform",
  "operation": "manage",
  "resource": "workspace-membership",
  "access": "write",
  "exposure": "internal/service-role",
  "sensitivity": "high",
  "tenantRelevance": "platform-scoped",
  "proposedPermissionKey": "internal.rpc.assign_team_workspace_membership",
  "functionalOwner": "Platform",
  "decisionStatus": "internal_only",
  "lifecycle": "active",
  "replacementAction": null,
  "sourceFingerprint": "bc632c30e4b93fec274e838a8b9579d181d40ae6236656d71b14e189d66f6e67",
  "notes": "BEFORE INSERT/UPDATE trigger on auth.users, not callable: EXECUTE revoked from public/anon/authenticated. A confirmed account whose email domain is in workspace_team_domains (service role only) gets that domain's rateware_organization_id and permissions in server-only app_metadata; never moves an account out of another organization; fails open (any error leaves the account untouched).",
  "analysisCoverage": "direct",
  "dependencyFiles": [
    "supabase/migrations/20260925185917_team_workspace_membership.sql"
  ],
  "rpcSignature": "",
  "coverageSignals": [
    "direct"
  ]
}];

export const TEAM_MEMBERSHIP_ACTION_CONTRACT_EXTENSION = {
  expectedCountsDelta: { governable: 1, edge: 0, postgres: 1, ratewareApi: 0 },
  reviewedMetadataFingerprints: {"rpc.public.assign_team_workspace_membership()":"028ab6ad90b0084176c9e990d0dc4e677cf0b4b5340e3d31b028bfcf74a82f00"},
  reviewedAuthorizationFingerprints: {"rpc.public.assign_team_workspace_membership()":"bc632c30e4b93fec274e838a8b9579d181d40ae6236656d71b14e189d66f6e67"},
  surfaces
};
