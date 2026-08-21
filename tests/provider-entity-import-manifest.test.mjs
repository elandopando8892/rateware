import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

test('the Phase 1 importer manifest does not require a signature asset', () => {
  const output = execFileSync(process.execPath, ['tools/import-entity-vault.mjs', '--manifest'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const entries = output.split(/\r?\n/).filter((line) => line.startsWith('  '));

  assert.equal(entries.length, 12, 'Phase 1 provisions exactly its twelve non-signature documents');
  assert.equal(entries.some((line) => /\bfirma\b|signature|specimen/i.test(line)), false);
});
