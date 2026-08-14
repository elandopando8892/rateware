import { ACTION_CONTRACT } from '../supabase/functions/_shared/action-contract.mjs';
import { discoverGovernableSurfaces, repoRootFrom } from './action-contract-lib.mjs';

const repoRoot = repoRootFrom(process.cwd());
const discovered = discoverGovernableSurfaces(repoRoot);
const registered = new Map(ACTION_CONTRACT.surfaces.map((entry) => [entry.canonicalId, entry]));
const unregistered = discovered
  .filter((entry) => !registered.has(entry.canonicalId))
  .sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));

const fields = [
  'canonicalId',
  'actionName',
  'sourceKind',
  'sourceFile',
  'handler',
  'endpoint',
  'operation',
  'resource',
  'access',
  'exposure',
  'sensitivity',
  'tenantRelevance',
  'rpcSignature',
  'sourceFingerprint',
  'authorizationFingerprint',
];

console.log(`Governable surfaces: ${discovered.length}; registered: ${registered.size}; unregistered: ${unregistered.length}.`);
for (const entry of unregistered) {
  console.log(JSON.stringify(Object.fromEntries(fields.map((field) => [field, entry[field] ?? null]))));
}

if (unregistered.length) {
  console.error(`Authorization contract delta FAIL: ${unregistered.length} governable surface(s) require an explicit contract decision.`);
  process.exitCode = 1;
} else {
  console.log('Authorization contract delta PASS: no unregistered governable surfaces.');
}
