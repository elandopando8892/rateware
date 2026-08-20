/**
 * Reviewed inventory entry for the isolated Freight Cost Model RateBook receiver.
 * The consequential write was explicitly approved for staging on 2026-08-20.
 */
const RECEIVE_FCM_RATEBOOK = {
  contractVersion: '1.3.0',
  canonicalId: 'edge.fcm-ratebook-receiver.receive_fcm_ratebook',
  actionName: 'receive_fcm_ratebook',
  sourceKind: 'edge-selector',
  sourceFile: 'supabase/functions/fcm-ratebook-receiver/index.ts',
  handler: 'receiveFcmRateBook',
  endpoint: 'POST /functions/v1/fcm-ratebook-receiver body.action',
  businessModule: 'Commercial',
  operation: 'receive',
  resource: 'ratebook',
  access: 'write',
  exposure: 'external-tokenized',
  sensitivity: 'critical',
  tenantRelevance: 'tenant-scoped',
  proposedPermissionKey: 'ratebook.receive',
  functionalOwner: 'Commercial',
  decisionStatus: 'explicitly_allowed',
  lifecycle: 'active',
  replacementAction: null,
  sourceFingerprint: 'b2d2ce281079df8f8f4e5870bcaf2c3b6dd235322ce973a1db8a3878e26e880d',
  analysisCoverage: 'shared-observed',
  dependencyFiles: [
    'supabase/functions/_shared/identity-contract.mjs',
    'supabase/functions/_shared/kinde.ts',
    'supabase/functions/_shared/runtime-identity.ts',
    'supabase/functions/_shared/workspace.ts',
    'supabase/functions/fcm-ratebook-receiver/index.ts'
  ],
  rpcSignature: null,
  coverageSignals: ['shared_dependency_observed', 'external_dependency']
};

export const FCM_RATEBOOK_ACTION_CONTRACT_EXTENSION = {
  contractVersion: '1.3.0',
  expectedCountsDelta: { governable: 1, edge: 1, postgres: 0, ratewareApi: 0 },
  reviewedMetadataFingerprints: {
    [RECEIVE_FCM_RATEBOOK.canonicalId]: '899502fd76694dd8a3a6103fee0dc6ec7e0df60c9b85f14ab47ced9cec779fa4'
  },
  reviewedAuthorizationFingerprints: {
    [RECEIVE_FCM_RATEBOOK.canonicalId]: '43f2b243c8362bdfe3c990df668a2dddd9155d7163631d2cc26b32f315a1a0f5'
  },
  surfaces: [RECEIVE_FCM_RATEBOOK]
};
