import { describe, expect, it, vi } from 'vitest';

import { createPreviewRuntime } from './preview-runtime';

describe('synthetic preview runtime', () => {
  it('starts authenticated with realistic XBF onboarding data and no network calls', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const runtime = createPreviewRuntime();
    const session = await runtime.authPort.initialize();

    expect(session?.identity.email).toBe('preview.operations@xbfreight.com');
    await expect(runtime.apiClient.listOnboardingWorkspace()).resolves.toEqual({
      requests_total: '26', documents_pending: '7', under_review: '5', ready_for_approval: '3',
    });
    await expect(runtime.apiClient.listDocumentVersions()).resolves.toHaveLength(3);
    await expect(runtime.apiClient.listClarificationReviews()).resolves.toHaveLength(1);
    const cases = await runtime.apiClient.listCustomerRegistrationCases();
    expect(cases).toHaveLength(4);
    await expect(runtime.apiClient.getCustomerRegistrationCase(cases[0].case_id)).resolves.toMatchObject({
      supplier_name: 'Northstar Components', state: 'ready_to_send', message_count: '4',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('keeps preview sign-out and sign-in entirely in memory', async () => {
    const runtime = createPreviewRuntime();
    await runtime.authPort.logout();
    expect(runtime.authPort.getCurrentSession()).toBeNull();
    await runtime.authPort.login('/app/pipeline');
    expect(runtime.authPort.getCurrentSession()?.identity.organization).toBe('xbf-preview-organization');
  });
});
