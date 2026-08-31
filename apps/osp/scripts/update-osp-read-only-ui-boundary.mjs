import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

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

function compareCanonicalPath(left, right) {
  const foldedLeft = left.toLocaleLowerCase('en-US');
  const foldedRight = right.toLocaleLowerCase('en-US');
  if (foldedLeft < foldedRight) return -1;
  if (foldedLeft > foldedRight) return 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function isProductionSource(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  const name = path.posix.basename(normalized);
  return productionExtensions.has(path.extname(name))
    && !normalized.startsWith('apps/osp/src/test/')
    && !name.endsWith('.d.ts')
    && !name.includes('.test.')
    && !name.includes('.spec.')
    && !name.includes('.compile.');
}

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
const files = await Promise.all(absolutePaths.map(async (absolutePath) => {
  const bytes = await readFile(absolutePath);
  return {
    kind: 'production-ui',
    path: path.relative(repositoryRoot, absolutePath).split(path.sep).join('/'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}));
files.sort((left, right) => compareCanonicalPath(left.path, right.path));
const manifest = {
  schema_version: 2,
  algorithm: 'sha256',
  entrypoint: 'apps/osp/src/main.tsx',
  files,
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
