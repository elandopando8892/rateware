/** Preguntas preparadas para revisión en la Cola; sin entrega al proveedor. */
export const RFX_CARRIER_QUESTION_DRAFT_ACTION_CONTRACT_EXTENSION = {
  "contractVersion": "1.3.0",
  "expectedCountsDelta": {
    "governable": 1,
    "edge": 1,
    "postgres": 0,
    "ratewareApi": 1
  },
  "reviewedMetadataFingerprints": {
    "edge.rateware-api.draft_bid_room_carrier_message": "37271629a107b4dfdc1cc1698b2992a8dab95b6eadff5adb92f56bd7421a4a0f"
  },
  "reviewedAuthorizationFingerprints": {
    "edge.rateware-api.draft_bid_room_carrier_message": "724e2d8921fe454affe29c7241121a1ccea371b6bcfe5e849a42a94489bb8af5"
  },
  "surfaces": [
    {
      "contractVersion": "1.3.0",
      "canonicalId": "edge.rateware-api.draft_bid_room_carrier_message",
      "actionName": "draft_bid_room_carrier_message",
      "sourceKind": "edge-selector",
      "sourceFile": "supabase/functions/rateware-api/index.ts",
      "handler": "sendBidRoomCarrierMessage",
      "endpoint": "POST /functions/v1/rateware-api body.action",
      "businessModule": "Procurement",
      "operation": "communicate",
      "resource": "rfx",
      "access": "write",
      "exposure": "human",
      "sensitivity": "high",
      "tenantRelevance": "tenant-scoped",
      "proposedPermissionKey": "rfx.communicate",
      "functionalOwner": "Procurement",
      "decisionStatus": "pending_human_approval",
      "lifecycle": "active",
      "replacementAction": null,
      "sourceFingerprint": "40ece87c76168324b7f644e9b161e0545f6cb019d52115b7672021216c074c42",
      "notes": "Prepara exclusivamente un borrador de pregunta para la Cola. Nunca invoca el envío de Gmail. Valida evento e invitación del workspace y confirmación ligada a esta acción; conserva request_key al reintentar. El permiso y su propietario mantienen la revisión humana del contrato existente.",
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
        "supabase/functions/rateware-api/outreach-pagination.js",
        "supabase/functions/rateware-api/rfx-closeout-guards.ts"
      ],
      "rpcSignature": null,
      "coverageSignals": [
        "shared_dependency_observed",
        "external_dependency"
      ]
    }
  ]
};
