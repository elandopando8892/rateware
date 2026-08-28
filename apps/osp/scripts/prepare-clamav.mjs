import { createHash } from 'node:crypto';
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VERSION = '1.5.4';
const PACKAGE_SHA256 = '28d6efc5b4423e7830c3559339552eb53870a9eac51ac4efb37d60530d329886';
const PACKAGE_URL = `https://github.com/Cisco-Talos/clamav/releases/download/clamav-${VERSION}/clamav-${VERSION}.linux.x86_64.deb`;
const DATABASES = ['main.cvd', 'daily.cvd', 'bytecode.cvd'];
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, '..');
const destination = join(projectDirectory, 'api', '.clamav');

async function download(url, userAgent = 'Codex-OSP-ClamAV-Build/1.0') {
  const response = await fetch(url, { headers: { 'user-agent': userAgent }, redirect: 'follow', signal: AbortSignal.timeout(120_000) });
  if (response.status !== 200) throw new Error(`DOWNLOAD_FAILED_${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function arMember(archive, wanted) {
  const signature = new TextDecoder().decode(archive.subarray(0, 8));
  if (signature !== '!<arch>\n') throw new Error('INVALID_DEB_ARCHIVE');
  let offset = 8;
  while (offset + 60 <= archive.byteLength) {
    const header = new TextDecoder().decode(archive.subarray(offset, offset + 60));
    const name = header.slice(0, 16).trim().replace(/\/$/, '');
    const size = Number(header.slice(48, 58).trim());
    if (!Number.isSafeInteger(size) || size < 0 || header.slice(58, 60) !== '`\n') throw new Error('INVALID_DEB_ARCHIVE');
    const start = offset + 60;
    const end = start + size;
    if (end > archive.byteLength) throw new Error('INVALID_DEB_ARCHIVE');
    if (name === wanted) return archive.slice(start, end);
    offset = end + (size % 2);
  }
  throw new Error(`MISSING_DEB_MEMBER_${wanted}`);
}

async function command(executable, args) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolvePromise() : reject(new Error(`${executable}_EXIT_${code}`)));
  });
}

async function copyAlias(target, path) {
  await rm(path, { force: true });
  await copyFile(join(dirname(path), target), path);
}

const temporary = await mkdtemp(join(tmpdir(), 'osp-clamav-build-'));
try {
  const packageBytes = await download(PACKAGE_URL);
  if (sha256(packageBytes) !== PACKAGE_SHA256) throw new Error('CLAMAV_PACKAGE_INTEGRITY_FAILED');
  const payload = arMember(packageBytes, 'data.tar.gz');
  const payloadPath = join(temporary, 'data.tar.gz');
  const extracted = join(temporary, 'extracted');
  await mkdir(extracted, { recursive: true });
  await writeFile(payloadPath, payload);
  await command('tar', ['-xzf', payloadPath, '-C', extracted,
    './usr/local/bin/clamscan',
    './usr/local/lib/libclamav.so.12.1.0',
    './usr/local/lib/libclammspack.so.0.8.0',
    './usr/local/lib/libclamunrar.so.12.1.0',
    './usr/local/lib/libclamunrar_iface.so.12.1.0',
  ]);

  const staged = join(temporary, '.clamav');
  await mkdir(join(staged, 'bin'), { recursive: true });
  await mkdir(join(staged, 'lib'), { recursive: true });
  await mkdir(join(staged, 'database'), { recursive: true });
  await rename(join(extracted, 'usr', 'local', 'bin', 'clamscan'), join(staged, 'bin', 'clamscan'));
  for (const name of ['libclamav.so.12.1.0', 'libclammspack.so.0.8.0', 'libclamunrar.so.12.1.0', 'libclamunrar_iface.so.12.1.0']) {
    await rename(join(extracted, 'usr', 'local', 'lib', name), join(staged, 'lib', name));
  }
  await copyAlias('libclamav.so.12.1.0', join(staged, 'lib', 'libclamav.so.12'));
  await copyAlias('libclammspack.so.0.8.0', join(staged, 'lib', 'libclammspack.so.0'));
  await copyAlias('libclamunrar.so.12.1.0', join(staged, 'lib', 'libclamunrar.so.12'));
  await copyAlias('libclamunrar_iface.so.12.1.0', join(staged, 'lib', 'libclamunrar_iface.so.12'));
  await chmod(join(staged, 'bin', 'clamscan'), 0o755);

  const manifest = { clamavVersion: VERSION, packageSha256: PACKAGE_SHA256, databases: {} };
  for (const name of DATABASES) {
    const bytes = await download(`https://database.clamav.net/${name}`, 'ClamAV/1.5.4 (OSP private scanner; contact=sales@heymarksman.com)');
    await writeFile(join(staged, 'database', name), bytes, { mode: 0o444 });
    manifest.databases[name] = { sha256: sha256(bytes), sizeBytes: bytes.byteLength };
  }
  await writeFile(join(staged, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o444 });
  await rm(destination, { recursive: true, force: true });
  await mkdir(dirname(destination), { recursive: true });
  await cp(staged, destination, { recursive: true, preserveTimestamps: true });
  const persisted = JSON.parse(await readFile(join(destination, 'manifest.json'), 'utf8'));
  process.stdout.write(`Prepared ClamAV ${persisted.clamavVersion} with ${Object.keys(persisted.databases).length} signed databases.\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
