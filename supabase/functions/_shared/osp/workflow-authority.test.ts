import assert from 'node:assert/strict';

import {
  assertServerDerivedOrganization,
  assertWorkflowPermission,
  createOspAuthorityContext,
} from './workflow-authority.ts';

const identity = {
  issuer: 'https://auth.example.test',
  authorizedParty: 'osp-browser',
  subject: 'subject-1',
  organization: 'server-derived-org',
  email: 'requester@example.test',
  emailVerified: true as const,
};

Deno.test('workflow authority uses the verified identity organization only', () => {
  const authority = createOspAuthorityContext({
    identity,
    permissions: Object.freeze(['osp:read']),
  }, 'correlation-1');
  assert.equal(authority.organizationId, 'server-derived-org');
  assert.throws(
    () => assertServerDerivedOrganization(authority, 'browser-supplied-organization'),
    /FORBIDDEN/,
  );
});

Deno.test('workflow authority requires the operate permission instead of an email identity', () => {
  const requester = createOspAuthorityContext({
    identity,
    permissions: Object.freeze(['osp:read']),
  }, 'correlation-2');
  const operator = createOspAuthorityContext({
    identity: { ...identity, email: 'operations@example.test' },
    permissions: Object.freeze(['osp:operate', 'osp:read']),
  }, 'correlation-3');
  assert.throws(() => assertWorkflowPermission(requester, 'osp:operate'), /FORBIDDEN/);
  assert.doesNotThrow(() => assertWorkflowPermission(operator, 'osp:operate'));
  assert.throws(() => assertWorkflowPermission(operator, 'admin'), /FORBIDDEN/);
});

Deno.test('workflow authority recognizes only the three separated consequential permissions', () => {
  for (const permission of ['osp:signature-approve', 'osp:sales-authorize', 'osp:send-authorized']) {
    const authority = createOspAuthorityContext({
      identity,
      permissions: Object.freeze(['osp:read', permission]),
    }, `correlation-${permission}`);
    assert.doesNotThrow(() => assertWorkflowPermission(authority, permission));
  }
  const unknown = createOspAuthorityContext({
    identity,
    permissions: Object.freeze(['osp:read', 'osp:admin']),
  }, 'correlation-unknown');
  assert.throws(() => assertWorkflowPermission(unknown, 'osp:admin'), /FORBIDDEN/);
});
