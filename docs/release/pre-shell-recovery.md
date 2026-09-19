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
