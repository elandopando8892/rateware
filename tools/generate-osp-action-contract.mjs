import { discoverGovernableInventory, metadataFingerprint, repoRootFrom } from './action-contract-lib.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const root = repoRootFrom(process.cwd());
const inventory = discoverGovernableInventory(root);
if (inventory.candidates.some((candidate) => String(candidate.functionName || '').startsWith('osp-'))) {
  throw new Error('OSP discovery still contains unresolved entrypoint candidates.');
}

const osp = inventory.surfaces.filter((entry) =>
  entry.canonicalId.startsWith('edge.osp-') ||
  entry.canonicalId.startsWith('rpc.osp_private.') ||
  entry.canonicalId.startsWith('rpc.public.osp_custom_access_token_hook(')
);
if (osp.length !== 155) throw new Error(`Expected 155 OSP surfaces, discovered ${osp.length}.`);

function resource(entry) {
  if (entry.canonicalId.startsWith('rpc.')) return 'osp-workflow-database';
  return entry.canonicalId.split('.')[1];
}

function isRead(entry) {
  return /^(?:get_|list_|preview_|normalize_|request_knowledge_candidates$|request_knowledge_reuse_policy$|provider_gmail_status$)/.test(entry.actionName) ||
    /(?:^|\.)(?:assert_|valid_|validate_|canonical_|compute_|load_|resolve_|request_knowledge_reuse_policy$|xlsx_column_number|sha256_)/.test(entry.actionName) ||
    /(?:_hash(?:es)?|_sha256|_is_|_are_)/.test(entry.actionName);
}

const definitions = osp.map((actual) => {
  const read = isRead(actual);
  const internal = actual.exposureHint === 'internal/service-role';
  const surface = {
    canonicalId: actual.canonicalId,
    actionName: actual.actionName,
    sourceKind: actual.sourceKind,
    sourceFile: actual.sourceFile,
    handler: actual.handler,
    endpoint: actual.endpoint,
    businessModule: 'OSP Customer Setup',
    operation: read ? 'read' : 'execute',
    resource: resource(actual),
    access: read ? 'read' : 'write',
    exposure: actual.exposureHint,
    sensitivity: read ? 'high' : 'critical',
    tenantRelevance: internal ? 'record-derived' : 'tenant-scoped',
    proposedPermissionKey: `osp.${resource(actual).replace(/^osp-/, '').replaceAll('-', '.')}.${actual.actionName}.${read ? 'read' : 'write'}`,
    functionalOwner: 'XBF Operations',
    decisionStatus: internal ? 'internal_only' : 'explicitly_allowed',
    lifecycle: 'active',
    replacementAction: null,
    sourceFingerprint: actual.sourceFingerprint,
    analysisCoverage: actual.analysisCoverage,
    coverageSignals: actual.coverageSignals || [],
    rpcSignature: actual.rpcSignature || null,
    dependencyFiles: actual.dependencyFiles || [actual.sourceFile],
    notes: internal
      ? 'Internal OSP runtime or database surface; no direct browser authority.'
      : 'Authenticated OSP human workflow; consequential effects remain separately gated.',
  };
  return {
    surface,
    metadataFingerprint: metadataFingerprint({ ...surface, contractVersion: '1.3.0' }),
    authorizationFingerprint: actual.authorizationFingerprint,
  };
});

const serialized = JSON.stringify(definitions, null, 2);
const output = `/**\n * Generated static OSP Customer Setup action-contract extension.\n * Regenerate only after deliberate review of every discovered OSP surface.\n */\nconst contractVersion = '1.3.0';\nconst DEFINITIONS = ${serialized};\n\nconst surfaces = DEFINITIONS.map(({ surface }) => ({ ...surface, contractVersion }));\n\nexport const OSP_CUSTOMER_SETUP_ACTION_CONTRACT_EXTENSION = {\n  contractVersion,\n  expectedCountsDelta: { governable: 155, edge: 50, postgres: 105, ratewareApi: 0 },\n  reviewedMetadataFingerprints: Object.fromEntries(DEFINITIONS.map((entry) => [entry.surface.canonicalId, entry.metadataFingerprint])),\n  reviewedAuthorizationFingerprints: Object.fromEntries(DEFINITIONS.map((entry) => [entry.surface.canonicalId, entry.authorizationFingerprint])),\n  surfaces,\n};\n`;
const outputIndex = process.argv.indexOf('--output');
const checkIndex = process.argv.indexOf('--check');
if (checkIndex >= 0) {
  const checkPath = process.argv[checkIndex + 1];
  if (!checkPath) throw new Error('--check requires a path.');
  const committed = readFileSync(checkPath, 'utf8');
  if (committed !== output) {
    throw new Error(`Generated OSP action contract is stale: ${checkPath}`);
  }
  process.stdout.write(`OSP action contract is current: ${checkPath}\n`);
} else if (outputIndex >= 0) {
  const outputPath = process.argv[outputIndex + 1];
  if (!outputPath) throw new Error('--output requires a path.');
  writeFileSync(outputPath, output, 'utf8');
} else {
  process.stdout.write(output);
}
