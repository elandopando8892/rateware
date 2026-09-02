import { expect, test, type Page, type Route } from '@playwright/test';
import { generateKeyPair, jwtVerify, SignJWT, type KeyLike } from 'jose';

const organizationId = '11111111-1111-4111-8111-111111111111';
const otherOrganizationId = '22222222-2222-4222-8222-222222222222';
const caseId = '33333333-3333-4333-8333-333333333333';
const payloadId = '44444444-4444-4444-8444-444444444444';
const editedPayloadId = '99999999-9999-4999-8999-999999999999';
const approvalId = '55555555-5555-4555-8555-555555555555';
const sha = 'a'.repeat(64);
const signedSha = 'b'.repeat(64);
const mimeSha = 'd'.repeat(64);
type Actor = { subject: string; email: string; organization?: string; permissions: string[] };
type State = { version: number; payloadVersion: number; stage: 'awaiting_clarification' | 'operations_review' | 'signature_approval' | 'sales_authorization' | 'ready_to_send' | 'manual_reconciliation_required'; kind: 'clarification' | 'final_response'; payload: 'none' | 'draft' | 'frozen' | 'authorized' | 'send_pending'; activePayloadId?: string; reservations: number; signaturePending?: boolean; outcome?: 'manual_reconciliation_required'; seen: Set<string>; sendKeys?: string[]; dropNextSendResponse?: boolean; workerReceipts?: Set<string>; workerTransitions?: number };

let privateKey: KeyLike;
let publicKey: KeyLike;
test.beforeAll(async () => { ({ privateKey, publicKey } = await generateKeyPair('RS256')); });

async function token(actor: Actor) {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    email: actor.email,
    email_verified: true,
    org_code: actor.organization ?? organizationId,
    permissions: actor.permissions,
    azp: 'osp-e2e-client',
    sid: `osp-e2e-${actor.subject}`,
    auth_time: now,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'osp-e2e' }).setIssuer('https://auth.heymarksman.com').setAudience('https://osp.heymarksman.com/api')
    .setSubject(actor.subject).setIssuedAt(now).setNotBefore(now).setExpirationTime('5m').sign(privateKey);
}

async function open(page: Page, actor: Actor, stage: string) {
  const signed = await token(actor);
  await page.addInitScript((value) => sessionStorage.setItem('osp-e2e-actor', JSON.stringify(value)), { ...actor, organization: actor.organization ?? organizationId, token: signed });
  await page.goto(`/app/e2e/approval-communications.html?stage=${stage}`);
}

