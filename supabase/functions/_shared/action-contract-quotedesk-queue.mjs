/** Contrato local revisado de Spot en Cola. Huellas estaticas; no activa produccion. */
export const QUOTEDESK_QUEUE_ACTION_CONTRACT_EXTENSION = {
  "contractVersion": "1.3.0",
  "expectedCountsDelta": {
    "governable": 3,
    "edge": 3,
    "postgres": 0,
    "ratewareApi": 0
  },
  "reviewedMetadataFingerprints": {
    "edge.quotedesk-api.prepare_quote_email_draft": "903fb1047f25202463b1a4b851c36af40b10793651a3200fcf646a2db550fa76",
    "edge.quotedesk-api.list_quote_queue": "6383f9f2aa7cc5f6a76ee3d9ea98988e33f743eff8232111e1a5699dcdd99267",
    "edge.quotedesk-api.send_quote_queue_message": "418b7cb91cb7bbb116f7e85c4cfee50c663b20674b64437ad9413beafcbf9469",
    "edge.quotedesk-api.send_quote_email": "9be0542457cf839f0eeeabfe116a50f0512905fa4d703f4f4a75447f0483d3fc"
  },
  "reviewedAuthorizationEnvelopes": {
    "quotedesk-api": "2e7b943a19f9e839d43db8b07a469b9f14501c16074a44ed989c79a11bcb35e8",
    "rateware-api": "20f63d060b3f72fcea25a010a7cd388a58ccb6e6527a7a71514db212c6f3b9c6"
  },
  "dependencyFiles": {
    "quotedesk-api": [
      "supabase/functions/_shared/auth.ts",
      "supabase/functions/_shared/gmail-send.ts",
      "supabase/functions/_shared/identity-contract.mjs",
      "supabase/functions/_shared/kinde.ts",
      "supabase/functions/_shared/quote-queue-scope.ts",
      "supabase/functions/_shared/runtime-identity.ts",
      "supabase/functions/_shared/team-roles.ts",
      "supabase/functions/_shared/workspace.ts",
      "supabase/functions/quotedesk-api/calc.mjs",
      "supabase/functions/quotedesk-api/email.mjs",
      "supabase/functions/quotedesk-api/fcm.mjs",
      "supabase/functions/quotedesk-api/index.ts",
      "supabase/functions/quotedesk-api/queue.ts",
      "supabase/functions/quotedesk-api/routes.mjs"
    ],
    "rateware-api": [
      "supabase/functions/_shared/auth.ts",
      "supabase/functions/_shared/bid-room-google-chat.ts",
      "supabase/functions/_shared/identity-contract.mjs",
      "supabase/functions/_shared/kinde.ts",
      "supabase/functions/_shared/quote-queue-scope.ts",
      "supabase/functions/_shared/runtime-identity.ts",
      "supabase/functions/_shared/source-download-routing.mjs",
      "supabase/functions/_shared/team-roles.ts",
      "supabase/functions/_shared/workspace.ts",
      "supabase/functions/rateware-api/carrier-list-templates.ts",
      "supabase/functions/rateware-api/growth.ts",
      "supabase/functions/rateware-api/index.ts",
      "supabase/functions/rateware-api/outreach-pagination.js",
      "supabase/functions/rateware-api/rfx-closeout-guards.ts"
    ]
  },
  "overrides": {
    "edge.rateware-api.bulk_update_rate_rows_by_filter": {
      "sourceFingerprint": "3c30a809fb3fbc16dd2cd5c6620e22a55cf340bf833c836f8b325f4c1a565259"
    },
    "edge.rateware-api.bulk_update_staging": {
      "sourceFingerprint": "faa57bb6decca79b4fbe017d015bb3aec23bc47bfd92cf8a3a904ed561278a88"
    },
    "edge.rateware-api.delete_outreach_messages": {
      "sourceFingerprint": "37d64dffce896f25dd48a4034c7665be9fbaeba4dd2a2633129565561a9c4c97"
    },
    "edge.rateware-api.mark_outreach_messages": {
      "sourceFingerprint": "6f9104f2148b5f417382fc1a3f7d3bf973e141b19aa5296b49c8e7dc4a317cef"
    },
    "edge.rateware-api.send_bid_room_carrier_message": {
      "sourceFingerprint": "40ece87c76168324b7f644e9b161e0545f6cb019d52115b7672021216c074c42"
    },
    "edge.rateware-api.send_whatsapp_outreach_messages": {
      "sourceFingerprint": "00eeffc48b20695e7e1dd9f7e1020ac63e6d5a8e8a148aea7df3d554d3b8c54f"
    },
    "edge.rateware-api.update_staging": {
      "sourceFingerprint": "876dfc00a6ca0c013b0be7d37063f12469ed0ce40bec1655de8378fd0665cfde"
    },
    "edge.quotedesk-api.send_quote_email": {
      "sourceFingerprint": "73a585b5f3d1a3d03a2bbf7cc498db095433bd38426397ec7c7f98f689a3fb98",
      "handler": "jsonResponse",
      "lifecycle": "deprecated",
      "replacementAction": "send_quote_queue_message",
      "notes": "Ruta antigua bloqueada con 409. Preparar con prepare_quote_email_draft y aprobar desde send_quote_queue_message."
    },
    "edge.rateware-api.list_rfx_segment_confirmations": {
      "sourceFingerprint": "ef2c360f34681df14d56dd0c3a3f4d3c91870e45526be3eb233e27719f7a716a"
    }
  },
  "surfaces": [
    {
      "contractVersion": "1.3.0",
      "canonicalId": "edge.quotedesk-api.prepare_quote_email_draft",
      "actionName": "prepare_quote_email_draft",
      "sourceKind": "edge-selector",
      "sourceFile": "supabase/functions/quotedesk-api/index.ts",
      "handler": "jsonResponse",
      "endpoint": "POST /functions/v1/quotedesk-api body.action",
      "businessModule": "Commercial",
      "operation": "manage",
      "resource": "quotedesk",
      "access": "write",
      "exposure": "human",
      "sensitivity": "medium",
      "tenantRelevance": "tenant-scoped",
      "proposedPermissionKey": "quotedesk.manage",
      "functionalOwner": "Commercial",
      "decisionStatus": "pending_human_approval",
      "lifecycle": "active",
      "replacementAction": null,
      "sourceFingerprint": "73a585b5f3d1a3d03a2bbf7cc498db095433bd38426397ec7c7f98f689a3fb98",
      "notes": "Prepara un snapshot en outreach_messages; no entrega. Workspace/operador, tarifas vigentes, checksum y rebotes; ID determinista y campaña sin evento RFx.",
      "analysisCoverage": "shared-observed",
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs"
      ],
      "rpcSignature": null,
      "coverageSignals": [
        "shared_dependency_observed",
        "external_dependency"
      ],
      "handlerStatus": "named-existing",
      "exposureHint": "human",
      "authorizationFingerprint": "2e7b943a19f9e839d43db8b07a469b9f14501c16074a44ed989c79a11bcb35e8",
      "unresolvedDependencies": [],
      "dynamicDependencies": [],
      "externalDependencies": [
        {
          "sourceFile": "supabase/functions/quotedesk-api/index.ts",
          "specifier": "https://esm.sh/@supabase/supabase-js@2.57.4",
          "kind": "static"
        },
        {
          "sourceFile": "supabase/functions/quotedesk-api/calc.mjs",
          "specifier": "$0",
          "kind": "static"
        }
      ],
      "discoveryKind": "switch-case",
      "handlerResolution": "imported-static"
    },
    {
      "contractVersion": "1.3.0",
      "canonicalId": "edge.quotedesk-api.list_quote_queue",
      "actionName": "list_quote_queue",
      "sourceKind": "edge-selector",
      "sourceFile": "supabase/functions/quotedesk-api/index.ts",
      "handler": "jsonResponse",
      "endpoint": "POST /functions/v1/quotedesk-api body.action",
      "businessModule": "Commercial",
      "operation": "view",
      "resource": "quotedesk",
      "access": "read",
      "exposure": "human",
      "sensitivity": "medium",
      "tenantRelevance": "tenant-scoped",
      "proposedPermissionKey": "quotedesk.view",
      "functionalOwner": "Commercial",
      "decisionStatus": "pending_human_approval",
      "lifecycle": "active",
      "replacementAction": null,
      "sourceFingerprint": "73a585b5f3d1a3d03a2bbf7cc498db095433bd38426397ec7c7f98f689a3fb98",
      "notes": "Cola paginada por cotización del workspace. Recibos como autoridad de entrega; lectura disponible a viewer.",
      "analysisCoverage": "shared-observed",
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs"
      ],
      "rpcSignature": null,
      "coverageSignals": [
        "shared_dependency_observed",
        "external_dependency"
      ],
      "handlerStatus": "named-existing",
      "exposureHint": "human",
      "authorizationFingerprint": "2e7b943a19f9e839d43db8b07a469b9f14501c16074a44ed989c79a11bcb35e8",
      "unresolvedDependencies": [],
      "dynamicDependencies": [],
      "externalDependencies": [
        {
          "sourceFile": "supabase/functions/quotedesk-api/index.ts",
          "specifier": "https://esm.sh/@supabase/supabase-js@2.57.4",
          "kind": "static"
        },
        {
          "sourceFile": "supabase/functions/quotedesk-api/calc.mjs",
          "specifier": "$0",
          "kind": "static"
        }
      ],
      "discoveryKind": "switch-case",
      "handlerResolution": "imported-static"
    },
    {
      "contractVersion": "1.3.0",
      "canonicalId": "edge.quotedesk-api.send_quote_queue_message",
      "actionName": "send_quote_queue_message",
      "sourceKind": "edge-selector",
      "sourceFile": "supabase/functions/quotedesk-api/index.ts",
      "handler": "jsonResponse",
      "endpoint": "POST /functions/v1/quotedesk-api body.action",
      "businessModule": "Commercial",
      "operation": "manage",
      "resource": "quotedesk",
      "access": "write",
      "exposure": "human",
      "sensitivity": "medium",
      "tenantRelevance": "tenant-scoped",
      "proposedPermissionKey": "quotedesk.manage",
      "functionalOwner": "Commercial",
      "decisionStatus": "pending_human_approval",
      "lifecycle": "active",
      "replacementAction": null,
      "sourceFingerprint": "73a585b5f3d1a3d03a2bbf7cc498db095433bd38426397ec7c7f98f689a3fb98",
      "notes": "Aprobación explícita ligada a la acción en Cola. Valida snapshot y cotización vigente, claim atómico y recibo Gmail único. Resultado incierto no permite reintento automático.",
      "analysisCoverage": "shared-observed",
      "dependencyFiles": [
        "supabase/functions/_shared/auth.ts",
        "supabase/functions/_shared/gmail-send.ts",
        "supabase/functions/_shared/identity-contract.mjs",
        "supabase/functions/_shared/kinde.ts",
        "supabase/functions/_shared/quote-queue-scope.ts",
        "supabase/functions/_shared/runtime-identity.ts",
        "supabase/functions/_shared/team-roles.ts",
        "supabase/functions/_shared/workspace.ts",
        "supabase/functions/quotedesk-api/calc.mjs",
        "supabase/functions/quotedesk-api/email.mjs",
        "supabase/functions/quotedesk-api/fcm.mjs",
        "supabase/functions/quotedesk-api/index.ts",
        "supabase/functions/quotedesk-api/queue.ts",
        "supabase/functions/quotedesk-api/routes.mjs"
      ],
      "rpcSignature": null,
      "coverageSignals": [
        "shared_dependency_observed",
        "external_dependency"
      ],
      "handlerStatus": "named-existing",
      "exposureHint": "human",
      "authorizationFingerprint": "2e7b943a19f9e839d43db8b07a469b9f14501c16074a44ed989c79a11bcb35e8",
      "unresolvedDependencies": [],
      "dynamicDependencies": [],
      "externalDependencies": [
        {
          "sourceFile": "supabase/functions/quotedesk-api/index.ts",
          "specifier": "https://esm.sh/@supabase/supabase-js@2.57.4",
          "kind": "static"
        },
        {
          "sourceFile": "supabase/functions/quotedesk-api/calc.mjs",
          "specifier": "$0",
          "kind": "static"
        }
      ],
      "discoveryKind": "switch-case",
      "handlerResolution": "imported-static"
    }
  ],
  "reviewedAuthorizationFingerprints": {
    "edge.interpret-upload.interpret_upload": "d1b5095019eed343bee727d63a73a477b5914b088329749864798f06c3665fb9",
    "edge.rateware-storage-api.get_upload_source_url": "fc3243acd7e1533e6d4f93a6ae086067163c1fe179edd31426a2099a64e8d27b",
    "edge.rateware-storage-api.remove_upload": "fc3243acd7e1533e6d4f93a6ae086067163c1fe179edd31426a2099a64e8d27b"
  }
};
