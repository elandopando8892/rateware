import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCAL_CONFIG, LOCAL_PROJECT_ID, prepareLocal } from '../tools/prepare-rateware-local.mjs';

test('bootstrap has distinct identity and keeps unconfigured services closed', () => {
  assert.equal(LOCAL_PROJECT_ID, 'rateware-carrier-local-v1');
  assert.doesNotMatch(LOCAL_CONFIG, /alqjqzqagdmcywpjtnnr|https:\/\/|env\(/);
  for (const section of ['db.migrations', 'db.seed', 'auth.external.google', 'edge_runtime']) {
    assert.ok(LOCAL_CONFIG.includes(`[${section}]\nenabled = false`));
  }
  assert.match(LOCAL_CONFIG, /skip_nonce_check = false/);
  assert.match(LOCAL_CONFIG, /port = 56431/);
  assert.match(LOCAL_CONFIG, /enable_signup = false/);
});

test('preparation copies only local config and refuses to overwrite existing state', () => {
  const root = mkdtempSync(join(tmpdir(), 'rateware-local-test-'));
  try {
    const result = prepareLocal(root);
    assert.equal(result.state, 'prepared-not-started');
    assert.equal(result.production_access, false);
    assert.deepEqual(readdirSync(join(result.target, 'supabase')), ['config.toml']);
    assert.equal(readFileSync(join(result.target, 'supabase', 'config.toml'), 'utf8'), LOCAL_CONFIG);
    assert.throws(() => prepareLocal(root), /already exists/);
  } finally {
    // Exact temporary directory returned by mkdtemp; no user data.
    rmSync(root, { recursive: true });
  }
});