function workspace(state: State, claims: { email?: unknown; permissions?: unknown; org_code?: unknown }) {
  const permissions = Array.isArray(claims.permissions) ? claims.permissions : [];
  const consequences = permissions.filter((item) => ['osp:operate', 'osp:signature-approve', 'osp:sales-authorize', 'osp:send-authorized'].includes(String(item)));
  const exact = consequences.length === 1;
  const operations = exact && consequences[0] === 'osp:operate';
  const replyContext = state.kind === 'final_response' ? {
    to: ['requester@xbfreight.com'],
    cc: ['supplier@example.test', 'sales@heymarksman.com'],
    subject: 'Re: Supplier registration request',
    inReplyTo: '<supplier-request@example.test>',
    references: ['<supplier-request@example.test>'],
  } : null;
  const outbound = state.payload === 'none' ? null : {
    payloadId: state.activePayloadId ?? payloadId, kind: state.kind, status: state.payload, caseVersion: state.payloadVersion, from: 'carriers@xbfreight.com',
    to: state.kind === 'final_response' ? replyContext!.to : ['supplier@example.test'], cc: state.kind === 'final_response' ? replyContext!.cc : ['sales@heymarksman.com'],
    subject: state.kind === 'final_response' ? replyContext!.subject : 'Supplier registration response',
    inReplyTo: state.kind === 'final_response' ? replyContext!.inReplyTo : null, references: state.kind === 'final_response' ? replyContext!.references : [],
    bodyText: 'The reviewed supplier package is ready.',
    attachments: state.kind === 'final_response' ? [{ name: 'Formato 3.3 Alta Cliente.pdf', contentType: 'application/pdf', sha256: signedSha }] : [],
    attachmentSha256: state.kind === 'final_response' ? [signedSha] : [], mimeSha256: state.payload === 'draft' ? null : mimeSha, salesAuthorizationId: ['authorized', 'send_pending'].includes(state.payload) ? approvalId : null, sendOutcome: state.outcome ?? (state.reservations ? 'reserved' : null),
  };
  return {
    caseId, caseVersion: state.version, caseState: state.stage,
    inputSnapshot: { sha256: sha, documentCount: 4, extractionCount: 18, reviewDecisionCount: 3, formInstanceVersion: 2 },
    supplierPackage: state.stage === 'operations_review' ? { packageId: '77777777-7777-4777-8777-777777777777', version: 1, outputSha256: sha, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', downloadUrl: null } : null,
    signedPackage: ['sales_authorization', 'ready_to_send', 'manual_reconciliation_required'].includes(state.stage) ? { packageId: '88888888-8888-4888-8888-888888888888', outputSha256: signedSha, contentType: 'application/pdf' } : null,
    replyContext,
    signature: { positionVersion: 3, approvalStatus: state.stage === 'signature_approval' ? 'pending' : 'approved', approvalId: state.signaturePending ? approvalId : state.stage === 'signature_approval' ? null : approvalId, outputSha256: state.stage === 'signature_approval' ? null : signedSha },
    outbound,
    capabilities: {
      completeOperationsReview: operations && state.stage === 'operations_review',
      approveAndApplySignature: exact && claims.email === 'jgonzalez@xbfreight.com' && consequences[0] === 'osp:signature-approve' && state.stage === 'signature_approval' && !state.signaturePending,
      saveOutboundDraft: operations && state.kind === 'final_response' && state.stage === 'sales_authorization' && (state.payload === 'none' || state.payload === 'draft'),
      freezeOutboundPayload: operations && state.payload === 'draft' && state.payloadVersion === state.version,
      authorizeOutboundPayload: exact && claims.email === 'sales@heymarksman.com' && consequences[0] === 'osp:sales-authorize' && state.payload === 'frozen' && state.payloadVersion === state.version && ((state.kind === 'clarification' && state.stage === 'awaiting_clarification') || (state.kind === 'final_response' && state.stage === 'sales_authorization')),
      requestAuthorizedSend: exact && claims.email === 'carriers@xbfreight.com' && consequences[0] === 'osp:send-authorized' && state.stage === 'ready_to_send' && state.payload === 'authorized' && state.payloadVersion + 1 === state.version,
    },
  };
}

function exactQuery(url: URL, names: readonly string[]): boolean {
  const actual = [...url.searchParams.keys()].sort();
  const expected = [...names].sort();
  return actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    actual.every((name, index) => name === expected[index]);
}

function finalDraftBody(draftPayloadId = editedPayloadId, bodyText = 'Edited after authorization.') {
  return {
    attachments: [{
      bucketId: 'osp-derived-documents',
      contentType: 'application/pdf',
      name: 'XBF-signed-supplier-package.pdf',
      objectId: '88888888-8888-4888-8888-888888888888',
      sha256: signedSha,
    }],
    bodyText,
    cc: [
      { email: 'supplier@example.test', source: 'reviewed_manual' },
      { email: 'sales@heymarksman.com', source: 'reviewed_manual' },
    ],
    from: 'carriers@xbfreight.com',
    inReplyTo: '<supplier-request@example.test>',
    kind: 'final_response',
    payloadId: draftPayloadId,
    references: ['<supplier-request@example.test>'],
    subject: 'Re: Supplier registration request',
    to: [{ email: 'requester@xbfreight.com', source: 'reviewed_manual' }],
  };
}

async function installUiContractFixture(page: Page, state: State) {
  await page.route('**/functions/v1/osp-document-api?**', async (route: Route) => {
    const request = route.request();
    const authorization = request.headers().authorization ?? '';
    let claims: Record<string, unknown>;
    try { claims = (await jwtVerify(authorization.replace(/^Bearer /, ''), publicKey, { issuer: 'https://auth.heymarksman.com', audience: 'https://osp.heymarksman.com/api' })).payload; }
    catch { await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAUTHORIZED', incident_id: 'e2e-document-auth' } }) }); return; }
    const url = new URL(request.url());
    const permissions = Array.isArray(claims.permissions) ? claims.permissions.map(String) : [];
    if (request.method() !== 'POST' || claims.org_code !== organizationId || claims.email !== 'operations@example.test' ||
      permissions.filter((item) => ['osp:operate', 'osp:signature-approve', 'osp:sales-authorize', 'osp:send-authorized'].includes(item)).join(',') !== 'osp:operate' ||
      !exactQuery(url, ['action', 'case_id', 'document_version_id']) || url.searchParams.get('action') !== 'approve_document_version' ||
      url.searchParams.get('case_id') !== caseId) {
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'FORBIDDEN', incident_id: 'e2e-document-forbidden' } }) }); return;
    }
    state.stage = 'operations_review'; state.version += 1; state.payloadVersion = state.version;
    state.signaturePending = false; state.payload = 'draft';
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { caseId, state: state.stage, caseVersion: state.version } }) });
  });
  await page.route('**/functions/v1/osp-worker-webhook?**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const receiptId = url.searchParams.get('receipt_id') ?? '';
    if (request.method() !== 'POST' || request.headers()['x-osp-worker-fixture'] !== 'local-only' ||
      !exactQuery(url, ['action', 'approval_id', 'receipt_id']) || url.searchParams.get('action') !== 'signature_applied' ||
      url.searchParams.get('approval_id') !== approvalId || !/^[0-9a-f-]{36}$/.test(receiptId)) {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INVALID_REQUEST', incident_id: 'e2e-worker-invalid' } }) }); return;
    }
    state.workerReceipts ??= new Set<string>();
    const replayed = state.workerReceipts.has(receiptId);
    if (!replayed) {
      state.workerReceipts.add(receiptId); state.workerTransitions = (state.workerTransitions ?? 0) + 1;
      if (state.stage === 'signature_approval' && state.signaturePending) {
        state.signaturePending = false; state.stage = 'sales_authorization'; state.version += 1; state.payloadVersion = state.version; state.payload = 'none';
      }
    }
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ data: { approvalId, replayed } }) });
  });
  await page.route('**/functions/v1/osp-case-api?**', async (route: Route) => {
    const request = route.request();
    const authorization = request.headers().authorization ?? '';
    let claims: Record<string, unknown>;
    try { claims = (await jwtVerify(authorization.replace(/^Bearer /, ''), publicKey, { issuer: 'https://auth.heymarksman.com', audience: 'https://osp.heymarksman.com/api' })).payload; }
    catch { await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAUTHORIZED', incident_id: 'e2e-auth' } }) }); return; }
    const url = new URL(request.url());
    const action = url.searchParams.get('action');
    const permissions = Array.isArray(claims.permissions) ? claims.permissions.map(String) : [];
    const authorityPermissions = permissions.filter((item) => ['osp:operate', 'osp:signature-approve', 'osp:sales-authorize', 'osp:send-authorized'].includes(item));
    const operations = authorityPermissions.length === 1 && authorityPermissions[0] === 'osp:operate';
    const deny = async (code = 'FORBIDDEN', status = 403) => await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: { code, incident_id: `e2e-${code.toLowerCase()}` } }) });
    if (claims.org_code !== organizationId || url.searchParams.get('case_id') !== caseId) { await deny(); return; }
    const view = workspace(state, claims);
    if (action === 'get_approval_communications_workspace') {
      if (!exactQuery(url, ['action', 'case_id', 'payload_id'])) { await deny('INVALID_REQUEST', 400); return; }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: view }) }); return;
    }
    const rawIdempotencyKey = url.searchParams.get('idempotency_key') ?? '';
    const key = `${action}:${rawIdempotencyKey}`;
    if (action === 'request_authorized_send') (state.sendKeys ??= []).push(rawIdempotencyKey);
    if (
      action === 'request_authorized_send' && state.seen.has(key) &&
      exactQuery(url, ['action', 'case_id', 'expected_case_version', 'idempotency_key', 'payload_sha256', 'sales_authorization_id']) &&
      request.postData() === null
    ) {
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ data: { attemptId: '66666666-6666-4666-8666-666666666666', jobId: '77777777-7777-4777-8777-777777777777', outcome: 'reserved', replayed: true } }) });
      return;
    }
    const expected = Number(url.searchParams.get('expected_case_version'));
    if (expected !== state.version) { await deny('VERSION_CONFLICT', 409); return; }
    if (action === 'save_outbound_draft' && operations && state.kind === 'final_response' && (state.stage === 'sales_authorization' || (state.stage === 'ready_to_send' && state.payload === 'authorized'))) {
      const editAfterAuthorization = state.stage === 'ready_to_send';
      let body: unknown;
      try { body = request.postDataJSON(); } catch { body = null; }
      const bodyRecord = body && typeof body === 'object' ? body as { payloadId?: unknown; bodyText?: unknown } : {};
      const requestedPayloadId = typeof bodyRecord.payloadId === 'string' ? bodyRecord.payloadId : '';
      const requestedBodyText = typeof bodyRecord.bodyText === 'string' ? bodyRecord.bodyText : '';
      if (!exactQuery(url, ['action', 'case_id', 'expected_case_version', 'source_snapshot_sha256', 'signed_package_sha256']) ||
        url.searchParams.get('source_snapshot_sha256') !== sha ||
        url.searchParams.get('signed_package_sha256') !== signedSha ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestedPayloadId) ||
        requestedBodyText.length < 1 || JSON.stringify(body) !== JSON.stringify(finalDraftBody(requestedPayloadId, requestedBodyText))) { await deny('INVALID_REQUEST', 400); return; }
      state.stage = state.kind === 'clarification' ? 'awaiting_clarification' : 'sales_authorization';
      state.payload = 'draft';
      state.activePayloadId = requestedPayloadId;
      if (editAfterAuthorization) state.version += 1;
      state.payloadVersion = state.version;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { payloadId: requestedPayloadId, caseVersion: state.version, kind: state.kind } }) });
      return;
    }
    if (!/^(?:operations|signature|sales|freeze|send):[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(url.searchParams.get('idempotency_key') ?? '') || request.postData() !== null) { await deny('INVALID_REQUEST', 400); return; }
    const exactCommand =
      (action === 'complete_operations_review' && exactQuery(url, ['action', 'case_id', 'expected_case_version', 'input_snapshot_sha256', 'idempotency_key'])) ||
      (action === 'approve_and_apply_signature' && exactQuery(url, ['action', 'case_id', 'expected_case_version', 'input_snapshot_sha256', 'signature_position_version', 'idempotency_key'])) ||
      (action === 'freeze_outbound_payload' && exactQuery(url, ['action', 'case_id', 'payload_id', 'expected_case_version', 'idempotency_key'])) ||
      (action === 'authorize_outbound_payload' && exactQuery(url, ['action', 'attachment_sha256s', 'case_id', 'expected_case_version', 'idempotency_key', 'payload_id', 'payload_sha256'])) ||
      (action === 'request_authorized_send' && exactQuery(url, ['action', 'case_id', 'expected_case_version', 'idempotency_key', 'payload_sha256', 'sales_authorization_id']));
    if (!exactCommand) { await deny('INVALID_REQUEST', 400); return; }
    if (action === 'complete_operations_review' && view.capabilities.completeOperationsReview) { state.stage = 'signature_approval'; state.version += 1; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { caseId, state: 'signature_approval', caseVersion: state.version, replayed: false } }) }); return; }
    if (action === 'approve_and_apply_signature' && view.capabilities.approveAndApplySignature) { state.signaturePending = true; state.version += 1; await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ data: { caseId, state: 'signature_approval', caseVersion: state.version, replayed: false, approvalId } }) }); return; }
    if (action === 'freeze_outbound_payload' && view.capabilities.freezeOutboundPayload && url.searchParams.get('payload_id') === (state.activePayloadId ?? payloadId)) { state.payload = 'frozen'; await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { payloadId: state.activePayloadId ?? payloadId, caseId, caseVersion: state.version, kind: state.kind, mimeSha256: mimeSha, attachmentSha256: state.kind === 'final_response' ? [signedSha] : [], replayed: false } }) }); return; }
    if (action === 'authorize_outbound_payload' && view.capabilities.authorizeOutboundPayload) { state.stage = 'ready_to_send'; state.payload = 'authorized'; state.version += 1; await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ data: { caseId, state: 'ready_to_send', caseVersion: state.version, replayed: false, authorizationId: approvalId } }) }); return; }
    if (action === 'request_authorized_send' && view.capabilities.requestAuthorizedSend) {
      const replayed = state.seen.has(key);
      if (!replayed) { state.seen.add(key); state.reservations += 1; state.version += 1; state.payload = 'send_pending'; }
      if (!replayed && state.dropNextSendResponse) { state.dropNextSendResponse = false; await route.abort('connectionreset'); return; }
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ data: { attemptId: '66666666-6666-4666-8666-666666666666', jobId: '77777777-7777-4777-8777-777777777777', outcome: 'reserved', replayed } }) }); return;
    }
    await deny();
  });
}

