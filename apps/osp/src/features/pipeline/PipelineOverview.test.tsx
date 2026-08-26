import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OspReadClient } from '../../api/osp-client';
import { PipelineOverview } from './PipelineOverview';

afterEach(() => { cleanup(); onlineManager.setOnline(true); });

function renderOverview(client: OspReadClient) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><PipelineOverview client={client} /></QueryClientProvider>);
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
});
