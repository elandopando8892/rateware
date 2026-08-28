import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const MAX_BYTES = 26_214_400;
const SHA = /^[0-9a-f]{64}$/;
const TOKEN = /^[\x21-\x7e]{16,2048}$/;

type ScanStatus = 'clean' | 'infected';
type RunScanner = (file: string) => Promise<ScanStatus>;

function fixedTokenEqual(left: string, right: string): boolean {
  if (!TOKEN.test(left) || !TOKEN.test(right)) return false;
  const actual = Buffer.from(left);
  const expected = Buffer.from(right);
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

function sourceUrl(value: unknown, allowedOrigin: string): URL {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('INVALID_SOURCE');
  const parsed = new URL(value);
  if (parsed.origin !== allowedOrigin || parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash ||
      !parsed.pathname.startsWith('/storage/v1/object/sign/osp-corporate-documents/') || !parsed.searchParams.has('token')) throw new Error('INVALID_SOURCE');
  return parsed;
}

async function exactBody(request: Request): Promise<{ sourceUrl: string; sourceSha256: string; sizeBytes: number }> {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw new Error('INVALID_REQUEST');
  const text = await request.text();
  if (text.length < 2 || text.length > 8192) throw new Error('INVALID_REQUEST');
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).sort().join('\0') !== 'sizeBytes\0sourceSha256\0sourceUrl') throw new Error('INVALID_REQUEST');
  const input = parsed as Record<string, unknown>;
  if (typeof input.sourceUrl !== 'string' || typeof input.sourceSha256 !== 'string' || !SHA.test(input.sourceSha256) ||
      !Number.isSafeInteger(input.sizeBytes) || Number(input.sizeBytes) < 1 || Number(input.sizeBytes) > MAX_BYTES) throw new Error('INVALID_REQUEST');
  return input as { sourceUrl: string; sourceSha256: string; sizeBytes: number };
}

async function download(fetchImplementation: typeof fetch, url: URL, expectedBytes: number, expectedSha256: string): Promise<Uint8Array> {
  const response = await fetchImplementation(url, { redirect: 'error', signal: AbortSignal.timeout(25_000) });
  if (response.status !== 200 || response.body === null) throw new Error('SOURCE_UNAVAILABLE');
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) !== expectedBytes)) throw new Error('SOURCE_INTEGRITY');
  const reader = response.body.getReader();
  const bytes = new Uint8Array(expectedBytes);
  let offset = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (offset + value.byteLength > expectedBytes) throw new Error('SOURCE_INTEGRITY');
    bytes.set(value, offset);
    offset += value.byteLength;
  }
  if (offset !== expectedBytes || createHash('sha256').update(bytes).digest('hex') !== expectedSha256) throw new Error('SOURCE_INTEGRITY');
  return bytes;
}

export function createClamAvRunner(options: { binary: string; database: string; certificates: string; libraryPath: string }): RunScanner {
  return async (file: string) => await new Promise<ScanStatus>((resolve, reject) => {
    const child = spawn(options.binary, [
      `--database=${options.database}`, `--cvdcertsdir=${options.certificates}`, '--no-summary', '--infected', '--max-filesize=25M', '--max-scansize=25M',
      '--max-recursion=20', '--max-files=1000', file,
    ], { env: { ...process.env, LD_LIBRARY_PATH: options.libraryPath, CVD_CERTS_DIR: options.certificates }, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { if (stderr.length < 4096) stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve('clean');
      else if (code === 1) resolve('infected');
      else reject(new Error(`CLAMAV_EXIT_${String(code)}:${stderr.slice(0, 256)}`));
    });
  });
}

export function createScanHandler(options: {
  token: string;
  sourceOrigin: string;
  fetch?: typeof fetch;
  runScanner: RunScanner;
}): (request: Request) => Promise<Response> {
  if (!TOKEN.test(options.token)) throw new Error('INVALID_RUNTIME_CONFIGURATION');
  const allowedOrigin = new URL(options.sourceOrigin).origin;
  if (allowedOrigin !== options.sourceOrigin || !allowedOrigin.startsWith('https://')) throw new Error('INVALID_RUNTIME_CONFIGURATION');
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  return async (request: Request): Promise<Response> => {
    const authorization = request.headers.get('authorization');
    if (request.method !== 'POST' || !authorization?.startsWith('Bearer ') || !fixedTokenEqual(authorization.slice(7), options.token)) return json({ error: 'not_found' }, 404);
    let work = '';
    try {
      const input = await exactBody(request);
      const url = sourceUrl(input.sourceUrl, allowedOrigin);
      const bytes = await download(fetchImplementation, url, input.sizeBytes, input.sourceSha256);
      work = await mkdtemp(join(tmpdir(), 'osp-scan-'));
      const file = join(work, randomUUID());
      await writeFile(file, bytes, { mode: 0o600, flag: 'wx' });
      await chmod(file, 0o600);
      const status = await options.runScanner(file);
      return json({ sha256: input.sourceSha256, status }, 200);
    } catch (error) {
      console.error('OSP_SCANNER_FAILURE', error instanceof Error ? error.message.slice(0, 512) : 'UNKNOWN');
      return json({ error: 'scan_unavailable' }, 503);
    } finally {
      if (work) await rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
  };
}