async function applySyntheticDocumentEdit(page: Page, operationsToken: string) {
  return await page.evaluate(async ({ caseId, operationsToken }) => {
    const response = await fetch(`/functions/v1/osp-document-api?action=approve_document_version&case_id=${caseId}&document_version_id=99999999-9999-4999-8999-999999999999`, {
      method: 'POST', headers: { Authorization: `Bearer ${operationsToken}` },
    });
    return response.status;
  }, { caseId, operationsToken });
}

async function applySyntheticSignatureReceipt(page: Page, receiptId: string) {
  return await page.evaluate(async ({ approvalId, receiptId }) => {
    const response = await fetch(`/functions/v1/osp-worker-webhook?action=signature_applied&approval_id=${approvalId}&receipt_id=${receiptId}`, {
      method: 'POST', headers: { 'X-OSP-Worker-Fixture': 'local-only' },
    });
    return { status: response.status, body: await response.json() as { data: { replayed: boolean } } };
  }, { approvalId, receiptId });
}

test('separate signed actors drive one exact final response through the UI contract fixture', async ({ page }) => {
  const state: State = { version: 7, payloadVersion: 7, stage: 'operations_review', kind: 'final_response', payload: 'draft', reservations: 0, seen: new Set() };
  await installUiContractFixture(page, state);
  await open(page, { subject: 'operations', email: 'operations@example.test', permissions: ['osp:read', 'osp:operate'] }, 'review');
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: /complete operations review/i }).click();
  await open(page, { subject: 'jose', email: 'jgonzalez@xbfreight.com', permissions: ['osp:read', 'osp:signature-approve'] }, 'signature');
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: /approve and apply signature/i }).click();
  expect(state.stage).toBe('signature_approval');
  expect(state.signaturePending).toBe(true);
  const signatureReceiptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const signatureReceipts = [
    await applySyntheticSignatureReceipt(page, signatureReceiptId),
    await applySyntheticSignatureReceipt(page, signatureReceiptId),
  ];
  expect(signatureReceipts.map((item) => item.status)).toEqual([202, 202]);
  expect(signatureReceipts.map((item) => item.body.data.replayed)).toEqual([false, true]);
  expect(state.workerTransitions).toBe(1);
  await open(page, { subject: 'operations', email: 'operations@example.test', permissions: ['osp:read', 'osp:operate'] }, 'authorization');
  await page.getByRole('button', { name: /save internal draft/i }).click();
  await expect(page.getByRole('heading', { name: /freeze final response/i })).toBeVisible();
  await page.getByRole('checkbox', { name: /exact draft, recipients and signed package/i }).check();
  await page.getByRole('button', { name: /freeze for sales review/i }).click();
  await open(page, { subject: 'sales', email: 'sales@heymarksman.com', permissions: ['osp:read', 'osp:sales-authorize'] }, 'authorization');
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: /authorize outbound payload/i }).click();
  await open(page, { subject: 'carriers', email: 'carriers@xbfreight.com', permissions: ['osp:read', 'osp:send-authorized'] }, 'communications');
  await page.getByRole('button', { name: /request authorized send/i }).click();
  await expect(page.getByRole('button', { name: /request authorized send/i })).toHaveCount(0);
  expect(state.reservations).toBe(1);
  expect(state.version).toBe(12);
});

