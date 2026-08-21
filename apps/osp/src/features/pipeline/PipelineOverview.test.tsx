import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { z } from 'zod';
import {
  OspApiError,
  type GmailStatusResponse,
  type OnboardingWorkspaceResponse,
  type OspClient,
} from '../../api/osp-client';
import { PipelineOverview } from './PipelineOverview';

const pipelineResponse: OnboardingWorkspaceResponse = {
  data: {
    rows: [],
    total: 12,
    limit: 10,
    offset: 0,
    queue: 'all',
    metrics: { total: 12, blocked: 3, approval: 4, overdue: 5 },
  },
};

const gmailResponse: GmailStatusResponse = {
  data: {
    mailbox_email: 'carriers@xbfreight.com',
    required_scope: 'gmail.readonly',
    legal_entities: [],
    connections: [{
      status: 'connected',
      mailbox_email: 'carriers@xbfreight.com',
      watch_expiration_at: null,
      last_error: null,
    }],
    outbound_enabled: false,
    pubsub_configured: true,
  },
};

function clientWith(overrides: Partial<OspClient> = {}): OspClient {
  return {
    listOnboardingWorkspace: vi.fn(async () => pipelineResponse),
    getGmailStatus: vi.fn(async () => gmailResponse),
    ...overrides,
  };
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } },
  });
}

function renderOverview(client: OspClient) {
  const queryClient = createTestQueryClient();
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <PipelineOverview client={client} />
    </QueryClientProvider>,
  );
  return { ...rendered, queryClient };
}

function apiError({
  status,
  code,
  incidentId = '',
  stage = 'response',
}: {
  status: number;
  code: string;
  incidentId?: string;
  stage?: string;
}) {
  return new OspApiError('provider detail must not render', status, code, incidentId, 'read', stage);
}

test('renders validated server metrics and mailbox health from the two exact read requests', async () => {
  // Catches replacing the aggregate endpoint with a row count or changing either stable request input.
  const client = clientWith();
  renderOverview(client);

  expect(await screen.findByRole('heading', { name: 'Vista global de la organización' })).toBeVisible();
  expect(client.listOnboardingWorkspace).toHaveBeenCalledOnce();
  expect(client.listOnboardingWorkspace).toHaveBeenCalledWith({
    queue: 'all',
    limit: 1,
    offset: 0,
  });
  expect(client.getGmailStatus).toHaveBeenCalledOnce();
  expect(client.getGmailStatus).toHaveBeenCalledWith();

  const metrics = await screen.findByRole('group', { name: 'Conteos del pipeline' });
  expect(within(metrics).getByText('12')).toBeVisible();
  expect(within(metrics).getByText('3')).toBeVisible();
  expect(within(metrics).getByText('4')).toBeVisible();
  expect(within(metrics).getByText('5')).toBeVisible();
  expect(screen.getByText('carriers@xbfreight.com')).toBeVisible();
  expect(screen.getByText('idle')).toBeVisible();
  expect(screen.getByText(/modelo de lectura del servidor/i)).toBeVisible();
});

test('keeps pipeline metrics visible when Gmail status fails', async () => {
  // Catches one rejected query replacing the independently successful read with an all-page error.
  const client = clientWith({
    getGmailStatus: vi.fn(async () => {
      throw apiError({ status: 403, code: 'FORBIDDEN', incidentId: 'gmail-incident-17' });
    }),
  });
  renderOverview(client);

  const alert = await screen.findByRole('alert', { name: 'Error de estado del buzón' });
  expect(alert).toHaveTextContent(/reintentar estado del buzón/i);
  expect(alert).toHaveTextContent('gmail-incident-17');
  expect(alert).not.toHaveTextContent('provider detail');
  expect(screen.getByRole('group', { name: 'Conteos del pipeline' })).toHaveTextContent('12');
  expect(screen.getByText('unknown')).toBeVisible();
  expect(screen.queryByText('carriers@xbfreight.com')).toBeNull();
});

