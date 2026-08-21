# Rateware Platform 55 Shell Migration Design

## Purpose

Adopt the user-approved Platform 55 shell as the shared production UI/UX for Rateware without rewriting the business logic that already reached production in P0 and P1.

The visual source of truth is the cumulative Platform 55 blueprint:

- `C:\Users\andre\Downloads\rateware\rateware_foundation_home_commercial_procurement_operations_finance_intelligence_administration_platform_implementation_blueprint_v1.html`
- SHA-256: `68CB5496B98CA1049A46E49E3852F2F73398BBFE6C0EE05ABA5975FEE4BBE1EA`
- Confirmed visual reference: `C:\Users\andre\.codex\visualizations\2026\08\11\019fef63-66ca-76e2-9b78-51d629492d76\platform55-shell-reference-1440x900.png`

The twelve-build fidelity source is the cumulative Build 12 package:

- `C:\Users\andre\Downloads\rateware_foundation_home_commercial_procurement_operations_finance_intelligence_administration_platform_build_v12.zip`
- SHA-256: `CF2CED85E95DFB33BB7410BF73ACE22CB95090CE649747DF60BF2920E808C16A`
- 3,239 archive entries;
- twelve build namespaces, `build_01` through `build_12`, each with an artifact manifest and render plan.

The implementation baseline is `origin/main` at `f751dd8455440cb1036c0687049e63f0c0dd826e`. It has P0 at 100%, P1 at 100%, P2 at 0%, and overall production readiness at 76%.

## Confirmed product decision

The approved shell is the Platform 55 experience with:

- a persistent Rateware tenant sidebar;
- grouped and collapsible navigation;
- global search, notifications, Ask AI, system status, and user controls in the header;
- a decision-first Command Center with Next Best Action, Priority Queue, Business Lifecycle, Network Pulse, and My Work;
- one responsive web experience for desktop, tablet, and mobile;
- the same visual language across operations, commercial, procurement, finance, intelligence, administration, and provider workflows.

This is a shell adoption, not a new visual concept.

## Twelve-build fidelity contract

“Faithful” means traceable parity with the cumulative shell delivered through all twelve builds, not merely a similar color palette or a recreation of one Command Center screenshot.

P2-S0 must create `docs/platform55-shell-build-matrix.csv` with one row for every build artifact/state that affects the product experience. Each row records the build number, manifest/render-plan source, reference asset, target production route/component, desktop/tablet/mobile applicability, implementation status, verification evidence, and any explicit disposition.

The fidelity dimensions are:

1. **Structure:** sidebar hierarchy, tenant identity, header, search, status, notifications, Ask AI, page frame, lifecycle, panels, drawers, tables, and action placement.
2. **Visual system:** color, typography, spacing, radii, borders, elevation, density, icons, selected/hover/focus/disabled treatments, and light/dark regions.
3. **Interaction:** navigation collapse/expand, search, filters, tabs, drawers, dialogs, keyboard order, responsive navigation, and browser history behavior.
4. **States:** default, loading, empty, error, retry, success, warning, blocked, permission-denied, review-required, and disabled states present in the build evidence.
5. **Responsive behavior:** faithful desktop, tablet, and mobile composition without clipping or horizontal overflow.
6. **Functional wiring:** prototype controls are connected to the existing production capability when that capability exists; fake prototype data and unsafe prototype mutations are not copied.

When build artifacts conflict, the later build is authoritative for the final shell while the superseded state remains documented in the matrix. A build is not counted complete because its screenshot exists; its manifest, render plan, relevant states, and production mapping must all be accounted for.

P2 cannot reach 100% unless the matrix proves 12/12 build coverage with zero unreviewed shell artifact or state. A deliberate omission requires an explicit product disposition and cannot be silently collapsed into a generic page.

## Current-state finding