test('one clarification is frozen, authorized and reserved without a live send', async ({ page }) => {
  const state: State = { version: 4, payloadVersion: 4, stage: 'awaiting_clarification', kind: 'clarification', payload: 'draft', reservations: 0, seen: new Set() };
  await installUiContractFixture(page, state);
  await open(page, { subject: 'operations', email: 'operations@example.test', permissions: ['osp:read', 'osp:operate'] }, 'communications');
  await page.getByRole('button', { name: /freeze outbound payload/i }).click();
  await open(page, { subject: 'sales', email: 'sales@heymarksman.com', permissions: ['osp:read', 'osp:sales-authorize'] }, 'authorization');
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: /authorize outbound payload/i }).click();
  await open(page, { subject: 'carriers', email: 'carriers@xbfreight.com', permissions: ['osp:read', 'osp:send-authorized'] }, 'communications');
  await page.getByRole('button', { name: /request authorized send/i }).click();
  expect(state.reservations).toBe(1);
});

test('mixed authority, cross-tenant access and a stale edit fail closed', async ({ page }) => {
  const state: State = { version: 7, payloadVersion: 7, stage: 'sales_authorization', kind: 'final_response', payload: 'frozen', reservations: 0, seen: new Set() };
  await installUiContractFixture(page, state);
  await open(page, { subject: 'mixed', email: 'sales@heymarksman.com', permissions: ['osp:read', 'osp:sales-authorize', 'osp:send-authorized'] }, 'authorization');
  await expect(page.getByRole('button', { name: /authorize outbound payload/i })).toHaveCount(0);
  await open(page, { subject: 'foreign', email: 'sales@heymarksman.com', organization: otherOrganizationId, permissions: ['osp:read', 'osp:sales-authorize'] }, 'authorization');
  await expect(page.getByRole('alert')).toContainText('Workspace unavailable');
  await open(page, { subject: 'sales', email: 'sales@heymarksman.com', permissions: ['osp:read', 'osp:sales-authorize'] }, 'authorization');
  await page.getByRole('checkbox').check();
  state.version += 1;
  await page.getByRole('button', { name: /authorize outbound payload/i }).click();
  await expect(page.getByRole('alert')).toContainText(/failed safely/i);
  expect(state.reservations).toBe(0);
});

