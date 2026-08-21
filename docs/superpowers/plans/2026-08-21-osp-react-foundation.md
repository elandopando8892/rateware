# OSP React Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the delivered OSP history with current Rateware safely and ship a deployable, authenticated React application at `/app` whose first real vertical slice shows the tenant-scoped onboarding pipeline metrics and honest Gmail mailbox health.

**Architecture:** Build a standalone Vite SPA in `apps/osp` and keep the delivered Supabase Edge Functions as the only browser-facing data boundary. Kinde PKCE supplies the bearer token through an injected auth port; a typed OSP client calls `provider-onboarding-api` and `provider-gmail-intake-api`; TanStack Query renders read-only operational state. The legacy HTML surfaces remain intact during this phase, but the new app contains no iframe and does not expose any consequential command.

**Tech Stack:** Node.js >=22.12, pnpm 11.19, React 19.2, TypeScript 7, Vite 8, TanStack Router 1, TanStack Query 5, Kinde PKCE JS 4, Zod 4, Vitest 4, React Testing Library 16, Playwright 1.62, existing Supabase/Postgres/Storage/Edge Functions.

**Spec:** `docs/superpowers/specs/2026-08-21-osp-customer-setup-rebuild-design.md`

## Global Constraints

- Work in an isolated clean worktree. Do not implement in the dirty control checkout.
- Preserve the delivered OSP branch `feat/provider-service-onboarding-production` at `c4bea07fc8a381dc8837afde88a4d1b57447a65e` and the current `origin/main` history.
- Do not stage or commit unrelated files from the control checkout, including `.superpowers/` and `tmp/`.
- OSP is for registering XBF as a provider's customer. It is not a quotation, rate intake, `rate_staging`, or carrier onboarding flow.
- The browser may call authenticated Edge Functions only. It must not query Supabase tables or buckets directly.
- Phase 1 is read-only after login. It must not approve, sign, authorize, send, mutate CRM state, or modify production data.
- Never copy `firma JAGP sin fondo.png` into the worktree, build output, test fixtures, logs, screenshots, or Git.
- Preserve `workspace_registry_external_canonical_unique`, `vendors_id_organization_id_unique`, the documented eight-column `vendors` seam, and OSP's separation from Rateware Edge Actions.
- Production Kinde callback and logout redirect are exactly `https://osp.heymarksman.com/app`; local callback and logout redirect are exactly `http://localhost:8791/app`. Do not remove or edit the existing `partners.heymarksman.com` URLs.
- An unreadable mailbox is `unknown`, never healthy. An empty or failed metric request must never become a fabricated zero.
- Run baseline and new tests with the bundled Node runtime if the shell's Node is below 22.12.

---

## File Structure

