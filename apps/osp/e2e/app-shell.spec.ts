import { expect, test } from '@playwright/test';
import type { RouterContext } from '../src/app/router';

declare global {
  interface Window {
    __OSP_E2E_RUNTIME__?: RouterContext;
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__OSP_E2E_RUNTIME__ = {
      auth: {
        initialize: async () => undefined,
        isAuthenticated: async () => true,
        login: async () => undefined,
        logout: async () => undefined,
        getAccessToken: async () => 'synthetic-e2e-token',
        getUser: async () => ({
          subject: 'kp_e2e',
          email: 'operator@example.test',
          displayName: 'OSP Operator',
        }),
      },
      ospClient: {
        listOnboardingWorkspace: async () => ({
          data: {
            rows: [],
            total: 4,
            limit: 1,
            offset: 0,
            queue: 'all',
            metrics: { total: 4, blocked: 1, approval: 2, overdue: 1 },
          },
        }),
        getGmailStatus: async () => ({
          data: {
            mailbox_email: 'carriers@example.test',
            required_scope: 'gmail.readonly',
            legal_entities: [],
            connections: [{
              status: 'watching',
              mailbox_email: 'carriers@example.test',
              watch_expiration_at: null,
              last_error: null,
            }],
            outbound_enabled: false,
            pubsub_configured: true,
          },
        }),
      },
    };
  });
});

test('redirects /app to live read-only fixture data without document overflow', async ({ page }) => {
  await page.goto('/app');

  await expect(page).toHaveURL(/\/app\/pipeline$/);
  await expect(page.getByRole('heading', { name: 'Pipeline', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Conteos del pipeline' })).toContainText('4');
  await expect(page.getByText('carriers@example.test', { exact: true })).toBeVisible();
  await expect(page.getByText('watching', { exact: true })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true);
});

test('loads a direct route and keeps keyboard navigation client-side', async ({ page }) => {
  await page.goto('/app/pipeline');
  await expect(page.getByRole('heading', { name: 'Pipeline', exact: true })).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Pipeline', exact: true })).toBeFocused();

  await page.evaluate(() => {
    (window as Window & { __ospNavigationSentinel?: string }).__ospNavigationSentinel = 'retained';
  });
  await page.getByRole('link', { name: 'Capturas' }).click();
  await expect(page).toHaveURL(/\/app\/intake$/);
  await expect(page.getByText('Disponible en una fase posterior')).toBeVisible();
  expect(await page.evaluate(
    () => (window as Window & { __ospNavigationSentinel?: string }).__ospNavigationSentinel,
  )).toBe('retained');
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true);
});
