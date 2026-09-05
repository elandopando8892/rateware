import assert from 'node:assert/strict';

import { createFormApiHandler } from './handler.ts';
import { createInMemoryFormStore } from './store.ts';

const organizationId = '11111111-1111-4111-8111-111111111111';
const caseId = '41111111-1111-4111-8111-111111111111';
const origin = 'http://localhost:8791';

Deno.test('answer memory review derives actor and tenant from verified identity, not the body', async () => {
  const calls: unknown[] = [];
  const subject = createFormApiHandler({
    store: { ...createInMemoryFormStore(), reviewAnswerMemory: async (input) => { calls.push(input); return { reviewId: caseId, decision: input.decision, replayed: false, approvedForReuse: false }; } },
    canonicalFieldIds: [],
    verifyToken: async (token) => ({ identity: { issuer: 'https://auth.example.test', authorizedParty: 'client', subject: 'verified-operator', organization: organizationId, email: 'operator@example.test', emailVerified: true }, permissions: token === 'read-token' ? ['osp:read'] : ['osp:operate'] }),
  });
  const payload = { version: 1, action: 'review_answer_memory', case_id: caseId, candidate_id: caseId, answer_sha256: 'a'.repeat(64), decision: 'accepted', reason: 'Verified synthetic answer.', idempotency_key: 'review-one' };
  assert.equal((await subject(request(payload, 'read-token'))).status, 403);
  assert.equal((await subject(request({ ...payload, organization_id: organizationId }))).status, 400);
  assert.equal((await subject(request({ ...payload, reason: 'short' }))).status, 400);
  assert.equal((await subject(request({ ...payload, decision: ['accepted'] }))).status, 400);
  assert.equal(calls.length, 0);
  const result = await subject(request(payload));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).data.approvedForReuse, false);
  assert.deepEqual(calls, [{ organizationId, subject: 'verified-operator', permission: 'osp:operate', caseId, candidateId: caseId, answerSha256: 'a'.repeat(64), decision: 'accepted', reason: 'Verified synthetic answer.', idempotencyKey: 'review-one' }]);
});
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
    store: createInMemoryFormStore(() => new Date('2026-08-26T20:00:00.000Z'), [{ organizationId, caseId, supplierName: 'Synthetic supplier', caseVersion: 4, caseState: 'preparing' }]),
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

Deno.test('reference constraints survive publishing and block incomplete submission before persistence', async () => {
  const subject = handler();
  const survey = { title: 'Reference requirements', pages: [{ name: 'references', elements: [{ type: 'matrixdynamic', name: 'references', title: 'References', ospKind: 'repeating_table', isRequired: true, minRowCount: 3, maxRowCount: 4, keyName: 'company', columns: [
    { name: 'company', title: 'Company', cellType: 'text', isRequired: true },
    { name: 'email', title: 'Email', cellType: 'text', inputType: 'email', isRequired: true },
  ] }] }] };
  const saved = await subject(request({ version: 1, action: 'save_form_template_draft', idempotency_key: 'refs-template', template_id: null, expected_version: 0, name: 'References', survey_json: survey }));
  assert.equal(saved.status, 201);
  const template = (await saved.json()).data.template;
  const published = await subject(request({ version: 1, action: 'publish_form_template', idempotency_key: 'refs-publish', template_id: template.templateId, template_version_id: template.latest.id, expected_version: 1 }));
  assert.equal(published.status, 200);
  const read = async () => (await (await subject(request({ version: 1, action: 'get_case_form_workspace', case_id: caseId }))).json()).data;
  assert.equal((await read()).template.fields[0].definition.minRows, 3);
  const command = { version: 1, action: 'submit_case_form_for_review', case_id: caseId, expected_case_version: 4, template_version_id: template.latest.id, instance_id: null, expected_version: 0 };
  const complete = ['A', 'B', 'C'].map((company) => ({ company, email: `${company}@example.test` }));
  const invalid = [complete.slice(0, 2), complete.map(({ company }) => ({ company })), [...complete.slice(0, 2), complete[0]]];
  for (const [index, references] of invalid.entries()) {
    const blocked = await subject(request({ ...command, idempotency_key: `refs-blocked-${index}`, values: { references } }));
    assert.equal(blocked.status, 400);
    const state = await read();
    assert.equal(state.instance, null);
    assert.equal(state.caseState, 'preparing');
    assert.equal(state.caseVersion, 4);
  }
  const accepted = await subject(request({ ...command, idempotency_key: 'refs-complete', values: { references: complete } }));
  assert.equal(accepted.status, 200);
  assert.equal((await read()).caseState, 'operations_review');
});

