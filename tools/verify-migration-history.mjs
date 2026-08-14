import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const migrationDir = path.resolve('supabase/migrations');
const pattern = /^(\d{14})_([a-z0-9_]+)\.sql$/;
const files = (await readdir(migrationDir)).filter(name => name.endsWith('.sql')).sort();
const errors = [];
const versions = new Map();
const large = [];
let previous = '';

for (const file of files) {
  const match = file.match(pattern);
  if (!match) { errors.push(`invalid filename: ${file}`); continue; }
  const version = match[1];
  if (versions.has(version)) errors.push(`duplicate version ${version}: ${versions.get(version)} and ${file}`);
  versions.set(version, file);
  if (previous && version <= previous) errors.push(`out of order: ${file}`);
  previous = version;
  const info = await stat(path.join(migrationDir, file));
  if (info.size >= 1000000) large.push([file, info.size]);
}

if (!files.length) errors.push('migration history is empty');
if (errors.length) throw new Error(`Migration history preflight failed:\n${errors.join('\n')}`);

const head = files.at(-1);
console.log(`Migration history PASS: ${files.length} files; head=${head}`);
for (const [file,size] of large) console.log(`WARN large migration: ${file} ${(size/1000000).toFixed(2)} MB`);
