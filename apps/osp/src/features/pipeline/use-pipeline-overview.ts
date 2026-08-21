import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { OspApiError, type OspClient } from '../../api/osp-client';

const PIPELINE_INPUT = { queue: 'all', limit: 1, offset: 0 } as const;

function retryRead(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (error instanceof z.ZodError) return false;
  if (error instanceof OspApiError) {
    if (error.status >= 400 && error.status < 500) return false;
    if (error.stage === 'auth' || /AUTH|TOKEN/.test(error.code)) return false;
    return error.status >= 500
      || error.stage === 'transport'
      || error.code === 'NETWORK_ERROR';
  }
  return error instanceof TypeError;
}

export function usePipelineOverview(client: OspClient) {
  const pipeline = useQuery({
    queryKey: ['osp', 'onboarding-workspace', PIPELINE_INPUT],
    queryFn: () => client.listOnboardingWorkspace(PIPELINE_INPUT),
    staleTime: 30_000,
    retry: retryRead,
  });
  const gmail = useQuery({
    queryKey: ['osp', 'gmail-status'],
    queryFn: () => client.getGmailStatus(),
    staleTime: 30_000,
    retry: retryRead,
  });

  return { pipeline, gmail };
}