Deno.test('form API binds a published template to a case and saves an idempotent draft', async () => {
  const subject = handler();
  const saved = await subject(request({ version: 1, action: 'save_form_template_draft', idempotency_key: 'case-template-save', template_id: null, expected_version: 0, name: 'Customer setup — Case', survey_json: surveyJson }));
  const template = (await saved.json()).data.template;
  await subject(request({ version: 1, action: 'publish_form_template', idempotency_key: 'case-template-publish', template_id: template.templateId, template_version_id: template.latest.id, expected_version: 1 }));

  const workspace = await subject(request({ version: 1, action: 'get_case_form_workspace', case_id: caseId }, 'read-token'));
  const workspaceBody = (await workspace.json()).data;
  assert.equal(workspaceBody.supplierName, 'Synthetic supplier');
  assert.equal(workspaceBody.template.status, 'published');
  assert.deepEqual(workspaceBody.capabilities, { saveDraft: false, acceptMapping: false, correctMapping: false, submitForReview: false });
  assert.deepEqual(workspaceBody.mappings, []);

  const command = { version: 1, action: 'save_case_form_draft', idempotency_key: 'case-form-save', case_id: caseId, template_version_id: template.latest.id, instance_id: null, expected_version: 0, values: { legal_name: 'Synthetic supplier' } };
  const first = await subject(request(command));
  assert.equal(first.status, 200);
  const firstBody = (await first.json()).data;
  assert.equal(firstBody.instance.version, 1);
  const replay = await subject(request(command));
  assert.equal((await replay.json()).data.replayed, true);

  const unchanged = await subject(request({ ...command, idempotency_key: 'case-form-save-unchanged', instance_id: firstBody.instance.id, expected_version: 1 }));
  assert.equal((await unchanged.json()).data.instance.version, 1);
  const changed = await subject(request({ ...command, idempotency_key: 'case-form-save-changed', instance_id: firstBody.instance.id, expected_version: 1, values: { legal_name: 'Synthetic supplier updated' } }));
  assert.equal((await changed.json()).data.instance.version, 2);

  const current = await subject(request({ version: 1, action: 'get_case_form_workspace', case_id: caseId }));
  assert.deepEqual((await current.json()).data.instance.values, { legal_name: 'Synthetic supplier updated' });

  const submitted = await subject(request({ version: 1, action: 'submit_case_form_for_review', idempotency_key: 'case-form-submit', case_id: caseId, expected_case_version: 4, template_version_id: template.latest.id, instance_id: firstBody.instance.id, expected_version: 2, values: { legal_name: 'Synthetic supplier updated' } }));
  assert.equal(submitted.status, 200);
  const submittedBody = (await submitted.json()).data;
  assert.equal(submittedBody.caseState, 'operations_review');
  assert.equal(submittedBody.caseVersion, 5);
  assert.match(submittedBody.snapshotSha256, /^[0-9a-f]{64}$/);

  const locked = await subject(request({ ...command, idempotency_key: 'case-form-save-after-submit', instance_id: firstBody.instance.id, expected_version: 2 }));
  assert.equal(locked.status, 400);
});

