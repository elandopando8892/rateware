import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { type OspClient } from '../api/osp-client';
import { type AuthPort } from '../auth/auth-port';
import { App } from './App';

test('identifies OSP as XBF customer setup and contains no iframe', async () => {
  const auth: AuthPort = {
    initialize: async () => undefined,
    isAuthenticated: async () => true,
    login: async () => undefined,
    logout: async () => undefined,
    getAccessToken: async () => 'test-token-not-rendered',
    getUser: async () => ({
      subject: 'kp_test',
      email: 'operator@example.test',
      displayName: 'OSP Operator',
    }),
  };
  const ospClient = {
    listOnboardingWorkspace: vi.fn(),
    getGmailStatus: vi.fn(),
  } as unknown as OspClient;
  const { container } = render(
    <App
      auth={auth}
      ospClient={ospClient}
      history={createMemoryHistory({ initialEntries: ['/app/pipeline'] })}
    />,
  );
  expect(await screen.findByRole('heading', { name: /customer setup/i })).toBeVisible();
  expect(screen.getByText(/xBF as the provider's customer/i)).toBeVisible();
  expect(container.querySelector('iframe')).toBeNull();
});
