/** Reviewed service-role-only RPC surfaces for the signed website intake. */
const definitions = [
  {
    actionName: 'public.website_lead_intake_claim_notification',
    rpcSignature: 'uuid,uuid',
    sourceFile: 'supabase/migrations/20260923170515_website_lead_claim_outcome.sql',
    sourceFingerprint: '8705106f273521c5caf88bc33949b12c524cc49d5971427eac1b125d76bceff7',
    operation: 'manage',
    notes: 'Service-role-only atomic notification claim; direct browser execution is revoked.'
  },
  {
    actionName: 'public.website_lead_intake_record_notification',
    rpcSignature: 'uuid,uuid,text,text,text,text',
    sourceFile: 'supabase/migrations/20260912010000_website_lead_intake_notification_claim.sql',
    sourceFingerprint: '7c9cf0dd582b41c3daca3e669cc064a108862fac6267df279a542f274f85af54',
    operation: 'manage',
    notes: 'Service-role-only claim reconciliation; claim token binds one delivery attempt.'
  }
];

const surfaces = definitions.map((item) => {
  const canonicalId = `rpc.${item.actionName}(${item.rpcSignature})`;
  const handler = `${item.actionName}(${item.rpcSignature})`;
  return {
    contractVersion: '1.3.0', canonicalId, actionName: item.actionName,
    sourceKind: 'postgres-function', sourceFile: item.sourceFile, handler,
    endpoint: `PostgreSQL function / PostgREST RPC surface ${handler}`,
    businessModule: 'Commercial Operations', operation: item.operation,
    resource: 'website-lead-notification', access: 'write',
    exposure: 'internal/service-role', sensitivity: 'high',
    tenantRelevance: 'record-derived',
    proposedPermissionKey: `internal.rpc.${item.actionName.replace(/^public\./, '')}`,
    functionalOwner: 'Commercial Operations', decisionStatus: 'internal_only',
    lifecycle: 'active', replacementAction: null,
    sourceFingerprint: item.sourceFingerprint, notes: item.notes,
    analysisCoverage: 'direct', dependencyFiles: [item.sourceFile],
    rpcSignature: item.rpcSignature, coverageSignals: ['direct']
  };
});

export const WEBSITE_INTAKE_ACTION_CONTRACT_EXTENSION = {
  expectedCountsDelta: { governable: 2, edge: 0, postgres: 2, ratewareApi: 0 },
  reviewedMetadataFingerprints: {
    'rpc.public.website_lead_intake_claim_notification(uuid,uuid)': 'a4c5d6af5ba6eacb46cad213266aab753acaf1eced5b78e5f9f3f4b282432f27',
    'rpc.public.website_lead_intake_record_notification(uuid,uuid,text,text,text,text)': '534137ef6046c9b4c5404fab525c18b99ef02ff57d17de038647faf56b719b88'
  },
  reviewedAuthorizationFingerprints: Object.fromEntries(
    surfaces.map((entry) => [entry.canonicalId, entry.sourceFingerprint])
  ),
  surfaces
};