test('keeps validated Gmail status visible when the pipeline read fails', async () => {
  // Catches fabricating zero metrics or hiding Gmail data after an independent pipeline failure.
  const client = clientWith({
    listOnboardingWorkspace: vi.fn(async () => {
      throw apiError({ status: 400, code: 'BAD_REQUEST', incidentId: 'pipeline-incident-23' });
    }),
  });
  renderOverview(client);

  const alert = await screen.findByRole('alert', { name: 'Error de conteos del pipeline' });
  expect(alert).toHaveTextContent(/reintentar conteos del pipeline/i);
  expect(alert).toHaveTextContent('pipeline-incident-23');
  expect(screen.queryByRole('group', { name: 'Conteos del pipeline' })).toBeNull();
  expect(screen.getByText('carriers@xbfreight.com')).toBeVisible();
  expect(screen.getByText('idle')).toBeVisible();
});

test('renders two separately actionable alerts when both reads fail', async () => {
  // Catches merging failures so operators cannot tell which independent read to retry.
  const client = clientWith({
    listOnboardingWorkspace: vi.fn(async () => {
      throw apiError({ status: 403, code: 'PIPELINE_FORBIDDEN' });
    }),
    getGmailStatus: vi.fn(async () => {
      throw apiError({ status: 403, code: 'GMAIL_FORBIDDEN' });
    }),
  });
  renderOverview(client);

  expect(await screen.findByRole('alert', { name: 'Error de conteos del pipeline' })).toBeVisible();
  expect(screen.getByRole('alert', { name: 'Error de estado del buzón' })).toBeVisible();
  expect(screen.queryByRole('group', { name: 'Conteos del pipeline' })).toBeNull();
  expect(screen.getByText('unknown')).toBeVisible();
});

test('shows independent loading states without provisional counts or mailbox health', () => {
  // Catches presenting optimistic zeros or a healthy mailbox while either response is pending.
  const never = new Promise<never>(() => undefined);
  const client = clientWith({
    listOnboardingWorkspace: vi.fn(() => never),
    getGmailStatus: vi.fn(() => never),
  });
  renderOverview(client);

  expect(screen.getByRole('status', { name: 'Cargando conteos del pipeline' })).toBeVisible();
  expect(screen.getByRole('status', { name: 'Cargando estado del buzón' })).toBeVisible();
  expect(screen.queryByRole('group', { name: 'Conteos del pipeline' })).toBeNull();
  expect(screen.queryByText('watching')).toBeNull();
  expect(screen.queryByText('idle')).toBeNull();
});

test('renders explicit zero metrics returned by the server', async () => {
  // Catches treating valid zeros as absent or replacing them with a loading/error state.
  const client = clientWith({
    listOnboardingWorkspace: vi.fn(async () => ({
      ...pipelineResponse,
      data: {
        ...pipelineResponse.data,
        total: 0,
        metrics: { total: 0, blocked: 0, approval: 0, overdue: 0 },
      },
    })),
  });
  renderOverview(client);

  const metrics = await screen.findByRole('group', { name: 'Conteos del pipeline' });
  expect(within(metrics).getAllByText('0')).toHaveLength(4);
});

test('reports mailbox health as unknown after a failed refresh of previously validated data', async () => {
  // Catches presenting a stale connected/watching state as current after the status read fails.
  const refreshedGmailResponse: GmailStatusResponse = {
    data: {
      ...gmailResponse.data,
      connections: [{
        ...gmailResponse.data.connections[0],
        status: 'watching',
      }],
    },
  };
  const gmail = vi.fn()
    .mockResolvedValueOnce(gmailResponse)
    .mockRejectedValueOnce(apiError({ status: 403, code: 'FORBIDDEN' }))
    .mockResolvedValueOnce(refreshedGmailResponse);
  const client = clientWith({ getGmailStatus: gmail });
  const { queryClient } = renderOverview(client);
  expect(await screen.findByText('idle')).toBeVisible();

  await queryClient.refetchQueries({ queryKey: ['osp', 'gmail-status'] });

  expect(await screen.findByRole('alert', { name: 'Error de estado del buzón' })).toBeVisible();
  expect(screen.queryByText('idle')).toBeNull();
  expect(screen.getByText('unknown')).toBeVisible();
  expect(screen.getByText('carriers@xbfreight.com')).toBeVisible();

  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Reintentar estado del buzón' }));
  expect(await screen.findByText('watching')).toBeVisible();
  expect(gmail).toHaveBeenCalledTimes(3);
  expect(client.listOnboardingWorkspace).toHaveBeenCalledOnce();
});

