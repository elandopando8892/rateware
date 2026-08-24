# Rateware Platform 55 Visual Parity Design

## Purpose

Make Rateware visually recognizable as the same product system shown in the user-provided Platform 55 and cumulative Build 12 references. The work preserves the production business controllers, authentication, tenant boundaries, human approval gates, and route URLs while replacing inconsistent page interiors with the reference system's layout, hierarchy, density, components, and states.

This is not a new visual concept. It is a fidelity pass over the already-deployed Platform 55 shell.

## Current baseline

- Production baseline: `origin/main` at `3ab2cdafafeae4c42514b9c1b3354411a7406a7e`.
- Formal release ledger: General `83%`; P0 `100%`; P1 `100%`; P2 `100%`; P3-P5 `0%`.
- The shared shell, route registry, accessibility primitives, responsive navigation, and all 29 route adoptions are complete.
- Command Center has partial visual parity.
- The Rateware workspace and several other route interiors retain legacy density, toolbar composition, and table styling that do not resemble the supplied Platform 55 screens closely enough.
- P3-V work earns no formal readiness credit by itself. P3 remains `0%` until its independent operational and release gates are satisfied.

## Source of truth

The source package is cumulative reference material, not runtime code. Production must not load it.

1. Platform 55 blueprint:
   - `C:\Users\andre\Downloads\rateware_foundation_home_commercial_procurement_operations_finance_intelligence_administration_platform_implementation_blueprint_v1.html`
   - SHA-256 `68CB5496B98CA1049A46E49E3852F2F73398BBFE6C0EE05ABA5975FEE4BBE1EA`
2. Cumulative Build 12 ZIP:
   - `C:\Users\andre\Downloads\rateware_foundation_home_commercial_procurement_operations_finance_intelligence_administration_platform_build_v12.zip`
   - SHA-256 `CF2CED85E95DFB33BB7410BF73ACE22CB95090CE649747DF60BF2920E808C16A`
3. Extracted reference package:
   - `C:\Users\andre\Downloads\rateware`
   - 12 build namespaces and 1,359 PNG reference images across the extracted tree.
4. Approved shell reference:
   - `C:\Users\andre\.codex\visualizations\2026\08\11\019fef63-66ca-76e2-9b78-51d629492d76\platform55-shell-reference-1440x900.png`

The content-addressed local copies used by this design live in `docs/platform55-visual-parity/baseline/`. `docs/platform55-visual-parity/README.md` records their hashes and intended use.

## Product decision

The visual target is **system-identical, content-adapted fidelity**:

- Shell geometry, navigation hierarchy, search/topbar, typography, tokens, spacing, radii, borders, shadows, responsive behavior, and state language must match Platform 55.
- Page interiors must use the same archetypes: page heading, tabs, context banner, metrics, lifecycle/pipeline, cards, tables, drawers, safety boundaries, empty/error/loading states, and action placement.
- Real Rateware labels, live data, permissions, and freight workflows remain authoritative; the implementation must not paste prototype wording or synthetic values over real product content.
- A route does not pass because it imports Platform 55 CSS. It passes only when the rendered route is visibly and behaviorally consistent with its pinned reference archetype.

## Approaches considered

### 1. Global CSS overlay

Fastest first screenshot, but it preserves legacy DOM hierarchy and toolbar clutter. It cannot reliably reproduce the reference cards, tabs, state panels, mobile flow, or action hierarchy. Rejected.

### 2. Big-bang reconstruction of 29 routes

Potentially highest single-release fidelity, but it combines 29 interface rewrites with operational regression risk and makes review evidence too broad. Rejected.

### 3. Family-based fidelity migration

Chosen. Freeze one visual contract and migrate route families in bounded verticals. Existing page controllers keep business behavior; focused view adapters and CSS own presentation. Each vertical produces same-viewport reference/current comparisons plus behavior and accessibility evidence.

## Visual contract

### Shell and page frame

- Expanded tenant sidebar: `264px`; collapsed sidebar: `80px`.
- Topbar: `64px`.
- Content background: slate `#f6f8fb` / `#edf1f6` family.
- Primary brand: `#3f5bd8`; navy boundary surfaces: `#0b1d2d`.
- Font: Inter with system fallback.
- Radius scale: `6px`, `10px`, `14px`, `18px`.
- Page content begins with an eyebrow, one dominant H1, one concise subtitle, and at most two top-level actions.
- Dense route controls belong in tabs, a filter card, an overflow menu, or a contextual drawer; they must not form multiple undifferentiated chip rows.

### Interior archetypes

1. **Command:** decision-first hero, priority list, lifecycle, pulse, and work queue.
2. **Governed operations:** context banner, compact metrics, one filter/tool row, table/card workspace, and explicit safety boundary.
3. **Procurement:** project/event identity, lifecycle steps, lane/carrier workspace, review state, and consequential-action boundary.
4. **Network and service:** profile/health summary, status metrics, activity, documents/tasks, and support timeline.
5. **Intelligence:** data-as-of context, evidence/gaps, recommendations, charts/tables, and confirmation-required actions.
6. **Administration:** scoped context, safety posture, staged pipeline, configuration table, audit evidence, and explicit prohibited actions.
7. **Public/entry:** shared tokens and brand language without tenant navigation, private search, notifications, or private actions.

### Responsive contract

Every route is verified at:

- desktop `1440x900`;
- tablet `1024x768`;
- mobile `390x844`.