Deno.test('form API accepts only an exact authorized mapping fingerprint command', async () => {
  const accepted: unknown[] = [];
  const base = createInMemoryFormStore(() => new Date('2026-08-26T20:00:00.000Z'), [{ organizationId, caseId, supplierName: 'Synthetic supplier', caseVersion: 4, caseState: 'preparing' }]);
  const subject = createFormApiHandler({
    store: { ...base, acceptCaseFormMapping: async (input) => {
      accepted.push(input);
      return { mappingId: input.mappingId, mappingVersion: input.expectedMappingVersion, status: 'accepted', reviewDecisionId: '51111111-1111-4111-8111-111111111111', documentVersionId: '61111111-1111-4111-8111-111111111111', extractionId: '71111111-1111-4111-8111-111111111111', reviewedFieldCount: 2, replayed: false };
    } },
    canonicalFieldIds: ['supplier.legalName'],
    verifyToken: async (token: string) => ({ identity: { issuer: 'https://auth.example.test', authorizedParty: 'client', subject: 'operator', organization: organizationId, email: 'operator@example.test', emailVerified: true as const }, permissions: token === 'read-token' ? ['osp:read'] : ['osp:operate'] }),
    incidentId: () => 'incident-synthetic',
  });
  const command = { version: 1, action: 'accept_case_form_mapping', idempotency_key: 'mapping-accept-1', case_id: caseId, mapping_id: '51111111-1111-4111-8111-111111111112', expected_mapping_version: 3, expected_after_sha256: 'a'.repeat(64) };
  const response = await subject(request(command));
  assert.equal(response.status, 200);
  assert.deepEqual(accepted, [{ organizationId, subject: 'operator', idempotencyKey: 'mapping-accept-1', caseId, mappingId: command.mapping_id, expectedMappingVersion: 3, expectedAfterSha256: 'a'.repeat(64) }]);
  assert.equal((await subject(request(command, 'read-token'))).status, 403);
  assert.equal((await subject(request({ ...command, unexpected: true }))).status, 400);
});

Deno.test('form API records only an exact authorized current-instance correction command', async () => {
  const corrected: unknown[] = [];
  const base = createInMemoryFormStore(() => new Date('2026-08-26T20:00:00.000Z'), [{ organizationId, caseId, supplierName: 'Synthetic supplier', caseVersion: 4, caseState: 'preparing' }]);
  const subject = createFormApiHandler({
    store: { ...base, correctCaseFormMapping: async (input) => {
      corrected.push(input);
      return { mappingId: input.mappingId, mappingVersion: input.expectedMappingVersion + 1, status: 'corrected', reviewDecisionId: '51111111-1111-4111-8111-111111111111', evidenceDocumentVersionId: '61111111-1111-4111-8111-111111111111', extractionId: '71111111-1111-4111-8111-111111111111', reviewedFieldCount: 2, caseState: 'preparing', caseVersion: 5, replayed: false };
    } },
    canonicalFieldIds: ['banking.accountNumber'],
    verifyToken: async (token: string) => ({ identity: { issuer: 'https://auth.example.test', authorizedParty: 'client', subject: 'operator', organization: organizationId, email: 'operator@example.test', emailVerified: true as const }, permissions: token === 'read-token' ? ['osp:read'] : ['osp:operate'] }),
    incidentId: () => 'incident-synthetic',
  });
  const command = { version: 1, action: 'correct_case_form_mapping', idempotency_key: 'mapping-correct-1', case_id: caseId, mapping_id: '51111111-1111-4111-8111-111111111112', expected_mapping_version: 3, expected_after_sha256: 'a'.repeat(64), instance_id: '81111111-1111-4111-8111-111111111111', expected_instance_version: 2 };
  const response = await subject(request(command));
  assert.equal(response.status, 200);
  assert.deepEqual(corrected, [{ organizationId, subject: 'operator', idempotencyKey: 'mapping-correct-1', caseId, mappingId: command.mapping_id, expectedMappingVersion: 3, expectedAfterSha256: 'a'.repeat(64), instanceId: command.instance_id, expectedInstanceVersion: 2 }]);
  assert.equal((await subject(request(command, 'read-token'))).status, 403);
  assert.equal((await subject(request({ ...command, expected_instance_version: 0 }))).status, 400);
});
