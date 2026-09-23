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
const conversionReview = {
  caseId: '22222222-2222-4222-8222-222222222222',
  sourceAttachmentId: '33333333-3333-4333-8333-333333333333',
  sourceSha256: 'a'.repeat(64),
  convertedDocumentVersionId: '44444444-4444-4444-8444-444444444444',
  convertedSha256: 'b'.repeat(64),
  sourcePageCount: 3,
  convertedPageCount: 3,
  fidelityConfirmed: true,
};

function request(query: string, init: RequestInit = {}) {
  const { headers, ...rest } = init;
  return new Request(`https://project.example.test/functions/v1/osp-document-api?${query}`, {
    method: 'POST', ...rest, headers: { origin, authorization: 'Bearer synthetic-token', ...headers },
  });
}

Deno.test('manual conversion review binds the authenticated operator and exact source hashes', async () => {
  const recorded: unknown[] = [];
  const base = {
    listVersions: async () => [],
    documentService: {
      upload: async () => ({ id: 'unused', version: 1, expiresAt: '2026-11-24' }),
      approve: async () => ({ id: 'unused', status: 'approved' as const }),
    },
    manualConversionStore: {
      recordManualConversionReview: async (input: unknown) => {
        recorded.push(input);
        return { conversionId: '55555555-5555-4555-8555-555555555555', replayed: false };
      },
      listManualConversionCandidates: async () => [],
    },
  };
  const handler = createDocumentApiHandler({ ...base, verifyToken: async () => identity });
  const body = JSON.stringify(conversionReview);
  const accepted = await handler(request('action=record_manual_conversion_review', {
    headers: { 'content-type': 'application/json' }, body,
  }));
  assertEquals(accepted.status, 200);
  assertEquals(recorded, [{
    organizationId: identity.identity.organization,
    reviewerSubject: identity.identity.subject,
    ...conversionReview,
  }]);

  const reader = createDocumentApiHandler({ ...base, verifyToken: async () => readOnlyIdentity });
  const denied = await reader(request('action=record_manual_conversion_review', {
    headers: { 'content-type': 'application/json' }, body,
  }));
  assertEquals(denied.status, 403);
  const wrongPages = await handler(request('action=record_manual_conversion_review', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...conversionReview, convertedPageCount: 2 }),
  }));
  assertEquals(wrongPages.status, 400);
  assertEquals(recorded.length, 1);
});

Deno.test('manual conversion candidates require exact source identity and an operator', async () => {
  const calls: unknown[] = [];
  const base = {
    listVersions: async () => [],
    documentService: { upload: async () => ({ id: 'unused', version: 1, expiresAt: '2026-11-24' }),
      approve: async () => ({ id: 'unused', status: 'approved' as const }) },
    manualConversionStore: {
      recordManualConversionReview: async () => { throw new Error('not used'); },
      listManualConversionCandidates: async (input: unknown) => {
        calls.push(input);
        return [{ id: conversionReview.convertedDocumentVersionId,
          convertedSha256: conversionReview.convertedSha256, version: 1,
          status: 'review_required' as const, createdAt: '2026-09-22T00:00:00.000Z', conversionId: null }];
      },
    },
  };
  const query = `action=list_manual_conversion_candidates&case_id=${conversionReview.caseId}&source_attachment_id=${conversionReview.sourceAttachmentId}&source_sha256=${conversionReview.sourceSha256}`;
  const handler = createDocumentApiHandler({ ...base, verifyToken: async () => identity });
  const response = await handler(request(query));
  assertEquals(response.status, 200);
  assertEquals((await response.json()).data.candidates[0].status, 'review_required');
  assertEquals(calls, [{ organizationId: identity.identity.organization, caseId: conversionReview.caseId,
    sourceAttachmentId: conversionReview.sourceAttachmentId, sourceSha256: conversionReview.sourceSha256 }]);
  const reader = createDocumentApiHandler({ ...base, verifyToken: async () => readOnlyIdentity });
  assertEquals((await reader(request(query))).status, 403);
  assertEquals((await handler(request(`${query}&extra=1`))).status, 400);
  assertEquals(calls.length, 1);
});

