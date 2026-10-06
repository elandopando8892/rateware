import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverGovernableSurfaces, validateActionContract } from '../tools/action-contract-lib.mjs';
import { ACTION_CONTRACT } from '../tools/effective-action-contract.mjs';
import { SPOT_CONVERSION_ACTION_CONTRACT_EXTENSION as extension } from '../supabase/functions/_shared/action-contract-spot-conversion.mjs';

test('Spot action inventory: HTTP write/read and internal RPC have reviewed, current contracts', () => {
  const ids = new Set(extension.surfaces.map(s => s.canonicalId));
  const actual = discoverGovernableSurfaces(process.cwd()).filter(s => ids.has(s.canonicalId));
  const contract = { ...ACTION_CONTRACT, surfaces: ACTION_CONTRACT.surfaces.filter(s => ids.has(s.canonicalId)),
    nonGovernableDeclarations: [], expectedCounts: { governable: 3, edge: 2, postgres: 1, ratewareApi: 0 } };
  assert.equal(actual.length, 3);
  const result = validateActionContract(contract, actual, { repoRoot: process.cwd() });
  assert.deepEqual(result.issues.filter(i => i.level === 'error'), []);
  assert.equal(contract.surfaces.find(s => s.actionName === 'convert_spot_request_to_quote').access, 'write');
  assert.equal(contract.surfaces.find(s => s.actionName === 'list_spot_request_quotes').access, 'read');
  assert.equal(contract.surfaces.find(s => s.sourceKind === 'postgres-function').exposure, 'internal/service-role');
});
