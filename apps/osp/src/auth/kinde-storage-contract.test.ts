import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const kindeEsmPath = resolve(
  process.cwd(),
  'node_modules/@kinde-oss/kinde-auth-pkce-js/dist/kinde-auth-pkce-js.esm.js',
);

test('patched Kinde runtime does not select localStorage solely because the hostname is localhost', () => {
  // This is a precise installed-dist contract: Kinde's storage selection is internal and coupled to redirect/
  // refresh setup, while this exact expression controls both the refresh-token adapter and tab sync below it.
  const source = readFileSync(kindeEsmPath, 'utf8');

  expect(source).toContain('const isUseLocalStorage = Boolean(is_dangerously_use_local_storage);');
  expect(source).not.toContain('const isUseLocalStorage = isDevelopment || is_dangerously_use_local_storage;');
});
