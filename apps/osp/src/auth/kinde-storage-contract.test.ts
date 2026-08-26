import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const esmPath = resolve(
  process.cwd(),
  'node_modules/@kinde-oss/kinde-auth-pkce-js/dist/kinde-auth-pkce-js.esm.js',
);

describe('patched Kinde browser storage contract', () => {
  it('makes development Local Storage token persistence opt-in only', async () => {
    const esm = await readFile(esmPath, 'utf8');

    expect(esm).toContain('const isUseLocalStorage = is_dangerously_use_local_storage;');
    expect(esm).not.toContain(
      'const isUseLocalStorage = isDevelopment || is_dangerously_use_local_storage;',
    );
  });

  it('never serializes token-sync messages through Local Storage', async () => {
    const esm = await readFile(esmPath, 'utf8');

    expect(esm).not.toContain('LS_SYNC_KEY');
    expect(esm).not.toContain('kinde_token_sync');
    expect(esm).not.toContain("window.addEventListener('storage'");
    expect(esm).not.toContain("window.removeEventListener('storage'");
  });

  it('retains PKCE session state and non-token refresh-lock metadata', async () => {
    const esm = await readFile(esmPath, 'utf8');

    expect(esm).toContain('sessionStorage.setItem(key, id);');
    expect(esm).toContain("const LS_LOCK_KEY = 'kinde_refresh_lock';");
    expect(esm).toContain('localStorage.setItem(LS_LOCK_KEY');
  });
});