| Area | Files | Responsibility |
|---|---|---|
| Integration boundary | `supabase/functions/_shared/action-contract-provider-service.mjs`, reconciled migrations, `tests/action-contract.test.mjs` | Preserve OSP action governance and current-main migration authority. |
| Package/build | `apps/osp/package.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `index.html` | Make OSP independently installable, testable, and buildable below `/app/`. |
| Runtime config | `apps/osp/src/config/runtime.ts` | Validate the three public values and derive exact Kinde redirect URLs. |
| Authentication | `apps/osp/src/auth/*` | Hide Kinde behind an injected port and expose safe session state to React. |
| API boundary | `apps/osp/src/api/*` | Call only the two approved Edge Functions and validate their safe response envelopes. |
| Application shell | `apps/osp/src/app/*`, `apps/osp/src/components/*`, `apps/osp/src/styles/*` | Own typed routes, authenticated navigation, accessibility, and visual tokens without iframes. |
| First vertical slice | `apps/osp/src/features/pipeline/*` | Render server-derived organization metrics and honest Gmail health without mutations. |
| Release evidence | `apps/osp/e2e/*`, `apps/osp/scripts/verify-build.mjs`, `apps/osp/vercel.json`, `apps/osp/README.md` | Prove direct-route behavior, artifact safety, and operational configuration. |

### Task 1: Create the clean integration baseline

**Files:**

- Modify: `supabase/functions/_shared/action-contract-provider-service.mjs`
- Modify: `tests/action-contract.test.mjs`
- Resolve without semantic change: `supabase/migrations/20260819214744_provider_release_item_hash_check_null_safe.sql`
- Resolve without semantic change: `supabase/migrations/20260819221154_provider_release_approval_separation_allows_flagged_self.sql`
- Resolve without semantic change: `supabase/migrations/20260819223726_provider_mailbox_policy_enabled_domains_cardinality.sql`
- Resolve without semantic change: `supabase/migrations/20260819224030_provider_mailbox_domain_predicate_execution_hardening.sql`
- Resolve without semantic change: `supabase/migrations/20260821010804_provider_read_model_service_role_grants_chain.sql`
- Resolve without semantic change: `supabase/migrations/20260821011805_provider_command_service_role_grants.sql`
- Add by cherry-pick: `docs/superpowers/specs/2026-08-21-osp-customer-setup-rebuild-design.md`
- Add by cherry-pick: `docs/superpowers/plans/2026-08-21-osp-react-foundation.md`

**Interfaces:**

- Consumes: exact commits `c4bea07fc8a381dc8837afde88a4d1b57447a65e`, `origin/main`, design commit `8a7d18c`, and the root npm regression scripts.
- Produces: clean branch `codex/osp-customer-setup-react` with the merged action contract, reconciled migrations, passing baseline, design, and plan.

- [ ] **Step 1: Create the isolated branch and worktree**

Invoke `superpowers:using-git-worktrees`. Create branch `codex/osp-customer-setup-react` from the exact OSP commit. Use the external worktree path below so no worktree metadata is introduced into the repository.

```powershell
$ospWorktree = 'C:\Users\andre\.codex\worktrees\Rateware\osp-customer-setup-react'
New-Item -ItemType Directory -Path (Split-Path -Parent $ospWorktree) -Force | Out-Null
git worktree add $ospWorktree -b codex/osp-customer-setup-react c4bea07fc8a381dc8837afde88a4d1b57447a65e
git -C $ospWorktree rev-parse HEAD
git -C $ospWorktree status --short
```

Expected: HEAD is `c4bea07fc8a381dc8837afde88a4d1b57447a65e` and status is empty.

- [ ] **Step 2: Establish the delivered baseline before merging**

```powershell
npm ci
npm test
npm run test:provider-service
npm run validate:action-contract
npm run test:action-contract
```

Record the exact suite/test counts. Stop on any failure; do not normalize a baseline failure into the merge.

- [ ] **Step 3: Merge current main without committing**

```powershell
git fetch origin
git merge --no-commit --no-ff origin/main
git status --short
```

Expected conflict set: the shared Provider Service action contract, the six migrations listed above, and `tests/action-contract.test.mjs`. Stop if additional conflicts appear and classify them before editing.

- [ ] **Step 4: Resolve the six migration conflicts**

For each of the six migration files, keep OSP's commented reconciliation variant because its executable body is already represented by the current-main migration. Do not create a third executable copy.

```powershell
git checkout --ours -- supabase/migrations/20260819214744_provider_release_item_hash_check_null_safe.sql
git checkout --ours -- supabase/migrations/20260819221154_provider_release_approval_separation_allows_flagged_self.sql
git checkout --ours -- supabase/migrations/20260819223726_provider_mailbox_policy_enabled_domains_cardinality.sql
git checkout --ours -- supabase/migrations/20260819224030_provider_mailbox_domain_predicate_execution_hardening.sql
git checkout --ours -- supabase/migrations/20260821010804_provider_read_model_service_role_grants_chain.sql
git checkout --ours -- supabase/migrations/20260821011805_provider_command_service_role_grants.sql
```

Verify each retained file contains commentary only for the duplicate migration and no conflict markers.

- [ ] **Step 5: Resolve the action contract additively**

Retain OSP's 24 Provider Service Edge Actions and expected totals:

```js
export const PROVIDER_SERVICE_EXPECTED_COUNTS = Object.freeze({
  governable: 64,
  edge: 24,
  postgres: 40,
  ratewareApi: 0,
});
```

For the four internal RPC rows below, retain current main's `migrationPath`, SQL fingerprint, `exposure: "internal/service-role"`, and `decisionStatus: "internal_only"`:

```text
provider_onboarding_decide_release_package_approval
provider_onboarding_revoke_release_package
provider_onboarding_revoke_signature_authorization
provider_onboarding_valid_recipient_domains
```

Use these exact current-main migration paths:

```text
provider_onboarding_decide_release_package_approval -> supabase/migrations/20260819221616_provider_release_approval_sets_expiry.sql
provider_onboarding_revoke_release_package -> supabase/migrations/20260817110000_provider_onboarding_approval_commands.sql
provider_onboarding_revoke_signature_authorization -> supabase/migrations/20260817130000_provider_onboarding_signature_template_binding.sql
provider_onboarding_valid_recipient_domains -> supabase/migrations/20260819223635_provider_mailbox_policy_domain_shape.sql
```

Do not invent aliases or expose these RPCs as browser actions.

- [ ] **Step 6: Preserve the stronger contract regression**

Keep OSP's dynamic count/shape assertions and add this explicit internal-only assertion to `tests/action-contract.test.mjs`:

```js
for (const canonicalId of [
  'rpc.public.provider_onboarding_decide_release_package_approval(uuid,uuid,text,text,text,text)',
  'rpc.public.provider_onboarding_revoke_release_package(uuid,uuid,text,text)',
  'rpc.public.provider_onboarding_revoke_signature_authorization(uuid,uuid,text,text)',
  'rpc.public.provider_onboarding_valid_recipient_domains(text[])',
]) {
  const action = ACTION_CONTRACT.surfaces.find((row) => row.canonicalId === canonicalId);
  assert.ok(action, `${canonicalId} must remain governed`);
  assert.equal(action.exposure, 'internal/service-role');
  assert.equal(action.decisionStatus, 'internal_only');
}
```

- [ ] **Step 7: Verify and commit the integration**

```powershell
rg -n "^(<<<<<<<|=======|>>>>>>>)" .
npm test
npm run test:provider-service
npm run validate:action-contract
npm run test:action-contract
git diff --check
git status --short
git add package.json package-lock.json src/styles.css supabase/functions/_shared/action-contract-provider-service.mjs tests/action-contract.test.mjs supabase/migrations/20260819214744_provider_release_item_hash_check_null_safe.sql supabase/migrations/20260819221154_provider_release_approval_separation_allows_flagged_self.sql supabase/migrations/20260819223726_provider_mailbox_policy_enabled_domains_cardinality.sql supabase/migrations/20260819224030_provider_mailbox_domain_predicate_execution_hardening.sql supabase/migrations/20260821010804_provider_read_model_service_role_grants_chain.sql supabase/migrations/20260821011805_provider_command_service_role_grants.sql
git commit -m "chore: integrate OSP delivery with current main"
```

Before staging, inspect `git status` and include every clean auto-merge from `origin/main`, not only the three named auto-merged files. Never use `git add -A`.

- [ ] **Step 8: Bring the approved design and this plan into the clean branch**

From the control checkout, resolve the plan commit without hard-coding an unknown hash:

```powershell
$planCommit = git log -1 --format=%H -- docs/superpowers/plans/2026-08-21-osp-react-foundation.md
$ospWorktree = 'C:\Users\andre\.codex\worktrees\Rateware\osp-customer-setup-react'
git -C $ospWorktree cherry-pick 8a7d18c $planCommit
```

Expected: both documentation files exist, and the worktree remains clean.

### Task 2: Scaffold the independently buildable React application

**Files:**

- Create: `apps/osp/package.json`
- Create: `apps/osp/pnpm-lock.yaml`
- Create: `apps/osp/index.html`
- Create: `apps/osp/tsconfig.json`
- Create: `apps/osp/vite.config.ts`
- Create: `apps/osp/eslint.config.js`
- Create: `apps/osp/src/main.tsx`
- Create: `apps/osp/src/app/App.tsx`
- Create: `apps/osp/src/app/App.test.tsx`
- Create: `apps/osp/src/test/setup.ts`
- Create: `apps/osp/src/styles/tokens.css`
- Create: `apps/osp/src/styles/global.css`
- Modify: `package.json`

**Interfaces:**

- Consumes: clean merged repository from Task 1 and Node.js >=22.12.
- Produces: independently installable `@rateware/osp-web` package, `App` component, Vite `/app/` build, Vitest/jsdom harness, and root `osp:*` scripts.

- [ ] **Step 1: Add the package manifest and test/build configuration**

Use this complete manifest:

```json
{
  "name": "@rateware/osp-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.19.0",
  "engines": { "node": ">=22.12.0" },
  "scripts": {
    "dev": "vite --host localhost --port 8791",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --host localhost --port 8791",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@kinde-oss/kinde-auth-pkce-js": "4.5.1",
    "@tanstack/react-query": "5.101.4",
    "@tanstack/react-router": "1.170.31",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "react-hook-form": "7.85.0",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@playwright/test": "1.62.1",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.5",
    "@types/node": "26.2.0",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.4",
    "@vitejs/plugin-react": "6.1.0",
    "eslint": "10.9.0",
    "eslint-plugin-react-hooks": "7.1.1",
    "globals": "17.11.0",
    "jsdom": "30.0.1",
    "typescript": "7.0.2",
    "typescript-eslint": "8.67.0",
    "vite": "8.2.2",
    "vitest": "4.1.11"
  }
}
```

Create `vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/app/',
  plugins: [react()],
  build: { outDir: 'dist/app', emptyOutDir: true },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
});
```

Use a strict `tsconfig.json` with `jsx: "react-jsx"`, `moduleResolution: "Bundler"`, `types: ["vite/client", "vitest/globals"]`, and `noEmit: true`. Configure flat ESLint for TypeScript/TSX plus React Hooks, and make `src/test/setup.ts` contain `import '@testing-library/jest-dom/vitest';`.

- [ ] **Step 2: Write the first failing application test**

```tsx
import { render, screen } from '@testing-library/react';
import { App } from './App';

test('identifies OSP as XBF customer setup and contains no iframe', () => {
  const { container } = render(<App />);
  expect(screen.getByRole('heading', { name: /customer setup/i })).toBeVisible();
  expect(screen.getByText(/xBF as the provider's customer/i)).toBeVisible();
  expect(container.querySelector('iframe')).toBeNull();
});
```

Run `pnpm --dir apps/osp test`. Expected: FAIL because `App` does not exist.

- [ ] **Step 3: Implement the minimal application shell**

Create `App.tsx` with the exact product description and an explicit read-only phase banner. Create `main.tsx` with `createRoot`, import the two CSS files, and render `App` inside `StrictMode`.

```tsx
// src/app/App.tsx
export function App() {
  return (
    <main>
      <p>Onboarding Service Provider</p>
      <h1>XBF Customer Setup</h1>
      <p>Register XBF as the provider's customer.</p>
      <aside role="status">Phase 1 is read-only. Approval, signature, authorization, and sending remain disabled.</aside>
    </main>
  );
}
```

```tsx
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/tokens.css';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
```

Do not import any legacy HTML page or create an iframe.

- [ ] **Step 4: Add root convenience scripts**

Add only these scripts to the merged root `package.json`, preserving every existing script:

```json
"osp:dev": "pnpm --dir apps/osp dev",
"osp:test": "pnpm --dir apps/osp test",
"osp:lint": "pnpm --dir apps/osp lint",
"osp:build": "pnpm --dir apps/osp build",
"osp:e2e": "pnpm --dir apps/osp test:e2e"
```

- [ ] **Step 5: Verify and commit**

```powershell
pnpm --dir apps/osp install --frozen-lockfile=false
pnpm --dir apps/osp test
pnpm --dir apps/osp lint
pnpm --dir apps/osp build
git diff --check
git add apps/osp package.json
git commit -m "feat(osp): scaffold React application"
```

### Task 3: Make runtime and callback configuration fail closed

**Files:**

- Create: `apps/osp/.env.example`
- Create: `apps/osp/src/config/runtime.ts`
- Create: `apps/osp/src/config/runtime.test.ts`

**Interfaces:**

- Consumes: Vite `ImportMetaEnv` and the three approved public configuration values.
- Produces: `RuntimeConfig`, `parseRuntimeConfig(env)`, `getRuntimeConfig()`, and `authRedirectUri(origin, production?)`.

- [ ] **Step 1: Write failing configuration tests**

Cover all of these cases:

```ts
expect(authRedirectUri('http://localhost:8791')).toBe('http://localhost:8791/app');
expect(authRedirectUri('https://osp.heymarksman.com')).toBe('https://osp.heymarksman.com/app');
expect(() => authRedirectUri('https://partners.heymarksman.com', true)).toThrow(/production origin/i);
expect(() => parseRuntimeConfig({})).toThrow(/VITE_KINDE_DOMAIN/);
```

Run `pnpm --dir apps/osp test -- src/config/runtime.test.ts`. Expected: FAIL because the module does not exist.

- [ ] **Step 2: Implement validated public runtime configuration**

Use Zod to parse exactly:

```ts
import { z } from 'zod';

export const RuntimeConfigSchema = z.object({
  VITE_KINDE_DOMAIN: z.url(),
  VITE_KINDE_CLIENT_ID: z.string().min(1),
  VITE_SUPABASE_URL: z.url(),
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export function parseRuntimeConfig(env: Record<string, unknown>): RuntimeConfig {
  return RuntimeConfigSchema.parse(env);
}

export function getRuntimeConfig(): RuntimeConfig {
  return parseRuntimeConfig(import.meta.env);
}
```

Export `parseRuntimeConfig`, `getRuntimeConfig`, and:

```ts
export function authRedirectUri(origin: string, production = import.meta.env.PROD): string {
  const normalized = new URL(origin).origin;
  if (production && normalized !== 'https://osp.heymarksman.com') {
    throw new Error('Unexpected OSP production origin.');
  }
  return `${normalized}/app`;
}
```

`.env.example` contains public identifiers only:

```dotenv
VITE_KINDE_DOMAIN=https://auth.heymarksman.com
VITE_KINDE_CLIENT_ID=25b7de39865b49308cf4d670d1c9a3cf
VITE_SUPABASE_URL=https://alqjqzqagdmcywpjtnnr.supabase.co
```

Do not add a client secret, service-role key, Gmail credential, signature path, or signature hash.

- [ ] **Step 3: Verify and commit**

```powershell
pnpm --dir apps/osp test -- src/config/runtime.test.ts
pnpm --dir apps/osp lint
git diff --check
git add apps/osp/.env.example apps/osp/src/config
git commit -m "feat(osp): validate runtime and callback configuration"
```

### Task 4: Isolate Kinde PKCE behind an injectable auth port

**Files:**

- Create: `apps/osp/src/auth/auth-port.ts`
- Create: `apps/osp/src/auth/kinde-auth-port.ts`
- Create: `apps/osp/src/auth/AuthProvider.tsx`
- Create: `apps/osp/src/auth/AuthProvider.test.tsx`

**Interfaces:**

- Consumes: `RuntimeConfig`, `authRedirectUri`, and Kinde PKCE SDK.
- Produces: `AuthPort`, `OspUser`, `createKindeAuthPort(config)`, `AuthProvider`, and `useAuth()` for the router and API client.

- [ ] **Step 1: Define the contract in a failing consumer test**

The auth port is:

```ts
export type OspUser = {
  subject: string;
  email: string;
  displayName: string;
};

export interface AuthPort {
  initialize(): Promise<void>;
  isAuthenticated(): Promise<boolean>;
  login(returnTo?: string): Promise<void>;
  logout(): Promise<void>;
  getAccessToken(forceRefresh?: boolean): Promise<string>;
  getUser(): Promise<OspUser | null>;
}
```

Use a deferred fake in `AuthProvider.test.tsx`; the core assertions are:

```tsx
const port = fakeAuthPort({ authenticated: false });
render(<AuthProvider port={port}><AuthProbe /></AuthProvider>);
expect(screen.getByText('Checking access…')).toBeVisible();
await port.finishInitialization();
await user.click(await screen.findByRole('button', { name: 'Sign in' }));
expect(port.login).toHaveBeenCalledWith('/app/pipeline');

const authenticated = fakeAuthPort({
  authenticated: true,
  user: { subject: 'kp_test_jagp', email: 'jgonzalez@xbfreight.com', displayName: 'José Andrés González Perales' },
});
render(<AuthProvider port={authenticated}><AuthProbe /></AuthProvider>);
expect(await screen.findByText('jgonzalez@xbfreight.com')).toBeVisible();
```

The same file also verifies that the fake port:

- renders `Checking access…` until `initialize()` completes;
- renders a `Sign in` button when unauthenticated;
- calls `login('/app/pipeline')` without accepting an external return URL;
- renders the verified user email when authenticated;
- renders a safe error state when initialization fails.

Run the focused test. Expected: FAIL because the provider does not exist.

- [ ] **Step 2: Implement `AuthProvider` and `useAuth`**

The provider owns only session state and delegates all SDK calls through the port. Normalize `returnTo` to a same-origin path beginning with `/app`; otherwise use `/app`.

```tsx
type AuthState =
  | { status: 'checking'; user: null; error: null }
  | { status: 'anonymous'; user: null; error: null }
  | { status: 'authenticated'; user: OspUser; error: null }
  | { status: 'error'; user: null; error: string };

export function safeReturnTo(value: string | undefined, origin = window.location.origin): string {
  if (!value) return '/app';
  const parsed = new URL(value, origin);
  if (parsed.origin !== origin || !parsed.pathname.startsWith('/app')) return '/app';
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export const AuthContext = createContext<{
  state: AuthState;
  login(returnTo?: string): Promise<void>;
  logout(): Promise<void>;
} | null>(null);
```

On mount, call `initialize()`, then `isAuthenticated()`, then `getUser()` only for an authenticated session. Expose login as `port.login(safeReturnTo(returnTo))`; expose logout as `port.logout()`. Catch initialization errors into the safe `error` state without rendering raw SDK or token details.

Do not infer OSP permissions from email in the browser. The email is presentation data; every backend action still authorizes the stable Kinde subject and verified email.

- [ ] **Step 3: Implement the Kinde adapter**

Create the Kinde client with:

```ts
await createKindeClient({
  domain: config.VITE_KINDE_DOMAIN,
  client_id: config.VITE_KINDE_CLIENT_ID,
  redirect_uri: authRedirectUri(window.location.origin),
  logout_uri: authRedirectUri(window.location.origin),
});
```

Map the SDK's login, logout, authentication, token, and user-profile methods to `AuthPort`. Throw if an authenticated session has no subject or verified email. Never persist access tokens in localStorage, application logs, query keys, or error messages.

- [ ] **Step 4: Verify and commit**

```powershell
pnpm --dir apps/osp test -- src/auth/AuthProvider.test.tsx
pnpm --dir apps/osp test
pnpm --dir apps/osp lint
git diff --check
git add apps/osp/src/auth
git commit -m "feat(osp): add Kinde PKCE session boundary"
```

### Task 5: Add the typed OSP Edge Function client

**Files:**

- Create: `apps/osp/src/api/contracts.ts`
- Create: `apps/osp/src/api/osp-client.ts`
- Create: `apps/osp/src/api/osp-client.test.ts`

**Interfaces:**

- Consumes: `AuthPort.getAccessToken(forceRefresh?)`, `RuntimeConfig.VITE_SUPABASE_URL`, and injected `fetch`.
- Produces: `OspClient`, `createOspClient(options)`, `OspApiError`, `OnboardingWorkspaceResponse`, and `GmailStatusResponse`.

- [ ] **Step 1: Write failing transport tests**

Use an injected `fetch` and `AuthPort`. Assert that:

- onboarding requests POST to `${supabaseUrl}/functions/v1/provider-onboarding-api`;
- Gmail status POSTs to `${supabaseUrl}/functions/v1/provider-gmail-intake-api`;
- the body is `{ action, ...payload }`;
- `Authorization: Bearer <token>` and `Content-Type: application/json` are present;
- a 401 obtains one forced-refresh token and retries once;
- a second 401 fails without a third request;
- non-JSON errors remain readable;
- error details never include the bearer token.

The primary request test must make the transport observable:

```ts
const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(workspaceFixture), { status: 200 }));
const client = createOspClient({
  supabaseUrl: 'https://alqjqzqagdmcywpjtnnr.supabase.co',
  auth: fakeAuthPort({ token: 'test-token' }),
  fetchImpl,
});
await client.listOnboardingWorkspace({ queue: 'all', limit: 1, offset: 0 });
expect(fetchImpl).toHaveBeenCalledWith(
  'https://alqjqzqagdmcywpjtnnr.supabase.co/functions/v1/provider-onboarding-api',
  expect.objectContaining({
    method: 'POST',
    headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
    body: JSON.stringify({ action: 'list_provider_onboarding_workspace', queue: 'all', limit: 1, offset: 0 }),
  }),
);
```

Run the focused test. Expected: FAIL because the client does not exist.

- [ ] **Step 2: Implement the explicit action surface**

The public client exposes only the phase-1 reads:

```ts
export interface OspClient {
  listOnboardingWorkspace(input: {
    queue: 'all' | 'draft' | 'evidence_collection' | 'blocked' | 'ready_for_approval' | 'closed' | 'overdue';
    search?: string;
    limit: number;
    offset: number;
  }): Promise<OnboardingWorkspaceResponse>;
  getGmailStatus(): Promise<GmailStatusResponse>;
}
```

Internally map them to exact actions:

```ts
return {
  listOnboardingWorkspace: (input) => call(
    'provider-onboarding-api',
    'list_provider_onboarding_workspace',
    input,
    OnboardingWorkspaceResponseSchema,
  ),
  getGmailStatus: () => call(
    'provider-gmail-intake-api',
    'provider_gmail_status',
    {},
    GmailStatusResponseSchema,
  ),
};
```

Do not implement a generic public `call(action)` escape hatch.

Create `OspApiError` with `status`, `code`, `incidentId`, `action`, and `stage`. Prefer `incident_id` from JSON, then `x-request-id`; sanitize the visible message and never include headers or request bodies.

```ts
export class OspApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly incidentId: string,
    readonly action: string,
    readonly stage: string,
  ) {
    super(message);
    this.name = 'OspApiError';
  }
}
```

- [ ] **Step 3: Validate response envelopes**

Use Zod to parse the delivered safe read models:

```ts
export const OnboardingMetricsSchema = z.object({
  total: z.coerce.number().nonnegative(),
  blocked: z.coerce.number().nonnegative(),
  approval: z.coerce.number().nonnegative(),
  overdue: z.coerce.number().nonnegative(),
});

export const OnboardingWorkspaceRowSchema = z.object({
  id: z.uuid(),
  program_code: z.string(),
  jurisdiction_code: z.string().nullable(),
  legal_entity_kind: z.string().nullable(),
  case_status: z.string(),
  revision: z.coerce.number().int().nonnegative(),
  blocking_task_count: z.coerce.number().int().nonnegative(),
  overdue_task_count: z.coerce.number().int().nonnegative(),
  updated_at: z.string(),
}).passthrough();

export const OnboardingWorkspaceResponseSchema = z.object({
  data: z.object({
    rows: z.array(OnboardingWorkspaceRowSchema),
    total: z.coerce.number().int().nonnegative(),
    limit: z.coerce.number().int().positive(),
    offset: z.coerce.number().int().nonnegative(),
    queue: z.string(),
    metrics: OnboardingMetricsSchema,
  }),
});

export const GmailStatusSchema = z.object({
  mailbox_email: z.string().email(),
  required_scope: z.string(),
  legal_entities: z.array(z.record(z.string(), z.unknown())),
  connections: z.array(z.object({
    status: z.string(),
    mailbox_email: z.string().email(),
    watch_expiration_at: z.string().nullable().optional(),
    last_error: z.string().nullable().optional(),
  }).passthrough()),
  outbound_enabled: z.literal(false),
  pubsub_configured: z.boolean(),
});

export const GmailStatusResponseSchema = z.object({ data: GmailStatusSchema });
```

Keep onboarding rows as a safe, narrow schema for the columns actually rendered; do not add tax IDs, banking fields, attachment contents, or storage paths.

- [ ] **Step 4: Verify and commit**

```powershell
pnpm --dir apps/osp test -- src/api/osp-client.test.ts
pnpm --dir apps/osp test
pnpm --dir apps/osp lint
git diff --check
git add apps/osp/src/api
git commit -m "feat(osp): add typed Edge Function client"
```

### Task 6: Build the authenticated `/app` route shell without iframes

**Files:**

- Create: `apps/osp/src/app/router.tsx`
- Create: `apps/osp/src/app/AppShell.tsx`
- Create: `apps/osp/src/app/AppShell.test.tsx`
- Create: `apps/osp/src/components/RoutePlaceholder.tsx`
- Create: `apps/osp/src/styles/shell.css`
- Modify: `apps/osp/src/app/App.tsx`
- Modify: `apps/osp/src/main.tsx`

**Interfaces:**

- Consumes: `AuthPort`/`useAuth()`, `OspClient`, and the React Query client.
- Produces: typed `RouterContext`, `createOspRouter(context)`, `/app/*` route tree, `AppShell`, and safe route placeholders.

- [ ] **Step 1: Write failing route and navigation tests**

Use TanStack memory history. Assert:

- `/app` redirects to `/app/pipeline`;
- the shell contains Pipeline, Capturas, Entity Vault, Firma JAGP, Autorización, Respuestas, and Auditoría navigation;
- the authenticated user's verified email is visible;
- every non-pipeline route renders an honest `Disponible en una fase posterior` placeholder;
- no rendered route contains an iframe;
- unauthenticated users see login, not application data.

Run the focused test. Expected: FAIL because router and shell do not exist.

- [ ] **Step 2: Implement the typed route tree**

Create routes under `/app`:

```text
/app/pipeline
/app/cases/$caseId
/app/intake
/app/vault
/app/approvals
/app/approvals/signature
/app/approvals/authorization
/app/delivery
/app/audit
```

Implement the route tree with this shape:

```tsx
export type RouterContext = { auth: AuthPort; ospClient: OspClient };

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Outlet });
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'app',
  component: AppShell,
});
const appIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: () => { throw redirect({ to: '/app/pipeline' }); },
});
const pipelineRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'pipeline',
  component: PipelineOverview,
});
const caseRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'cases/$caseId',
  component: () => <RoutePlaceholder title="Expediente" />,
});
const intakeRoute = createRoute({ getParentRoute: () => appRoute, path: 'intake', component: () => <RoutePlaceholder title="Capturas" /> });
const vaultRoute = createRoute({ getParentRoute: () => appRoute, path: 'vault', component: () => <RoutePlaceholder title="Entity Vault" /> });
const approvalsRoute = createRoute({ getParentRoute: () => appRoute, path: 'approvals', component: Outlet });
const approvalsIndexRoute = createRoute({ getParentRoute: () => approvalsRoute, path: '/', component: () => <RoutePlaceholder title="Aprobaciones" /> });
const signatureRoute = createRoute({ getParentRoute: () => approvalsRoute, path: 'signature', component: () => <RoutePlaceholder title="Firma JAGP" /> });
const authorizationRoute = createRoute({ getParentRoute: () => approvalsRoute, path: 'authorization', component: () => <RoutePlaceholder title="Autorización" /> });
const deliveryRoute = createRoute({ getParentRoute: () => appRoute, path: 'delivery', component: () => <RoutePlaceholder title="Respuestas" /> });
const auditRoute = createRoute({ getParentRoute: () => appRoute, path: 'audit', component: () => <RoutePlaceholder title="Auditoría" /> });

export function createOspRouter(context: RouterContext) {
  const routeTree = rootRoute.addChildren([
    appRoute.addChildren([
      appIndexRoute,
      pipelineRoute,
      caseRoute,
      intakeRoute,
      vaultRoute,
      approvalsRoute.addChildren([approvalsIndexRoute, signatureRoute, authorizationRoute]),
      deliveryRoute,
      auditRoute,
    ]),
  ]);
  return createRouter({ routeTree, context });
}
```

Render through `RouterProvider`. Do not add a `file://` or legacy HTML fallback inside the React tree.

- [ ] **Step 3: Implement accessible shell states**

The shell needs skip navigation, visible focus, current-route indication, session status, and a persistent banner stating that phase 1 is read-only. Sensitive future nav items may be visible as workflow context, but must be disabled/placeholders rather than wired to commands.

```tsx
export function AppShell() {
  const { state, login, logout } = useAuth();
  if (state.status === 'checking') return <p role="status">Checking access…</p>;
  if (state.status === 'error') return <AuthError message={state.error} />;
  if (state.status === 'anonymous') {
    return <button onClick={() => void login('/app/pipeline')}>Sign in</button>;
  }
  return (
    <div className="osp-shell">
      <a className="skip-link" href="#osp-main">Saltar al contenido</a>
      <header><span>OSP · XBF Customer Setup</span><span>{state.user.email}</span><button onClick={() => void logout()}>Sign out</button></header>
      <nav aria-label="Flujo OSP">
        <Link to="/app/pipeline">Pipeline</Link>
        <Link to="/app/intake">Capturas</Link>
        <Link to="/app/vault">Entity Vault</Link>
        <Link to="/app/approvals/signature">Firma JAGP</Link>
        <Link to="/app/approvals/authorization">Autorización</Link>
        <Link to="/app/delivery">Respuestas</Link>
        <Link to="/app/audit">Auditoría</Link>
      </nav>
      <aside role="status">Fase 1: consulta solamente</aside>
      <main id="osp-main"><Outlet /></main>
    </div>
  );
}
```

- [ ] **Step 4: Verify and commit**

```powershell
pnpm --dir apps/osp test -- src/app/AppShell.test.tsx
pnpm --dir apps/osp test
pnpm --dir apps/osp lint
git diff --check
git add apps/osp/src/app apps/osp/src/components apps/osp/src/styles/shell.css apps/osp/src/main.tsx
git commit -m "feat(osp): add authenticated application routes"
```

### Task 7: Deliver the first live read-only pipeline slice

**Files:**

- Create: `apps/osp/src/features/pipeline/pipeline-health.ts`
- Create: `apps/osp/src/features/pipeline/pipeline-health.test.ts`
- Create: `apps/osp/src/features/pipeline/use-pipeline-overview.ts`
- Create: `apps/osp/src/features/pipeline/PipelineOverview.tsx`
- Create: `apps/osp/src/features/pipeline/PipelineOverview.test.tsx`
- Create: `apps/osp/src/styles/pipeline.css`
- Modify: `apps/osp/src/app/router.tsx`

**Interfaces:**

- Consumes: `OspClient.listOnboardingWorkspace`, `OspClient.getGmailStatus`, `OspApiError`, and TanStack Query.
- Produces: `MailboxHealth`, `deriveMailboxHealth(connections)`, `usePipelineOverview(client)`, and `PipelineOverview`.

- [ ] **Step 1: Write failing domain tests for honest mailbox health**

The pure mapper must produce exactly:

```ts
deriveMailboxHealth([{ status: 'watching' }]) === 'watching'
deriveMailboxHealth([{ status: 'connected' }]) === 'idle'
deriveMailboxHealth([]) === 'disconnected'
deriveMailboxHealth(undefined) === 'unknown'
```

Implement the mapper without a default-to-healthy branch:

```ts
export type MailboxHealth = 'watching' | 'idle' | 'disconnected' | 'unknown';

export function deriveMailboxHealth(
  connections: ReadonlyArray<{ status: string }> | undefined,
): MailboxHealth {
  if (!connections) return 'unknown';
  if (connections.some((row) => row.status === 'watching')) return 'watching';
  if (connections.some((row) => row.status === 'connected')) return 'idle';
  return 'disconnected';
}
```

An API failure is represented as `unknown` with a correlation ID when available. Never map failure to `watching`, `connected`, or zero pending work.

- [ ] **Step 2: Write the failing component test**

Inject a fake `OspClient` and QueryClient. Assert the route calls:

```ts
listOnboardingWorkspace({ queue: 'all', limit: 1, offset: 0 })
getGmailStatus()
```

Assert it renders the four server-provided metrics (`total`, `blocked`, `approval`, `overdue`), mailbox address, and derived mailbox state. Also cover:

- pipeline success + Gmail error;
- Gmail success + pipeline error;
- both errors;
- loading state;
- zero metrics returned explicitly by the server.

Each partial failure must retain the successful portion and show an actionable error with incident ID when present.

- [ ] **Step 3: Implement query hooks and overview**

Use stable keys:

```ts
['osp', 'onboarding-workspace', { queue: 'all', limit: 1, offset: 0 }]
['osp', 'gmail-status']
```

Set a finite stale time and disable automatic mutation/retry behavior. One safe retry is allowed for read-only network/5xx failures; do not retry 401, 403, or schema errors after the transport's single token refresh.

```ts
function retryRead(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (error instanceof z.ZodError) return false;
  if (error instanceof OspApiError) return error.status >= 500;
  return error instanceof TypeError;
}

export function usePipelineOverview(client: OspClient) {
  const pipeline = useQuery({
    queryKey: ['osp', 'onboarding-workspace', { queue: 'all', limit: 1, offset: 0 }],
    queryFn: () => client.listOnboardingWorkspace({ queue: 'all', limit: 1, offset: 0 }),
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
```

The overview must say `Vista global de la organización` and that the counts come from the server read model. Do not label the single fetched row as the complete case list; Phase 2 will implement list/Kanban pagination.

Render each query independently: metrics only when `pipeline.data` passed schema validation; mailbox health only from `gmail.data`; and a separate `role="alert"` for each failure containing the recommended retry action and `incidentId` when the error is `OspApiError`.

- [ ] **Step 4: Verify and commit**

```powershell
pnpm --dir apps/osp test -- src/features/pipeline
pnpm --dir apps/osp test
pnpm --dir apps/osp lint
git diff --check
git add apps/osp/src/features/pipeline apps/osp/src/styles/pipeline.css apps/osp/src/app/router.tsx
git commit -m "feat(osp): show live pipeline and mailbox status"
```

### Task 8: Make `/app` build, routing, and operations verifiable

**Files:**

- Create: `apps/osp/vercel.json`
- Create: `apps/osp/playwright.config.ts`
- Create: `apps/osp/e2e/app-shell.spec.ts`
- Create: `apps/osp/scripts/verify-build.mjs`
- Create: `apps/osp/README.md`
- Modify: `apps/osp/package.json`
- Modify: `apps/osp/src/main.tsx`

**Interfaces:**

- Consumes: `apps/osp` production build, test-only fake auth/client harness, and Vercel filesystem-first routes.
- Produces: verified `dist/app` artifact, Playwright smoke proof, release configuration, and operator runbook.

- [ ] **Step 1: Write the failing build verifier**

`verify-build.mjs` must fail unless all are true:

- `dist/app/index.html` exists;
- its script and stylesheet URLs begin with `/app/`;
- referenced assets exist below `dist/app/assets`;
- no built text file contains `firma JAGP`, the source signature path, `SERVICE_ROLE`, `GOOGLE_CLIENT_SECRET`, or a Kinde client secret;
- no built file contains an `<iframe` tag.

Add `"verify:build": "node scripts/verify-build.mjs"` and run it before building. Expected: FAIL because `dist/app` is absent.

Use this verifier structure:

```js
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = join(appRoot, 'dist');
const indexPath = join(distRoot, 'app', 'index.html');
await access(indexPath);
const html = await readFile(indexPath, 'utf8');
const assetUrls = [...html.matchAll(/(?:src|href)="(\/app\/assets\/[^"]+)"/g)].map((match) => match[1]);
if (assetUrls.length === 0) throw new Error('No /app/ assets found in built index.');
for (const url of assetUrls) await access(join(distRoot, url.slice(1)));

async function textFiles(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const absolute = join(path, entry.name);
    return entry.isDirectory() ? textFiles(absolute) : [absolute];
  }));
  return nested.flat().filter((path) => /\.(?:html|js|css|map|json|txt)$/i.test(path));
}

const forbidden = [/firma JAGP/i, /Legal & Cumplimiento/i, /SERVICE_ROLE/i, /GOOGLE_CLIENT_SECRET/i, /KINDE_CLIENT_SECRET/i, /synthetic-e2e-token/i, /__OSP_E2E_RUNTIME__/i, /<iframe/i];
for (const path of await textFiles(distRoot)) {
  const content = await readFile(path, 'utf8');
  for (const pattern of forbidden) {
    if (pattern.test(content)) throw new Error(`Forbidden build content ${pattern} in ${path}`);
  }
}
```

- [ ] **Step 2: Add filesystem-first SPA routing**

Create `apps/osp/vercel.json`:

```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": "dist",
  "routes": [
    { "handle": "filesystem" },
    { "src": "/app(?:/.*)?", "dest": "/app/index.html" }
  ]
}
```

This serves generated assets before falling back internal `/app` routes to the SPA entry.

- [ ] **Step 3: Add the browser smoke test**

Configure Playwright to start `pnpm dev`, use `http://localhost:8791`, and test a fake-auth/test-client harness—not a live Kinde or production backend. The smoke test must verify:

- `/app` reaches the pipeline route;
- direct navigation to `/app/pipeline` loads;
- navigation placeholders load without full-page reload;
- no iframe exists;
- the mobile viewport has no horizontal document overflow;
- keyboard focus reaches primary navigation and sign-out.

Do not put production tokens or real mailbox data in the harness.

Use a development-only injected runtime in `main.tsx`:

```ts
declare global {
  interface Window { __OSP_E2E_RUNTIME__?: RouterContext }
}
const runtime = import.meta.env.DEV && window.__OSP_E2E_RUNTIME__
  ? window.__OSP_E2E_RUNTIME__
  : (() => {
      const config = getRuntimeConfig();
      const auth = createKindeAuthPort(config);
      return {
        auth,
        ospClient: createOspClient({
          supabaseUrl: config.VITE_SUPABASE_URL,
          auth,
          fetchImpl: window.fetch.bind(window),
        }),
      };
    })();
```

Because `import.meta.env.DEV` is false in production, Vite removes the test branch from the production artifact; `verify-build.mjs` confirms no test fixture or secret leaked. Configure Playwright to start the Vite development server so `addInitScript` can set the runtime before the app boots:

```ts
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:8791', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:8791/app',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
});
```

```ts
// e2e/app-shell.spec.ts
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__OSP_E2E_RUNTIME__ = {
      auth: {
        initialize: async () => undefined,
        isAuthenticated: async () => true,
        login: async () => undefined,
        logout: async () => undefined,
        getAccessToken: async () => 'synthetic-e2e-token',
        getUser: async () => ({ subject: 'kp_e2e', email: 'operator@example.test', displayName: 'OSP Operator' }),
      },
      ospClient: {
        listOnboardingWorkspace: async () => ({ data: { rows: [], total: 0, limit: 1, offset: 0, queue: 'all', metrics: { total: 4, blocked: 1, approval: 2, overdue: 1 } } }),
        getGmailStatus: async () => ({ data: { mailbox_email: 'carriers@example.test', required_scope: 'gmail.readonly', legal_entities: [], connections: [{ status: 'watching', mailbox_email: 'carriers@example.test' }], outbound_enabled: false, pubsub_configured: true } }),
      },
    };
  });
});

test('loads direct routes without iframe or horizontal overflow', async ({ page }) => {
  await page.goto('/app/pipeline');
  await expect(page.getByRole('heading', { name: /pipeline/i })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole('link', { name: 'Capturas' }).click();
  await expect(page.getByText('Disponible en una fase posterior')).toBeVisible();
});
```

- [ ] **Step 4: Document operator/deployment configuration**

`apps/osp/README.md` must include:

- Node and pnpm requirements;
- environment variables and which are public;
- local commands;
- local callback/logout `http://localhost:8791/app`;
- production callback/logout `https://osp.heymarksman.com/app`;
- instruction to preserve `https://partners.heymarksman.com/app` settings;
- Vercel project root `apps/osp` and production domain `osp.heymarksman.com`;
- confirmation that Phase 1 is read-only and does not provision the signature;
- rollback: restore the prior Vercel deployment; no database rollback is required for the frontend-only release.

- [ ] **Step 5: Run the complete phase gate**

```powershell
pnpm --dir apps/osp test
pnpm --dir apps/osp lint
pnpm --dir apps/osp build
pnpm --dir apps/osp verify:build
pnpm --dir apps/osp test:e2e
npm test
npm run test:provider-service
npm run validate:action-contract
npm run test:action-contract
git diff --check
git status --short
```

Invoke `superpowers:verification-before-completion`. Record exact counts and distinguish local build/browser proof from production deployment proof.

- [ ] **Step 6: Commit the phase gate artifacts**

```powershell
git add apps/osp/vercel.json apps/osp/playwright.config.ts apps/osp/e2e apps/osp/scripts apps/osp/README.md apps/osp/package.json apps/osp/pnpm-lock.yaml
git commit -m "test(osp): verify app routing and release build"
git status --short
```

Expected: clean worktree. Do not push, deploy, modify Kinde, configure the production domain, or provision the signature in this local implementation phase. Those are explicit release actions after review.

## Phase 1 completion gate

Phase 1 is complete only when all of the following are evidenced:

1. The clean integration contains both OSP `c4bea07` history and current `origin/main` behavior without unresolved conflict markers.
2. The delivered baseline test count and contract checks pass before and after the work.
3. `apps/osp` builds to `dist/app` and every asset is rooted under `/app/`.
4. Local Kinde redirect calculation is exactly `http://localhost:8791/app`; production calculation is exactly `https://osp.heymarksman.com/app`.
5. An authenticated, authorized user can load the new shell and the two existing read endpoints through injected/real non-production configuration.
6. Pipeline metrics come from `list_provider_onboarding_workspace`; Gmail health comes from `provider_gmail_status` and never reports false health.
7. No iframe, consequential command, direct table query, direct bucket access, signature asset, secret, or production mutation is present.
8. Unit, component, browser, build, action-contract, Provider Service, and root regression gates pass with exact counts recorded.
9. No P0, P1, or P2 finding remains open in the phase review.

After this gate, write the Phase 2 plan for the paginated Pipeline, Intake, Case Workspace, Documents, and Entity Vault migration. Do not begin signature or outbound-delivery implementation from this plan.