Deno.test('case conversion upload binds exact case and source to an Operations identity', async () => {
  const uploads: unknown[] = [];
  const documentService = {
    upload: async () => ({ id: 'unused', version: 1, expiresAt: '2026-11-24' }),
    approve: async () => ({ id: 'unused', status: 'approved' as const }),
    uploadCaseConversion: async (authority: unknown, input: unknown) => {
      uploads.push({ authority, input });
      return { id: '55555555-5555-4555-8555-555555555555', version: 1, convertedSha256: 'b'.repeat(64) };
    },
  };
  const query = `action=upload_case_conversion&case_id=${conversionReview.caseId}&source_attachment_id=${conversionReview.sourceAttachmentId}&source_sha256=${conversionReview.sourceSha256}`;
  const body = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  const handler = createDocumentApiHandler({ verifyToken: async () => identity,
    listVersions: async () => [], documentService });
  const accepted = await handler(request(query, { headers: { 'content-type':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, body }));
  assertEquals(accepted.status, 201);
  assertEquals((uploads[0] as { authority: { subject: string } }).authority.subject, identity.identity.subject);
  assertEquals((uploads[0] as { input: { sourceSha256: string } }).input.sourceSha256, conversionReview.sourceSha256);
  const reader = createDocumentApiHandler({ verifyToken: async () => readOnlyIdentity,
    listVersions: async () => [], documentService });
  assertEquals((await reader(request(query, { headers: { 'content-type':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, body }))).status, 403);
  assertEquals(uploads.length, 1);
});

Deno.test('manual source link requires an authenticated operator and exact source identity', async () => {
  const calls: unknown[] = [];
  const documentService = {
    upload: async () => ({ id: 'unused', version: 1, expiresAt: '2026-11-24' }),
    approve: async () => ({ id: 'unused', status: 'approved' as const }),
    manualConversionSource: async (authority: unknown, input: unknown) => {
      calls.push({ authority, input });
      return { downloadUrl: 'https://storage.example.test/private', filename: 'source.doc',
        sourceSha256: conversionReview.sourceSha256, expiresInSeconds: 60 };
    },
  };
  const query = `action=get_manual_conversion_source&case_id=${conversionReview.caseId}&source_attachment_id=${conversionReview.sourceAttachmentId}&source_sha256=${conversionReview.sourceSha256}`;
  const handler = createDocumentApiHandler({ verifyToken: async () => identity,
    listVersions: async () => [], documentService });
  assertEquals((await handler(request(query))).status, 200);
  assertEquals(calls.length, 1);
  const reader = createDocumentApiHandler({ verifyToken: async () => readOnlyIdentity,
    listVersions: async () => [], documentService });
  assertEquals((await reader(request(query))).status, 403);
  assertEquals(calls.length, 1);
});

Deno.test('converted DOCX link is bound to the exact candidate and denied to readers', async () => {
  const calls: unknown[] = [];
  const documentService = {
    upload: async () => ({ id: 'unused', version: 1, expiresAt: '2026-11-24' }),
    approve: async () => ({ id: 'unused', status: 'approved' as const }),
    manualConversionCandidate: async (authority: unknown, input: unknown) => {
      calls.push({ authority, input });
      return { downloadUrl: 'https://storage.example.test/review', convertedSha256: conversionReview.convertedSha256, expiresInSeconds: 60 };
    },
  };
  const query = `action=get_manual_conversion_candidate&case_id=${conversionReview.caseId}&source_attachment_id=${conversionReview.sourceAttachmentId}&source_sha256=${conversionReview.sourceSha256}&converted_document_version_id=${conversionReview.convertedDocumentVersionId}`;
  const handler = createDocumentApiHandler({ verifyToken: async () => identity,
    listVersions: async () => [], documentService });
  assertEquals((await handler(request(query))).status, 200);
  assertEquals((calls[0] as { input: { convertedDocumentVersionId: string } }).input.convertedDocumentVersionId,
    conversionReview.convertedDocumentVersionId);
  const reader = createDocumentApiHandler({ verifyToken: async () => readOnlyIdentity,
    listVersions: async () => [], documentService });
  assertEquals((await reader(request(query))).status, 403);
  assertEquals((await handler(request(`${query}&extra=1`))).status, 400);
  assertEquals(calls.length, 1);
});

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

Deno.test('document API separates profile review from explicit fact promotion and rejects a read-only identity', async () => {
  const calls: Array<{ action: string; input: Record<string, unknown> }> = [];
  const reviewId = '44444444-4444-4444-8444-444444444444';
  const fieldId = '55555555-5555-4555-8555-555555555555';
  const profileReviewStore = {
    claimProfileReview: async (input: Record<string, unknown>) => {
      calls.push({ action: 'claim', input });
      return { reviewId, reviewStatus: 'in_review' as const, revision: 2 };
    },
    decideProfileReviewField: async (input: Record<string, unknown>) => {
      calls.push({ action: 'decide', input });
      return { reviewId, fieldId, fieldStatus: 'accepted' as const, revision: 3 };
    },
    finalizeProfileReview: async (input: Record<string, unknown>) => {
      calls.push({ action: 'finalize', input });
      return { reviewId, reviewStatus: 'approved' as const, verificationStatus: 'verified' as const, revision: 4 };
    },
    promoteProfileReviewFacts: async (input: Record<string, unknown>) => {
      calls.push({ action: 'promote', input });
      return { promotionId: '66666666-6666-4666-8666-666666666666', promotionStatus: 'applied' as const, promotedFactCount: 2, unchangedFactCount: 1, withheldFieldCount: 1, reviewId, reviewRevision: 4, replayed: false };
    },
  };
  const handler = createDocumentApiHandler({
    verifyToken: async () => identity,
    listVersions: async () => [],
    documentService: {
      upload: async () => ({ id: 'unused', version: 1, expiresAt: '2026-11-24' }),
      approve: async () => ({ id: 'unused', status: 'approved' as const }),
    },
    profileReviewStore,
    incidentId: () => 'incident-profile-review',
  });
  const jsonRequest = (action: string, body: Record<string, unknown>) => request(`action=${action}`, {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  assertEquals((await handler(jsonRequest('claim_profile_review', { reviewId, expectedRevision: 1 }))).status, 200);
  assertEquals((await handler(jsonRequest('decide_profile_review_field', {
    reviewId, fieldId, expectedRevision: 2, decision: 'accepted', decisionNote: 'Evidence matches the proposed value.', reviewerValue: null,
  }))).status, 200);
  assertEquals((await handler(jsonRequest('finalize_profile_review', {
    reviewId, expectedRevision: 3, decision: 'approved', decisionNote: 'All documentary evidence was reviewed.',
  }))).status, 200);
  assertEquals(calls.map(({ action }) => action), ['claim', 'decide', 'finalize']);
  assertEquals((await handler(jsonRequest('promote_profile_review_facts', {
    reviewId, expectedRevision: 4, candidateSha256: 'a'.repeat(64), comparisonSha256: 'b'.repeat(64),
    expectedCurrentFactIds: { legal_name: null }, confirmation: 'PROMOTE_VERIFIED_PROFILE_FACTS',
  }))).status, 200);
  assertEquals(calls.map(({ action }) => action), ['claim', 'decide', 'finalize', 'promote']);
  assertEquals(calls.find(({ action }) => action === 'promote')?.input.comparisonSha256, 'b'.repeat(64));
  assertEquals((await handler(jsonRequest('promote_profile_review_facts', {
    reviewId, expectedRevision: 4, candidateSha256: 'a'.repeat(64),
    expectedCurrentFactIds: { legal_name: null }, confirmation: 'PROMOTE_VERIFIED_PROFILE_FACTS',
  }))).status, 400);
  assertEquals(calls.filter(({ action }) => action === 'promote').length, 1);
  assertEquals(calls.every(({ input }) => input.organizationId === identity.identity.organization && input.actorSubject === identity.identity.subject), true);
  assertEquals(calls.some(({ input }) => 'send' in input), false);

  const readOnly = createDocumentApiHandler({
    verifyToken: async () => readOnlyIdentity,
    listVersions: async () => [],
    documentService: {
      upload: async () => ({ id: 'unused', version: 1, expiresAt: '2026-11-24' }),
      approve: async () => ({ id: 'unused', status: 'approved' as const }),
    },
    profileReviewStore,
    incidentId: () => 'incident-profile-review-forbidden',
  });
  assertEquals((await readOnly(jsonRequest('claim_profile_review', { reviewId, expectedRevision: 1 }))).status, 403);
  assertEquals((await readOnly(jsonRequest('promote_profile_review_facts', {
    reviewId, expectedRevision: 4, candidateSha256: 'a'.repeat(64), comparisonSha256: 'b'.repeat(64),
    expectedCurrentFactIds: { legal_name: null }, confirmation: 'PROMOTE_VERIFIED_PROFILE_FACTS',
  }))).status, 403);
  assertEquals(calls.length, 4);
});

Deno.test('document API binds one XBF entity and assembles only a reference-only internal draft', async () => {
  const caseId = '22222222-2222-4222-8222-222222222222';
  const legalEntityId = '33333333-3333-4333-8333-333333333333';
  const calls: Array<{ action: string; input: Record<string, unknown> }> = [];
  const profileReviewStore = {
    claimProfileReview: async () => { throw new Error('not used'); },
    decideProfileReviewField: async () => { throw new Error('not used'); },
    finalizeProfileReview: async () => { throw new Error('not used'); },
    bindCaseProfile: async (input: Record<string, unknown>) => { calls.push({ action: 'bind', input }); return { caseId, legalEntityId, entityCode: 'XBFUS', bindingRevision: 1, caseVersion: 2, replayed: false }; },
    assembleCaseProfileDraft: async (input: Record<string, unknown>) => { calls.push({ action: 'draft', input }); return { draftId: '77777777-7777-4777-8777-777777777777', manifestSha256: 'b'.repeat(64), factCount: 21, restrictedFactCount: 7, caseVersion: 3, replayed: false }; },
  };
  const handler = createDocumentApiHandler({ verifyToken: async () => identity, listVersions: async () => [], documentService: { upload: async () => ({ id: 'unused', version: 1, expiresAt: '2026-11-24' }), approve: async () => ({ id: 'unused', status: 'approved' as const }) }, profileReviewStore, incidentId: () => 'incident-package-draft' });
  const postJson = (action: string, body: Record<string, unknown>) => handler(request(`action=${action}`, { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  assertEquals((await postJson('bind_case_profile', { caseId, legalEntityId, expectedCaseVersion: 1, expectedBindingRevision: 0, confirmation: 'BIND_CASE_TO_XBF_ENTITY' })).status, 200);
  assertEquals((await postJson('assemble_case_profile_draft', { caseId, expectedCaseVersion: 2, expectedBindingRevision: 1, expectedFactsSha256: 'a'.repeat(64), confirmation: 'ASSEMBLE_INTERNAL_PROFILE_DRAFT' })).status, 200);
  assertEquals(calls.map(({ action }) => action), ['bind', 'draft']);
  assertEquals(calls.every(({ input }) => input.organizationId === identity.identity.organization && input.actorPermission === 'osp:operate'), true);
  const readOnly = createDocumentApiHandler({ verifyToken: async () => readOnlyIdentity, listVersions: async () => [], documentService: { upload: async () => ({ id: 'unused', version: 1, expiresAt: '2026-11-24' }), approve: async () => ({ id: 'unused', status: 'approved' as const }) }, profileReviewStore, incidentId: () => 'incident-package-forbidden' });
  assertEquals((await readOnly(request('action=bind_case_profile', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ caseId, legalEntityId, expectedCaseVersion: 1, expectedBindingRevision: 0, confirmation: 'BIND_CASE_TO_XBF_ENTITY' }) }))).status, 403);
  assertEquals(calls.length, 2);
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
    ['action=claim_profile_review', 'authorization, content-type'],
    ['action=decide_profile_review_field', 'content-type, authorization'],
    ['action=finalize_profile_review', 'authorization,content-type'],
    ['action=promote_profile_review_facts', 'authorization,content-type'],
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
