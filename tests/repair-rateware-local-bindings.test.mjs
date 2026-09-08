import test from 'node:test';
import assert from 'node:assert/strict';
import { replacementBody } from '../tools/repair-rateware-local-bindings.mjs';
const fixture = () => ({ Name: '/supabase_db_rateware-carrier-local-v1', State: { Running: false }, Config: { Image: 'pinned-image' }, HostConfig: { NetworkMode: 'rateware-carrier-local-v1', Binds: ['local-volume:/data'], PortBindings: { '5432/tcp': [{ HostIp: '', HostPort: '56432' }] } }, NetworkSettings: { Networks: { 'rateware-carrier-local-v1': { Aliases: ['db'] } } } });
test('repair pins loopback and preserves volume and configuration without mutating original', () => {
  const original = fixture(); const result = replacementBody(original);
  assert.equal(result.HostConfig.PortBindings['5432/tcp'][0].HostIp, '127.0.0.1');
  assert.equal(original.HostConfig.PortBindings['5432/tcp'][0].HostIp, '');
  assert.deepEqual(result.HostConfig.Binds, original.HostConfig.Binds);
  assert.equal(result.HostConfig.RestartPolicy.Name, 'no');
});
test('repair refuses running containers, foreign names and networks', () => {
  for (const change of [o => o.State.Running = true, o => o.Name = '/supabase_db_other', o => o.HostConfig.NetworkMode = 'bridge']) {
    const original = fixture(); change(original); assert.throws(() => replacementBody(original));
  }
});