test('Operations combined with Sales has no write capability at either stage', async ({ page }) => {
  const state: State = { version: 7, payloadVersion: 7, stage: 'sales_authorization', kind: 'final_response', payload: 'draft', reservations: 0, seen: new Set() };
  await installUiContractFixture(page, state);
  const mixed = { subject: 'mixed-operate-sales', email: 'sales@heymarksman.com', permissions: ['osp:read', 'osp:operate', 'osp:sales-authorize'] };
  await open(page, mixed, 'communications');
  await expect(page.getByRole('button', { name: /freeze outbound payload/i })).toHaveCount(0);
  state.payload = 'frozen';
  await open(page, mixed, 'authorization');
  await expect(page.getByRole('button', { name: /authorize outbound payload/i })).toHaveCount(0);
  const directStatus = await page.evaluate(async ({ caseId, payloadId, mimeSha, signedSha }) => {
    const actor = JSON.parse(sessionStorage.getItem('osp-e2e-actor') ?? '{}') as { token?: string };
    const response = await fetch(`/functions/v1/osp-case-api?action=authorize_outbound_payload&attachment_sha256s=${signedSha}&case_id=${caseId}&expected_case_version=7&idempotency_key=sales:99999999-9999-4999-8999-999999999999&payload_id=${payloadId}&payload_sha256=${mimeSha}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${actor.token ?? ''}` },
    });
    return response.status;
  }, { caseId, payloadId, mimeSha, signedSha });
  expect(directStatus).toBe(403);
});

