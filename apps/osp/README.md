# OSP web application

This Vite application registers XBF as a provider's customer. Phase 1 is an authenticated, read-only operational view of the onboarding pipeline and Gmail capture health; it is not a quotation or carrier-rate intake flow.

## Local requirements and commands

- Node.js 22.12 or newer (the verified local runtime is Node 24.19.0).
- pnpm 11.19.0.

From the repository root:

```powershell
pnpm --dir apps/osp install --frozen-lockfile
pnpm --dir apps/osp dev
pnpm --dir apps/osp test
pnpm --dir apps/osp lint
pnpm --dir apps/osp build
pnpm --dir apps/osp verify:build
pnpm --dir apps/osp test:e2e
```

Playwright uses its package-pinned Chromium build. To install that browser inside this package's ignored `node_modules` tree on Windows, without selecting a machine browser channel:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = '0'
pnpm --dir apps/osp exec playwright install chromium
```

The committed Playwright configuration also defaults `PLAYWRIGHT_BROWSERS_PATH` to `0` when tests run.

## Public runtime configuration

Copy `.env.example` to `.env.local`. The browser intentionally receives only these public values:

```dotenv
VITE_KINDE_DOMAIN=https://auth.heymarksman.com
VITE_KINDE_CLIENT_ID=25b7de39865b49308cf4d670d1c9a3cf
VITE_SUPABASE_URL=https://alqjqzqagdmcywpjtnnr.supabase.co
```

Never add a Kinde client secret, Supabase service-role credential, Google client secret, bearer token, private signature source, or other server credential to a `VITE_` variable. The browser calls only the authenticated Provider Service Edge Function read boundaries.

## Kinde URLs

The application callback and logout redirect are the same URL for each environment:

- Local callback and logout redirect: `http://localhost:8791/app`
- Production callback and logout redirect: `https://osp.heymarksman.com/app`

Keep the existing `https://partners.heymarksman.com/app` callback and logout settings in Kinde. Adding OSP must not remove or replace the Partners Portal settings.

## Vercel release and rollback

Configure the Vercel project root as `apps/osp` and the production domain as `osp.heymarksman.com`. `vercel.json` serves generated files first and sends internal `/app` routes to `dist/app/index.html`.

This implementation does not deploy Vercel, configure the domain, or change Kinde. A production release requires separate authorized deployment and connectivity verification. To roll back this frontend-only release, restore the prior Vercel deployment. No database rollback is required.

## Evidence boundary

Unit tests, the build verifier, and Playwright's injected `example.test` fixtures prove local routing, rendering, accessibility, read-only client behavior, and artifact hygiene. The injected runtime exists only in Vite development builds, and the production verifier rejects its marker and fixture token.

These local checks are not proof of production deployment, live Kinde login, Edge Function connectivity, Gmail connectivity, or production data. Phase 1 exposes no approval, signature, authorization, sending, CRM mutation, or other consequential command, and it does not provision or bundle the private signature.
