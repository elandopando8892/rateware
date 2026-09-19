# Pre-shell recovery candidate

Base: `f751dd8455440cb1036c0687049e63f0c0dd826e`.
Reusable frontend contracts: `300d396e0063aa0f91d3f5500a8664a248e0a20a`.

## Implemented locally

- Supabase Google authentication, with Platform55 mount calls removed.
- Landing sign-in uses the shared dialog and releases its busy state on cancellation.
- Existing CRM template library, versioned service methods, capability detection,
  import resolution, draft controller and navigation guards reused.
- Template workspace HTML and scoped CSS integrated into the original CRM page.
- The incomplete legacy CRUD adaptation was removed; it did not preserve version checks.

## Evidence

- Google dialog tests: 4 passed.
- Template library controller tests: 5 passed.
- Vendor template navigation tests: 8 passed.
- Template browser-domain tests passed.
- Existing RFx multilane contract test passed before template integration.
- These are local automated checks, not authenticated production evidence.

## Required before preview acceptance

- Carrier Fit now lists active templates through the current API and refreshes membership
  before loading. Legacy template mutations and hard-delete controls were removed.
  Three behavioral tests pass: fresh membership, unavailable/archived lists, empty lists.
  Authenticated integration and bulk selection still require browser verification.
- Verify current Supabase project, API capabilities, authorization and callbacks.
  Do not deploy the historical backend or apply migrations as a rollback shortcut.
- Verify frontend import closure and exercise actual pages in browser.
- Verify template creation/edit/archive/load with fixtures, and live read-only access.
- Validate desktop/mobile layout and MARKSMAN conformance with visual approval.
- Validate bulk preparation, including 89 carriers by 69 lanes, idempotency and recovery.
- Deploy only the visually approved, functionally verified candidate; verify authenticated
  production flows and retain a known rollback deployment.

The template SQL file is copied for contract/reference parity only. No remote migration,
backend deployment, business-record creation or message delivery was performed.

Status: candidate in development; sprint 1 remains open.

## Local follow-up: template response context

- Added event/list identity checks to all three asynchronous template-selection
  handlers. Responses and errors from a different currently selected event/list
  no longer change selection or show an unrelated error.
- 15 behavioral tests exercise actual handler source with deferred responses;
  together with the loader suite, 18 tests pass. Syntax and diff checks pass.
- Scope: event/list identity changes, not a complete cancellation or request-version
  audit (including navigating away and back to the same IDs).
- Permission inspection: template controls explicitly require `vendors:manage`
  from app_metadata. Shared `canUse` currently checks sign-in only. Server-side
  authorization and denied-role tests remain required; UI is not a security boundary.
- Published with candidate `0942bd50` in the updated preview below; not production.

## Updated preview: authentication handoff

- Commit: `0942bd50`.
- URL: https://rateware-34rcsqmu2-elandopando8892s-projects.vercel.app
- Deployment: `dpl_FpvJXb5HoKu69p3YRWkziUmVWz4g`, READY, preview target.
- Browser navigation to `/vendors?tab=list-templates` still redirects to Vercel login.
- The same authentication blocker persists across successive goal turns. Local
  compatibility fixes and the preview update are complete for this increment;
  authenticated workflow evidence and visual approval cannot be substituted with
  additional source-only checks. User sign-in is required for the next gate.
- No production promotion, migration, invitation or message was performed.

## Live Supabase verification (read-only, 2026-09-19)

- Project `rateware-prod` (`alqjqzqagdmcywpjtnnr`) reports `ACTIVE_HEALTHY`
  on Postgres 17.6.1.
- Deployed `rateware-api` is active at version 626. Its current source sets
  `RFX_OUTREACH_INVITATION_ID_LIMIT = 50000` and checks the computed outreach
  matrix against that limit. The 89 x 69 case (6,141 rows) is within the
  deployed bound; this verifies the server contract, not the end-to-end draft run.
- The deployed auth adapter resolves the Supabase bearer through `/auth/v1/user`
  and copies only server-managed `app_metadata.permissions` into action claims.
  Template write actions return 403 unless `vendors:manage` is present.
- A read-only aggregate query confirms exactly one `sales@heymarksman.com` Auth
  user, with `vendors:manage` and an organization binding. No user identifiers,
  tokens or secret keys were recorded in this evidence.
- Supabase changelog review found no hosted-Auth breaking change affecting this
  flow. Relevant 2026 changes concern self-hosted `API_EXTERNAL_URL` and OAuth
  token response status; the application uses hosted Auth and accepts Supabase
  client responses rather than hard-coding OAuth HTTP 201.
- No database, Auth metadata, Edge Function, migration or application record was
  changed by these checks.

## Preview and browser verification

- Candidate commit: `f1eef707`.
- Preview: https://rateware-81sy2u3jt-elandopando8892s-projects.vercel.app
- Deployment: `dpl_GXVJzEYrjFD7waZtC9xtfjdyR1Pj`, Vercel READY, preview target.
- Opening `/vendors?tab=list-templates` in the in-app browser reaches Vercel login.
  No authenticated application or visual acceptance has been established in this preview.
- User sign-in was requested; protection has not been disabled.
- Static local import traversal from landing, CRM and Bid Room resolved 28 modules
  with no missing local files (URL version query strings stripped during resolution).
- Bulk-wave fix `831a9f37` raises the server invitation-id bound from 5,000 to
  50,000. The historical backend in this checkout predates that fix. An 89 x 69
  wave contains 6,141 lane/carrier pairs. Frontend tests cannot establish whether
  the currently deployed backend includes that fix; remote verification remains required.
