import { assertEquals } from 'jsr:@std/assert@1.0.14';

import { createDocumentApiHandler } from './handler.ts';

const identity = {
  identity: {
    organization: '11111111-1111-4111-8111-111111111111', issuer: 'https://auth.example.test', subject: 'ops-subject',
    email: 'ops@example.test', emailVerified: true, audience: 'https://osp.heymarksman.com/api', authorizedParty: 'client', expiresAt: 1, notBefore: 1,
  },
  permissions: ['osp:read', 'osp:operate'],
} as const;
const readOnlyIdentity = { ...identity, permissions: ['osp:read'] } as const;
const origin = 'https://osp.heymarksman.com';

function request(query: string, init: RequestInit = {}) {
  const { headers, ...rest } = init;
  return new Request(`https://project.example.test/functions/v1/osp-document-api?${query}`, {
    method: 'POST', ...rest, headers: { origin, authorization: 'Bearer synthetic-token', ...headers },
  });
}

Deno.test('document API lists safe metadata and uploads reviewed bytes under verified workflow authority', async () => {
  const uploads: unknown[] = [];
  const handler = createDocumentApiHandler({
    verifyToken: async () => identity,
    listVersions: async () => [{ id: '22222222-2222-4222-8222-222222222222', documentType: 'proof_of_address', version: 1, status: 'review_required', validFrom: '2026-08-24', expiresAt: '2026-11-24' }],
    documentService: {
      upload: async (authority, input) => { uploads.push({ authority, input }); return { id: '22222222-2222-4222-8222-222222222222', version: 1, expiresAt: '2026-11-24' }; },
      approve: async () => ({ id: 'unused', status: 'approved' as const }),
    },
    incidentId: () => 'incident-1',
  });
  const listed = await handler(request('action=list_document_versions'));
  assertEquals(listed.status, 200);
  assertEquals(await listed.json(), { data: { versions: [{ id: '22222222-2222-4222-8222-222222222222', documentType: 'proof_of_address', version: 1, status: 'review_required', validFrom: '2026-08-24', expiresAt: '2026-11-24' }] } });

  const body = new TextEncoder().encode('synthetic document');
  const uploaded = await handler(request('action=upload_document_version&document_type=proof_of_address&valid_from=2026-08-24', { headers: { 'content-type': 'application/pdf', 'content-length': String(body.byteLength) }, body }));
  assertEquals(uploaded.status, 201);
  assertEquals((uploads[0] as { authority: { organizationId: string } }).authority.organizationId, identity.identity.organization);
  assertEquals((uploads[0] as { input: { bytes: Uint8Array } }).input.bytes, body);
});

Deno.test('document API accepts a gateway-normalized zero-byte stream and rejects any body bytes', async () => {
  const handler = createDocumentApiHandler({
    verifyToken: async () => identity,
    listVersions: async () => [],
    documentService: {
      upload: async () => ({ id: 'unused', version: 1, expiresAt: '2026-11-24' }),
      approve: async () => ({ id: 'unused', status: 'approved' as const }),
    },
    incidentId: () => 'incident-empty-stream',
  });
  const stream = (payload?: Uint8Array) => new ReadableStream<Uint8Array>({
    start(controller) {
      if (payload) controller.enqueue(payload);
      controller.close();
    },
  });
  assertEquals(
    (await handler(request('action=list_document_versions', { body: stream() }))).status,
    200,
  );
  assertEquals(
    (await handler(request('action=list_document_versions', { body: stream(new Uint8Array([1])) }))).status,
    400,
  );
});

