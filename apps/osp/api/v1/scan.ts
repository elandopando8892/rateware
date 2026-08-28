import { join } from 'node:path';

import { createClamAvRunner, createScanHandler } from './scan-core.js';

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
export default handler;
