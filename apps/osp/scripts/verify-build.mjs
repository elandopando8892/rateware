import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

process.on('uncaughtException', (error) => {
  const message = error instanceof Error ? error.message : 'Unexpected build verification failure.';
  console.error(`Build verification failed: ${message}`);
  process.exitCode = 1;
});

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(appRoot, 'dist');
const appDistRoot = resolve(distRoot, 'app');
const assetsRoot = resolve(appDistRoot, 'assets');
const indexPath = resolve(appDistRoot, 'index.html');
const assetUrlRoot = '/app/assets/';
const htmlNamespace = 'http://www.w3.org/1999/xhtml';

function safeRelative(path) {
  return relative(distRoot, path).split(sep).join('/');
}

function isWithin(root, candidate, { allowRoot = false } = {}) {
  const pathFromRoot = relative(root, candidate);
  if (pathFromRoot === '') return allowRoot;
  return !isAbsolute(pathFromRoot)
    && pathFromRoot !== '..'
    && !pathFromRoot.startsWith(`..${sep}`);
}

function assertWithin(root, candidate, label, options) {
  if (!isWithin(root, candidate, options)) {
    throw new Error(`${label} escapes its allowed build directory.`);
  }
}

async function safeLstat(path, missingMessage) {
  try {
    return await lstat(path);
  } catch {
    throw new Error(missingMessage);
  }
}

async function safeRealpath(path, label) {
  try {
    return await realpath(path);
  } catch {
    throw new Error(`${label} cannot be resolved inside the build artifact.`);
  }
}

async function safeReadText(path, label) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    throw new Error(`${label} cannot be read from the build artifact.`);
  }
}

async function safeReadDirectory(path, label) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch {
    throw new Error(`${label} cannot be enumerated inside the build artifact.`);
  }
}

function rejectLink(stats, label) {
  if (stats.isSymbolicLink()) {
    throw new Error(`Linked build entry ${label} is not allowed.`);
  }
}

const initialIndexStats = await safeLstat(
  indexPath,
  'Missing required build entry app/index.html. Run pnpm build first.',
);

const distStats = await safeLstat(distRoot, 'Missing required build directory dist.');
rejectLink(distStats, 'dist');
if (!distStats.isDirectory()) throw new Error('Build entry dist must be a directory.');
const physicalDistRoot = await safeRealpath(distRoot, 'Build directory dist');

const appDistStats = await safeLstat(appDistRoot, 'Missing required build directory app.');
rejectLink(appDistStats, 'app');
if (!appDistStats.isDirectory()) throw new Error('Build entry app must be a directory.');
const physicalAppDistRoot = await safeRealpath(appDistRoot, 'Build directory app');
assertWithin(physicalDistRoot, physicalAppDistRoot, 'Physical app build directory');

const assetsStats = await safeLstat(assetsRoot, 'Missing required build directory app/assets.');
rejectLink(assetsStats, 'app/assets');
if (!assetsStats.isDirectory()) throw new Error('Build entry app/assets must be a directory.');
const physicalAssetsRoot = await safeRealpath(assetsRoot, 'Build directory app/assets');
assertWithin(physicalAppDistRoot, physicalAssetsRoot, 'Physical asset directory');

rejectLink(initialIndexStats, 'app/index.html');
if (!initialIndexStats.isFile()) throw new Error('Build entry app/index.html must be a file.');
const physicalIndexPath = await safeRealpath(indexPath, 'Build entry app/index.html');
assertWithin(physicalAppDistRoot, physicalIndexPath, 'Physical build entry app/index.html');

function assetReferences(html) {
  let dom;
  try {
    // JSDOM defaults deliberately keep script execution disabled and do not load subresources.
    dom = new JSDOM(html, { url: 'https://osp.example.test/app/index.html' });
  } catch {
    throw new Error('Built index could not be parsed safely as HTML.');
  }

  const references = [];
  try {
    for (const script of dom.window.document.querySelectorAll('script')) {
      if (script.namespaceURI !== htmlNamespace) {
        throw new Error('Built index contains a non-HTML script element.');
      }
      if (!script.hasAttribute('src')) continue;
      const value = script.getAttribute('src');
      if (!value) throw new Error('Built index contains a script asset without a usable src.');
      references.push({ kind: 'script', value });
    }

    for (const link of dom.window.document.querySelectorAll('link')) {
      const rel = link.getAttribute('rel');
      const isStylesheet = typeof rel === 'string'
        && rel.split(/\s+/).some((token) => token.toLowerCase() === 'stylesheet');
      if (!isStylesheet) continue;
      const value = link.getAttribute('href');
      if (!value) throw new Error('Built index contains a stylesheet asset without a usable href.');
      references.push({ kind: 'stylesheet', value });
    }
  } finally {
    dom.window.close();
  }

  return references;
}

