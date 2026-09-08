import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REQUIRED = ['db', 'auth', 'rest', 'kong'].map(name => `supabase_${name}_rateware-carrier-local-v1`);
export function assessContainers(containers) {
  const failures = [];
  for (const name of REQUIRED) {
    const container = containers.find(c => c.Name === `/${name}`);
    if (!container) { failures.push(`${name}: missing`); continue; }
    if (!container.State?.Running) failures.push(`${name}: not running`);
    if (container.State?.Health && container.State.Health.Status !== 'healthy') failures.push(`${name}: unhealthy`);
    const expected = name.includes('_db_') ? ['5432/tcp', '56432'] : name.includes('_kong_') ? ['8000/tcp', '56431'] : null;
    if (expected && !(container.NetworkSettings?.Ports?.[expected[0]] || []).some(b => b.HostPort === expected[1] && b.HostIp === '127.0.0.1')) {
      failures.push(`${name}: required local endpoint missing`);
    }
    for (const bindings of Object.values(container.NetworkSettings?.Ports || {})) {
      for (const binding of bindings || []) {
        if (!['127.0.0.1', '::1'].includes(binding.HostIp)) failures.push(`${name}: non-loopback port`);
      }
    }
  }
  return { status: failures.length ? 'FAIL' : 'PASS', scope: 'local-container-health-and-bindings-only', failures };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // Inspect full objects in memory only; never print Docker environment secrets.
  const result = spawnSync('docker', ['inspect', ...REQUIRED], { encoding: 'utf8' });
  let containers = [];
  try { containers = JSON.parse(result.stdout || '[]'); } catch {}
  const report = assessContainers(containers);
  if (result.status !== 0) {
    report.status = 'FAIL';
    report.failures.push('docker inspect did not complete successfully');
  }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}
