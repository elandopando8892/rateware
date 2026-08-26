import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import {
  assertNoUnsafeUiSyntax,
  assertNoAlternateViteConfigOnDisk,
  assertReadOnlyUiBoundary,
  assertReadOnlyUiBoundaryOnDisk,
} from './osp-read-only-ui-boundary.mjs';

const appRoot = path.resolve(import.meta.dirname, '..');
const repositoryRoot = path.resolve(appRoot, '..', '..');
const sourceRoot = path.join(appRoot, 'src');
const manifestPath = path.join(appRoot, 'config', 'osp-read-only-ui-boundary.json');
const productionExtensions = new Set(['.css', '.ts', '.tsx']);
const buildDeterminantPaths = [
  'apps/osp/index.html',
  'apps/osp/package.json',
  'apps/osp/patches/@kinde-oss__kinde-auth-pkce-js@4.5.1.patch',
  'apps/osp/pnpm-lock.yaml',
  'apps/osp/pnpm-workspace.yaml',
  'apps/osp/tsconfig.json',
  'apps/osp/vercel.json',
  'apps/osp/vite.config.ts',
];
const expectedProductionSourcePaths = [
  'apps/osp/src/api/contracts.ts',
  'apps/osp/src/api/osp-client.ts',
  'apps/osp/src/api/workflow-client.ts',
  'apps/osp/src/app/App.tsx',
  'apps/osp/src/app/AppShell.tsx',
  'apps/osp/src/app/router.tsx',
  'apps/osp/src/auth/auth-port.ts',
  'apps/osp/src/auth/AuthProvider.tsx',
  'apps/osp/src/auth/kinde-auth-port.ts',
  'apps/osp/src/auth/session-channel.ts',
  'apps/osp/src/auth/SessionScopedQueryProvider.tsx',
  'apps/osp/src/auth/token-binding.ts',
  'apps/osp/src/components/RoutePlaceholder.tsx',
  'apps/osp/src/config/runtime.ts',
  'apps/osp/src/features/approval/SalesAuthorizationPage.tsx',
  'apps/osp/src/features/approval/SignatureApprovalPage.tsx',
  'apps/osp/src/features/communications/ClarificationReview.tsx',
  'apps/osp/src/features/communications/OutboundPayloadPage.tsx',
  'apps/osp/src/features/documents/QuarterlyDocumentVault.tsx',
  'apps/osp/src/features/forms/FormRuntime.tsx',
  'apps/osp/src/features/forms/surveyjs-canonical-adapter.ts',
  'apps/osp/src/features/forms/surveyjs-preset.ts',
  'apps/osp/src/features/forms/VisualFormBuilder.tsx',
  'apps/osp/src/features/pipeline/pipeline-health.ts',
  'apps/osp/src/features/pipeline/PipelineOverview.tsx',
  'apps/osp/src/features/pipeline/use-pipeline-overview.ts',
  'apps/osp/src/features/review/OperationsReviewPage.tsx',
  'apps/osp/src/main.tsx',
  'apps/osp/src/preview/preview-runtime.ts',
  'apps/osp/src/styles/global.css',
  'apps/osp/src/styles/pipeline.css',
  'apps/osp/src/styles/shell.css',
  'apps/osp/src/styles/tokens.css',
];
const expectedBuildInputPaths = [
  ...buildDeterminantPaths,
  ...expectedProductionSourcePaths,
].sort(compareCanonicalPath);

function isProductionSource(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  const name = path.posix.basename(normalized);
  return productionExtensions.has(path.extname(name)) &&
    !normalized.startsWith('apps/osp/src/test/') &&
    !name.endsWith('.d.ts') &&
    !name.includes('.test.') &&
    !name.includes('.spec.') &&
    !name.includes('.compile.');
}