function assetPathname(reference) {
  if (!reference.value.startsWith(assetUrlRoot) || reference.value.includes('\\')) {
    throw new Error(`Built index contains a ${reference.kind} asset outside /app/assets/.`);
  }

  let parsed;
  let pathname;
  try {
    parsed = new URL(reference.value, 'https://osp.example.test');
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    throw new Error(`Built index contains an invalid ${reference.kind} asset URL.`);
  }

  if (
    parsed.origin !== 'https://osp.example.test'
    || !pathname.startsWith(assetUrlRoot)
    || pathname.includes('%')
    || pathname.slice(assetUrlRoot.length).length === 0
  ) {
    throw new Error(`Built index contains a ${reference.kind} asset outside /app/assets/.`);
  }

  return pathname;
}

async function assertNoLinkedSegments(root, target) {
  const pathFromRoot = relative(root, target);
  let current = root;
  for (const segment of pathFromRoot.split(sep)) {
    current = join(current, segment);
    const stats = await safeLstat(
      current,
      `Missing referenced build asset ${safeRelative(target)}.`,
    );
    rejectLink(stats, safeRelative(current));
  }
}

const html = await safeReadText(indexPath, 'Build entry app/index.html');
const references = assetReferences(html);
if (references.length === 0) {
  throw new Error('No executable or stylesheet assets found in app/index.html.');
}

for (const reference of references) {
  const pathname = assetPathname(reference);
  const assetPath = resolve(distRoot, pathname.slice(1));
  assertWithin(assetsRoot, assetPath, 'Referenced asset');
  await assertNoLinkedSegments(assetsRoot, assetPath);
  const assetStats = await safeLstat(
    assetPath,
    `Missing referenced build asset ${safeRelative(assetPath)}.`,
  );
  if (!assetStats.isFile()) {
    throw new Error(`Referenced build asset ${safeRelative(assetPath)} must be a file.`);
  }
  const physicalAssetPath = await safeRealpath(
    assetPath,
    `Referenced build asset ${safeRelative(assetPath)}`,
  );
  assertWithin(physicalAssetsRoot, physicalAssetPath, 'Physical referenced asset');
}

const textExtensions = new Set(['.html', '.js', '.css', '.map', '.json', '.txt']);

async function textFiles(path, { allowRoot = false } = {}) {
  assertWithin(distRoot, path, 'Build scan path', { allowRoot });
  const physicalPath = await safeRealpath(path, `Build scan entry ${safeRelative(path) || 'dist'}`);
  assertWithin(physicalDistRoot, physicalPath, 'Physical build scan path', { allowRoot });
  const entries = await safeReadDirectory(path, `Build scan entry ${safeRelative(path) || 'dist'}`);
  const files = [];

  for (const entry of entries) {
    const absolute = resolve(path, entry.name);
    assertWithin(distRoot, absolute, 'Build scan entry');
    const relativeEntry = safeRelative(absolute);
    const stats = await safeLstat(absolute, `Build scan entry ${relativeEntry} disappeared.`);
    rejectLink(stats, relativeEntry);
    const physicalEntry = await safeRealpath(absolute, `Build scan entry ${relativeEntry}`);
    assertWithin(physicalDistRoot, physicalEntry, 'Physical build scan entry');

    if (stats.isDirectory()) {
      files.push(...await textFiles(absolute));
    } else if (stats.isFile()) {
      if (textExtensions.has(extname(entry.name).toLowerCase())) files.push(absolute);
    } else {
      throw new Error(`Unsupported build entry ${relativeEntry}.`);
    }
  }

  return files;
}

const forbidden = [
  /sin fondo\.png/i,
  /Mi unidad/i,
  /Legal\s*&\s*Cumplimiento/i,
  /(?:^|[^A-Za-z])SERVICE_ROLE(?:[^A-Za-z]|$)/i,
  /GOOGLE_CLIENT_SECRET/i,
  /KINDE_CLIENT_SECRET/i,
  /synthetic-e2e-token/i,
  /__OSP_E2E_RUNTIME__/i,
  /<iframe\b/i,
];

const builtTextFiles = await textFiles(distRoot, { allowRoot: true });
for (const path of builtTextFiles) {
  const content = await safeReadText(path, `Build text entry ${safeRelative(path)}`);
  for (const pattern of forbidden) {
    if (pattern.test(content)) {
      throw new Error(`Forbidden content detected in ${safeRelative(path)}.`);
    }
  }
}

console.log(`Verified ${references.length} rooted asset reference(s) and ${builtTextFiles.length} built text file(s).`);
