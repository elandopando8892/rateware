import { describe, expect, test, vi } from 'vitest';
import type { AuthPort } from '../auth/auth-port';
import { createOspClient, OspApiError } from './osp-client';

const workspaceFixture = {
  data: {
    rows: [
      {
        id: 'eb39d173-a4a9-46af-b613-283bf9ee70fb',
        program_code: 'XBF-MX',
        jurisdiction_code: 'MX',
        legal_entity_kind: 'corporation',
        case_status: 'evidence_collection',
        revision: '3',
        blocking_task_count: '1',
        overdue_task_count: 0,
        updated_at: '2026-08-21T12:00:00.000Z',
      },
    ],
    total: '4',
    limit: 10,
    offset: 0,
    queue: 'all',
    metrics: { total: '4', blocked: 1, approval: '2', overdue: 0 },
  },
};

const gmailFixture = {
  data: {
    mailbox_email: 'carriers@xbfreight.com',
    required_scope: 'https://www.googleapis.com/auth/gmail.readonly',
    legal_entities: [
      {
        id: '1c37a64a-506d-434d-990c-a8e28f07a7fb',
        entity_code: 'XBF',
        legal_name: 'XBorder Freight LLC',
        country_code: 'US',
        default_currency: 'USD',
        status: 'active',
      },
    ],
    connections: [
      {
        status: 'watching',
        mailbox_email: 'carriers@xbfreight.com',
        watch_expiration_at: null,
        last_error: null,
      },
    ],
    outbound_enabled: false,
    pubsub_configured: true,
  },
};

function fakeAuthPort(tokens: string[] = ['test-token']): AuthPort {
  let tokenIndex = 0;
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    isAuthenticated: vi.fn().mockResolvedValue(true),
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    getAccessToken: vi.fn().mockImplementation(async () => {
      const token = tokens[Math.min(tokenIndex, tokens.length - 1)];
      tokenIndex += 1;
      return token;
    }),
    getUser: vi.fn().mockResolvedValue({
      subject: 'kp_operator',
      email: 'operator@example.test',
      displayName: 'OSP Operator',
    }),
  };
}

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

function makeClient(fetchImpl: typeof fetch, auth = fakeAuthPort()) {
  return createOspClient({
    supabaseUrl: 'https://alqjqzqagdmcywpjtnnr.supabase.co',
    auth,
    fetchImpl,
  });
}

