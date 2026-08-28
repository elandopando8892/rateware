import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { act } from '@testing-library/react';
import { createMemoryHistory } from '@tanstack/react-router';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { OspClient } from '../api/osp-client';
import type { AuthPort, BoundSession } from '../auth/auth-port';
import { App } from './App';

const session: BoundSession = {
  generation: 'generation-a',
  identity: {
    issuer: 'https://auth.heymarksman.com',
    authorizedParty: 'synthetic-public-client',
    subject: 'subject-a',
    organization: 'organization-a',
    email: 'operator@example.test',
    emailVerified: true,
  },
};

beforeEach(() => { window.scrollTo = vi.fn(); });

function authPort(initial: BoundSession | null, initialize = Promise.resolve(initial)): AuthPort {
  let current = initial;
  return {
    initialize: vi.fn(() => initialize),
    revalidate: vi.fn(async () => current),
    subscribe: vi.fn(() => () => undefined),
    getCurrentSession: vi.fn(() => current),
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => { current = null; }),
    getAccessToken: vi.fn(async () => 'token'),
  };
}

function client(): OspClient {
  return {
    getApprovalCommunicationsWorkspace: vi.fn(async () => { throw new Error('not used'); }),
    completeOperationsReview: vi.fn(async () => { throw new Error('not used'); }),
    approveAndApplySignature: vi.fn(async () => { throw new Error('not used'); }),
    freezeOutboundPayload: vi.fn(async () => { throw new Error('not used'); }),
    authorizeOutboundPayload: vi.fn(async () => { throw new Error('not used'); }),
    requestAuthorizedSend: vi.fn(async () => { throw new Error('not used'); }),
    listOnboardingWorkspace: vi.fn(async () => ({
      requests_total: '0', documents_pending: '0', under_review: '0', ready_for_approval: '0',
    })),
    getGmailStatus: vi.fn(async () => ({
      connection_exists: false as const, pubsub_configured: null, watch_configured: null,
      token_expires_at: null, watch_expires_at: null, error_present: false as const,
      error_code: null, outbound_enabled: false as const,
    })),
    getCorporateProfile: vi.fn(async () => ({
      disclosure_locked: true as const,
      entities: [{
        entity_id: '91000000-0000-4000-8000-000000000001', entity_code: 'XBFMX', legal_name: 'XBF Demo Logistics',
        country_code: 'MX', default_currency: 'MXN', status: 'active' as const, verified_fields: '1', review_fields: '0', total_fields: '1',
        fields: [{ code: 'tax_identifier', label: 'Tax identifier', display_value: 'On file', verification_status: 'verified' as const, sensitivity: 'restricted' as const, support_status: 'verified_match' as const, evidence_candidate_count: '1', reviewed_candidate_count: '1' }], evidence: [],
      }],
    })),
    listCustomerRegistrationCases: vi.fn(async () => []),
    getCustomerRegistrationCase: vi.fn(async () => { throw new Error('not used'); }),
    listDocumentVersions: vi.fn(async () => []),
    uploadDocumentVersion: vi.fn(async () => ({ id: '22222222-2222-4222-8222-222222222222', version: 1, expiresAt: '2026-11-24' })),
    approveDocumentVersion: vi.fn(async (input) => ({ id: input.versionId, status: 'approved' as const })),
    listClarificationReviews: vi.fn(async () => []),
    saveClarificationReview: vi.fn(async (input) => ({
      id: input.draftId, caseId: '33333333-3333-4333-8333-333333333333', caseVersion: input.expectedCaseVersion + 1,
      version: 2, status: 'operations_reviewed' as const, questions: input.questions, evidenceIds: ['ev-1'],
      canonicalSha256: 'b'.repeat(64), authorizationMailbox: 'sales@heymarksman.com' as const,
    })),
    listFormTemplates: vi.fn(async () => ({ templates: [], capabilities: { saveDraft: false, publish: false } })),
    saveFormTemplateDraft: vi.fn(async () => { throw new Error('not used'); }),
    publishFormTemplate: vi.fn(async () => { throw new Error('not used'); }),
    getCaseFormWorkspace: vi.fn(async () => { throw new Error('not used'); }),
    saveCaseFormDraft: vi.fn(async () => { throw new Error('not used'); }),
    acceptCaseFormMapping: vi.fn(async () => { throw new Error('not used'); }),
    correctCaseFormMapping: vi.fn(async () => { throw new Error('not used'); }),
    submitCaseFormForReview: vi.fn(async () => { throw new Error('not used'); }),
  };
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/app');
});