test('stale browser submissions at each approval gate force an explicit reload', async ({ page }) => {
  const state: State = { version: 7, payloadVersion: 7, stage: 'operations_review', kind: 'final_response', payload: 'frozen', reservations: 0, seen: new Set() };
  await installUiContractFixture(page, state);
  await open(page, { subject: 'operations', email: 'operations@example.test', permissions: ['osp:read', 'osp:operate'] }, 'review');
  await page.getByRole('checkbox').check(); state.version += 1;
  await page.getByRole('button', { name: /complete operations review/i }).click();
  await expect(page.getByRole('alert')).toContainText(/not completed/i);
  state.stage = 'signature_approval';
  await open(page, { subject: 'jose', email: 'jgonzalez@xbfreight.com', permissions: ['osp:read', 'osp:signature-approve'] }, 'signature');
  await page.getByRole('checkbox').check(); state.version += 1;
  await page.getByRole('button', { name: /approve and apply signature/i }).click();
  await expect(page.getByRole('alert')).toContainText(/failed safely/i);
  state.stage = 'sales_authorization';
  state.payloadVersion = state.version;
  await open(page, { subject: 'sales', email: 'sales@heymarksman.com', permissions: ['osp:read', 'osp:sales-authorize'] }, 'authorization');
  await page.getByRole('checkbox').check(); state.version += 1;
  await page.getByRole('button', { name: /authorize outbound payload/i }).click();
  await expect(page.getByRole('alert')).toContainText(/failed safely/i);
});

