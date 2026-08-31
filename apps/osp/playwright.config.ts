import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /approval-communications\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  use: { baseURL: 'http://localhost:8791', channel: 'chrome', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:8791',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_OSP_AUTH_PROVIDER: 'kinde',
      VITE_KINDE_DOMAIN: 'https://auth.heymarksman.com',
      VITE_KINDE_CLIENT_ID: 'synthetic-public-client',
      VITE_KINDE_AUDIENCE: 'https://osp.heymarksman.com/api',
      VITE_SUPABASE_URL: 'https://project.example.test',
      VITE_OSP_BUILD_PROFILE: 'local-e2e',
    },
  },
});
