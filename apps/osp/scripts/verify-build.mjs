import { access, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(appRoot, 'dist');
const appDistRoot = resolve(distRoot, 'app');
const assetsRoot = resolve(appDistRoot, 'assets');
const indexPath = resolve(appDistRoot, 'index.html');

function safeRelative(path) {
  return relative(distRoot, path).split(sep).join('/');
}

function assertWithin(root, candidate, label, { allowRoot = false } = {}) {
  const pathFromRoot = relative(root, candidate);
  if ((!allowRoot && pathFromRoot === '') || pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === '..' || pathFromRoot.includes(`${sep}..${sep}`)) {
    throw new Error(`${label} escapes its allowed build directory.`);
  }
}

await access(indexPath).catch(() => {
  throw new Error('Missing required build entry app/index.html. Run pnpm build first.');
});

const html = await readFile(indexPath, 'utf8');
const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)]
  .map((match) => match[1])
  .filter((url) => url.startsWith('/app/assets/'));

if (assetUrls.length === 0) {
  throw new Error('No /app/assets/ references found in app/index.html.');
}

for (const assetUrl of assetUrls) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(assetUrl, 'https://osp.example.test').pathname);
  } catch {
    throw new Error('Built index contains an invalid /app/assets/ URL.');
  }

  if (!pathname.startsWith('/app/assets/')) {
    throw new Error('Built index contains an asset outside /app/assets/.');
  }

  const assetPath = resolve(distRoot, pathname.slice(1));
  assertWithin(assetsRoot, assetPath, 'Referenced asset');
  const assetStats = await stat(assetPath).catch(() => null);
  if (!assetStats?.isFile()) {
    throw new Error(`Missing referenced build asset ${safeRelative(assetPath)}.`);
  }
}

const textExtensions = new Set(['.html', '.js', '.css', '.map', '.json', '.txt']);

async function textFiles(path) {
  assertWithin(distRoot, path, 'Build scan path', { allowRoot: true });
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = resolve(path, entry.name);
    assertWithin(distRoot, absolute, 'Build scan entry');
    if (entry.isDirectory()) {
      files.push(...await textFiles(absolute));
    } else if (entry.isFile() && textExtensions.has(extname(entry.name).toLowerCase())) {
      files.push(absolute);
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

const builtTextFiles = await textFiles(distRoot);
for (const path of builtTextFiles) {
  const content = await readFile(path, 'utf8');
  for (const pattern of forbidden) {
    if (pattern.test(content)) {
      throw new Error(`Forbidden content detected in ${safeRelative(path)}.`);
    }
  }
}

console.log(`Verified ${assetUrls.length} rooted asset reference(s) and ${builtTextFiles.length} built text file(s).`);