describe('App authentication and routing', () => {
  it('labels the synthetic preview prominently', async () => {
    const history = createMemoryHistory({ initialEntries: ['/app/pipeline'] });
    render(<App authPort={authPort(session)} apiClient={client()} buildProfile="preview-synthetic" routerHistory={history} />);
    expect(screen.getByText(/Preview sintética/)).toBeInTheDocument();
    expect(await screen.findByText('operator@example.test')).toBeInTheDocument();
  });

  it('opens a read-only case workspace with the next gate and redacted request summary', async () => {
    const api = client();
    vi.mocked(api.getCustomerRegistrationCase).mockResolvedValue({
      case_id: '22222222-2222-4222-8222-222222222222', supplier_name: 'Synthetic Supplier', state: 'received', aggregate_version: 1,
      blocked_by_duplicate_review: false, created_at: '2030-01-01T00:00:00.000Z', updated_at: '2030-01-01T01:00:00.000Z',
      message_count: '1', attachment_count: '2', document_count: '0',
      latest_request: { subject: 'Customer setup request', sender_domain: 'supplier.example', received_at: '2030-01-01T00:00:00.000Z' },
      recent_events: [{ sequence: 1, state: 'received', occurred_at: '2030-01-01T00:00:00.000Z', reason_code: 'case_received' }],
    });
    const history = createMemoryHistory({ initialEntries: ['/app/cases/22222222-2222-4222-8222-222222222222'] });
    render(<App authPort={authPort(session)} apiClient={api} routerHistory={history} />);
    expect(await screen.findByRole('heading', { name: 'Synthetic Supplier' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Received', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Analyze the request and identify required documents.')).toBeInTheDocument();
    expect(screen.getByText('Message bodies and private files stay outside this summary.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /open xbf case form/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no action is available until the next controlled transition/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toHaveTextContent('Sign out');
  });

  it('opens the controlled workspace that matches the current case state', async () => {
    const api = client();
    vi.mocked(api.getCustomerRegistrationCase).mockResolvedValue({
      case_id: '22222222-2222-4222-8222-222222222222', supplier_name: 'Synthetic Supplier', state: 'operations_review', aggregate_version: 5,
      blocked_by_duplicate_review: false, created_at: '2030-01-01T00:00:00.000Z', updated_at: '2030-01-01T01:00:00.000Z',
      message_count: '1', attachment_count: '2', document_count: '2',
      latest_request: { subject: 'Customer setup request', sender_domain: 'supplier.example', received_at: '2030-01-01T00:00:00.000Z' },
      recent_events: [{ sequence: 5, state: 'operations_review', occurred_at: '2030-01-01T01:00:00.000Z', reason_code: 'form_submitted_for_review' }],
    });
    const history = createMemoryHistory({ initialEntries: ['/app/cases/22222222-2222-4222-8222-222222222222'] });
    render(<App authPort={authPort(session)} apiClient={api} routerHistory={history} />);

    const action = await screen.findByRole('link', { name: /open operations review/i });
    expect(action).toHaveAttribute('href', '/app/cases/22222222-2222-4222-8222-222222222222/review');
    expect(screen.queryByRole('link', { name: /open xbf case form/i })).not.toBeInTheDocument();
  });

  it('hides workspace data while authentication is checking', () => {
    const pending = new Promise<BoundSession | null>(() => undefined);
    render(<App authPort={authPort(null, pending)} apiClient={client()} />);
    expect(screen.getByRole('status', { name: /checking access/i })).toBeInTheDocument();
    expect(screen.queryByText(/requests total/i)).not.toBeInTheDocument();
  });

  it('offers login to anonymous users and never exposes operational controls', async () => {
    const port = authPort(null);
    render(<App authPort={port} apiClient={client()} />);
    const login = await screen.findByRole('button', { name: /sign in/i });
    await userEvent.click(login);
    expect(port.login).toHaveBeenCalledWith('/app/pipeline');
    expect(screen.queryByRole('button', { name: /approve|authorize|send|upload|oauth|sync|renew|digital signature/i })).not.toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('contains login rejection safely and permits an explicit retry', async () => {
    const port = authPort(null);
    vi.mocked(port.login).mockRejectedValueOnce(new Error('private login failure'));
    render(<App authPort={port} apiClient={client()} />);
    await userEvent.click(await screen.findByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not start sign in/i);
    expect(screen.queryByText(/private login failure/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry sign in/i }));
    expect(port.login).toHaveBeenCalledTimes(2);
  });

  it('shows a safe callback failure without leaking the underlying message', async () => {
    const port = authPort(null, Promise.reject(new Error('private callback detail')));
    render(<App authPort={port} apiClient={client()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not verify access/i);
    expect(screen.queryByText(/private callback detail/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /authorize workspace/i }));
    expect(port.login).toHaveBeenCalledWith('/app/pipeline');
    vi.mocked(port.revalidate).mockResolvedValueOnce(session);
    await userEvent.click(screen.getByRole('button', { name: /retry access/i }));
    expect(port.revalidate).toHaveBeenCalledWith('refresh');
    expect(await screen.findByRole('heading', { name: /onboarding pipeline/i })).toBeInTheDocument();
  });

  it('can discard an unverifiable session and return to sign in', async () => {
    const port = authPort(null, Promise.reject(new Error('stale token')));
    render(<App authPort={port} apiClient={client()} />);
    await userEvent.click(await screen.findByRole('button', { name: /start new session/i }));
    expect(port.logout).toHaveBeenCalledOnce();
    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
  });

  it('redirects authenticated /app to pipeline and controls unknown /app routes', async () => {
    const port = authPort(session);
    const api = client();
    render(<App authPort={port} apiClient={api} />);
    expect(await screen.findByRole('heading', { name: /onboarding pipeline/i })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/app/pipeline'));

    window.history.pushState(null, '', '/app/not-legacy');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(await screen.findByRole('heading', { name: /page unavailable/i })).toBeInTheDocument();
    expect(document.querySelector('a[href*="legacy"]')).toBeNull();
    await userEvent.click(screen.getByRole('link', { name: /return to pipeline/i }));
    expect(await screen.findByRole('heading', { name: /onboarding pipeline/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/app/pipeline');
  });

  it('keeps the authenticated surface limited to reviewed controls and bounded Gmail actions', async () => {
    window.history.replaceState(null, '', '/app/pipeline');
    const view = render(<App authPort={authPort(session)} apiClient={client()} />);
    await screen.findByRole('heading', { name: /onboarding pipeline/i });
    const controls = [...view.container.querySelectorAll('button,a,input,select,textarea,form,[role="button"],[role="link"]')]
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        name: element.getAttribute('aria-label') ?? element.textContent?.trim(),
        href: element.getAttribute('href'),
        type: element.getAttribute('type'),
      }));
    expect(controls).toEqual([
      { tag: 'a', name: 'Skip to content', href: '#main-content', type: null },
      { tag: 'a', name: 'XBF OSP pipeline home', href: '/app/pipeline', type: null },
      { tag: 'a', name: 'Corporate profile', href: '/app/profile', type: null },
      { tag: 'a', name: 'Forms', href: '/app/forms/builder', type: null },
      { tag: 'a', name: 'Documents', href: '/app/documents', type: null },
      { tag: 'a', name: 'Clarifications', href: '/app/clarifications', type: null },
      { tag: 'button', name: 'Sign out', href: null, type: 'button' },
      { tag: 'button', name: 'Connect Gmail first', href: null, type: 'button' },
      { tag: 'button', name: 'Sync inbox now', href: null, type: 'button' },
    ]);
    expect(view.container.querySelector('iframe')).toBeNull();
    const source = [
      join('app', 'App.tsx'),
      join('app', 'AppShell.tsx'),
      join('app', 'router.tsx'),
      join('components', 'RoutePlaceholder.tsx'),
      join('features', 'pipeline', 'PipelineOverview.tsx'),
    ].map((file) => readFileSync(join(process.cwd(), 'src', file), 'utf8')).join('\n');
    expect(source).not.toMatch(/<iframe|<form(?=[\s>])|type=["']file/i);
  });

  it('connects quarterly documents and grounded clarification review to the authenticated client', async () => {
    const history = createMemoryHistory({ initialEntries: ['/app/documents'] });
    const api = client();
    render(<App authPort={authPort(session)} apiClient={api} routerHistory={history} />);
    expect(await screen.findByRole('heading', { name: /quarterly corporate documents/i })).toBeInTheDocument();
    await waitFor(() => expect(api.listDocumentVersions).toHaveBeenCalledOnce());
    await userEvent.click(screen.getByRole('button', { name: /upload new proof of address version/i }));
    expect(screen.getByLabelText(/select proof of address file/i)).toHaveAttribute('accept', 'application/pdf,image/jpeg,image/png,image/tiff');
    expect(screen.queryByText(/blocked until the authenticated document API/i)).not.toBeInTheDocument();

    vi.mocked(api.listClarificationReviews).mockResolvedValueOnce([{
      id: '44444444-4444-4444-8444-444444444444', caseId: '33333333-3333-4333-8333-333333333333',
      caseVersion: 4, version: 1, status: 'operations_review_required',
      questions: [{ kind: 'missing', fieldId: 'supplier.address', question: 'Please confirm the registered address.', evidenceIds: ['ev-1'] }],
      evidenceIds: ['ev-1'], canonicalSha256: 'a'.repeat(64), authorizationMailbox: 'sales@heymarksman.com',
    }]);
    await userEvent.click(screen.getByRole('link', { name: /clarifications/i }));
    expect(await screen.findByRole('heading', { name: /clarification review/i })).toBeInTheDocument();
    const editor = await screen.findByLabelText(/question for supplier.address/i);
    await userEvent.clear(editor);
    await userEvent.type(editor, 'Please provide the current registered address.');
    await userEvent.click(screen.getByRole('button', { name: /save operations review/i }));
    await waitFor(() => expect(api.saveClarificationReview).toHaveBeenCalledWith(expect.objectContaining({
      draftId: '44444444-4444-4444-8444-444444444444', expectedCaseVersion: 4, expectedCanonicalSha256: 'a'.repeat(64),
    })));
    expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument();
  });

  it('opens the reusable dual-entity corporate profile without production identifiers', async () => {
    const history = createMemoryHistory({ initialEntries: ['/app/profile'] });
    render(<App authPort={authPort(session)} apiClient={client()} routerHistory={history} />);
    expect(await screen.findByRole('button', { name: /mexico entity/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /corporate profile/i })).toBeInTheDocument();
    expect(screen.getAllByText(/on file/i).length).toBeGreaterThan(0);
  });

  it('hands a completed Operations review to the signature control', async () => {
    const caseId = '33333333-3333-4333-8333-333333333333';
    const snapshot = { sha256: 'a'.repeat(64), documentCount: 4, extractionCount: 18, reviewDecisionCount: 3, formInstanceVersion: 2 };
    const api = client();
    vi.mocked(api.getApprovalCommunicationsWorkspace)
      .mockResolvedValueOnce({
        caseId, caseVersion: 4, caseState: 'operations_review', inputSnapshot: snapshot, signature: null, outbound: null,
        capabilities: { completeOperationsReview: true, approveAndApplySignature: false, freezeOutboundPayload: false, authorizeOutboundPayload: false, requestAuthorizedSend: false },
      })
      .mockResolvedValue({
        caseId, caseVersion: 5, caseState: 'signature_approval', inputSnapshot: snapshot,
        signature: { positionVersion: 1, approvalStatus: 'pending', approvalId: null, outputSha256: null }, outbound: null,
        capabilities: { completeOperationsReview: false, approveAndApplySignature: true, freezeOutboundPayload: false, authorizeOutboundPayload: false, requestAuthorizedSend: false },
      });
    vi.mocked(api.completeOperationsReview).mockResolvedValue({ caseId, state: 'signature_approval', caseVersion: 5, replayed: false });
    const history = createMemoryHistory({ initialEntries: [`/app/cases/${caseId}/review`] });
    render(<App authPort={authPort(session)} apiClient={api} routerHistory={history} />);

    await userEvent.click(await screen.findByRole('checkbox', { name: /evidence package is complete/i }));
    await userEvent.click(screen.getByRole('button', { name: /complete operations review/i }));

    expect(await screen.findByRole('heading', { name: /signature approval/i })).toBeInTheDocument();
    expect(history.location.pathname).toBe(`/app/cases/${caseId}/signature`);
    expect(api.completeOperationsReview).toHaveBeenCalledWith(expect.objectContaining({
      caseId, expectedVersion: 4, inputSnapshotSha256: snapshot.sha256,
    }));
  });

  it('routes Sales to the exact server-authorized payload without exposing private material', async () => {
    const history = createMemoryHistory({ initialEntries: ['/app/cases/33333333-3333-4333-8333-333333333333/authorization'] });
    const api = client();
    vi.mocked(api.getApprovalCommunicationsWorkspace).mockResolvedValue({
      caseId: '33333333-3333-4333-8333-333333333333', caseVersion: 7, caseState: 'sales_authorization',
      inputSnapshot: { sha256: 'a'.repeat(64), documentCount: 4, extractionCount: 18, reviewDecisionCount: 3, formInstanceVersion: 2 },
      signature: null,
      outbound: {
        payloadId: '44444444-4444-4444-8444-444444444444', kind: 'final_response', status: 'frozen', caseVersion: 7,
        from: 'carriers@xbfreight.com', to: ['supplier@example.test'], cc: [], subject: 'Supplier registration response',
        bodyText: 'Ready for exact Sales review.', attachmentSha256: ['c'.repeat(64)], mimeSha256: 'd'.repeat(64),
        salesAuthorizationId: null, sendOutcome: null,
      },
      capabilities: { completeOperationsReview: false, approveAndApplySignature: false, freezeOutboundPayload: false, authorizeOutboundPayload: true, requestAuthorizedSend: false },
    });
    vi.mocked(api.authorizeOutboundPayload).mockResolvedValue({
      caseId: '33333333-3333-4333-8333-333333333333', state: 'ready_to_send', caseVersion: 8, replayed: false,
      authorizationId: '55555555-5555-4555-8555-555555555555',
    });
    render(<App authPort={authPort(session)} apiClient={api} routerHistory={history} />);
    expect(await screen.findByRole('heading', { name: /authorize exact outbound payload/i })).toBeInTheDocument();
    expect(screen.getByText('Ready for exact Sales review.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/vault|mime object|signature bytes/i);
    await userEvent.click(screen.getByRole('checkbox', { name: /exact recipients, content and attachments/i }));
    await userEvent.click(screen.getByRole('button', { name: /authorize outbound payload/i }));
    await waitFor(() => expect(api.authorizeOutboundPayload).toHaveBeenCalledWith(expect.objectContaining({
      caseId: '33333333-3333-4333-8333-333333333333', expectedVersion: 7,
      payloadId: '44444444-4444-4444-8444-444444444444', payloadSha256: 'd'.repeat(64),
    })));
  });

  it('recovers logout after an anonymous notification unmounts the shell', async () => {
    let current: BoundSession | null = session;
    let listener: () => void = () => undefined;
    const port = authPort(session);
    vi.mocked(port.getCurrentSession).mockImplementation(() => current);
    vi.mocked(port.subscribe).mockImplementation((next) => { listener = next; return () => undefined; });
    vi.mocked(port.logout)
      .mockImplementationOnce(async () => { current = null; listener(); throw new Error('private logout failure'); })
      .mockResolvedValueOnce(undefined);
    window.history.replaceState(null, '', '/app/pipeline');
    render(<App authPort={port} apiClient={client()} />);
    await userEvent.click(await screen.findByRole('button', { name: /^sign out$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not sign out/i);
    expect(screen.queryByText(/private logout failure/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry sign out/i }));
    expect(port.logout).toHaveBeenCalledTimes(2);
  });

  it('never renders or queries stale router context when session identity and client switch', async () => {
    let current = session;
    let listener: () => void = () => undefined;
    const port = authPort(current);
    vi.mocked(port.getCurrentSession).mockImplementation(() => current);
    vi.mocked(port.subscribe).mockImplementation((next) => { listener = next; return () => undefined; });
    const clientA = client();
    vi.mocked(clientA.listOnboardingWorkspace).mockResolvedValue({ requests_total: '77', documents_pending: '0', under_review: '0', ready_for_approval: '0' });
    const pending = new Promise<never>(() => undefined);
    const clientB: OspClient = {
      getApprovalCommunicationsWorkspace: vi.fn(() => pending), completeOperationsReview: vi.fn(() => pending),
      approveAndApplySignature: vi.fn(() => pending), freezeOutboundPayload: vi.fn(() => pending),
      authorizeOutboundPayload: vi.fn(() => pending), requestAuthorizedSend: vi.fn(() => pending),
      listOnboardingWorkspace: vi.fn(() => pending), getGmailStatus: vi.fn(() => pending),
      getCorporateProfile: vi.fn(() => pending),
      listCustomerRegistrationCases: vi.fn(() => pending), getCustomerRegistrationCase: vi.fn(() => pending),
      listDocumentVersions: vi.fn(() => pending),
      uploadDocumentVersion: vi.fn(() => pending), approveDocumentVersion: vi.fn(() => pending), listClarificationReviews: vi.fn(() => pending),
      saveClarificationReview: vi.fn(() => pending),
      listFormTemplates: vi.fn(() => pending), saveFormTemplateDraft: vi.fn(() => pending), publishFormTemplate: vi.fn(() => pending),
      getCaseFormWorkspace: vi.fn(() => pending), saveCaseFormDraft: vi.fn(() => pending), acceptCaseFormMapping: vi.fn(() => pending), correctCaseFormMapping: vi.fn(() => pending), submitCaseFormForReview: vi.fn(() => pending),
    };
    const history = createMemoryHistory({ initialEntries: ['/app/pipeline'] });
    const view = render(<App authPort={port} apiClient={clientA} routerHistory={history} />);
    expect(await screen.findByText('77')).toBeInTheDocument();
    current = { ...session, generation: 'generation-b', identity: { ...session.identity, subject: 'subject-b', email: 'second@example.test' } };
    await act(async () => {
      listener();
      view.rerender(<App authPort={port} apiClient={clientB} routerHistory={history} />);
    });
    expect(screen.queryByText('77')).not.toBeInTheDocument();
    expect(screen.queryByText('operator@example.test')).not.toBeInTheDocument();
    expect(screen.getByText('second@example.test')).toBeInTheDocument();
    expect(clientB.listOnboardingWorkspace).toHaveBeenCalledOnce();
  });

  it('never retains router context across a same-generation authorization-scope switch', async () => {
    let current = session;
    let listener: () => void = () => undefined;
    const port = authPort(current);
    vi.mocked(port.getCurrentSession).mockImplementation(() => current);
    vi.mocked(port.subscribe).mockImplementation((next) => { listener = next; return () => undefined; });
    const pending = new Promise<never>(() => undefined);
    const api = client();
    vi.mocked(api.listOnboardingWorkspace)
      .mockResolvedValueOnce({ requests_total: '77', documents_pending: '0', under_review: '0', ready_for_approval: '0' })
      .mockImplementation(() => pending);
    vi.mocked(api.getGmailStatus)
      .mockResolvedValueOnce({
        connection_exists: false, pubsub_configured: null, watch_configured: null,
        token_expires_at: null, watch_expires_at: null, error_present: false,
        error_code: null, outbound_enabled: false,
      })
      .mockImplementation(() => pending);
    const history = createMemoryHistory({ initialEntries: ['/app/pipeline'] });
    render(<App authPort={port} apiClient={api} routerHistory={history} />);
    expect(await screen.findByText('77')).toBeInTheDocument();
    expect(screen.getByText('operator@example.test')).toBeInTheDocument();

    current = {
      generation: session.generation,
      identity: {
        ...session.identity,
        issuer: 'https://replacement-auth.example.test',
        authorizedParty: 'replacement-public-client',
        organization: 'organization-b',
        email: 'replacement@example.test',
      },
    };
    act(() => listener());

    expect(screen.queryByText('77')).not.toBeInTheDocument();
    expect(screen.queryByText('operator@example.test')).not.toBeInTheDocument();
    expect(await screen.findByText('replacement@example.test')).toBeInTheDocument();
    expect(api.listOnboardingWorkspace).toHaveBeenCalledTimes(2);
  });

  it('clears logout recovery when the AuthPort changes', async () => {
    let current: BoundSession | null = session;
    let listener: () => void = () => undefined;
    const portA = authPort(session);
    vi.mocked(portA.getCurrentSession).mockImplementation(() => current);
    vi.mocked(portA.subscribe).mockImplementation((next) => { listener = next; return () => undefined; });
    vi.mocked(portA.logout).mockImplementation(async () => { current = null; listener(); throw new Error('fail'); });
    const portB = authPort(null);
    window.history.replaceState(null, '', '/app/pipeline');
    const view = render(<App authPort={portA} apiClient={client()} />);
    await userEvent.click(await screen.findByRole('button', { name: /^sign out$/i }));
    expect(await screen.findByRole('button', { name: /retry sign out/i })).toBeInTheDocument();
    view.rerender(<App authPort={portB} apiClient={client()} />);
    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry sign out/i })).not.toBeInTheDocument();
    expect(portB.logout).not.toHaveBeenCalled();
  });

  it('uses typed TanStack routing and client-side links without manual history events', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'app', 'router.tsx'), 'utf8');
    expect(source).toMatch(/createRootRoute|createRoute|createRouter/);
    expect(source).toMatch(/\bLink\b/);
    expect(source).not.toMatch(/window\.history|PopStateEvent|popstate/);
  });
});
