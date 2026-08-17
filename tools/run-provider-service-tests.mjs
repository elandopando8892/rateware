// Runs every provider-service and provider-onboarding suite.
// These suites existed since Build 1 but were never wired into `npm test`, so CI
// never gated on them. This runner closes that gap; it discovers suites by glob so
// a new build's tests are picked up without editing package.json.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const testsDir = fileURLToPath(new URL('../tests/', import.meta.url));
const suites = readdirSync(testsDir)
  .filter((name) => /^provider-.*\.test\.mjs$/.test(name))
  .sort();

if (!suites.length) {
  console.error('No provider-service suites were discovered.');
  process.exit(1);
}

const failed = [];
for (const suite of suites) {
  const result = spawnSync(process.execPath, ['--test', path.join(testsDir, suite)], { stdio: 'inherit' });
  if (result.status !== 0) failed.push(suite);
}

console.log(`\nprovider-service suites: ${suites.length - failed.length}/${suites.length} passed`);
if (failed.length) {
  for (const suite of failed) console.error(`FAIL ${suite}`);
  process.exit(1);
}
