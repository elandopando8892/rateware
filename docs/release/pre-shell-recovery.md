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

Status: authenticated recovery preview verified; production certification remains open.

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

## Bulk draft preparation regression coverage

- Added an executable harness around the actual `createCurrentOutreachDrafts`
  implementation. A fixture with 89 carriers and 69 lane invitations per carrier
  passes all 6,141 distinct invitation IDs in one bounded preparation request.
- The preparation source is asserted not to call Gmail or WhatsApp send methods.
- A transient failure retains the idempotency key and a successful retry reuses
  that same key before clearing it. A response from a previously selected event
  cannot refresh or redirect the newly selected event.
- The three bulk preparation cases plus 18 template load/context cases pass
  locally (21 total). This verifies frontend behavior with fakes; authenticated
  preview execution is still required and must use non-sending preparation only.

## Focused release suite

- Migrated the two obsolete authentication-performance assertions from Kinde
  token parsing to the current Supabase session and `app_metadata` contract.
- The focused release suite now passes 45/45 across Google login lifecycle,
  Supabase session reuse, server-managed permission metadata, template domain,
  template controller/navigation, stale-response guards, large draft preparation,
  RFx refresh ordering and multilane behavior.
- This is an intentionally scoped recovery suite. The historical monolithic
  static suite still describes other repository eras and is not claimed as a
  green certification of the complete application.

## Frontend Kinde retirement

- Removed unused Kinde domain/client constants from real and example browser
  configuration, the inherited Kinde-only error-copy branch, and Kinde setup
  instructions from the README.
- Migrated the integration smoke interface from `RATEWARE_E2E_KINDE_TOKEN` /
  `--kinde-token` to `RATEWARE_E2E_AUTH_TOKEN` / `--auth-token`, with Supabase
  token expiry and email claims. The smoke was syntax-checked and its help path
  was executed only; no authenticated smoke writes or sends were performed.
- A regression test now rejects Kinde references in frontend configuration,
  error handling and the deployment smoke contract.
- Historical Edge Function sources in this recovery checkout are not a safe
  deployment source and remain explicitly out of the frontend recovery artifact.
  The live `rateware-api` Supabase adapter was verified separately above.
- Candidate `bbe8437a` is published at
  https://rateware-ci6wmaoef-elandopando8892s-projects.vercel.app as deployment
  `dpl_9er3zEw82uXz1vSEbChwGdK2nCzn` (`READY`, preview target). Opening the RFx
  route redirects to the Supabase login landing page as expected; authenticated
  smoke remains a user handoff gate.

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

## Authenticated responsive preview - 2026-09-19

- Candidate commit: `d7e7b339`.
- Preview: https://rateware-3o8yyklo8-elandopando8892s-projects.vercel.app
- Deployment: `dpl_BMsxxUunDuHWz6WRKTEGuDpcn9oF`, Vercel `READY`, preview target.
- Supabase Google Sign-In completed as `sales@heymarksman.com`; the authenticated
  workspace exposed the server-managed carrier-management permission.
- Carrier Fit, Message, and Delivery Queue were inspected against RFx
  `ab666cee-a052-4bbb-bc77-5f509435c051` at the default 1280 px viewport. The
  compact-desktop layout gives the active task the full row, stacks Launch
  workspaces before copy collapses, and places operating context after the active
  panel. Rendered box measurements showed the 757.56 px active Launch panel ending
  exactly where the operating context begins; no overlap remained.
- Mobile verification used a temporary 390 x 844 viewport. The document client and
  scroll widths were both 380 px, the Delivery Queue guidance resolved to static
  positioning, and the participation, lifecycle, action, and table sections scrolled
  in sequence without overlap. The viewport override was reset after inspection.
- Browser console capture contained no warnings or errors during the responsive
  verification.
- Carrier CRM List Templates loaded the active `D2D Crossborder MX-US` template with
  332 members. `New template` opened the Details -> Add carriers -> Review -> Save
  builder and confirmed that membership is restricted to carriers already in the
  workspace. The builder was inspected without saving or changing a template.
- The focused release checks remained green: responsive layout assertions plus six
  Supabase-auth and 89-carrier-by-69-lane preparation cases. The harness verifies
  preparation and idempotent retry behavior and rejects Gmail/WhatsApp send calls.
- No carrier was added to an RFx, no draft queue was created, no invitation or
  message was sent, and production was not promoted in this verification.