test('hides stale pipeline metrics after a failed refresh until its own retry succeeds', async () => {
  // Catches presenting old counts as current when no server freshness timestamp can support them.
  const transientFailure = apiError({ status: 503, code: 'HTTP_503' });
  const refreshedPipelineResponse: OnboardingWorkspaceResponse = {
    data: {
      ...pipelineResponse.data,
      total: 21,
      metrics: { total: 21, blocked: 8, approval: 7, overdue: 6 },
    },
  };
  const pipeline = vi.fn()
    .mockResolvedValueOnce(pipelineResponse)
    .mockRejectedValueOnce(transientFailure)
    .mockRejectedValueOnce(transientFailure)
    .mockResolvedValueOnce(refreshedPipelineResponse);
  const client = clientWith({ listOnboardingWorkspace: pipeline });
  const { queryClient } = renderOverview(client);
  const initialMetrics = await screen.findByRole('group', { name: 'Conteos del pipeline' });
  expect(initialMetrics).toHaveTextContent('12');

  await queryClient.refetchQueries({ queryKey: [
    'osp',
    'onboarding-workspace',
    { queue: 'all', limit: 1, offset: 0 },
  ] });

  expect(await screen.findByRole('alert', { name: 'Error de conteos del pipeline' })).toBeVisible();
  expect(screen.queryByRole('group', { name: 'Conteos del pipeline' })).toBeNull();
  expect(screen.queryByText('12')).toBeNull();
  expect(pipeline).toHaveBeenCalledTimes(3);
  expect(client.getGmailStatus).toHaveBeenCalledOnce();

  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Reintentar conteos del pipeline' }));
  const refreshedMetrics = await screen.findByRole('group', { name: 'Conteos del pipeline' });
  expect(refreshedMetrics).toHaveTextContent('21');
  expect(refreshedMetrics).toHaveTextContent('8');
  expect(refreshedMetrics).toHaveTextContent('7');
  expect(refreshedMetrics).toHaveTextContent('6');
  expect(pipeline).toHaveBeenCalledTimes(4);
  expect(client.getGmailStatus).toHaveBeenCalledOnce();
});

test.each([
  ['HTTP 5xx', apiError({ status: 503, code: 'HTTP_503' })],
  ['safe transport stage', apiError({ status: 0, code: 'TRANSPORT_FAILURE', stage: 'transport' })],
  ['safe network code', apiError({ status: 0, code: 'NETWORK_ERROR', stage: 'response' })],
  ['raw TypeError', new TypeError('network detail')],
])('retries %s once and then preserves the successful result', async (_label, firstFailure) => {
  // Catches eliminating the one bounded retry for safe, read-only transient failures.
  const pipeline = vi.fn()
    .mockRejectedValueOnce(firstFailure)
    .mockResolvedValueOnce(pipelineResponse);
  const client = clientWith({ listOnboardingWorkspace: pipeline });
  renderOverview(client);

  expect(await screen.findByRole('group', { name: 'Conteos del pipeline' })).toHaveTextContent('12');
  expect(pipeline).toHaveBeenCalledTimes(2);
});

test.each([
  ['401', apiError({ status: 401, code: 'UNAUTHORIZED' })],
  ['403', apiError({ status: 403, code: 'FORBIDDEN' })],
  ['other 4xx', apiError({ status: 422, code: 'INVALID_INPUT' })],
  ['other 4xx even with a transport stage', apiError({
    status: 429,
    code: 'NETWORK_ERROR',
    stage: 'transport',
  })],
  ['auth/token failure', apiError({ status: 503, code: 'AUTH_TOKEN_UNAVAILABLE', stage: 'auth' })],
  ['schema failure', new z.ZodError([{ code: 'custom', path: [], message: 'invalid' }])],
  ['other failure', new Error('unexpected')],
])('does not retry a %s failure', async (_label, failure) => {
  // Catches retrying authorization, validation, or non-transient failures after transport handling.
  const pipeline = vi.fn(async () => {
    throw failure;
  });
  const client = clientWith({ listOnboardingWorkspace: pipeline });
  renderOverview(client);

  expect(await screen.findByRole('alert', { name: 'Error de conteos del pipeline' })).toBeVisible();
  await waitFor(() => expect(pipeline).toHaveBeenCalledOnce());
});
