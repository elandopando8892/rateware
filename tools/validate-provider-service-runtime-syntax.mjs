import { readFile, readdir } from 'node:fs/promises';
import { parse } from '@babel/parser';

const srcEntries = await readdir(new URL('../src/', import.meta.url));
const providerBrowserFiles = srcEntries
  .filter((name) => /^provider-service-.*\.js$/.test(name))
  .map((name) => `src/${name}`);

const files = [
  ...providerBrowserFiles,
  'src/vendor-service.js',
  'supabase/functions/shipper-directory-api/index.ts',
  'supabase/functions/shipper-directory-api/provider-service.ts',
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
