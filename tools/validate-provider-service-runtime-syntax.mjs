import { readFile, readdir } from 'node:fs/promises';
import { parse } from '@babel/parser';

const srcEntries = await readdir(new URL('../src/', import.meta.url));
const providerBrowserFiles = srcEntries
  .filter((name) => /^provider-(?:service|communications|gmail|onboarding)-.*\.js$/.test(name))
  .map((name) => `src/${name}`);

const files = [
  ...providerBrowserFiles,
  'src/vendor-service.js',
  'src/provider-document-review-domain.js',
  'src/provider-document-review-page.js',
  'supabase/functions/_shared/provider-gmail.ts',
  'supabase/functions/_shared/provider-entity-upload.ts',
  'supabase/functions/_shared/provider-entity-document-processor.ts',
  'supabase/functions/_shared/provider-entity-review-commands.ts',
  'supabase/functions/_shared/provider-entity-fact-promotion.ts',
  'supabase/functions/_shared/provider-onboarding-readiness.ts',
  'supabase/functions/_shared/provider-onboarding-case-workflow.ts',
  'supabase/functions/_shared/provider-onboarding-release-package.ts',
  'supabase/functions/_shared/provider-onboarding-requirement-waiver.mjs',
  'supabase/functions/_shared/provider-onboarding-taxpayer-classification.mjs',
  'supabase/functions/_shared/action-contract-osp.mjs',
  'supabase/functions/_shared/provider-onboarding-waiver-commands.ts',
  'supabase/functions/_shared/provider-onboarding-form-assembly.ts',
  'supabase/functions/_shared/provider-onboarding-gmail-delivery.ts',
  'supabase/functions/_shared/provider-gmail-sync.ts',
  'supabase/functions/_shared/provider-agent-resolution.mjs',
  'supabase/functions/_shared/provider-agent-thread-resolution.ts',
  'supabase/functions/_shared/provider-agent-classifier.mjs',
  'supabase/functions/_shared/provider-agent-directive.mjs',
  'supabase/functions/_shared/provider-agent-intake.ts',
  'supabase/functions/_shared/provider-onboarding-ontology.mjs',
  'supabase/functions/_shared/provider-onboarding-form-adapters.mjs',
  'supabase/functions/_shared/provider-onboarding-assembler.mjs',
  'supabase/functions/_shared/provider-onboarding-form-extraction.mjs',
  'supabase/functions/_shared/provider-entity-import.mjs',
  'supabase/functions/_shared/provider-entity-import-commit.mjs',
  'supabase/functions/_shared/provider-pubsub-auth.ts',
  'supabase/functions/provider-gmail-intake-api/index.ts',
  'supabase/functions/provider-gmail-oauth-callback/index.ts',
  'supabase/functions/provider-gmail-push/index.ts',
  'supabase/functions/shipper-directory-api/index.ts',
  'supabase/functions/provider-onboarding-api/index.ts',
  'supabase/functions/provider-onboarding-api/provider-service.ts',
];

for (const path of files) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const isTypeScript = path.endsWith('.ts');
  try {
    parse(source, {
      sourceType: 'module',
      allowAwaitOutsideFunction: false,
      plugins: isTypeScript ? ['typescript', 'importAttributes'] : ['importAttributes'],
    });
  } catch (error) {
    const location = error?.loc ? `${error.loc.line}:${error.loc.column}` : 'unknown location';
    throw new Error(`${path} failed syntax validation at ${location}: ${error?.message || error}`);
  }
}

console.log(`Provider Service runtime syntax PASS: ${files.length} files.`);
