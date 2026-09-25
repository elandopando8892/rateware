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

const edgeSourceFile = 'supabase/functions/website-lead-intake/index.ts';
const edgeSourceFingerprint = '0d945965cf4802e07f5e9368454bf10d07c0648af9287091ea2989df9f5ad21f';
const edgeAuthorizationFingerprint = '7cc84d94832f577263629386e20d7c6fa000d149ca0dafaa7ab8984bc4e43737';
const edgeDependencies = [
  'supabase/functions/website-lead-intake/carrier-rate-sheet.ts',
  'supabase/functions/website-lead-intake/follow-up-token.ts',
  edgeSourceFile,
  'supabase/functions/website-lead-intake/notification-workflow.ts'
];
const edgeDefinitions = [
  ['record_quote_sent', 'POST /functions/v1/website-lead-intake signed quote follow-up', 'write', 'high'],
  ['submit_carrier_rate_sheet', 'POST /functions/v1/website-lead-intake signed carrier rate sheet', 'write', 'high'],
  ['submit_web_lead', 'POST /functions/v1/website-lead-intake signed website lead', 'write', 'high'],
  ['view_follow_up', 'POST /functions/v1/website-lead-intake signed follow-up view', 'read', 'medium']
];
const edgeSurfaces = edgeDefinitions.map(([actionName, endpoint, access, sensitivity]) => ({
  contractVersion: '1.3.0', canonicalId: `edge.website-lead-intake.${actionName}`,
  actionName, sourceKind: 'edge-method', sourceFile: edgeSourceFile,
  handler: 'Deno.serve', endpoint, businessModule: 'Commercial Operations',
  operation: access === 'read' ? 'read' : 'manage', resource: 'website-intake',
  access, exposure: 'external-tokenized', sensitivity,
  tenantRelevance: 'record-derived',
  proposedPermissionKey: `external.website-intake.${actionName}`,
  functionalOwner: 'Commercial Operations', decisionStatus: 'explicitly_allowed',
  lifecycle: 'active', replacementAction: null,
  sourceFingerprint: edgeSourceFingerprint,
  notes: 'Signed website-to-Edge request; public visitors do not receive the signing key.',
  analysisCoverage: 'shared-observed', dependencyFiles: edgeDependencies,
  rpcSignature: null, coverageSignals: ['shared_dependency_observed', 'external_dependency']
}));

const rpcSurfaces = definitions.map((item) => {
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
const surfaces = [...edgeSurfaces, ...rpcSurfaces];

export const WEBSITE_INTAKE_ACTION_CONTRACT_EXTENSION = {
  expectedCountsDelta: { governable: 6, edge: 4, postgres: 2, ratewareApi: 0 },
  reviewedMetadataFingerprints: {
    'edge.website-lead-intake.record_quote_sent': '091072b2fe8f91a72d450584d6e921fd777004a6fd027beb67bebfcd6dab4291',
    'edge.website-lead-intake.submit_carrier_rate_sheet': '6c375133094ce26ad3bbf625443cc7b0e4313cce6f624ea126b20d0911a38bfb',
    'edge.website-lead-intake.submit_web_lead': '54a80df7a5ee4f93ba7000a7236aacfaf34ad5d7fe2a60645c275272ade65409',
    'edge.website-lead-intake.view_follow_up': '1539dff8daeb0453050d92f8032b5fe75b3c6321b95117825d84faf7ae001251',
    'rpc.public.website_lead_intake_claim_notification(uuid,uuid)': 'a4c5d6af5ba6eacb46cad213266aab753acaf1eced5b78e5f9f3f4b282432f27',
    'rpc.public.website_lead_intake_record_notification(uuid,uuid,text,text,text,text)': '534137ef6046c9b4c5404fab525c18b99ef02ff57d17de038647faf56b719b88'
  },
  reviewedAuthorizationFingerprints: Object.fromEntries(
    surfaces.map((entry) => [entry.canonicalId,
      entry.canonicalId.startsWith('edge.') ? edgeAuthorizationFingerprint : entry.sourceFingerprint])
  ),
  surfaces
};
