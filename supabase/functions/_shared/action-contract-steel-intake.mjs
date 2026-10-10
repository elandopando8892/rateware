/** Reviewed steel-intake-api surfaces (The Steel Marketplace -> Rateware, server to server). Static reviewed fingerprints. */
const surfaces = [
  {
    "contractVersion": "1.3.0",
    "canonicalId": "edge.steel-intake-api.cancel_spot_opportunity",
    "actionName": "cancel_spot_opportunity",
    "sourceKind": "edge-selector",
    "sourceFile": "supabase/functions/steel-intake-api/index.ts",
    "handler": "cancelSpot",
    "endpoint": "POST /functions/v1/steel-intake-api body.action",
    "businessModule": "Commercial Operations",
    "operation": "manage",
    "resource": "steel-spot-intake",
    "access": "write",
    "exposure": "external-tokenized",
    "sensitivity": "high",
    "tenantRelevance": "platform-scoped",
    "proposedPermissionKey": "external.steel-intake.cancel_spot_opportunity",
    "functionalOwner": "Commercial Operations",
    "decisionStatus": "pending_human_approval",
    "lifecycle": "active",
    "replacementAction": null,
    "sourceFingerprint": "b848626aa5af3c0009f524b62ade9aefcee9e4a96a09d280e055ae5aec4b372f",
    "notes": "Archiva una oportunidad spot creada por esta función, con motivo en notes y receipt idempotente.",
    "analysisCoverage": "shared-observed",
    "dependencyFiles": [
      "supabase/functions/steel-intake-api/index.ts",
      "supabase/functions/steel-intake-api/logic.mjs"
    ],
    "rpcSignature": null,
    "coverageSignals": [
      "shared_dependency_observed",
      "external_dependency"
    ]
  },
  {
    "contractVersion": "1.3.0",
    "canonicalId": "edge.steel-intake-api.get_spot_status",
    "actionName": "get_spot_status",
    "sourceKind": "edge-selector",
    "sourceFile": "supabase/functions/steel-intake-api/index.ts",
    "handler": "spotStatus",
    "endpoint": "POST /functions/v1/steel-intake-api body.action",
    "businessModule": "Commercial Operations",
    "operation": "read",
    "resource": "steel-spot-intake",
    "access": "read",
    "exposure": "external-tokenized",
    "sensitivity": "medium",
    "tenantRelevance": "platform-scoped",
    "proposedPermissionKey": "external.steel-intake.get_spot_status",
    "functionalOwner": "Commercial Operations",
    "decisionStatus": "pending_human_approval",
    "lifecycle": "active",
    "replacementAction": null,
    "sourceFingerprint": "66a2c2417d489b92146ee7afe62e1000c62daa3401bddd7c65b646b9be424f00",
    "notes": "Lee estado, ofertas con tarifa y adjudicación primaria de una oportunidad creada por esta función.",
    "analysisCoverage": "shared-observed",
    "dependencyFiles": [
      "supabase/functions/steel-intake-api/index.ts",
      "supabase/functions/steel-intake-api/logic.mjs"
    ],
    "rpcSignature": null,
    "coverageSignals": [
      "shared_dependency_observed",
      "external_dependency"
    ]
  },
  {
    "contractVersion": "1.3.0",
    "canonicalId": "edge.steel-intake-api.list_carrier_directory",
    "actionName": "list_carrier_directory",
    "sourceKind": "edge-selector",
    "sourceFile": "supabase/functions/steel-intake-api/index.ts",
    "handler": "carrierDirectory",
    "endpoint": "POST /functions/v1/steel-intake-api body.action",
    "businessModule": "Commercial Operations",
    "operation": "read",
    "resource": "carrier-directory",
    "access": "read",
    "exposure": "external-tokenized",
    "sensitivity": "medium",
    "tenantRelevance": "platform-scoped",
    "proposedPermissionKey": "external.steel-intake.list_carrier_directory",
    "functionalOwner": "Commercial Operations",
    "decisionStatus": "pending_human_approval",
    "lifecycle": "active",
    "replacementAction": null,
    "sourceFingerprint": "6c816f2fb8b608dba284eb471924bb38514b1cd5f1650a50454cebbc8eb791c3",
    "notes": "Lista vendors activos del workspace (id, nombre, dominio, estado, tags) sin correos ni teléfonos.",
    "analysisCoverage": "shared-observed",
    "dependencyFiles": [
      "supabase/functions/steel-intake-api/index.ts",
      "supabase/functions/steel-intake-api/logic.mjs"
    ],
    "rpcSignature": null,
    "coverageSignals": [
      "shared_dependency_observed",
      "external_dependency"
    ]
  },
  {
    "contractVersion": "1.3.0",
    "canonicalId": "edge.steel-intake-api.publish_spot_opportunity",
    "actionName": "publish_spot_opportunity",
    "sourceKind": "edge-selector",
    "sourceFile": "supabase/functions/steel-intake-api/index.ts",
    "handler": "publishSpot",
    "endpoint": "POST /functions/v1/steel-intake-api body.action",
    "businessModule": "Commercial Operations",
    "operation": "manage",
    "resource": "steel-spot-intake",
    "access": "write",
    "exposure": "external-tokenized",
    "sensitivity": "high",
    "tenantRelevance": "platform-scoped",
    "proposedPermissionKey": "external.steel-intake.publish_spot_opportunity",
    "functionalOwner": "Commercial Operations",
    "decisionStatus": "pending_human_approval",
    "lifecycle": "active",
    "replacementAction": null,
    "sourceFingerprint": "a4b96c4b63d89c512146713d74883a16475aa104581e294dc94c193f94e56464",
    "notes": "Publica una oportunidad spot abierta (rfx_events + rfx_lanes) con receipt idempotente; no invita carriers.",
    "analysisCoverage": "shared-observed",
    "dependencyFiles": [
      "supabase/functions/steel-intake-api/index.ts",
      "supabase/functions/steel-intake-api/logic.mjs"
    ],
    "rpcSignature": null,
    "coverageSignals": [
      "shared_dependency_observed",
      "external_dependency"
    ]
  },
  {
    "contractVersion": "1.3.0",
    "canonicalId": "rpc.public.steel_intake_cancel_spot(text,text,text,text,text,text,uuid,text,uuid)",
    "actionName": "public.steel_intake_cancel_spot",
    "sourceKind": "postgres-function",
    "sourceFile": "supabase/migrations/20261010195538_steel_intake.sql",
    "handler": "public.steel_intake_cancel_spot(text,text,text,text,text,text,uuid,text,uuid)",
    "endpoint": "PostgreSQL function / PostgREST RPC surface public.steel_intake_cancel_spot(text,text,text,text,text,text,uuid,text,uuid)",
    "businessModule": "Commercial Operations",
    "operation": "manage",
    "resource": "steel-spot-intake",
    "access": "write",
    "exposure": "internal/service-role",
    "sensitivity": "high",
    "tenantRelevance": "platform-scoped",
    "proposedPermissionKey": "internal.rpc.steel_intake_cancel_spot",
    "functionalOwner": "Commercial Operations",
    "decisionStatus": "internal_only",
    "lifecycle": "active",
    "replacementAction": null,
    "sourceFingerprint": "e14762e111bf9660d562147b19e77112add6d0cc224406f804168ed50a8af7f2",
    "notes": "Transacción interna de steel-intake-api; sólo service role, sin grant para navegador.",
    "analysisCoverage": "direct",
    "dependencyFiles": [
      "supabase/migrations/20261010195538_steel_intake.sql"
    ],
    "rpcSignature": "text,text,text,text,text,text,uuid,text,uuid",
    "coverageSignals": [
      "direct"
    ]
  },
  {
    "contractVersion": "1.3.0",
    "canonicalId": "rpc.public.steel_intake_publish_spot(text,text,text,text,text,text,jsonb,jsonb,text,jsonb,jsonb)",
    "actionName": "public.steel_intake_publish_spot",
    "sourceKind": "postgres-function",
    "sourceFile": "supabase/migrations/20261010195538_steel_intake.sql",
    "handler": "public.steel_intake_publish_spot(text,text,text,text,text,text,jsonb,jsonb,text,jsonb,jsonb)",
    "endpoint": "PostgreSQL function / PostgREST RPC surface public.steel_intake_publish_spot(text,text,text,text,text,text,jsonb,jsonb,text,jsonb,jsonb)",
    "businessModule": "Commercial Operations",
    "operation": "manage",
    "resource": "steel-spot-intake",
    "access": "write",
    "exposure": "internal/service-role",
    "sensitivity": "high",
    "tenantRelevance": "platform-scoped",
    "proposedPermissionKey": "internal.rpc.steel_intake_publish_spot",
    "functionalOwner": "Commercial Operations",
    "decisionStatus": "internal_only",
    "lifecycle": "active",
    "replacementAction": null,
    "sourceFingerprint": "6690c7e0934dc9caf06735bce4a289383d470c28445353b369f9498d7df3fc80",
    "notes": "Transacción interna de steel-intake-api; sólo service role, sin grant para navegador.",
    "analysisCoverage": "direct",
    "dependencyFiles": [
      "supabase/migrations/20261010195538_steel_intake.sql"
    ],
    "rpcSignature": "text,text,text,text,text,text,jsonb,jsonb,text,jsonb,jsonb",
    "coverageSignals": [
      "direct"
    ]
  }
];

