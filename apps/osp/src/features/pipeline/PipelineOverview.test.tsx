import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OspCaseReadClient, OspClient, OspReadClient } from '../../api/osp-client';
import { PipelineOverview } from './PipelineOverview';

afterEach(() => { cleanup(); onlineManager.setOnline(true); });

function renderOverview(client: OspReadClient & Partial<OspCaseReadClient> &
  Partial<Pick<OspClient, 'syncGmailInbox' | 'renewGmailWatch' | 'previewHistoricalGmailSearch' | 'importHistoricalGmailMessage'>>,
email = '') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><PipelineOverview client={client} email={email} /></QueryClientProvider>);
}

const disconnected = {
  connection_exists: false as const, pubsub_configured: null, watch_configured: null,
  token_expires_at: null, watch_expires_at: null, error_present: false as const,
  error_code: null, outbound_enabled: false as const,
};

describe('PipelineOverview', () => {
  it('renders explicit zeros as 0 and missing data as an em dash', async () => {
    renderOverview({
      listOnboardingWorkspace: vi.fn(async () => ({
        requests_total: '0', documents_pending: '4', under_review: undefined as never,
        ready_for_approval: '1',
      })),
      getGmailStatus: vi.fn(async () => disconnected),
    });
    expect(await screen.findByTestId('metric-requests_total')).toHaveTextContent('0');
    expect(screen.getByTestId('metric-under_review')).toHaveAccessibleName(/under review: data unavailable/i);
  });

  it('distinguishes degraded health from watching', async () => {
    renderOverview({
      listOnboardingWorkspace: vi.fn(async () => ({
        requests_total: '1', documents_pending: '2', under_review: '3', ready_for_approval: '4',
      })),
      getGmailStatus: vi.fn(async () => ({
        connection_exists: true as const, pubsub_configured: true, watch_configured: true,
        token_expires_at: null, watch_expires_at: '2099-01-01T00:00:00.000Z',
        error_present: false, error_code: null, outbound_enabled: false as const,
      })),
    });
    expect(await screen.findByText('Degraded')).toBeInTheDocument();
    expect(screen.queryByText('Watching')).not.toBeInTheDocument();
  });

  it('keeps independent loading, failure, empty and success states accessible', async () => {
    renderOverview({
      listOnboardingWorkspace: vi.fn(async () => { throw new Error('pipeline private'); }),
      getGmailStatus: vi.fn(async () => disconnected),
    });
    expect(await screen.findByRole('alert', { name: /pipeline unavailable/i })).toBeInTheDocument();
    expect(await screen.findByRole('status', { name: /gmail status: disconnected/i })).toBeInTheDocument();
    expect(screen.queryByText(/pipeline private/i)).not.toBeInTheDocument();
  });

  it('drops stale data when the client identity changes', async () => {
    const first: OspReadClient = {
      listOnboardingWorkspace: vi.fn(async () => ({
        requests_total: '77', documents_pending: '0', under_review: '0', ready_for_approval: '0',
      })), getGmailStatus: vi.fn(async () => disconnected),
    };
    const pending = new Promise<never>(() => undefined);
    const second: OspReadClient = {
      listOnboardingWorkspace: vi.fn(() => pending), getGmailStatus: vi.fn(() => pending),
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={queryClient}><PipelineOverview client={first} /></QueryClientProvider>);
    expect(await screen.findByText('77')).toBeInTheDocument();
    queryClient.clear();
    view.rerender(<QueryClientProvider client={queryClient}><PipelineOverview client={second} /></QueryClientProvider>);
    expect(screen.queryByText('77')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: /loading pipeline/i })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /loading gmail health/i })).toBeInTheDocument();
  });

  it('announces paused pipeline and Gmail queries as paused', () => {
    onlineManager.setOnline(false);
    const pending = new Promise<never>(() => undefined);
    renderOverview({ listOnboardingWorkspace: vi.fn(() => pending), getGmailStatus: vi.fn(() => pending) });
    expect(screen.getByRole('status', { name: /pipeline loading paused/i })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /gmail health loading paused/i })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /^loading pipeline$/i })).not.toBeInTheDocument();
  });

  it('announces hidden refreshes as revalidating instead of initial loading', async () => {
    const pipelineRefresh = new Promise<never>(() => undefined);
    const gmailRefresh = new Promise<never>(() => undefined);
    const client: OspReadClient = {
      listOnboardingWorkspace: vi.fn()
        .mockResolvedValueOnce({ requests_total: '5', documents_pending: '0', under_review: '0', ready_for_approval: '0' })
        .mockImplementationOnce(() => pipelineRefresh),
      getGmailStatus: vi.fn().mockResolvedValueOnce(disconnected).mockImplementationOnce(() => gmailRefresh),
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><PipelineOverview client={client} /></QueryClientProvider>);
    expect(await screen.findByText('5')).toBeInTheDocument();
    void queryClient.invalidateQueries();
    expect(await screen.findByRole('status', { name: /revalidating pipeline/i })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /revalidating gmail health/i })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /^loading pipeline$/i })).not.toBeInTheDocument();
  });

  it('offers one manual no-Pub/Sub sync and reports only safe counts', async () => {
    const syncGmailInbox = vi.fn(async () => ({
      discovered: 2, inserted_messages: 1, duplicates: 1, attachment_metadata_rows: 0,
      osp_enqueued: 1, osp_processed: 1, outbound_enabled: false as const,
    }));
    renderOverview({
      listOnboardingWorkspace: vi.fn(async () => ({
        requests_total: '1', documents_pending: '1', under_review: '0', ready_for_approval: '0',
      })),
      getGmailStatus: vi.fn(async () => ({
        connection_exists: true as const, pubsub_configured: false, watch_configured: false,
        token_expires_at: '2099-01-01T00:00:00.000Z', watch_expires_at: null,
        error_present: false, error_code: null, outbound_enabled: false as const,
      })),
      syncGmailInbox,
    });
    expect(await screen.findByRole('status', { name: /gmail status: connected/i })).toBeInTheDocument();
    expect(screen.getByText(/manual · no cloud trigger/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pub\/sub required/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /sync inbox now/i }));
    expect(await screen.findByText(/1 new gmail message.*osp processed 1 job/i)).toBeInTheDocument();
    expect(syncGmailInbox).toHaveBeenCalledOnce();
  });

  it('shows the automatic email-to-review path while keeping every external effect locked', async () => {
    const syncGmailInbox = vi.fn(async () => ({
      discovered: 0, inserted_messages: 0, duplicates: 0, attachment_metadata_rows: 0,
      osp_enqueued: 0, osp_processed: 0, outbound_enabled: false as const,
    }));
    const renewGmailWatch = vi.fn(async () => ({
      watch_configured: true as const, watch_expires_at: '2099-01-08T00:00:00.000Z', outbound_enabled: false as const,
    }));
    renderOverview({
      listOnboardingWorkspace: vi.fn(async () => ({
        requests_total: '2', documents_pending: '0', under_review: '1', ready_for_approval: '0',
      })),
      getGmailStatus: vi.fn(async () => ({
        connection_exists: true as const, pubsub_configured: true, watch_configured: true,
        token_expires_at: '2099-01-01T00:00:00.000Z', watch_expires_at: '2099-01-02T00:00:00.000Z',
        error_present: false, error_code: null, outbound_enabled: false as const,
      })),
      syncGmailInbox,
      renewGmailWatch,
    });

    expect(await screen.findByText(/automatic · gmail watch/i)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: /automatic onboarding path/i })).toHaveTextContent(/inbox monitored/i);
    expect(screen.getByRole('list', { name: /automatic onboarding path/i })).toHaveTextContent(/operations handoff/i);
    expect(screen.getByRole('note')).toHaveTextContent(/no reply, signature, authorization or provider write/i);
    expect(screen.getByRole('button', { name: /run fallback sync/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /renew watch/i })).toBeEnabled();
    expect(syncGmailInbox).not.toHaveBeenCalled();
    expect(renewGmailWatch).not.toHaveBeenCalled();
  });

  it('shows no-cost scheduled polling as the primary automatic path', async () => {
    renderOverview({
      listOnboardingWorkspace: vi.fn(async () => ({
        requests_total: '2', documents_pending: '2', under_review: '0', ready_for_approval: '0',
      })),
      getGmailStatus: vi.fn(async () => ({
        connection_exists: true as const,
        pubsub_configured: false,
        watch_configured: false,
        scheduled_poll_configured: true,
        poll_interval_seconds: 300,
        poll_last_completed_at: '2099-01-01T00:00:00.000Z',
        poll_status: 'succeeded' as const,
        token_expires_at: '2099-01-02T00:00:00.000Z',
        watch_expires_at: null,
        error_present: false,
        error_code: null,
        outbound_enabled: false as const,
      })),
      syncGmailInbox: vi.fn(async () => ({
        discovered: 0, inserted_messages: 0, duplicates: 0, attachment_metadata_rows: 0,
        osp_enqueued: 0, osp_processed: 0, outbound_enabled: false as const,
      })),
    });

    expect(await screen.findByText(/automatic · scheduled sync/i)).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /gmail status: automated/i })).toHaveTextContent(/every 5 minutes/i);
    expect(screen.getByText(/no-cost scheduled intake/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scheduled sync active/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /run fallback sync/i })).toBeEnabled();
    expect(screen.getByRole('note')).toHaveTextContent(/no reply, signature, authorization or provider write/i);
  });

  it('activates automatic intake only when the full cloud trigger is configured', async () => {
    const renewGmailWatch = vi.fn(async () => ({
      watch_configured: true as const,
      watch_expires_at: '2099-01-08T00:00:00.000Z',
      outbound_enabled: false as const,
    }));
    renderOverview({
      listOnboardingWorkspace: vi.fn(async () => ({
        requests_total: '1', documents_pending: '1', under_review: '0', ready_for_approval: '0',
      })),
      getGmailStatus: vi.fn(async () => ({
        connection_exists: true as const, pubsub_configured: true, watch_configured: false,
        token_expires_at: '2099-01-01T00:00:00.000Z', watch_expires_at: null,
        error_present: false, error_code: null, outbound_enabled: false as const,
      })),
      renewGmailWatch,
    });

    expect(await screen.findByText(/ready · watch inactive/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /enable automatic intake/i }));
    expect(renewGmailWatch).toHaveBeenCalledOnce();
    expect(await screen.findByText(/automatic intake active until/i)).toBeInTheDocument();
  });

  it('exposes the exact Salzillo recovery only to Sales and preserves every outbound guard', async () => {
    const salzilloQuery = 'subject:"PROCESO DE ALTA GRUPO SALZILLO - HEYMARKSMAN" after:2026/08/18 before:2026/08/21';
    const previewHistoricalGmailSearch = vi.fn(async () => ({
      query: salzilloQuery,
      candidates: [{
        candidate_id: 'salzillo_message_1',
        subject: 'PROCESO DE ALTA GRUPO SALZILLO - HEYMARKSMAN',
        sender_domain: 'xbfreight.com',
        received_at: '2026-08-10T15:00:00.000Z',
        attachment_count: 1,
        duplicate_state: 'ready' as const,
      }],
      checkpoint_unchanged: true as const,
      persisted: false as const,
      outbound_enabled: false as const,
    }));
    const importHistoricalGmailMessage = vi.fn(async () => ({
      candidate_id: 'salzillo_message_1',
      claim_id: '97000000-0000-4000-8000-000000000001',
      import_status: 'imported' as const,
      attachment_metadata_rows: 1,
      osp_enqueued: 1,
      osp_processed: 0,
      checkpoint_unchanged: true as const,
      source_preserved: true as const,
      persisted: true as const,
      outbound_enabled: false as const,
    }));
    const client = {
      listOnboardingWorkspace: vi.fn(async () => ({ requests_total: '3', documents_pending: '2', under_review: '0', ready_for_approval: '0' })),
      getGmailStatus: vi.fn(async () => disconnected),
      previewHistoricalGmailSearch,
      importHistoricalGmailMessage,
    };

    const view = renderOverview(client, 'ops@xbfreight.com');
    expect(screen.queryByRole('heading', { name: /bounded gmail preflight/i })).not.toBeInTheDocument();
    view.unmount();
    renderOverview(client, 'sales@heymarksman.com');

    expect(await screen.findByText(salzilloQuery)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /verify exact candidate/i }));
    expect(previewHistoricalGmailSearch).toHaveBeenCalledWith({
      subjectPhrase: 'PROCESO DE ALTA GRUPO SALZILLO - HEYMARKSMAN',
      afterDate: '2026-08-18',
      beforeDate: '2026-08-21',
    });
    expect(screen.getByLabelText('Historical intake preflight')).toHaveTextContent('Candidates1');
    expect(await screen.findByText(/xbfreight\.com · 1 attachment.*new import/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /import only this verified customer-setup request/i }));
    await userEvent.click(screen.getByRole('button', { name: /import selected request/i }));
    expect(importHistoricalGmailMessage).toHaveBeenCalledOnce();
    expect(importHistoricalGmailMessage).toHaveBeenCalledWith(expect.objectContaining({
      subjectPhrase: 'PROCESO DE ALTA GRUPO SALZILLO - HEYMARKSMAN',
      afterDate: '2026-08-18',
      beforeDate: '2026-08-21',
      candidateId: 'salzillo_message_1',
      idempotencyKey: expect.stringMatching(/^historical_gmail:/),
    }));
    expect(await screen.findByText(/imported into osp intake/i)).toBeInTheDocument();
    expect(screen.getByText(/1 intake job queued · 1 attachment metadata row/i)).toBeInTheDocument();
  });
});
