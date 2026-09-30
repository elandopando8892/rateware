import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Build a disposable, read-only variant without changing Rateware's
// production action dispatcher or its authorization envelope.
const sourcePath = resolve(process.argv[2] || 'supabase/functions/rfx-bid-api/index.ts');
const outputPath = resolve(process.argv[3] || 'supabase/functions/rfx-bid-api-preview/index.ts');
if (sourcePath === outputPath) {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'In-place build is CI-only');
  assert.equal(process.env.RFX_PEEK_LOCAL_ONLY, '1', 'In-place build requires an isolated local gate');
}

const source = await readFile(sourcePath, 'utf8');
const sentinel = /    const supabase = getClient\(\);\r?\n    const body = await request\.json\(\)\.catch\(\(\) => \(\{\}\)\);/g;
assert.equal([...source.matchAll(sentinel)].length, 1, 'Action-dispatcher sentinel drifted; review the source before building Preview');
assert.ok(source.includes('Deno.serve(async (request) => {'), 'Expected Rateware Edge handler');
const guarded = `    const body = await request.json().catch(() => ({}));
    // Generated Preview: only a token-backed, non-mutating carrier lookup.
    // This guard executes before the service-role client is constructed.
    if (request.method !== "POST" || body.action !== "peek_invitation") {
      const response = jsonResponse({ error: "Preview permits invitation lookup only." }, 403);
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      return response;
    }
    const supabase = getClient();`;
const result = source.replace(sentinel, guarded.replaceAll('\n', source.includes('\r\n') ? '\r\n' : '\n'));
assert.ok(result.includes('body.action !== "peek_invitation"'), 'Read-only action guard missing');
await writeFile(outputPath, result, { flag: 'w' });
