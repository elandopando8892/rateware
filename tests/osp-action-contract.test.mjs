import assert from 'node:assert/strict';
import {
  discoverGovernableInventory,
  metadataFingerprint,
  repoRootFrom,
} from '../tools/action-contract-lib.mjs';
import { ACTION_CONTRACT } from '../tools/effective-action-contract.mjs';

const root = repoRootFrom(process.cwd());
const inventory = discoverGovernableInventory(root);
const extensionIds = new Set(
  ACTION_CONTRACT.surfaces
    .filter((entry) =>
      entry.canonicalId.startsWith('edge.osp-') ||
      entry.canonicalId.startsWith('rpc.osp_private.') ||
      entry.canonicalId.startsWith('rpc.public.osp_custom_access_token_hook(')
    )
    .map((entry) => entry.canonicalId),
);
const discovered = inventory.surfaces.filter((entry) => extensionIds.has(entry.canonicalId));

assert.equal(
  inventory.candidates.filter((candidate) => String(candidate.functionName || '').startsWith('osp-')).length,
  0,
  'OSP Edge entrypoints must not remain unresolved',
);
assert.equal(extensionIds.size, 154, 'the OSP contract must contain the reviewed 154 surfaces');
assert.equal(discovered.length, 154, 'every reviewed OSP surface must still be discoverable');

for (const actual of discovered) {
  const surface = ACTION_CONTRACT.surfaces.find((entry) => entry.canonicalId === actual.canonicalId);
  assert.ok(surface, `${actual.canonicalId} must be registered`);
  assert.equal(surface.sourceFingerprint, actual.sourceFingerprint, `${actual.canonicalId} source changed`);
  assert.equal(
    ACTION_CONTRACT.reviewedAuthorizationFingerprints[actual.canonicalId],
    actual.authorizationFingerprint,
    `${actual.canonicalId} authorization envelope changed`,
  );
  assert.equal(
    ACTION_CONTRACT.reviewedMetadataFingerprints[actual.canonicalId],
    metadataFingerprint(surface),
    `${actual.canonicalId} metadata changed`,
  );
}

console.log('OSP action contract test passed: 154/154 surfaces are registered and fingerprinted.');
