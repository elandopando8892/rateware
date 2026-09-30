/** Contrato revisado de la lectura de confirmaciones, sin ampliar permisos de escritura. */
export const RFX_SEGMENT_CONFIRMATIONS_ACTION_CONTRACT_EXTENSION = {
  "contractVersion": "1.3.0",
  "expectedCountsDelta": {
    "governable": 1,
    "edge": 1,
    "postgres": 0,
    "ratewareApi": 1
  },
  "reviewedMetadataFingerprints": {
    "edge.rateware-api.list_rfx_segment_confirmations": "35247747d43aa52ec4bf7d21e30d36b18022f7517e32d104d96b61a5bf30c4b8"
  },
  "reviewedAuthorizationFingerprints": {
    "edge.rateware-api.list_rfx_segment_confirmations": "18402a017f7fd931b27c58545a0e838fc2fe9250ff52fdd2193c92389abfa481"
  },
  "surfaces": [
    {
      "contractVersion": "1.3.0",
      "canonicalId": "edge.rateware-api.list_rfx_segment_confirmations",
      "actionName": "list_rfx_segment_confirmations",
      "sourceKind": "edge-selector",
      "sourceFile": "supabase/functions/rateware-api/index.ts",
      "handler": "inline",
      "endpoint": "POST /functions/v1/rateware-api body.action",
      "businessModule": "Procurement",
      "operation": "read",
      "resource": "rfx",
      "access": "read",
      "exposure": "human",
      "sensitivity": "high",
      "tenantRelevance": "tenant-scoped",
      "proposedPermissionKey": "rfx.read",
      "functionalOwner": "Procurement",
      "decisionStatus": "pending_human_approval",
      "lifecycle": "active",
      "replacementAction": null,
      "sourceFingerprint": "a3293c38c0a014104a72c4eb3dd266dad0222a121230520c9945ced3edd81c9b",
      "notes": "Lectura solicitada por el equipo: requireOwnedRfxEvent valida owner_email antes de devolver siete campos de confirmaciones. Consulta, Operador y Administrador leen sin escrituras. El permiso rfx.read y su propietario funcional mantienen el estado de revisión humana del contrato existente.",
      "analysisCoverage": "shared-observed",
      "dependencyFiles": [
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
        "supabase/functions/rateware-api/index.ts",
        "supabase/functions/rateware-api/outreach-pagination.js"
      ],
      "rpcSignature": null,
      "coverageSignals": [
        "shared_dependency_observed",
        "external_dependency"
      ]
    }
  ]
};
