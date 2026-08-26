import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './AppShell';

afterEach(cleanup);

describe('AppShell', () => {
  it('provides keyboard focus and clears query data before logout', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['osp', 'pipeline-overview'], { requests_total: '99' });
    const logout = vi.fn(async () => undefined);
    render(
      <QueryClientProvider client={queryClient}>
        <AppShell email="operator@example.test" onLogout={logout}>
          <h1>Workspace</h1>
        </AppShell>
      </QueryClientProvider>,
    );
    await userEvent.tab();
    expect(screen.getByRole('link', { name: /skip to content/i })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(queryClient.getQueryData(['osp', 'pipeline-overview'])).toBeUndefined();
    expect(logout).toHaveBeenCalledOnce();
  });

  it('shows a safe logout failure and lets the user retry explicitly', async () => {
    const queryClient = new QueryClient();
    const logout = vi.fn().mockRejectedValueOnce(new Error('private logout failure')).mockResolvedValueOnce(undefined);
    render(<QueryClientProvider client={queryClient}><AppShell email="operator@example.test" onLogout={logout}><h1>Workspace</h1></AppShell></QueryClientProvider>);
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not sign out/i);
    expect(screen.queryByText(/private logout failure/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry sign out/i }));
    expect(logout).toHaveBeenCalledTimes(2);
  });
});
