import assert from 'node:assert/strict';

import { createFormApiHandler } from './handler.ts';
import { createInMemoryFormStore } from './store.ts';

const organizationId = '11111111-1111-4111-8111-111111111111';
const origin = 'http://localhost:8791';
const surveyJson = {
  title: 'XBF customer setup', pages: [{ name: 'company', elements: [
    { type: 'text', name: 'legal_name', title: 'Legal name', isRequired: true, ospKind: 'text', ospCanonicalFieldId: 'supplier.legalName', minLength: 1, maxLength: 256 },
  ] }],
};

function request(body: unknown, token = 'operate-token') {
  return new Request('https://project.example.test/functions/v1/osp-form-api', {
    method: 'POST', headers: { origin, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

function handler() {
  return createFormApiHandler({
    store: createInMemoryFormStore(),
    canonicalFieldIds: ['supplier.legalName', 'supplier.address', 'fiscal.taxIdentifier', 'banking.accountNumber'],
    verifyToken: async (token: string) => ({
      identity: { issuer: 'https://auth.example.test', authorizedParty: 'client', subject: 'operator', organization: token === 'second-org-token' ? '33333333-3333-4333-8333-333333333333' : organizationId, email: 'operator@example.test', emailVerified: true as const },
      permissions: token === 'read-token' ? ['osp:read'] : ['osp:operate'],
    }),
    incidentId: () => 'incident-synthetic',
  });
}

Deno.test('form API persists a tenant draft, lists it, and publishes the exact immutable version', async () => {
  const subject = handler();
  const saved = await subject(request({ version: 1, action: 'save_form_template_draft', idempotency_key: 'save-1', template_id: null, expected_version: 0, name: 'Customer setup — Core', survey_json: surveyJson }));
  assert.equal(saved.status, 201);
  const receipt = (await saved.json()).data;
  assert.equal(receipt.template.latest.status, 'draft');
  assert.equal(receipt.template.latest.version, 1);

  const listed = await subject(request({ version: 1, action: 'list_form_templates' }, 'read-token'));
  assert.equal(listed.status, 200);
  assert.deepEqual((await listed.json()).data.capabilities, { saveDraft: false, publish: false });

  const published = await subject(request({ version: 1, action: 'publish_form_template', idempotency_key: 'publish-1', template_id: receipt.template.templateId, template_version_id: receipt.template.latest.id, expected_version: 1 }));
  assert.equal(published.status, 200);
  assert.equal((await published.json()).data.template.latest.status, 'published');
});

Deno.test('form API derives tenant scope from the verified token and replays idempotent writes', async () => {
  const subject = handler();
  const command = { version: 1, action: 'save_form_template_draft', idempotency_key: 'save-idempotent', template_id: null, expected_version: 0, name: 'Customer setup — Scoped', survey_json: surveyJson };
  const first = await subject(request(command));
  const second = await subject(request(command));
  assert.equal((await second.json()).data.replayed, true);
  const foreignList = await subject(request({ version: 1, action: 'list_form_templates' }, 'second-org-token'));
  assert.deepEqual((await foreignList.json()).data.templates, []);
  assert.equal(first.status, 201);
});

Deno.test('form API fails closed for unsafe schemas and read-only writes', async () => {
  const subject = handler();
  const unsafe = structuredClone(surveyJson);
  unsafe.pages[0].elements[0].title = '<script>alert(1)</script>';
  assert.equal((await subject(request({ version: 1, action: 'save_form_template_draft', idempotency_key: 'save-unsafe', template_id: null, expected_version: 0, name: 'Unsafe', survey_json: unsafe }))).status, 400);
  assert.equal((await subject(request({ version: 1, action: 'save_form_template_draft', idempotency_key: 'save-read', template_id: null, expected_version: 0, name: 'Read only', survey_json: surveyJson }, 'read-token'))).status, 403);
});

Deno.test('form API exposes an exact browser preflight without credentials', async () => {
  const response = await handler()(new Request('https://project.example.test/functions/v1/osp-form-api', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' } }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.has('access-control-allow-credentials'), false);
});