export const STEEL_INTAKE_ACTION_CONTRACT_EXTENSION = {
  expectedCountsDelta: {"governable":6,"edge":4,"postgres":2,"ratewareApi":0},
  reviewedMetadataFingerprints: {
  "edge.steel-intake-api.cancel_spot_opportunity": "62c8ca211445f3e072030c007504ae97ab31e23e8ce5fb5611cce35835da74d2",
  "edge.steel-intake-api.get_spot_status": "62dbb5a2e5c2268503c96db15cbc60202d53a9f27539b51285bed8ff470502cf",
  "edge.steel-intake-api.list_carrier_directory": "3707522713be5040b532c4d49788ac8b48e58aa3f62639326d16ed9da44b2552",
  "edge.steel-intake-api.publish_spot_opportunity": "6dfe24e3a7411158c14cb5fee7d6af8bd63ace79da4d5e22b155fb710c24f9b4",
  "rpc.public.steel_intake_cancel_spot(text,text,text,text,text,text,uuid,text,uuid)": "658b076074f81fcae2d8d5036bfdfd0710f3e5a58709f2f7bb2c08910036266a",
  "rpc.public.steel_intake_publish_spot(text,text,text,text,text,text,jsonb,jsonb,text,jsonb,jsonb)": "9ea9d616fb730753cf8ea279cd8138f9a3407c340ca1f4e83cb117069a2f2d2d"
},
  reviewedAuthorizationFingerprints: {
  "edge.steel-intake-api.cancel_spot_opportunity": "df3caa0b7adabd26d3ad22c02368f466d2625ce9016b7d5078abaf606636a108",
  "edge.steel-intake-api.get_spot_status": "df3caa0b7adabd26d3ad22c02368f466d2625ce9016b7d5078abaf606636a108",
  "edge.steel-intake-api.list_carrier_directory": "df3caa0b7adabd26d3ad22c02368f466d2625ce9016b7d5078abaf606636a108",
  "edge.steel-intake-api.publish_spot_opportunity": "df3caa0b7adabd26d3ad22c02368f466d2625ce9016b7d5078abaf606636a108",
  "rpc.public.steel_intake_cancel_spot(text,text,text,text,text,text,uuid,text,uuid)": "e14762e111bf9660d562147b19e77112add6d0cc224406f804168ed50a8af7f2",
  "rpc.public.steel_intake_publish_spot(text,text,text,text,text,text,jsonb,jsonb,text,jsonb,jsonb)": "6690c7e0934dc9caf06735bce4a289383d470c28445353b369f9498d7df3fc80"
},
  surfaces
};