The standalone blueprint already contains the visual states and prototype interactions, but production does not load it as an application dependency. Production currently has page-specific HTML shells, a large shared stylesheet, and shared shell behavior embedded in `src/auth.js`. That is a useful precursor, but it is not yet the approved Platform 55 DOM, token, header, navigation, or responsive contract.

Existing IDs, page scripts, APIs, authentication, tenant isolation, approval controls, and data flows remain authoritative. The shell wraps those capabilities; it does not replace them.

## Chosen architecture

### Approach

Use a progressive shared-runtime migration.

1. Extract the approved shell's stable visual tokens and structural contract into focused production files.
2. Mount the shared shell around existing page content.
3. Move shell ownership out of `src/auth.js` while preserving its authentication and permission responsibilities.
4. Migrate related pages in bounded waves.
5. Remove duplicated page shell markup only after each page passes behavior and visual regression checks.

The blueprint remains reference-only. Production must not load or parse the 11 MB blueprint at runtime.

### Rejected alternatives

- **Big-bang rewrite of every page:** visually fast but too risky because it combines 30 page migrations with functional regression risk.
- **CSS overlay on the existing markup:** superficially quick but cannot faithfully deliver the approved header, grouped navigation, lifecycle, responsive behavior, or shared component semantics.

## Component boundaries

### `src/platform55-shell.js`

Owns the shell DOM contract, route metadata, active navigation state, collapsible groups, responsive navigation state, and shell event hooks. It receives user/permission data from authentication code and does not call Supabase or mutate business data.

### `src/platform55-shell.css`

Owns shell tokens and layout only: color, typography, spacing, elevation, sidebar, header, lifecycle, responsive breakpoints, focus states, and reduced-motion behavior. Page-specific components remain in `src/styles.css` until migrated deliberately.

### `src/platform55-search.js`

Owns in-browser global navigation/action discovery using an allowlisted route and action registry. Search results navigate to existing authenticated pages; search does not query private records or execute business actions.

### `src/auth.js`

Continues to own Kinde session handling, user identity, authorization, permission-aware route filtering, and sign-out. It supplies a sanitized shell model to `platform55-shell.js`. It no longer owns shell rendering after the migration is complete.

### Page modules

Existing page modules continue to own data loading and domain actions. Existing element IDs and action handlers remain stable unless a page-specific migration explicitly changes and tests them.

## Data and action boundaries

- Shell initialization consumes page metadata, authenticated-user display data, and an allowlisted permission model.
- Global navigation and search produce navigation only.
- Ask AI opens the existing intelligence surface; it does not auto-execute a recommendation.
- Notifications are initially derived from existing read-only summaries. A new notification backend is outside P2.
- No shell component approves rates, sends bids, creates awards, dispatches freight, writes to Fleet Rocket, writes to MARKSMAN ERP, or changes configuration.
- Rate quotes continue to enter `rate_staging` and require human approval before production insertion.
- Fleet Rocket remains the execution system of record and MARKSMAN remains the accounting system of record.

## Sprint roadmap

P2 has a formal weight of 7 readiness points. Completing P2 moves overall readiness from 76% to 83%. Percentages below are evidence milestones, not estimates of elapsed time.

| Sprint | Outcome | Primary surfaces | P2 after sprint | Overall after sprint | Recommended model |
|---|---|---|---:|---:|---|
| P2-S0 | Freeze the shell contract and migration map | blueprint tokens, route map, page inventory, test fixtures | 10% | 76.7% | GPT-5.6 Sol, high |
| P2-S1 | First production-quality vertical slice | shared shell, Command Center, desktop/tablet/mobile | 25% | 77.8% | GPT-5.6 Sol, xhigh |
| P2-S2 | Governed Operate workflow | Import, Source Files, Review Queue, Rateware | 45% | 79.2% | GPT-5.6 Terra, high; Sol review |
| P2-S3 | Procurement execution | Carrier CRM, RFx Process, Bid Room, Ratebook, RFI, outreach | 65% | 80.6% | GPT-5.6 Sol, high |
| P2-S4 | Network and service workspaces | shipper/carrier profiles, support, improvement, Provider Service | 80% | 81.6% | GPT-5.6 Terra, high; Sol review |
| P2-S5 | Intelligence and administration | Analyze, Growth, Settings, Learning Rules, Catalog | 93% | 82.5% | GPT-5.6 Sol, xhigh |
| P2-S6 | All-surface convergence and production certification | every routed HTML surface and all 95 inventory dispositions | 100% | 83.0% | GPT-5.6 Sol, xhigh |