test('post-review and post-signature input edits remove downstream authority', async ({ page }) => {
  const state: State = { version: 7, payloadVersion: 7, stage: 'operations_review', kind: 'final_response', payload: 'draft', reservations: 0, seen: new Set() };
  await installUiContractFixture(page, state);
  const operationsToken = await token({ subject: 'operations', email: 'operations@example.test', permissions: ['osp:read', 'osp:operate'] });
  await open(page, { subject: 'operations', email: 'operations@example.test', permissions: ['osp:read', 'osp:operate'] }, 'review');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /complete operations review/i }).click();
  expect(await applySyntheticDocumentEdit(page, operationsToken)).toBe(200);
  await open(page, { subject: 'jose', email: 'jgonzalez@xbfreight.com', permissions: ['osp:read', 'osp:signature-approve'] }, 'signature');
  await expect(page.getByRole('button', { name: /approve and apply signature/i })).toHaveCount(0);
  await open(page, { subject: 'operations', email: 'operations@example.test', permissions: ['osp:read', 'osp:operate'] }, 'review');
  await expect(page.getByRole('button', { name: /complete operations review/i })).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /complete operations review/i }).click();
  await open(page, { subject: 'jose', email: 'jgonzalez@xbfreight.com', permissions: ['osp:read', 'osp:signature-approve'] }, 'signature');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /approve and apply signature/i }).click();
  expect((await applySyntheticSignatureReceipt(page, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).status).toBe(202);
  expect(await applySyntheticDocumentEdit(page, operationsToken)).toBe(200);
  await open(page, { subject: 'sales', email: 'sales@heymarksman.com', permissions: ['osp:read', 'osp:sales-authorize'] }, 'authorization');
  await expect(page.getByRole('button', { name: /authorize outbound payload/i })).toHaveCount(0);
  await open(page, { subject: 'operations', email: 'operations@example.test', permissions: ['osp:read', 'osp:operate'] }, 'review');
  await expect(page.getByRole('button', { name: /complete operations review/i })).toBeVisible();
});

