import { expect, it, vi } from 'vitest';

import type { BoundSession } from '../auth/auth-port';
import { createOspClient, OspClientError } from './osp-client';

const session = (generation = 'generation-a'): BoundSession => ({
  generation,
  identity: { issuer: 'https://issuer.example.test', authorizedParty: 'osp-client', subject: 'subject-a', organization: 'org-a', email: 'person@example.test', emailVerified: true },
});
const pipeline = { version: 1, data: { requests_total: '4', documents_pending: '3', under_review: '2', ready_for_approval: '1' } };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

function harness(responses: Array<Response | Error>, current = session()) {
  let active: BoundSession | null = current;
  const fetch = vi.fn(async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error('unexpected request');
    return next;
  });
  const getAccessToken = vi.fn(async (_expected: BoundSession, force?: boolean) => force ? 'fresh-bound-token' : 'bound-token');
  const client = createOspClient({ supabaseUrl: 'https://synthetic.supabase.co/', getCurrentSession: () => active, getAccessToken, fetch });
  return { client, fetch, getAccessToken, setSession(value: BoundSession | null) { active = value; } };
}

it('uses one endpoint, exact action body, bearer token, and never transmits generation', async () => {
  const h = harness([json(pipeline)]);
  await expect(h.client.listOnboardingWorkspace()).resolves.toEqual(pipeline.data);
  const [url, init] = h.fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://synthetic.supabase.co/functions/v1/osp-read-api');
  expect(init.headers).toEqual({ authorization: 'Bearer bound-token', 'content-type': 'application/json' });
  expect(JSON.parse(String(init.body))).toEqual({ version: 1, action: 'list_provider_onboarding_workspace' });
  expect(String(init.body)).not.toContain('generation-a');
});

it('forces exactly one bound-token refresh after 401', async () => {
  const h = harness([json({ error: { code: 'UNAUTHORIZED', incident_id: 'i1' } }, 401), json(pipeline)]);
  await expect(h.client.listOnboardingWorkspace()).resolves.toEqual(pipeline.data);
  expect(h.getAccessToken.mock.calls.map((call) => call[1])).toEqual([false, true]);
  expect(h.fetch).toHaveBeenCalledTimes(2);
});

it('uses forced token refresh exactly once across a later transient retry', async () => {
  const h = harness([
    json({ error: { code: 'UNAUTHORIZED', incident_id: 'i1' } }, 401),
    new TypeError('offline'),
    json(pipeline),
  ]);
  await expect(h.client.listOnboardingWorkspace()).resolves.toEqual(pipeline.data);
  expect(h.getAccessToken.mock.calls.map((call) => call[1])).toEqual([false, true, false]);
  expect(h.fetch).toHaveBeenCalledTimes(3);
});

it.each([
  ['network', [new TypeError('offline'), json(pipeline)]],
  ['server', [json({ error: { code: 'INTERNAL_ERROR', incident_id: 'i1' } }, 500), json(pipeline)]],
])('retries a read-only %s failure at most once', async (_name, responses) => {
  const h = harness(responses as Array<Response | Error>);
  await expect(h.client.listOnboardingWorkspace()).resolves.toEqual(pipeline.data);
  expect(h.fetch).toHaveBeenCalledTimes(2);
  expect(h.getAccessToken).toHaveBeenCalledTimes(2);
});

