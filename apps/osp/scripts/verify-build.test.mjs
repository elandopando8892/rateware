import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const verifierSource = fileURLToPath(new URL('./verify-build.mjs', import.meta.url));
const packageNodeModules = resolve(dirname(verifierSource), '..', 'node_modules');
const tempBase = await realpath(tmpdir());

const validScript = '<script type="module" src="/app/assets/app.js"></script>';
const validStylesheet = '<link rel="stylesheet" href="/app/assets/app.css">';

async function withFixture(html, run) {
  const fixtureRoot = await mkdtemp(join(tempBase, 'osp-verify-build-'));
  const appRoot = join(fixtureRoot, 'app');
  const scriptsRoot = join(appRoot, 'scripts');
  const assetsRoot = join(appRoot, 'dist', 'app', 'assets');

  try {
    await mkdir(scriptsRoot, { recursive: true });
    await mkdir(assetsRoot, { recursive: true });
    await symlink(packageNodeModules, join(appRoot, 'node_modules'), 'junction');
    await copyFile(verifierSource, join(scriptsRoot, 'verify-build.mjs'));
    await writeFile(join(appRoot, 'dist', 'app', 'index.html'), html, 'utf8');
    await writeFile(join(assetsRoot, 'app.js'), 'console.log("safe build");', 'utf8');
    await writeFile(join(assetsRoot, 'app.css'), 'body { color: #123456; }', 'utf8');
    await run({ fixtureRoot, appRoot, assetsRoot });
  } finally {
    const resolvedFixture = resolve(fixtureRoot);
    assert.equal(dirname(resolvedFixture), resolve(tempBase));
    assert.match(basename(resolvedFixture), /^osp-verify-build-/);
    await rm(resolvedFixture, { recursive: true, force: false });
  }
}

async function runVerifier(appRoot) {
  try {
    const result = await execFileAsync(process.execPath, [join(appRoot, 'scripts', 'verify-build.mjs')], {
      cwd: appRoot,
      windowsHide: true,
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: typeof error.code === 'number' ? error.code : 1,
      stdout: typeof error.stdout === 'string' ? error.stdout : '',
      stderr: typeof error.stderr === 'string' ? error.stderr : String(error),
    };
  }
}

function assertSafeFailure(result, fixtureRoot) {
  assert.notEqual(result.code, 0);
  const output = `${result.stdout}\n${result.stderr}`;
  const normalizedOutput = output.replaceAll('\\', '/');
  const normalizedFixture = fixtureRoot.replaceAll('\\', '/');
  assert.equal(normalizedOutput.includes(normalizedFixture), false);
  return output;
}

test('accepts a valid build with rooted executable and stylesheet assets', async () => {
  await withFixture(`${validScript}${validStylesheet}`, async ({ appRoot }) => {
    const result = await runVerifier(appRoot);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Verified 2 rooted asset reference\(s\)/);
  });
});

test('rejects an external script even when another valid asset exists', async () => {
  const html = `${validScript}${validStylesheet}<script src="https://cdn.example.test/evil.js"></script>`;
  await withFixture(html, async ({ fixtureRoot, appRoot }) => {
    const output = assertSafeFailure(await runVerifier(appRoot), fixtureRoot);
    assert.match(output, /script asset/i);
  });
});

test('rejects an external script after a greater-than character inside a quoted attribute', async () => {
  const html = `${validScript}${validStylesheet}<script data-note=">" src="https://cdn.example.test/evil.js"></script>`;
  await withFixture(html, async ({ fixtureRoot, appRoot }) => {
    const output = assertSafeFailure(await runVerifier(appRoot), fixtureRoot);
    assert.match(output, /script asset/i);
  });
});

test('rejects a wrong-root stylesheet even when valid assets exist', async () => {
  const html = `${validScript}${validStylesheet}<link rel="stylesheet" href="/wrong.css">`;
  await withFixture(html, async ({ fixtureRoot, appRoot }) => {
    const output = assertSafeFailure(await runVerifier(appRoot), fixtureRoot);
    assert.match(output, /stylesheet asset/i);
  });
});

test('rejects encoded traversal from an executable asset URL', async () => {
  const html = `${validStylesheet}<script src="/app/assets/%2f..%2fescape.js"></script>`;
  await withFixture(html, async ({ fixtureRoot, appRoot }) => {
    const output = assertSafeFailure(await runVerifier(appRoot), fixtureRoot);
    assert.match(output, /asset/i);
  });
});

test('rejects a referenced asset that escapes through a junction', async () => {
  await withFixture(`${validStylesheet}<script src="/app/assets/linked/escape.js"></script>`, async ({
    fixtureRoot,
    appRoot,
    assetsRoot,
  }) => {
    const outsideRoot = join(fixtureRoot, 'outside-assets');
    await mkdir(outsideRoot);
    await writeFile(join(outsideRoot, 'escape.js'), 'console.log("outside");', 'utf8');
    await symlink(outsideRoot, join(assetsRoot, 'linked'), 'junction');
    const output = assertSafeFailure(await runVerifier(appRoot), fixtureRoot);
    assert.match(output, /linked|physical|asset/i);
  });
});

test('rejects an unreferenced junction found during the recursive text scan', async () => {
  await withFixture(`${validScript}${validStylesheet}`, async ({ fixtureRoot, appRoot }) => {
    const outsideRoot = join(fixtureRoot, 'outside-scan');
    await mkdir(outsideRoot);
    await writeFile(join(outsideRoot, 'outside.txt'), 'safe text', 'utf8');
    await symlink(outsideRoot, join(appRoot, 'dist', 'linked-scan'), 'junction');
    const output = assertSafeFailure(await runVerifier(appRoot), fixtureRoot);
    assert.match(output, /linked|physical|scan/i);
  });
});

test('rejects forbidden built content and reports only a safe relative path', async () => {
  await withFixture(`${validScript}${validStylesheet}`, async ({ fixtureRoot, appRoot, assetsRoot }) => {
    await writeFile(join(assetsRoot, 'app.js'), 'const leaked = "KINDE_CLIENT_SECRET";', 'utf8');
    const output = assertSafeFailure(await runVerifier(appRoot), fixtureRoot);
    assert.match(output, /app\/assets\/app\.js/i);
  });
});