test('a double click through the real UI runner reuses one send key and reserves once', async ({ page }) => {
  const state: State = { version: 10, payloadVersion: 9, stage: 'ready_to_send', kind: 'final_response', payload: 'authorized', reservations: 0, seen: new Set(), sendKeys: [] };
  await installUiContractFixture(page, state);
  await open(page, { subject: 'carriers', email: 'carriers@xbfreight.com', permissions: ['osp:read', 'osp:send-authorized'] }, 'communications');
  await page.getByRole('button', { name: /request authorized send/i }).evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });
  await expect.poll(() => state.sendKeys?.length).toBe(2);
  expect(state.sendKeys?.[0]).toMatch(/^send:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(state.sendKeys?.[1]).toBe(state.sendKeys?.[0]);
  expect(state.reservations).toBe(1);
  await expect(page.getByRole('button', { name: /request authorized send/i })).toHaveCount(0);
});

test('a lost send response keeps the exact UI key for one explicit receipt replay', async ({ page }) => {
  const state: State = { version: 10, payloadVersion: 9, stage: 'ready_to_send', kind: 'final_response', payload: 'authorized', reservations: 0, seen: new Set(), sendKeys: [], dropNextSendResponse: true };
  await installUiContractFixture(page, state);
  await open(page, { subject: 'carriers', email: 'carriers@xbfreight.com', permissions: ['osp:read', 'osp:send-authorized'] }, 'communications');
  await page.getByRole('button', { name: /request authorized send/i }).click();
  await expect(page.getByRole('alert')).toContainText(/failed safely/i);
  await page.getByRole('button', { name: /request authorized send/i }).click();
  await expect.poll(() => state.sendKeys?.length).toBe(2);
  expect(state.sendKeys?.[1]).toBe(state.sendKeys?.[0]);
  expect(state.reservations).toBe(1);
  await expect(page.getByRole('button', { name: /request authorized send/i })).toHaveCount(0);
});

test('an edit after Sales authorization invalidates authority before Carriers can request send', async ({ page }) => {
  const state: State = { version: 10, payloadVersion: 9, stage: 'ready_to_send', kind: 'final_response', payload: 'authorized', reservations: 0, seen: new Set() };
  await installUiContractFixture(page, state);
  const operationsToken = await token({ subject: 'operations', email: 'operations@example.test', permissions: ['osp:read', 'osp:operate'] });
  await open(page, { subject: 'carriers', email: 'carriers@xbfreight.com', permissions: ['osp:read', 'osp:send-authorized'] }, 'communications');
  await expect(page.getByRole('button', { name: /request authorized send/i })).toBeVisible();
  const editStatus = await page.evaluate(async ({ caseId, operationsToken, sha, signedSha, body }) => {
    const response = await fetch(`/functions/v1/osp-case-api?action=save_outbound_draft&case_id=${caseId}&expected_case_version=10&source_snapshot_sha256=${sha}&signed_package_sha256=${signedSha}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${operationsToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.status;
  }, { caseId, operationsToken, sha, signedSha, body: finalDraftBody() });
  expect(editStatus).toBe(201);
  await open(page, { subject: 'carriers', email: 'carriers@xbfreight.com', permissions: ['osp:read', 'osp:send-authorized'] }, 'communications');
  await expect(page.getByRole('button', { name: /request authorized send/i })).toHaveCount(0);
  expect(state.stage).toBe('sales_authorization');
  expect(state.payload).toBe('draft');
  expect(state.reservations).toBe(0);
});

test('ambiguous Gmail outcome is visible and cannot be sent again', async ({ page }) => {
  const state: State = { version: 10, payloadVersion: 9, stage: 'manual_reconciliation_required', kind: 'final_response', payload: 'authorized', reservations: 1, outcome: 'manual_reconciliation_required', seen: new Set() };
  await installUiContractFixture(page, state);
  await open(page, { subject: 'carriers', email: 'carriers@xbfreight.com', permissions: ['osp:read', 'osp:send-authorized'] }, 'communications');
  await expect(page.getByRole('alert')).toContainText(/manual reconciliation required/i);
  await expect(page.getByRole('button', { name: /request authorized send/i })).toHaveCount(0);
});
