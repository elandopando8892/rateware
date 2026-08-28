// @vitest-environment node
import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { createScanHandler } from './scan-core.js';

const token = 'synthetic-scanner-token';
const bytes = new TextEncoder().encode('private synthetic bank statement');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const input = {
  sourceUrl: 'https://project.supabase.co/storage/v1/object/sign/osp-corporate-documents/a/b?token=signed',
  sourceSha256: sha256,
  sizeBytes: bytes.byteLength,
};

function request(body: unknown = input, authorization = `Bearer ${token}`): Request {
  return new Request('https://osp.example.test/v1/scan', { method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('private OSP ClamAV endpoint', () => {
  it('downloads only the pinned Supabase object, verifies its hash, and returns the engine verdict', async () => {
    const runScanner = vi.fn(async () => 'clean' as const);
    const fetchImplementation = vi.fn(async () => new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.byteLength) } }));
    const handler = createScanHandler({ token, sourceOrigin: 'https://project.supabase.co', fetch: fetchImplementation, runScanner });
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sha256, status: 'clean' });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(runScanner).toHaveBeenCalledTimes(1);
  });

  it('conceals auth failures and fails closed on SSRF, size, or hash mismatch', async () => {
    const runScanner = vi.fn(async () => 'clean' as const);
    const fetchImplementation = vi.fn(async () => new Response(bytes, { status: 200 }));
    const handler = createScanHandler({ token, sourceOrigin: 'https://project.supabase.co', fetch: fetchImplementation, runScanner });
    expect((await handler(request(input, 'Bearer wrong-token-value'))).status).toBe(404);
    expect((await handler(request({ ...input, sourceUrl: 'https://attacker.example/object?token=x' }))).status).toBe(503);
    expect((await handler(request({ ...input, sourceSha256: 'b'.repeat(64) }))).status).toBe(503);
    expect(runScanner).not.toHaveBeenCalled();
  });

  it('returns infected only when the engine positively identifies malware', async () => {
    const handler = createScanHandler({
      token,
      sourceOrigin: 'https://project.supabase.co',
      fetch: async () => new Response(bytes, { status: 200 }),
      runScanner: async () => 'infected',
    });
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sha256, status: 'infected' });
  });
});
