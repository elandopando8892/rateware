import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { GmailReadModel, PipelineReadModel } from '../../api/contracts';
import type { OspReadClient } from '../../api/osp-client';

export const pipelineOverviewQueryKey = Object.freeze({
  pipeline: ['osp', 'pipeline-overview'] as const,
  gmail: ['osp', 'gmail-health'] as const,
  cases: ['osp', 'customer-registration-cases'] as const,
});

function hideStaleData<T>(query: UseQueryResult<T, Error>): UseQueryResult<T, Error> {
  if (query.fetchStatus === 'idle' && !query.isError) return query;
  return { ...query, data: undefined } as UseQueryResult<T, Error>;
}

export function usePipelineOverview(client: OspReadClient): {
  pipeline: UseQueryResult<PipelineReadModel, Error>;
  gmail: UseQueryResult<GmailReadModel, Error>;
} {
  const pipeline = useQuery({
    queryKey: pipelineOverviewQueryKey.pipeline,
    queryFn: () => client.listOnboardingWorkspace(),
    retry: false,
    staleTime: 0,
  });
  const gmail = useQuery({
    queryKey: pipelineOverviewQueryKey.gmail,
    queryFn: () => client.getGmailStatus(),
    retry: false,
    staleTime: 0,
  });
  return {
    pipeline: hideStaleData(pipeline),
    gmail: hideStaleData(gmail),
  };
}
