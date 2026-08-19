import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Orphaned shared modules are the most repeated defect in this codebase: a module is
// written, tested, and never imported by anything that runs, so it passes CI forever
// while doing nothing. It has been found and fixed one module at a time, seven times.
// This test finds them as a class.
//
// A module may be unreachable -- some deliberately are -- but it must SAY so here, with
// a reason. The list is the point: an unwired module becomes a decision someone made
// rather than something nobody noticed.

const root = fileURLToPath(new URL('../', import.meta.url));
const SHARED = 'supabase/functions/_shared/';

/**
 * Modules with no runtime importer, and why. Removing an entry means the module must be
 * reachable; adding one means someone decided it should not be, in writing.
 */
const DELIBERATELY_UNREACHABLE = new Map([
  ['provider-onboarding-form-assembly.ts',
   'Reaches document assembly and consumes signature consent. Stays unreachable until a form template and field mappings exist for a real program.'],
  ['provider-onboarding-gmail-delivery.ts',
   'Queueing and sending reach Gmail. Draft/approve are internal but the module is wired as a unit, so it stays out until sending is deliberately enabled.'],
  ['provider-onboarding-form-extraction.mjs',
   'Reads a counterparty form and maps its questions onto our facts. No counterparty form is held yet, so there is nothing to point it at.'],
  ['provider-onboarding-assembler.mjs',
   'The concrete assembler implementation behind provider-onboarding-form-assembly.ts; unreachable for the same reason.'],
  ['provider-onboarding-document-request.mjs',
   'Answers what a counterparty asked for against what the vault holds. Needs an operator read surface to call it; none exists yet.'],
  ['provider-entity-operator-attested-scanner.mjs',
   'Records an operator attestation in place of a machine malware scan. Unreachable until the attestation surface exists.'],
  ['provider-entity-import-commit.mjs',
   'Entry point is tools/import-entity-vault.mjs, an operator-run importer rather than an edge function.'],
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(path, out);
    else if (/\.(ts|mjs|js)$/.test(entry.name)) out.push(path);
  }
  return out;
}

const runtimeFiles = walk(`${root}supabase/functions`);
const toolFiles = walk(`${root}tools`);
const sharedModules = readdirSync(`${root}${SHARED}`)
  .filter((name) => /^provider-.*\.(ts|mjs)$/.test(name))
  .filter((name) => statSync(`${root}${SHARED}${name}`).isFile());

const sources = [...runtimeFiles, ...toolFiles].map((path) => ({
  path: path.slice(root.length).replace(/\\/g, '/'),
  text: readFileSync(path, 'utf8'),
}));

function importersOf(moduleName) {
  const pattern = new RegExp(`['"\\./]${moduleName.replace('.', '\\.')}['"]`);
  return sources.filter((file) => !file.path.endsWith(`/${moduleName}`) && pattern.test(file.text));
}

test('every shared provider module is reachable, or is listed as deliberately not', () => {
  const unexplained = [];
  for (const moduleName of sharedModules) {
    const runtimeImporters = importersOf(moduleName).filter((file) => file.path.startsWith('supabase/functions/'));
    if (runtimeImporters.length) continue;
    if (DELIBERATELY_UNREACHABLE.has(moduleName)) continue;
    unexplained.push(moduleName);
  }
  assert.deepEqual(unexplained, [],
    `unreachable and unexplained -- wire it, or add it to DELIBERATELY_UNREACHABLE with a reason:\n  ${unexplained.join('\n  ')}`);
});

test('the unreachable list has no stale entries', () => {
  // A module that was wired but left on the list makes the list untrustworthy, and the
  // next person reads it as "these are all intentional" without checking.
  const nowReachable = [];
  for (const moduleName of DELIBERATELY_UNREACHABLE.keys()) {
    if (!sharedModules.includes(moduleName)) {
      nowReachable.push(`${moduleName} (no longer exists)`);
      continue;
    }
    const runtimeImporters = importersOf(moduleName).filter((file) => file.path.startsWith('supabase/functions/'));
    if (runtimeImporters.length) nowReachable.push(`${moduleName} (now imported by ${runtimeImporters[0].path})`);
  }
  assert.deepEqual(nowReachable, [], `remove from DELIBERATELY_UNREACHABLE:\n  ${nowReachable.join('\n  ')}`);
});

test('every listed exception carries a real reason', () => {
  for (const [moduleName, reason] of DELIBERATELY_UNREACHABLE) {
    assert.ok(reason.length >= 40, `${moduleName}: the reason must explain why, not just assert it`);
  }
});

test('readiness is reachable, because reconcile cannot create its own input', () => {
  // The evaluation this produces is a required input to reconcileProviderOnboardingCase,
  // which takes readiness_evaluation_id and does not compute it. With readiness
  // unreachable, no evaluation could be produced by anything that runs in production.
  const dispatch = readFileSync(`${root}supabase/functions/shipper-directory-api/provider-service.ts`, 'utf8');
  assert.match(dispatch, /import \{ evaluateProviderOnboardingReadiness \} from "\.\.\/_shared\/provider-onboarding-readiness\.ts";/);
  assert.match(dispatch, /\["evaluate_provider_onboarding_readiness", evaluateProviderOnboardingReadiness\]/);
  assert.match(dispatch, /"evaluate_provider_onboarding_readiness",/);
});

test('the check actually sees the modules it claims to check', () => {
  // A glob that silently matched nothing would make every assertion above vacuous.
  assert.ok(sharedModules.length >= 20, `only found ${sharedModules.length} shared modules`);
  assert.ok(sources.length >= 30, `only found ${sources.length} source files`);
  assert.ok(sharedModules.includes('provider-agent-intake.ts'));
  // And a module known to be wired must be seen as wired.
  assert.ok(importersOf('provider-agent-classifier.mjs').some((file) => file.path.startsWith('supabase/functions/')));
});
