/**
 * Provider-neutral source-file storage (supabase/functions/rateware-storage-api):
 * Supabase Storage or Oracle Object Storage behind one authenticated service.
 * Deployed to production on 2026-09-08; reviewed fingerprints are static.
 */
const authorizationFingerprint = "a66ccc65e67fcba6264e684ea4355d590e1223de76e7216daa6704df73b37cf0";
const surfaces = [
  {
    "contractVersion": "1.3.0",
    "canonicalId": "edge.rateware-storage-api.get_upload_source_url",
    "actionName": "get_upload_source_url",
    "sourceKind": "edge-selector",
    "sourceFile": "supabase/functions/rateware-storage-api/index.ts",
    "handler": "createStorageDownloadUrl",
    "endpoint": "POST /functions/v1/rateware-storage-api body.action",
    "businessModule": "Procurement",
    "operation": "read",
    "resource": "intake-staging",
    "access": "read",
    "exposure": "external-tokenized",
    "sensitivity": "medium",
    "tenantRelevance": "tenant-scoped",
    "proposedPermissionKey": "object-storage.read",
    "functionalOwner": "Procurement",
    "decisionStatus": "pending_human_approval",
    "lifecycle": "active",
    "replacementAction": null,
    "sourceFingerprint": "7b17409df3f003f062aaa3076f81534cf5c3fb88a79f1fc9a3ce02a9db5dc5ea",
    "notes": "Authenticated operator action behind reviewed source-file access (confirmed email + rateware_organization_id); ownership is checked against the canonical workspace before any object access. rateware-api forwards get_upload_source_url, and remove_upload for files outside Supabase Storage, with the caller's own bearer.",
    "analysisCoverage": "shared-observed",
    "dependencyFiles": [
      "supabase/functions/_shared/auth.ts",
      "supabase/functions/_shared/identity-contract.mjs",
      "supabase/functions/_shared/kinde.ts",
      "supabase/functions/_shared/object-storage.ts",
      "supabase/functions/_shared/runtime-identity.ts",
      "supabase/functions/_shared/source-file-access.ts",
      "supabase/functions/_shared/workspace.ts",
      "supabase/functions/rateware-storage-api/index.ts"
    ],
    "rpcSignature": null,
    "coverageSignals": [
      "shared_dependency_observed",
      "external_dependency"
    ]
  },
  {
    "contractVersion": "1.3.0",
    "canonicalId": "edge.rateware-storage-api.remove_upload",
    "actionName": "remove_upload",
    "sourceKind": "edge-selector",
    "sourceFile": "supabase/functions/rateware-storage-api/index.ts",
    "handler": "inline",
    "endpoint": "POST /functions/v1/rateware-storage-api body.action",
    "businessModule": "Procurement",
    "operation": "delete",
    "resource": "intake-staging",
    "access": "write",
    "exposure": "external-tokenized",
    "sensitivity": "high",
    "tenantRelevance": "tenant-scoped",
    "proposedPermissionKey": "object-storage.delete",
    "functionalOwner": "Procurement",
    "decisionStatus": "pending_human_approval",
    "lifecycle": "active",
    "replacementAction": null,
    "sourceFingerprint": "94a9fe78414d5fee7f27331697092d47f10382bfcf0879a19887034c817c0013",
    "notes": "Authenticated operator action behind reviewed source-file access (confirmed email + rateware_organization_id); ownership is checked against the canonical workspace before any object access. rateware-api forwards get_upload_source_url, and remove_upload for files outside Supabase Storage, with the caller's own bearer.",
    "analysisCoverage": "shared-observed",
    "dependencyFiles": [
      "supabase/functions/_shared/auth.ts",
      "supabase/functions/_shared/identity-contract.mjs",
      "supabase/functions/_shared/kinde.ts",
      "supabase/functions/_shared/object-storage.ts",
      "supabase/functions/_shared/runtime-identity.ts",
      "supabase/functions/_shared/source-file-access.ts",
      "supabase/functions/_shared/workspace.ts",
      "supabase/functions/rateware-storage-api/index.ts"
    ],
    "rpcSignature": null,
    "coverageSignals": [
      "shared_dependency_observed",
      "external_dependency"
    ]
  }
];

export const OBJECT_STORAGE_ACTION_CONTRACT_EXTENSION = {
  expectedCountsDelta: { governable: 2, edge: 2, postgres: 0, ratewareApi: 0 },
  reviewedMetadataFingerprints: {
  "edge.rateware-storage-api.get_upload_source_url": "79e6ada3fc77527d3a3ef5ce142c3463a7d5696d16380bd2851b0c131aaa89fa",
  "edge.rateware-storage-api.remove_upload": "016786d16cefef32f1c20ac79a99496ba59f98e0671f1daaecd554499a8bf82b"
},
  reviewedAuthorizationFingerprints: Object.fromEntries(surfaces.map((entry) => [entry.canonicalId, authorizationFingerprint])),
  surfaces
};
