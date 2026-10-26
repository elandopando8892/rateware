// Local reviewed candidate. Registers only this cut, not unrelated baseline drift.
// These hashes are review evidence, never runtime authorization or release approval.
const migration='supabase/migrations/20261008180000_rfx_rfi_link_atomic.sql';
const sqlSurface=(name,signature,hash,permission)=>({
  contractVersion:'1.3.0',canonicalId:`rpc.public.${name}(${signature})`,
  actionName:`public.${name}`,sourceKind:'postgres-function',sourceFile:migration,
  handler:`public.${name}(${signature})`,endpoint:`PostgreSQL function / PostgREST RPC surface public.${name}(${signature})`,
  businessModule:'Commercial',operation:'manage',resource:'rfx_rfi_link',access:'write',
  exposure:'internal/service-role',sensitivity:'high',tenantRelevance:'tenant-scoped',
  proposedPermissionKey:permission,functionalOwner:'Commercial',decisionStatus:'internal_only',
  lifecycle:'active',replacementAction:null,sourceFingerprint:hash,analysisCoverage:'direct',
  coverageSignals:['direct'],dependencyFiles:[migration],rpcSignature:signature,
  notes:'Local only: authenticated receiver verifies workspace and sealed Radar receipts; SQL preserves the original source/link. No email or publication.',
});
export const RADAR_RFI_LINK_ACTION_CONTRACT_EXTENSION={
  expectedCountsDelta:{governable:2,postgres:2},
  reviewedMetadataFingerprints:{
    'rpc.public.guard_rfx_radar_origin()':'571db5c6fe61de95e8d9627bbdefb1e1294dc730fc64d487eecdec21dcfb4cf1',
    'rpc.public.issue_rfx_rfi_link_once(uuid,text,text,text,text,integer,jsonb)':'bde54768b07c02d5be4adf14e970a2e42d042b68e1dc70e44d7deb4bb767c35f',
  },
  reviewedAuthorizationFingerprints:{
    // E3 local review: optional predecessor selects a separate sealed Radar job.
    // Owner, operation, project and all three receipt checks remain mandatory.
    // Integrated on main ae0dbfeb; production deploy preserves all other v718 sources.
    'edge.rateware-api.create_rfx_rfi_magic_link':"8bc3740f9107aa7a90e389b1e31ce471bec9023dd3375218467fd98eb21a3c26",
    'rpc.public.guard_rfx_radar_origin()':'c854cdd7a0d443a6ecdcc80dba945600356b62b872293f2a43754b99d97f716e',
    'rpc.public.issue_rfx_rfi_link_once(uuid,text,text,text,text,integer,jsonb)':'42e2ebe98c7f75a11137276e8815fec0c447d9921067009719ab3cd6e7ffa8b6',
  },
  surfaces:[
    sqlSurface('guard_rfx_radar_origin','','c854cdd7a0d443a6ecdcc80dba945600356b62b872293f2a43754b99d97f716e','rfx_rfi_link.origin_guard'),
    sqlSurface('issue_rfx_rfi_link_once','uuid,text,text,text,text,integer,jsonb','42e2ebe98c7f75a11137276e8815fec0c447d9921067009719ab3cd6e7ffa8b6','rfx_rfi_link.issue_internal'),
  ],
};