### P2-S0 — Shell contract and migration map

Deliverables:

- a token map from the confirmed blueprint to production CSS variables;
- a twelve-build fidelity matrix sourced from each build namespace's artifact manifest and render plan (`build_01/render_plan.json` for Build 01 and `BUILD_XX_RENDER_PLAN.json` for Builds 02-12);
- one canonical navigation/route registry covering every production HTML page;
- a page-to-Platform-55-surface map covering all 95 inventory rows;
- shell accessibility and responsive acceptance fixtures;
- tests that initially fail when duplicated shell markup or unmapped routes are introduced.

Exit criteria:

- every production page is assigned to exactly one migration wave;
- all twelve build manifests and render plans are inventoried with no missing namespace;
- every reference surface is implemented, mapped to a shared production surface, or explicitly dispositioned;
- the blueprint hash, screenshot, and baseline production SHA are recorded;
- no production behavior changes.

### P2-S1 — Shared shell and Command Center

Deliverables:

- shared sidebar, header, tenant identity, system status, global search trigger, notifications entry, Ask AI entry, and user control;
- Command Center visual parity for Next Best Action, Priority Queue, Business Lifecycle, Network Pulse, and My Work;
- responsive layouts at 1440x900, 1024x768, and 390x844;
- removal of the known 390 px horizontal overflow;
- preserved Command Center data, loading, empty, error, and retry states.

Exit criteria:

- exact visual comparison against the confirmed shell reference;
- no change to authenticated data requests or action permissions;
- keyboard navigation, visible focus, landmark order, reduced motion, and mobile drawer behavior pass;
- existing Command Center and product tests pass.

### P2-S2 — Governed Operate workflow

Pages:

- `upload-center.html`
- `upload-history.html`
- `staging-review.html`
- `rateware.html`

Deliverables:

- one continuous Platform 55 path from source intake to approved rates;
- consistent headers, filters, tables, drawers, empty/error/loading states, and breadcrumbs;
- preservation of source file, staging-first ingestion, and explicit human approval.

Exit criteria:

- no automatic approval or production-rate insertion;
- no loss of selected review state, filters, or URL context;
- desktop, tablet, mobile, and full existing intake tests pass.

### P2-S3 — Procurement execution

Pages:

- `vendors.html`, `carrier-profile.html`
- `rfx-process.html`, `rfx-events.html`, `rfx-bid.html`, `bid-room-board.html`
- `customer-rfi.html`, `outreach.html`
- `ratebook.html`, `ratebook-carrier.html`

Deliverables:

- Platform 55 sourcing lifecycle across carrier discovery, RFx design, communications, responses, award preparation, and rate books;
- consistent context retention across event, carrier, lane, and response views;
- clear labels for proposals, review-required states, and consequential actions.

Exit criteria:

- no automated send, bid, award, or implementation-ready transition;
- RFx and outreach URL state remains shareable without exposing private participant data;
- existing RFx, Bid Room, carrier, and ratebook tests pass.

### P2-S4 — Network and service workspaces

Pages:

- `shipper-crm.html`, `shipper-profile.html`
- `vendor-support.html`, `vendor-improvement.html`
- `provider-service.html`, `provider-onboarding.html`, `provider-gmail.html`, `provider-communications.html`

Deliverables:

