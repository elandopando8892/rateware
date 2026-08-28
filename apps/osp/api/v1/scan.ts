import { join } from 'node:path';

import { createClamAvRunner, createScanHandler } from '../../server/scan-core.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error('INVALID_RUNTIME_CONFIGURATION');
  return value;
}

const root = process.env.OSP_CLAMAV_ROOT?.trim() || join(process.cwd(), 'api', '.clamav');
const handler = createScanHandler({
  token: required('OSP_MALWARE_SCANNER_TOKEN'),
  sourceOrigin: required('OSP_SCANNER_SOURCE_ORIGIN'),
  runScanner: createClamAvRunner({
    binary: join(root, 'bin', 'clamscan'),
    database: join(root, 'database'),
    libraryPath: join(root, 'lib'),
  }),
});

export const maxDuration = 60;
type NodeRequest = AsyncIterable<Uint8Array> & { method?: string; url?: string; headers: Record<string, string | string[] | undefined> };
type NodeResponse = { statusCode: number; setHeader(name: string, value: string): void; end(body?: Uint8Array): void };

export default async function nodeHandler(request: NodeRequest, response: NodeResponse): Promise<void> {
  const method = request.method ?? 'GET';
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) for (const item of value) headers.append(name, item);
    else if (typeof value === 'string') headers.set(name, value);
  }
  const chunks: Uint8Array[] = [];
  if (!['GET', 'HEAD'].includes(method)) for await (const chunk of request) chunks.push(chunk);
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const body = length > 0 ? Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))) : undefined;
  const webRequest = new Request(new URL(request.url ?? '/v1/scan', 'https://scanner.internal'), { method, headers, body });
  const result = await handler(webRequest);
  response.statusCode = result.status;
  result.headers.forEach((value, name) => response.setHeader(name, value));
  response.end(new Uint8Array(await result.arrayBuffer()));
}
