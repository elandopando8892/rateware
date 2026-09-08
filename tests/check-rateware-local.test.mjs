import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED, assessContainers } from '../tools/check-rateware-local.mjs';
const fixture = () => REQUIRED.map(name => ({ Name: `/${name}`, State: { Running: true, Health: { Status: 'healthy' } }, NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '56432' }], '8000/tcp': [{ HostIp: '127.0.0.1', HostPort: '56431' }] } } }));
test('healthy loopback containers pass only the explicitly scoped check', () => {
  assert.equal(assessContainers(fixture()).status, 'PASS');
});
test('missing, stopped, unhealthy and publicly bound containers fail', () => {
  assert.equal(assessContainers([]).status, 'FAIL');
  const missingPort = fixture(); missingPort[0].NetworkSettings.Ports = {};
  assert.equal(assessContainers(missingPort).status, 'FAIL');
  for (const modify of [c => c.State.Running = false, c => c.State.Health.Status = 'starting', c => c.NetworkSettings.Ports['8000/tcp'][0].HostIp = '0.0.0.0']) {
    const containers = fixture(); modify(containers[0]);
    assert.equal(assessContainers(containers).status, 'FAIL');
  }
});
