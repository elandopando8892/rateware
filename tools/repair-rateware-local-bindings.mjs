import http from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const names = ['supabase_db_rateware-carrier-local-v1', 'supabase_kong_rateware-carrier-local-v1'];
export function replacementBody(original) {
  if (!names.includes(original.Name?.slice(1)) || original.State?.Running) throw new Error('Only the stopped Rateware bootstrap containers may be repaired.');
  if (original.HostConfig.NetworkMode !== 'rateware-carrier-local-v1') throw new Error('Unexpected network.');
  const host = structuredClone(original.HostConfig);
  for (const bindings of Object.values(host.PortBindings || {})) for (const binding of bindings) binding.HostIp = '127.0.0.1';
  host.RestartPolicy = { Name: 'no', MaximumRetryCount: 0 };
  const aliases = original.NetworkSettings.Networks['rateware-carrier-local-v1'].Aliases;
  return { ...original.Config, HostConfig: host, NetworkingConfig: { EndpointsConfig: { 'rateware-carrier-local-v1': { Aliases: aliases } } } };
}

function request(method, path, body, binary = false) {
  return new Promise((resolveRequest, reject) => {
    const data = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    const req = http.request({ socketPath: '//./pipe/dockerDesktopLinuxEngine', path: `/v1.47${path}`, method,
      headers: data ? { 'Content-Type': Buffer.isBuffer(body) ? 'application/x-tar' : 'application/json', 'Content-Length': data.length } : {} }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => {
        const response = Buffer.concat(chunks);
        if (res.statusCode >= 300) return reject(new Error(`Docker ${method} ${path.split('?')[0]} failed: HTTP ${res.statusCode}`));
        resolveRequest(binary ? response : response.length ? JSON.parse(response.toString()) : null);
      });
    });
    req.on('error', reject); req.end(data);
  });
}

async function repair() {
  // All originals are validated before the first mutation. Secrets stay in memory.
  const originals = await Promise.all(names.map(n => request('GET', `/containers/${n}/json`)));
  const bodies = originals.map(replacementBody);
  const kongFiles = await request('GET', `/containers/${names[1]}/archive?path=/home/kong`, undefined, true);
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    await request('POST', `/containers/${name}/rename?name=${name}-pre-loopback`);
    await request('POST', `/containers/create?name=${name}`, bodies[i]);
    if (i === 1) await request('PUT', `/containers/${name}/archive?path=/home`, kongFiles);
    console.log(`${name}: recreated, stopped, explicit loopback; original preserved as -pre-loopback`);
  }
  // Deliberately no automatic start; inspect bindings before starting services.
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  repair().catch(error => { console.error(error.message); process.exitCode = 1; });
}