At every viewport:

- no page-level horizontal overflow;
- no clipped primary action, heading, state banner, or data label;
- mobile navigation is inert when closed and restores focus correctly;
- tables use contained horizontal scrolling or a tested compact/card representation;
- loading, empty, error, review-required, blocked, permission-denied, and disabled states stay visible and named.

## Fidelity score and release gate

Each route receives a 100-point score:

| Dimension | Weight | Pass requirement |
|---|---:|---|
| Shell/frame geometry | 20 | Shared geometry and hierarchy match the reference system |
| Interior layout and information hierarchy | 25 | Correct archetype, grouping, action priority, and content rhythm |
| Typography, spacing, color, radius, and density | 20 | Token-backed and visibly consistent at all three viewports |
| Components and non-happy states | 20 | Required cards/tables/tabs/drawers/states are present and legible |
| Responsive and accessibility behavior | 15 | Keyboard, names, focus, contrast, reflow, and overflow pass |

A route is `accepted` only at score `>= 90`, with no dimension below `80%` of its available points and no P0/P1/P2 finding. A route with missing reference, missing viewport, missing state, or unverified current screenshot is `blocked`, not partially accepted.

## Route matrix

`docs/platform55-visual-parity/p3v-route-matrix.csv` is the canonical 29-route board. It records access model, family, primary and secondary references, current baseline, gap, wave, and verification state.

Initial status is deliberately conservative:

- `partial`: recognizable Platform 55 structure exists but visible gaps remain;
- `low`: shell adoption exists but interior parity is materially below target;
- `unscored`: no same-viewport comparison has yet been performed under this contract;
- `accepted`: allowed only after the complete route gate passes.

## Delivery waves

P3-V is a visual workstream that runs before and alongside the existing P3 operational hardening. It does not replace the P3-P5 release plan.

| Wave | Outcome | P3-V progress |
|---|---|---:|
| P3-V0 | Freeze visual sources, route matrix, score, and evidence format | 10% |
| P3-V1 | Command Center and Rateware vertical; prove the reusable page-interior system | 25% |
| P3-V2 | Import, Source Files, and Review Queue | 40% |
| P3-V3 | Procurement and carrier lifecycle routes | 60% |
| P3-V4 | Network, provider, support, and continuous-improvement routes | 75% |
| P3-V5 | Intelligence, administration, and public/entry routes | 90% |
| P3-V6 | 29-route convergence, independent review, preview, and production visual smoke | 100% |

## First vertical: Command Center and Rateware

### Command Center

Keep the current decision-first composition and functional wiring. Tighten it against the approved reference by normalizing sidebar/content proportions, heading rhythm, card density, action styling, mobile hierarchy, and the visible relationship between Next Best Action, Priority Queue, Business Lifecycle, Network Pulse, and My Work.

### Rateware

Preserve all existing IDs, data requests, filters, selection behavior, export behavior, pagination, column configuration, evidence links, and human control boundaries. Recompose the workspace using the governed-operations archetype:

1. Page heading with one primary export action.
2. Approved-rate context/safety banner.
3. Five compact metrics aligned to the reference grid.
4. A single filter/tool surface with primary filters visible and secondary tools in an overflow/details region.
5. A table workspace card with selection status, pagination, issue navigation, and column headings grouped clearly.
6. Row density that remains operationally efficient without reproducing the current wall of chips and borders.
7. A contained mobile/tablet strategy that preserves every function.

No Rateware write, approval, bulk edit, export, or evidence behavior changes are authorized by this visual design.

## Component boundaries

- `src/platform55-tokens.css`: frozen cross-route tokens only.
- `src/platform55-shell.css`: shared shell geometry and responsive navigation only.
- `src/platform55-command-center.css`: Command Center interior.
- `src/platform55-operate.css`: shared Operate-family components.
- `src/platform55-visual-parity.css`: new page-interior primitives used across later waves; no route-specific business selectors.
- Route HTML and page modules: retain semantic structure, IDs, data flow, event handlers, and mutations; add only presentation hooks or safe view grouping required by the approved composition.
- `tests/platform55-visual-parity-contract.test.mjs`: static route/reference/score contract and required visual hooks.
- Browser evidence tooling: deterministic screenshots and measured comparison artifacts; no production writes.

## Evidence contract

Every accepted route must record:

- exact candidate Git SHA;
- reference file path and SHA-256;
- current screenshot SHA-256;
- route, state, viewport, authentication model, and fixture identity;
- computed geometry/token/accessibility results;
- human visual review notes;
- score by dimension;
- reviewer verdict.

Screenshots cannot prove interaction alone. DOM, keyboard, focus, overflow, contrast, console/network, and no-unexpected-write checks remain mandatory.

## Safety and authorization boundaries

- Local development, documentation, tests, local screenshots, and offline comparisons are allowed.
- No API, Edge Function, SQL, migration, DDL, DML, Supabase branch, secret, CORS, enforcement, or production-data change belongs to P3-V.
- Source files still enter `rate_staging`; human approval remains required before production insertion.
- Push, draft PR, Vercel preview, Ready, merge, automatic production deployment, and any production smoke require their own explicit authorization.

## Success definition

P3-V is complete only when all 29 routes are `accepted`, their screenshots visibly belong to the same Platform 55 system, all functional and safety tests pass, an immutable independent review reports no P0/P1/P2 findings, and an authorized authenticated production visual smoke confirms the deployed result.