describe('OSP Edge Function client', () => {
  test('posts the exact onboarding read action with bearer and JSON headers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(workspaceFixture));
    const client = makeClient(fetchImpl);

    const result = await client.listOnboardingWorkspace({
      queue: 'all',
      limit: 1,
      offset: 0,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://alqjqzqagdmcywpjtnnr.supabase.co/functions/v1/provider-onboarding-api',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'list_provider_onboarding_workspace',
          queue: 'all',
          limit: 1,
          offset: 0,
        }),
      },
    );
    expect(result.data.limit).toBe(10);
    expect(result.data.metrics).toEqual({ total: 4, blocked: 1, approval: 2, overdue: 0 });
  });

  test('posts Gmail status only to the Gmail intake read action', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(gmailFixture));
    const client = makeClient(fetchImpl);

    const result = await client.getGmailStatus();

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://alqjqzqagdmcywpjtnnr.supabase.co/functions/v1/provider-gmail-intake-api',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'provider_gmail_status' }),
      }),
    );
    expect(result.data.mailbox_email).toBe('carriers@xbfreight.com');
    expect(Object.keys(client).sort()).toEqual(['getGmailStatus', 'listOnboardingWorkspace']);
  });

  test('refreshes the token once after a first 401 and retries with the new token', async () => {
    const auth = fakeAuthPort(['expired-token', 'refreshed-token']);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'expired' }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse(workspaceFixture));
    const client = makeClient(fetchImpl, auth);

    await client.listOnboardingWorkspace({ queue: 'all', limit: 1, offset: 0 });

    expect(auth.getAccessToken).toHaveBeenNthCalledWith(1);
    expect(auth.getAccessToken).toHaveBeenNthCalledWith(2, true);
    expect(auth.getAccessToken).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer refreshed-token' }),
    }));
  });

  test('stops after a second 401 and returns only safe correlation metadata', async () => {
    const auth = fakeAuthPort(['expired-secret-token', 'refreshed-secret-token']);
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: 'Bearer refreshed-secret-token failed against internal policy',
          code: 'AUTH_REJECTED',
          incident_id: 'incident-json',
        },
        { status: 401, headers: { 'x-request-id': 'incident-header' } },
      ),
    );
    const client = makeClient(fetchImpl, auth);

    const error = await client
      .listOnboardingWorkspace({ queue: 'all', limit: 1, offset: 0 })
      .catch((caught: unknown) => caught);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(auth.getAccessToken).toHaveBeenCalledTimes(2);
    expect(error).toBeInstanceOf(OspApiError);
    expect(error).toMatchObject({
      status: 401,
      code: 'AUTH_REJECTED',
      incidentId: 'incident-json',
      action: 'list_provider_onboarding_workspace',
      stage: 'response',
    });
    expect(String(error)).toMatch(/sign in/i);
    expect(`${String(error)} ${JSON.stringify(error)}`).not.toMatch(/secret-token|internal policy/i);
  });

  test('does not retry a non-401 failure and makes non-JSON responses understandable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      'upstream gateway included private request content',
      { status: 502, headers: { 'x-request-id': 'request-502' } },
    ));
    const client = makeClient(fetchImpl);

    const error = await client.getGmailStatus().catch((caught: unknown) => caught);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(OspApiError);
    expect(error).toMatchObject({
      status: 502,
      code: 'HTTP_502',
      incidentId: 'request-502',
      action: 'provider_gmail_status',
      stage: 'response',
    });
    expect(String(error)).toMatch(/temporarily unavailable|http 502/i);
    expect(String(error)).not.toContain('private request content');
  });

  test('removes restricted or unapproved onboarding row fields from validated output', async () => {
    const restrictedFixture = structuredClone(workspaceFixture);
    Object.assign(restrictedFixture.data.rows[0], {
      tax_id: 'RFC-SECRET',
      bank_account: 'BANK-SECRET',
      attachment_contents: 'DOCUMENT-SECRET',
      storage_path: 'private/path',
      arbitrary_backend_field: 'not-approved',
    });
    const client = makeClient(vi.fn().mockResolvedValue(jsonResponse(restrictedFixture)));

    const result = await client.listOnboardingWorkspace({ queue: 'all', limit: 1, offset: 0 });

    expect(result.data.rows[0]).toEqual({
      id: 'eb39d173-a4a9-46af-b613-283bf9ee70fb',
      program_code: 'XBF-MX',
      jurisdiction_code: 'MX',
      legal_entity_kind: 'corporation',
      case_status: 'evidence_collection',
      revision: 3,
      blocking_task_count: 1,
      overdue_task_count: 0,
      updated_at: '2026-08-21T12:00:00.000Z',
    });
    expect(JSON.stringify(result)).not.toMatch(/RFC-SECRET|BANK-SECRET|DOCUMENT-SECRET|private\/path/);
  });

  test('rejects malformed success envelopes instead of fabricating data', async () => {
    const invalidFixture = structuredClone(workspaceFixture);
    invalidFixture.data.metrics.total = '-1';
    const client = makeClient(vi.fn().mockResolvedValue(jsonResponse(invalidFixture)));

    await expect(
      client.listOnboardingWorkspace({ queue: 'all', limit: 1, offset: 0 }),
    ).rejects.toMatchObject({ name: 'ZodError' });
  });

  test('sanitizes token acquisition and network failures', async () => {
    const auth = fakeAuthPort();
    vi.mocked(auth.getAccessToken).mockRejectedValueOnce(
      new Error('token acquisition leaked bearer auth-secret'),
    );
    const neverFetch = vi.fn();
    const authClient = makeClient(neverFetch, auth);

    const authError = await authClient.getGmailStatus().catch((caught: unknown) => caught);

    expect(neverFetch).not.toHaveBeenCalled();
    expect(authError).toMatchObject({ code: 'AUTH_TOKEN_UNAVAILABLE', stage: 'auth' });
    expect(String(authError)).not.toMatch(/auth-secret|token acquisition leaked/i);

    const networkClient = makeClient(vi.fn().mockRejectedValue(
      new Error('request headers included Bearer network-secret'),
    ));
    const networkError = await networkClient.getGmailStatus().catch((caught: unknown) => caught);

    expect(networkError).toMatchObject({ code: 'NETWORK_ERROR', stage: 'transport' });
    expect(String(networkError)).not.toMatch(/network-secret|request headers/i);
  });
});