async function productionBuildInputs() {
  const absolutePaths = [];
  async function discover(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await discover(absolutePath);
      if (entry.isFile()) {
        const relativePath = path.relative(repositoryRoot, absolutePath);
        if (isProductionSource(relativePath)) absolutePaths.push(absolutePath);
      }
    }
  }
  await discover(sourceRoot);
  absolutePaths.push(...buildDeterminantPaths.map((relativePath) =>
    path.join(repositoryRoot, ...relativePath.split('/'))));
  const inputs = await Promise.all(absolutePaths.map(async (absolutePath) => ({
    path: path.relative(repositoryRoot, absolutePath).split(path.sep).join('/'),
    bytes: await readFile(absolutePath),
  })));
  return inputs.sort((left, right) => compareCanonicalPath(left.path, right.path));
}

function canonicalManifest(manifest) {
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function compareCanonicalPath(left, right) {
  const foldedLeft = left.toLocaleLowerCase('en-US');
  const foldedRight = right.toLocaleLowerCase('en-US');
  if (foldedLeft < foldedRight) return -1;
  if (foldedLeft > foldedRight) return 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function pinnedManifest(sources) {
  return {
    schema_version: 2,
    algorithm: 'sha256',
    entrypoint: 'apps/osp/src/main.tsx',
    files: [...sources]
      .sort((left, right) => compareCanonicalPath(left.path, right.path))
      .map((source) => ({
        kind: 'production-ui',
        path: source.path,
        sha256: createHash('sha256').update(source.bytes).digest('hex'),
      })),
  };
}

function replaceSource(sources, sourcePath, text) {
  return sources.map((source) => source.path === sourcePath
    ? { ...source, bytes: Buffer.from(text, 'utf8') }
    : source);
}

function appendSource(sources, sourcePath, appendedText) {
  const source = sources.find((candidate) => candidate.path === sourcePath);
  if (!source) throw new Error(`Missing fixture source ${sourcePath}`);
  return replaceSource(
    sources,
    sourcePath,
    `${source.bytes.toString('utf8')}\n${appendedText}\n`,
  );
}

async function withNewAlternateConfig(alternatePath, operation) {
  await writeFile(alternatePath, 'export default {};\n', { encoding: 'utf8', flag: 'wx' });
  try { await operation(); } finally { await rm(alternatePath, { force: true }); }
}

test('production UI manifest is canonical raw JSON with the exact reviewed build-input inventory', async () => {
  const rawManifest = await readFile(manifestPath);
  const manifest = JSON.parse(rawManifest);
  assert.deepEqual(rawManifest, canonicalManifest(manifest));
  assert.deepEqual(Object.keys(manifest), ['schema_version', 'algorithm', 'entrypoint', 'files']);
  assert.equal(manifest.schema_version, 2);
  assert.equal(manifest.algorithm, 'sha256');
  assert.equal(manifest.entrypoint, 'apps/osp/src/main.tsx');
  assert.deepEqual(manifest.files.map((entry) => entry.path), expectedBuildInputPaths);
  for (const entry of manifest.files) {
    assert.deepEqual(Object.keys(entry), ['kind', 'path', 'sha256']);
    assert.equal(entry.kind, 'production-ui');
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
  }
});

test('package Vite and Vitest scripts use only the pinned TypeScript configuration', async () => {
  const packageJson = JSON.parse(await readFile(path.join(appRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts.dev, 'vite --config vite.config.ts');
  assert.equal(packageJson.scripts.build, 'vite build --config vite.config.ts');
  assert.equal(packageJson.scripts.test.startsWith('vitest run --config vite.config.ts'), true);
});

for (const extension of ['js', 'mjs', 'cjs', 'mts', 'cts']) {
  test(`production UI boundary rejects vite.config.${extension} before source semantics`, async () => {
    const sources = await productionBuildInputs();
    const alternate = {
      path: `apps/osp/vite.config.${extension}`,
      bytes: Buffer.from('export default {};\n', 'utf8'),
    };
    const candidate = [...sources, alternate];
    assert.throws(
      () => assertReadOnlyUiBoundary(candidate, canonicalManifest(pinnedManifest(candidate))),
      (error) => error instanceof Error && error.message === 'UI_VITE_CONFIG_ALTERNATE',
    );
  });
}

for (const extension of ['js', 'mjs', 'cjs', 'mts', 'cts']) {
  test(`production UI boundary discovers physical vite.config.${extension}`, async () => {
    const alternatePath = path.join(appRoot, `vite.config.${extension}`);
    await withNewAlternateConfig(alternatePath, async () => {
      await assert.rejects(
        () => assertNoAlternateViteConfigOnDisk(appRoot),
        (error) => error instanceof Error && error.message === 'UI_VITE_CONFIG_ALTERNATE',
      );
    });
  });
}

test('production UI boundary pins the complete local TypeScript configuration closure', async () => {
  const sources = await productionBuildInputs();
  const tsconfigPath = 'apps/osp/tsconfig.json';
  const extending = replaceSource(sources, tsconfigPath, JSON.stringify({ extends: './tsconfig.base' }, null, 2) + '\n');
  const base = { path: 'apps/osp/tsconfig.base.json', bytes: Buffer.from('{}\n', 'utf8') };
  const complete = [...extending, base];
  assert.doesNotThrow(() => assertReadOnlyUiBoundary(complete, canonicalManifest(pinnedManifest(complete))));
  assert.throws(
    () => assertReadOnlyUiBoundary(extending, canonicalManifest(pinnedManifest(extending))),
    (error) => error instanceof Error && error.message === 'UI_TSCONFIG_CLOSURE',
  );
  const external = replaceSource(sources, tsconfigPath, JSON.stringify({ extends: 'unsafe-config' }, null, 2) + '\n');
  assert.throws(
    () => assertReadOnlyUiBoundary(external, canonicalManifest(pinnedManifest(external))),
    (error) => error instanceof Error && error.message === 'UI_TSCONFIG_REFERENCE',
  );
});

test('production UI boundary accepts the reviewed entry and complete import closure', async () => {
  const sources = await productionBuildInputs();
  const rawManifest = await readFile(manifestPath);
  await assert.doesNotReject(() => assertReadOnlyUiBoundaryOnDisk(sources, rawManifest, appRoot));
});

test('production UI baseline rejects a physical alternate Vite configuration', async () => {
  const alternatePath = path.join(appRoot, 'vite.config.js');
  const sources = await productionBuildInputs();
  const rawManifest = await readFile(manifestPath);
  await withNewAlternateConfig(alternatePath, async () => {
    await assert.rejects(
      () => assertReadOnlyUiBoundaryOnDisk(sources, rawManifest, appRoot),
      (error) => error instanceof Error && error.message === 'UI_VITE_CONFIG_ALTERNATE',
    );
  });
});

for (const [label, sourcePath, appendedText] of [
  ['React.createElement button', 'apps/osp/src/app/App.tsx', 'React.createElement("button", null, "unsafe");'],
  ['React.createElement anchor', 'apps/osp/src/app/App.tsx', 'React.createElement("a", { href: "/unsafe" }, "unsafe");'],
  ['custom Controls.Send', 'apps/osp/src/app/App.tsx', 'void (<Controls.Send />);'],
  ['object element', 'apps/osp/src/app/App.tsx', 'void (<object data="/unsafe" />);'],
  ['embed element', 'apps/osp/src/app/App.tsx', 'void (<embed src="/unsafe" />);'],
  ['dangerous HTML', 'apps/osp/src/app/App.tsx', 'void (<section dangerouslySetInnerHTML={{ __html: "unsafe" }} />);'],
  ['UI-bearing TypeScript', 'apps/osp/src/features/pipeline/pipeline-health.ts', 'React.createElement("button", null, "unsafe");'],
]) {
  test(`raw production hash rejects actual-source ${label} before semantic analysis`, async () => {
    const sources = await productionBuildInputs();
    const rawManifest = await readFile(manifestPath);
    const mutated = appendSource(sources, sourcePath, appendedText);
    assert.throws(
      () => assertReadOnlyUiBoundary(mutated, rawManifest),
      (error) => error instanceof Error && error.message === 'UI_SOURCE_HASH',
    );
  });
}

for (const [label, inputPath, mutate] of [
  [
    'index HTML operational control',
    'apps/osp/index.html',
    (text) => text.replace('</body>', '<button type="button">Send</button>\n  </body>'),
  ],
  [
    'Vite transform plugin operational control',
    'apps/osp/vite.config.ts',
    (text) => text.replace(
      'plugins: [',
      `plugins: [
    {
      name: 'inject-operational-control',
      transformIndexHtml(html) {
        return html.replace('</body>', '<button type="button">Send</button></body>');
      },
    },`,
    ),
  ],
  [
    'package build and plugin determinant',
    'apps/osp/package.json',
    (text) => text
      .replace('"build": "vite build"', '"build": "vite build --mode operational"')
      .replace('"@vitejs/plugin-react": "6.1.0"', '"@vitejs/plugin-react": "6.1.1"'),
  ],
  [
    'pnpm workspace determinant',
    'apps/osp/pnpm-workspace.yaml',
    (text) => `${text}catalog:\n  unsafe-plugin: 1.0.0\n`,
  ],
  [
    'pnpm lock determinant',
    'apps/osp/pnpm-lock.yaml',
    (text) => `${text}# unexpected build resolution\n`,
  ],
  [
    'Kinde patch determinant',
    'apps/osp/patches/@kinde-oss__kinde-auth-pkce-js@4.5.1.patch',
    (text) => `${text}# unexpected patch mutation\n`,
  ],
]) {
  test(`raw build-input hash rejects ${label} before source semantics`, async () => {
    const inputs = await productionBuildInputs();
    const rawManifest = await readFile(manifestPath);
    const input = inputs.find((candidate) => candidate.path === inputPath);
    if (!input) throw new Error(`Missing build input fixture ${inputPath}`);
    const mutated = replaceSource(inputs, inputPath, mutate(input.bytes.toString('utf8')));
    assert.throws(
      () => assertReadOnlyUiBoundary(mutated, rawManifest),
      (error) => error instanceof Error && error.message === 'UI_SOURCE_HASH',
    );
  });
}

test('production UI inventory rejects extra, missing, duplicate, and aliased source paths before semantics', async () => {
  const sources = await productionBuildInputs();
  const rawManifest = await readFile(manifestPath);
  const extraText = 'void (<iframe src="/unsafe" />);';
  const cases = [
    ['extra', [...sources, {
      path: 'apps/osp/src/components/UnexpectedControl.tsx',
      bytes: Buffer.from(extraText, 'utf8'),
    }]],
    ['missing', sources.filter((source) => source.path !== 'apps/osp/vite.config.ts')],
    ['duplicate', [...sources, sources[0]]],
    ['aliased', sources.map((source) => source.path === 'apps/osp/src/app/App.tsx'
      ? { ...source, path: 'apps/osp/src/app/../app/App.tsx' }
      : source)],
    ['self hash', [...sources, {
      path: 'apps/osp/config/osp-read-only-ui-boundary.json',
      bytes: rawManifest,
    }]],
    ['generated dependencies', [...sources, {
      path: 'apps/osp/node_modules/unsafe-plugin/index.js',
      bytes: Buffer.from(extraText, 'utf8'),
    }]],
    ['generated artifact', [...sources, {
      path: 'apps/osp/dist/app/index.html',
      bytes: Buffer.from('<button>Send</button>', 'utf8'),
    }]],
  ];
  for (const [label, candidate] of cases) {
    assert.throws(
      () => assertReadOnlyUiBoundary(candidate, rawManifest),
      (error) => error instanceof Error && error.message === 'UI_SOURCE_INVENTORY',
      label,
    );
  }
});

test('production UI manifest rejects duplicate, case-ambiguous, and aliased paths before semantics', async () => {
  const sources = await productionBuildInputs();
  const manifest = pinnedManifest(sources);
  const appEntry = manifest.files.find((entry) => entry.path === 'apps/osp/src/app/App.tsx');
  if (!appEntry) throw new Error('Missing App manifest fixture');
  const ambiguousFiles = [...manifest.files, { ...appEntry, path: 'apps/osp/src/app/app.tsx' }]
    .sort((left, right) => compareCanonicalPath(left.path, right.path));
  const cases = [
    ['duplicate', { ...manifest, files: [...manifest.files, manifest.files[0]] }],
    ['case-ambiguous', { ...manifest, files: ambiguousFiles }],
    ['path alias', {
      ...manifest,
      files: manifest.files.map((entry) => entry.path === appEntry.path
        ? { ...entry, path: 'apps/osp/src/app/../app/App.tsx' }
        : entry),
    }],
    ['self hash', {
      ...manifest,
      files: manifest.files.map((entry) => entry.path === appEntry.path
        ? { ...entry, path: 'apps/osp/config/osp-read-only-ui-boundary.json' }
        : entry),
    }],
    ['generated dependencies', {
      ...manifest,
      files: manifest.files.map((entry) => entry.path === appEntry.path
        ? { ...entry, path: 'apps/osp/node_modules/unsafe-plugin/index.js' }
        : entry),
    }],
    ['generated artifact', {
      ...manifest,
      files: manifest.files.map((entry) => entry.path === appEntry.path
        ? { ...entry, path: 'apps/osp/dist/app/index.html' }
        : entry),
    }],
  ];
  for (const [label, candidate] of cases) {
    assert.throws(
      () => assertReadOnlyUiBoundary(sources, canonicalManifest(candidate)),
      (error) => error instanceof Error && error.message === 'UI_MANIFEST_INVENTORY',
      label,
    );
  }
});

test('production UI manifest requires every build determinant when the input list omits the same path', async () => {
  const inputs = await productionBuildInputs();
  const omittedPath = 'apps/osp/package.json';
  const reducedInputs = inputs.filter((input) => input.path !== omittedPath);
  const reducedManifest = pinnedManifest(reducedInputs);
  assert.throws(
    () => assertReadOnlyUiBoundary(reducedInputs, canonicalManifest(reducedManifest)),
    (error) => error instanceof Error && error.message === 'UI_MANIFEST_INVENTORY',
  );
});

test('production UI manifest rejects noncanonical, duplicate-key, and reordered raw JSON', async () => {
  const sources = await productionBuildInputs();
  const rawManifest = await readFile(manifestPath);
  const manifest = JSON.parse(rawManifest);
  const text = rawManifest.toString('utf8');
  const cases = [
    ['UTF-8 BOM', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), rawManifest]), 'UI_MANIFEST_CANONICAL'],
    ['CRLF', Buffer.from(text.replaceAll('\n', '\r\n'), 'utf8'), 'UI_MANIFEST_CANONICAL'],
    ['leading whitespace', Buffer.from(`\n${text}`, 'utf8'), 'UI_MANIFEST_CANONICAL'],
    [
      'duplicate key',
      Buffer.from(text.replace(
        '  "algorithm": "sha256",',
        '  "algorithm": "sha256",\n  "algorithm": "sha256",',
      ), 'utf8'),
      'UI_MANIFEST_CANONICAL',
    ],
    [
      'duplicate entry key',
      Buffer.from(text.replace(
        '      "kind": "production-ui",',
        '      "kind": "production-ui",\n      "kind": "production-ui",',
      ), 'utf8'),
      'UI_MANIFEST_CANONICAL',
    ],
    [
      'reordered keys',
      canonicalManifest({ algorithm: manifest.algorithm, schema_version: manifest.schema_version, entrypoint: manifest.entrypoint, files: manifest.files }),
      'UI_MANIFEST_SCHEMA',
    ],
    [
      'reordered entry keys',
      canonicalManifest({
        ...manifest,
        files: manifest.files.map((entry, index) => index === 0
          ? { path: entry.path, kind: entry.kind, sha256: entry.sha256 }
          : entry),
      }),
      'UI_MANIFEST_SCHEMA',
    ],
    [
      'reordered file inventory',
      canonicalManifest({ ...manifest, files: [...manifest.files].reverse() }),
      'UI_MANIFEST_INVENTORY',
    ],
    [
      'unknown top-level field',
      canonicalManifest({ ...manifest, unexpected: true }),
      'UI_MANIFEST_SCHEMA',
    ],
    [
      'unknown entry field',
      canonicalManifest({
        ...manifest,
        files: manifest.files.map((entry, index) => index === 0
          ? { ...entry, unexpected: true }
          : entry),
      }),
      'UI_MANIFEST_SCHEMA',
    ],
  ];
  for (const [label, candidate, expectedCode] of cases) {
    assert.throws(
      () => assertReadOnlyUiBoundary(sources, candidate),
      (error) => error instanceof Error && error.message === expectedCode,
      label,
    );
  }
});

test('parsed production closure rejects an unreachable reviewed source and an ambiguous extension import', async () => {
  const sources = await productionBuildInputs();
  const main = sources.find((source) => source.path === 'apps/osp/src/main.tsx');
  if (!main) throw new Error('Missing main fixture');
  const withoutTokenImport = replaceSource(
    sources,
    main.path,
    main.bytes.toString('utf8').replace("import './styles/tokens.css';\n", ''),
  );
  assert.throws(
    () => assertReadOnlyUiBoundary(withoutTokenImport, canonicalManifest(pinnedManifest(withoutTokenImport))),
    (error) => error instanceof Error && error.message === 'UI_IMPORT_CLOSURE',
  );

  const ambiguousImportMain = `${main.bytes.toString('utf8')}\nimport './ambiguous/control';\n`;
  const ambiguousSources = [
    ...replaceSource(sources, main.path, ambiguousImportMain),
    { path: 'apps/osp/src/ambiguous/control.ts', bytes: Buffer.from('export const control = true;\n', 'utf8') },
    { path: 'apps/osp/src/ambiguous/control.tsx', bytes: Buffer.from('export const control = <span />;\n', 'utf8') },
  ];
  assert.throws(
    () => assertReadOnlyUiBoundary(ambiguousSources, canonicalManifest(pinnedManifest(ambiguousSources))),
    (error) => error instanceof Error && error.message === 'UI_IMPORT_AMBIGUOUS',
  );
});

test('semantic diagnostics remain readable after a deliberate manifest update', async () => {
  const sources = await productionBuildInputs();
  for (const [label, appendedText, expectedCode] of [
    ['embedded frame', 'void (<iframe src="/unsafe" />);', 'UI_EMBEDDED_CONTENT'],
    ['embedded object', 'void (<object data="/unsafe" />);', 'UI_EMBEDDED_CONTENT'],
    ['embedded resource', 'void (<embed src="/unsafe" />);', 'UI_EMBEDDED_CONTENT'],
    ['dangerous HTML', 'void (<section dangerouslySetInnerHTML={{ __html: "unsafe" }} />);', 'UI_DANGEROUS_HTML'],
    ['operational control', 'void (<Controls.Send />);', 'UI_OPERATIONAL_CONTROL'],
  ]) {
    const mutated = appendSource(sources, 'apps/osp/src/app/App.tsx', appendedText);
    assert.throws(
      () => assertReadOnlyUiBoundary(mutated, canonicalManifest(pinnedManifest(mutated))),
      (error) => error instanceof Error && error.message === expectedCode,
      label,
    );
  }

  assert.doesNotThrow(() => assertNoUnsafeUiSyntax(
    'const note = "<iframe dangerouslySetInnerHTML Controls.Send"; // <object />',
    'fixture.tsx',
  ));
});

test('semantic UI boundary permits only the reviewed quarterly document upload surface', async () => {
  const sourcePath = 'apps/osp/src/features/documents/QuarterlyDocumentVault.tsx';
  const source = await readFile(path.join(repositoryRoot, sourcePath), 'utf8');
  assert.doesNotThrow(() => assertNoUnsafeUiSyntax(source, sourcePath));
  assert.throws(
    () => assertNoUnsafeUiSyntax(source, 'apps/osp/src/features/pipeline/UnexpectedUpload.tsx'),
    (error) => error instanceof Error && error.message === 'UI_MUTATION_CONTROL',
  );
  assert.throws(
    () => assertNoUnsafeUiSyntax(source.replace('application/pdf,image/jpeg,image/png,image/tiff', 'application/pdf'), sourcePath),
    (error) => error instanceof Error && error.message === 'UI_MUTATION_CONTROL',
  );
});