Deno.test('document API lets an authorized reader stage evidence but not approve it', async () => {
  const uploads: unknown[] = [];
  const approvals: unknown[] = [];
  const handler = createDocumentApiHandler({
    verifyToken: async () => readOnlyIdentity,
    listVersions: async () => [],
    documentService: {
      upload: async (authority, input) => { uploads.push({ authority, input }); return { id: 'version-1', version: 1, expiresAt: '2026-11-28' }; },
      approve: async (authority, input) => { approvals.push({ authority, input }); return { id: input.versionId, status: 'approved' as const }; },
    },
    incidentId: () => 'incident-read-only-upload',
  });
  const body = new TextEncoder().encode('synthetic bank statement');
  const uploaded = await handler(request('action=upload_document_version&document_type=bank_statement&valid_from=2026-08-28', {
    headers: { 'content-type': 'application/pdf', 'content-length': String(body.byteLength) },
    body,
  }));
  assertEquals(uploaded.status, 201);
  assertEquals(uploads.length, 1);

  const sha = 'a'.repeat(64);
  const approved = await handler(request(`action=approve_document_version&version_id=22222222-2222-4222-8222-222222222222&expected_version=1&review_before_sha256=${sha}&review_after_sha256=${sha}`));
  assertEquals(approved.status, 403);
  assertEquals(approvals.length, 0);
});

Deno.test('document API approves only exact reviewed hashes and contains unsafe requests', async () => {
  const approvals: unknown[] = [];
  const handler = createDocumentApiHandler({
    verifyToken: async () => identity,
    listVersions: async () => [],
    documentService: {
      upload: async () => ({ id: 'unused', version: 1, expiresAt: '2026-11-24' }),
      approve: async (authority, input) => { approvals.push({ authority, input }); return { id: input.versionId, status: 'approved' as const }; },
    },
    incidentId: () => 'incident-2',
  });
  const sha = 'a'.repeat(64);
  const approved = await handler(request(`action=approve_document_version&version_id=22222222-2222-4222-8222-222222222222&expected_version=1&review_before_sha256=${sha}&review_after_sha256=${sha}`));
  assertEquals(approved.status, 200);
  assertEquals(approvals.length, 1);

  for (const unsafe of [
    new Request('https://project.example.test/functions/v1/osp-document-api?action=list_document_versions', { method: 'POST', headers: { origin } }),
    request('action=list_document_versions&organization_id=22222222-2222-4222-8222-222222222222'),
    request('action=upload_document_version&document_type=proof_of_address&valid_from=2026-08-24', { headers: { 'content-type': 'text/html' }, body: 'x' }),
    new Request('https://project.example.test/functions/v1/osp-document-api?action=list_document_versions', { method: 'GET', headers: { origin, authorization: 'Bearer synthetic-token' } }),
  ]) {
    const response = await handler(unsafe);
    assertEquals(response.status >= 400, true);
    assertEquals(response.headers.get('cache-control'), 'no-store');
  }
});

Deno.test('document API preflight accepts the exact header set independent of order and rejects extras', async () => {
  const handler = createDocumentApiHandler({
    verifyToken: async () => identity,
    listVersions: async () => [],
    documentService: {
      upload: async () => ({ id: 'unused', version: 1, expiresAt: '2026-11-24' }),
      approve: async () => ({ id: 'unused', status: 'approved' as const }),
    },
    incidentId: () => 'incident-preflight',
  });
  const preflight = (query: string, headers: string) => new Request(`https://project.example.test/functions/v1/osp-document-api?${query}`, {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': headers,
    },
  });
  for (const [query, headers] of [
    ['action=list_document_versions', 'authorization'],
    [`action=approve_document_version&version_id=22222222-2222-4222-8222-222222222222&expected_version=1&review_before_sha256=${'a'.repeat(64)}&review_after_sha256=${'a'.repeat(64)}`, 'Authorization'],
    ['action=upload_document_version&document_type=proof_of_address&valid_from=2026-08-24', 'authorization, content-type'],
    ['action=upload_document_version&document_type=proof_of_address&valid_from=2026-08-24', 'content-type,authorization'],
  ]) {
    const response = await handler(preflight(query, headers));
    assertEquals(response.status, 204);
    assertEquals(response.headers.get('access-control-allow-origin'), origin);
  }
  for (const [query, headers] of [
    ['action=upload_document_version&document_type=proof_of_address&valid_from=2026-08-24', 'authorization'],
    ['action=list_document_versions', 'authorization, content-type'],
    ['action=list_document_versions', 'authorization, x-extra'],
    ['action=list_document_versions', 'authorization, authorization'],
    ['action=unknown', 'authorization'],
  ]) {
    const response = await handler(preflight(query, headers));
    assertEquals(response.status, 400);
    assertEquals(response.headers.get('access-control-allow-origin'), null);
  }
});