it.each([
  [418, 'FORBIDDEN'],
  [403, 'UNAUTHORIZED'],
])('rejects mismatched HTTP status %s and wire error %s without retry', async (status, code) => {
  const h = harness([json({ error: { code, incident_id: 'i1' } }, status)]);
  await expect(h.client.listOnboardingWorkspace()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(h.fetch).toHaveBeenCalledOnce();
});

it.each([
  [401, { error: { code: 'FORBIDDEN', incident_id: 'i1' } }],
  [500, { error: { code: 'FORBIDDEN', incident_id: 'i1' } }],
  [503, { error: { code: 'INTERNAL_ERROR', incident_id: 'i1' } }],
  [500, { malformed: true }],
])('validates error/status before retry policy for HTTP %s', async (status, body) => {
  const h = harness([json(body, status), json(pipeline)]);
  await expect(h.client.listOnboardingWorkspace()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(h.fetch).toHaveBeenCalledOnce();
  expect(h.getAccessToken.mock.calls.map((call) => call[1])).toEqual([false]);
});

it.each([
  ['schema', json({ ...pipeline, extra: true })],
  ['forbidden', json({ error: { code: 'FORBIDDEN', incident_id: 'i1' } }, 403)],
  ['bad-request', json({ error: { code: 'INVALID_REQUEST', incident_id: 'i1' } }, 400)],
])('does not retry %s failures and exposes only a safe client error', async (_name, response) => {
  const h = harness([response]);
  await expect(h.client.listOnboardingWorkspace()).rejects.toBeInstanceOf(OspClientError);
  expect(h.fetch).toHaveBeenCalledOnce();
});

it('rejects a response when the captured generation is stale before return', async () => {
  let resolve!: (value: Response) => void;
  const response = new Promise<Response>((done) => { resolve = done; });
  const h = harness([]);
  h.fetch.mockImplementationOnce(() => response);
  const pending = h.client.listOnboardingWorkspace();
  h.setSession(session('generation-b'));
  resolve(json(pipeline));
  await expect(pending).rejects.toMatchObject({ code: 'STALE_SESSION' });
});

it('rejects a response when authorization scope changes without a generation change', async () => {
  let resolve!: (value: Response) => void;
  const response = new Promise<Response>((done) => { resolve = done; });
  const h = harness([]);
  h.fetch.mockImplementationOnce(() => response);
  const pending = h.client.listDocumentVersions();
  h.setSession({ ...session(), identity: { ...session().identity, organization: 'org-b' } });
  resolve(json({ data: { versions: [] } }));
  await expect(pending).rejects.toMatchObject({ code: 'STALE_SESSION' });
});

it('validates the Gmail success envelope with the second exact action', async () => {
  const data = { connection_exists: false, pubsub_configured: null, watch_configured: null, token_expires_at: null, watch_expires_at: null, error_present: false, error_code: null, outbound_enabled: false };
  const h = harness([json({ version: 1, data })]);
  await expect(h.client.getGmailStatus()).resolves.toEqual(data);
  const [, init] = h.fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(String(init.body))).toEqual({ version: 1, action: 'provider_gmail_status' });
});

it('runs one bounded Gmail sync through the dedicated OSP endpoint without automatic mutation retry', async () => {
  const data = { discovered: 2, inserted_messages: 1, duplicates: 1, attachment_metadata_rows: 0, osp_enqueued: 1, osp_processed: 1, outbound_enabled: false } as const;
  const h = harness([json({ version: 1, data })]);
  await expect(h.client.syncGmailInbox?.()).resolves.toEqual(data);
  const [url, init] = h.fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://synthetic.supabase.co/functions/v1/osp-gmail-sync-api');
  expect(init.headers).toEqual({ authorization: 'Bearer bound-token', 'content-type': 'application/json' });
  expect(JSON.parse(String(init.body))).toEqual({ version: 1, action: 'sync_provider_gmail_inbox' });

  const ambiguous = harness([new TypeError('response lost'), json({ version: 1, data })]);
  await expect(ambiguous.client.syncGmailInbox?.()).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
  expect(ambiguous.fetch).toHaveBeenCalledOnce();
});

it('lists quarterly document versions through the authenticated document endpoint', async () => {
  const version = { id: '22222222-2222-4222-8222-222222222222', documentType: 'proof_of_address', version: 1, status: 'approved', validFrom: '2026-08-24', expiresAt: '2026-11-24' };
  const h = harness([json({ data: { versions: [version] } })]);
  await expect(h.client.listDocumentVersions()).resolves.toEqual([version]);
  const [url, init] = h.fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://synthetic.supabase.co/functions/v1/osp-document-api?action=list_document_versions');
  expect(init).toEqual({ method: 'POST', headers: { authorization: 'Bearer bound-token' } });
});

it('uploads an immutable quarterly document without automatic network retry', async () => {
  const h = harness([new TypeError('ambiguous network failure'), json({ data: { id: '22222222-2222-4222-8222-222222222222', version: 1, expiresAt: '2026-11-24' } }, 201)]);
  await expect(h.client.uploadDocumentVersion({
    documentType: 'bank_statement', validFrom: '2026-08-24', contentType: 'application/pdf', bytes: new Uint8Array([1, 2, 3]),
  })).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
  expect(h.fetch).toHaveBeenCalledOnce();
  const [url, init] = h.fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://synthetic.supabase.co/functions/v1/osp-document-api?action=upload_document_version&document_type=bank_statement&valid_from=2026-08-24');
  expect(init.method).toBe('POST');
  expect(init.headers).toEqual({ authorization: 'Bearer bound-token', 'content-type': 'application/pdf' });
  expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
});

it('approves only an explicit reviewed version and refreshes only after a verified 401', async () => {
  const sha = 'a'.repeat(64);
  const unauthorized = json({ error: { code: 'UNAUTHORIZED', incident_id: 'i1' } }, 401);
  const approved = json({ data: { id: '22222222-2222-4222-8222-222222222222', status: 'approved' } });
  const h = harness([unauthorized, approved]);
  await expect(h.client.approveDocumentVersion({
    versionId: '22222222-2222-4222-8222-222222222222', expectedVersion: 1, reviewBeforeSha256: sha, reviewAfterSha256: sha,
  })).resolves.toEqual({ id: '22222222-2222-4222-8222-222222222222', status: 'approved' });
  expect(h.fetch).toHaveBeenCalledTimes(2);
  expect(h.getAccessToken.mock.calls.map((call) => call[1])).toEqual([false, true]);
  const [url, init] = h.fetch.mock.calls[1] as unknown as [string, RequestInit];
  expect(url).toContain('action=approve_document_version');
  expect(url).toContain(`review_before_sha256=${sha}`);
  expect(init).toEqual({ method: 'POST', headers: { authorization: 'Bearer fresh-bound-token' } });
});

it('rejects malformed document mutation inputs before token or network access', async () => {
  const h = harness([]);
  await expect(h.client.uploadDocumentVersion({
    documentType: 'bank_statement', validFrom: '2026-02-31', contentType: 'application/pdf', bytes: new Uint8Array([1]),
  })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  await expect(h.client.approveDocumentVersion({
    versionId: '22222222-2222-4222-8222-222222222222', expectedVersion: 2_147_483_648,
    reviewBeforeSha256: 'a'.repeat(64), reviewAfterSha256: 'a'.repeat(64),
  })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  expect(h.getAccessToken).not.toHaveBeenCalled();
  expect(h.fetch).not.toHaveBeenCalled();
});

it('lists grounded clarification reviews through the authenticated case endpoint', async () => {
  const draft = {
    id: '44444444-4444-4444-8444-444444444444', caseId: '33333333-3333-4333-8333-333333333333',
    caseVersion: 4, version: 1, status: 'operations_review_required',
    questions: [{ kind: 'missing', fieldId: 'supplier.address', question: 'Please confirm the registered address.', evidenceIds: ['ev-1'] }],
    evidenceIds: ['ev-1'], canonicalSha256: 'a'.repeat(64), authorizationMailbox: 'sales@heymarksman.com',
  };
  const h = harness([json({ data: { drafts: [draft] } })]);
  await expect(h.client.listClarificationReviews()).resolves.toEqual([draft]);
  const [url, init] = h.fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://synthetic.supabase.co/functions/v1/osp-case-api?action=list_clarification_reviews');
  expect(init).toEqual({ method: 'POST', headers: { authorization: 'Bearer bound-token' } });
});

it('saves an exact clarification review without automatic network retry', async () => {
  const input = {
    draftId: '44444444-4444-4444-8444-444444444444', expectedCaseVersion: 4, expectedCanonicalSha256: 'a'.repeat(64),
    questions: [{ kind: 'missing' as const, fieldId: 'supplier.address', question: 'Please provide the current registered address.', evidenceIds: ['ev-1'] }],
  };
  const h = harness([new TypeError('ambiguous network failure'), json({ data: {} })]);
  await expect(h.client.saveClarificationReview(input)).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
  expect(h.fetch).toHaveBeenCalledOnce();
  const [url, init] = h.fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toContain('action=save_clarification_review');
  expect(url).toContain(`expected_canonical_sha256=${'a'.repeat(64)}`);
  expect(init.headers).toEqual({ authorization: 'Bearer bound-token', 'content-type': 'application/json' });
  expect(JSON.parse(String(init.body))).toEqual({ questions: input.questions });
});