- consistent Platform 55 customer, carrier, support, compliance, onboarding, and communications workspaces;
- reusable profile header, health/status, activity, document, task, and timeline patterns;
- preserved Provider Service human-review and controlled-release boundaries.

Exit criteria:

- no document fact promotion, outbound communication, or release-package execution without the existing authorization gate;
- provider runtime, domain, onboarding, Gmail, and communications suites pass;
- responsive behavior matches the shared shell contract.

### P2-S5 — Intelligence and administration

Pages:

- `business-intelligence.html`, `growth-hacking.html`
- `settings.html`, `interpretation-memory.html`, `catalog-workbench.html`
- `index.html` authenticated entry/routing state

Deliverables:

- Platform 55 intelligence workbench, decision brief, administration, governance, learning, and catalog patterns;
- consistent read-only evidence, data-as-of, gaps, recommendation, and confirmation-required states;
- permission-aware navigation and settings visibility.

Exit criteria:

- AI recommendations remain proposals only;
- invalid or incomplete evidence fails closed and cannot appear reviewable;
- no settings, secrets, enforcement, or catalog mutation is introduced by shell work;
- intelligence, governance, readiness, and Action Contract tests pass.

### P2-S6 — Convergence and certification

Deliverables:

- every routed production HTML page uses the shared shell contract;
- duplicated sidebar/header markup is removed or reduced to a documented compatibility shim;
- all 95 Platform 55 inventory rows have an implemented or explicit disposition;
- the twelve-build fidelity matrix has 12/12 build coverage and zero unreviewed artifact/state;
- visual regression captures for representative desktop, tablet, and mobile surfaces;
- accessibility, performance, browser navigation, auth, permission, and full product regression evidence;
- updated P2 readiness ledger and independent detached review.

Exit criteria:

- P0/P1/P2 findings are zero in an immutable independent review;
- `npm test`, Action Contract validation, syntax checks, audit, and diff checks pass;
- an authorized Vercel preview passes authenticated read-only smoke;
- a separately authorized merge and automatic deployment pass production read-only smoke and bounded monitoring;
- P2 is set to 100 only after file-backed evidence and independent GO.

## Testing strategy

Each sprint uses test-driven implementation and adds focused tests before changing the shell.

Planned focused suites:

- `tests/platform55-shell-contract.test.mjs`: route registry, active state, permissions, landmarks, collapse state, safe escaping, and no business mutation hooks;
- `tests/platform55-shell-adoption.test.mjs`: page inventory, required shared assets, forbidden duplicated shell blocks after migration, and current-page semantics;
- `tests/platform55-command-center.test.mjs`: approved Command Center blocks and state handling;
- existing `tests/rateware-stability.test.mjs` plus all domain suites;
- browser verification at 1440x900, 1024x768, and 390x844 with no horizontal overflow.

Screenshots prove appearance only. DOM assertions, behavioral tests, and authenticated read-only smoke prove integration.

## Delivery and authorization boundaries

Local isolated development, tests, documentation, and offline visual verification continue without scheduled blockers.

The following remain separately authorized transitions:

- push or force-push;
- PR creation or metadata changes;
- Vercel build preview when it consumes quota;
- Ready for review, merge, and automatic production deployment;
- manual promotion;
- Supabase preview-branch creation;
- migrations, DDL, DML, secrets, environment, CORS, or tenant-enforcement changes;
- uploads, approvals, communications, awards, dispatch, or production-data mutations.

P2 shell work is frontend-only by default and must not create a second Supabase preview branch.

## After P2

P2 completion raises overall readiness to 83%. The remaining formal path to 100% stays separate:

- P3: end-to-end operational integration and controlled cross-system evidence, overall 90%;
- P4: scale, reliability, supportability, recovery, and operational readiness, overall 96%;
- P5: final certification, go-live controls, production monitoring, and acceptance, overall 100%.

Those phases receive their own designs and implementation plans after P2 supplies the shared user experience.
