import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { expect, it, vi } from 'vitest';

import { pipelineOverviewQueryKey, usePipelineOverview } from './use-pipeline-overview';

it('uses distinct PII-free queries and keeps partial failures independent', async () => {
  const client = {
    listOnboardingWorkspace: vi.fn(async () => ({ requests_total: '1', documents_pending: '0', under_review: '0', ready_for_approval: '0' })),
    getGmailStatus: vi.fn(async () => { throw new Error('unavailable'); }),
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => usePipelineOverview(client), { wrapper });
  await waitFor(() => expect(result.current.pipeline.isSuccess).toBe(true));
  await waitFor(() => expect(result.current.gmail.isError).toBe(true));
  expect(result.current.pipeline.data?.requests_total).toBe('1');
  expect(result.current.gmail.data).toBeUndefined();
  expect(pipelineOverviewQueryKey.pipeline).toEqual(['osp', 'pipeline-overview']);
  expect(pipelineOverviewQueryKey.gmail).toEqual(['osp', 'gmail-health']);
  expect(JSON.stringify(pipelineOverviewQueryKey)).not.toMatch(/subject|email|organization/);
});

it('hides prior data immediately while revalidating and after a failed refresh', async () => {
  let reject!: (error: Error) => void;
  const client = {
    listOnboardingWorkspace: vi.fn()
      .mockResolvedValueOnce({ requests_total: '9', documents_pending: '0', under_review: '0', ready_for_approval: '0' })
      .mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; })),
    getGmailStatus: vi.fn(async () => ({ connection_exists: false as const, pubsub_configured: null, watch_configured: null, token_expires_at: null, watch_expires_at: null, error_present: false as const, error_code: null, outbound_enabled: false as const })),
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => usePipelineOverview(client), { wrapper });
  await waitFor(() => expect(result.current.pipeline.data?.requests_total).toBe('9'));
  await act(async () => { void result.current.pipeline.refetch(); });
  await waitFor(() => expect(result.current.pipeline.isFetching).toBe(true));
  expect(result.current.pipeline.data).toBeUndefined();
  reject(new Error('refresh failed'));
  await waitFor(() => expect(result.current.pipeline.isError).toBe(true));
  expect(result.current.pipeline.data).toBeUndefined();
});

it('disables Query retries even under a real default QueryClient', async () => {
  const client = {
    listOnboardingWorkspace: vi.fn(async () => { throw new Error('invalid response'); }),
    getGmailStatus: vi.fn(async () => { throw new Error('forbidden'); }),
  };
  const queryClient = new QueryClient();
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => usePipelineOverview(client), { wrapper });
  await waitFor(() => {
    expect(result.current.pipeline.isError).toBe(true);
    expect(result.current.gmail.isError).toBe(true);
  });
  expect(client.listOnboardingWorkspace).toHaveBeenCalledOnce();
  expect(client.getGmailStatus).toHaveBeenCalledOnce();
});

it('hides cached data while an offline revalidation is paused', async () => {
  const client = {
    listOnboardingWorkspace: vi.fn(async () => ({ requests_total: '7', documents_pending: '0', under_review: '0', ready_for_approval: '0' })),
    getGmailStatus: vi.fn(async () => ({ connection_exists: false as const, pubsub_configured: null, watch_configured: null, token_expires_at: null, watch_expires_at: null, error_present: false as const, error_code: null, outbound_enabled: false as const })),
  };
  const queryClient = new QueryClient();
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const { result, unmount } = renderHook(() => usePipelineOverview(client), { wrapper });
  await waitFor(() => expect(result.current.pipeline.data?.requests_total).toBe('7'));
  onlineManager.setOnline(false);
  try {
    await act(async () => { void result.current.pipeline.refetch(); });
    await waitFor(() => expect(result.current.pipeline.fetchStatus).toBe('paused'));
    expect(result.current.pipeline.data).toBeUndefined();
  } finally {
    unmount();
    onlineManager.setOnline(true);
  }
});
