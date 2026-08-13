# Platform 55 parity — Sprint 0 baseline

## Purpose

Turn the Platform 55 cumulative prototype into a traceable implementation backlog for the live Rateware application. The prototype is the experience and architecture reference; it is not deployable production code.

## Verified inputs

- Prototype: `rateware_foundation_home_commercial_procurement_operations_finance_intelligence_administration_platform_v55 (1).zip`
- Prototype SHA-256: `b8270bc7c35912ea3e7add1aaee634fa56c52122f86e18ee68ca3e71a157ad42`
- Archive inventory: 2,238 entries, including 95 navigable surfaces in the cumulative prototype.
- Live-code baseline: `746178013a804b15d39eeb505efaf108107e207b` (`main` after PR #8).
- Phase 0.2E candidate: `98a7d6b32e81fbb67ae2096507a81711144a2577` in draft PR #9.
- Production tenant mode: `shadow`, verified by secret digest on 2026-08-12.
- Earliest valid 24-hour shadow gate: 2026-08-13 16:52:09 America/Mexico_City. This is a time gate; it must not be shortened or inferred from a partial log sample.

## Baseline scope

The live repository currently has 26 HTML pages, 20 client services, 13 Edge Function entrypoints, and 202 migrations. Existing capability is strongest in Rate Intake, staging review, Ratebook, RFx/Bid Room, carrier and shipper records, and basic intelligence. Platform 55 adds a unified product shell plus control-plane surfaces that are mostly partial foundations or prototype-only.

The detailed source of truth is [platform55-surface-inventory.csv](./platform55-surface-inventory.csv).

| Baseline state | Surfaces | Meaning |
|---|---:|---|
| `live_partial` | 15 | A live user-facing path exists but parity is not certified. |
| `foundation_partial` | 49 | Some supporting runtime or control exists without the complete product surface. |
| `prototype_only` | 31 | No matching first-class implementation was found in the reviewed baseline. |
| **Total** | **95** | Every Platform 55 navigation surface is accounted for exactly once. |

## State vocabulary

- `live_partial`: a user-facing capability and production path exist, but Platform 55 parity is not yet certified.
- `foundation_partial`: technical controls exist, but the corresponding Platform 55 product surface is not complete.
- `prototype_only`: no matching first-class implementation was found in the reviewed `main` baseline.

None of these states means production-certified. Each surface still needs the listed sprint gate and an authenticated E2E path.

## Product delivery sequence

| Sprint | Primary outcome | Platform 55 areas |
|---|---|---|
| 0 | Verified parity baseline and release ledger | all 95 surfaces |
| 1 | Shared shell and delivery controls | shell, lifecycle, reliability, trust, release and data foundations |
| 2 | Operator home | Command Center, My Work, notifications, search and Ask AI |
| 3 | Governed rate intake | Rate Intake, Review Queue, Documents, Imports and Approved Rates |
| 4 | Procurement execution | RFx Projects, Bid Room, Awards, Agreements and Rate Matrix |
| 5 | Commercial network | Shippers, Carriers, Growth, Opportunities, Customer Success and Communications |
| 6 | Operations handoff | Control Tower, Shipments, Dispatch, Exceptions, Tracking and Scheduling |
| 7 | Finance handoff | Billing, Carrier Pay, Reconciliation, Business P&L and FinOps |
| 8 | Intelligence | network, carrier/shipper intelligence, benchmarks, reports, optimization and AI |
| 9 | Administration and governance | users, roles, workflow, master data, compliance, privacy, legal and configuration |
| 10 | Platform 34–40 | jobs, service catalog, RFC, identity, secrets, flags and implementation gates |
| 11 | Platform 41–46 | integration runtime, setup, marketplace, developer, operations and events |
| 12 | Platform 47–50 | API consumer, machine identity, gateway and observability |
| 13 | Platform 51–55 | export, regionalization, localization, operator console and certification |

## Non-negotiable release rules

1. Rate quotes enter `rate_staging` before any production-rate insert.
2. Human approval is required before a staged rate becomes production data.
3. No automated bid, award, communication, dispatch, ERP/TMS update, or financial approval is authorized by this roadmap.
4. Fleet Rocket remains the execution system of record; MARKSMAN ERP remains the accounting system of record.
5. Every material action requires tenant isolation, authorization evidence, an immutable receipt, rollback, and independent review proportional to risk.
6. Desktop, tablet and mobile are responsive views of one web product unless a separate native-app decision is explicitly approved.
7. Prototype screenshots and static acceptance tests are design evidence, not live-system proof.

## Sprint 0 exit criteria

- [x] Prototype identity and SHA verified.
- [x] All 95 navigation surfaces inventoried.
- [x] Every surface assigned a current-state class and target sprint.
- [x] Existing live-code evidence linked at file or subsystem level.
- [ ] Phase 0.2E completes a real 24-hour shadow window with zero legitimate rejection.
- [ ] PR #9 receives an independent final review after the complete evidence window.
- [ ] Product owner confirms the first implementation slice: Sprint 1 shared shell.
- [x] Baseline screenshots are captured at desktop, tablet and mobile widths before UI replacement begins.

## Responsive baseline

The Platform 55 Command Center was rendered from the verified local prototype with no provider or production connection. All three widths retained the `Command Center` surface. Desktop and tablet had no horizontal overflow; mobile exposed the first concrete parity defect.

| View | Result | Baseline |
|---|---|---|
| Desktop 1440×900 | navigation visible; no horizontal overflow | [PNG](./platform55-baseline/command-center-desktop-1440x900.png) |
| Tablet 1024×768 | navigation visible; no horizontal overflow | [PNG](./platform55-baseline/command-center-tablet-1024x768.png) |
| Mobile 390×844 | navigation collapsed; **15 px horizontal document overflow** | [PNG](./platform55-baseline/command-center-mobile-390x844.png) |

### RSP-001 — mobile horizontal overflow

At 390×844, `window.innerWidth` is 390 px, the usable document width is 375 px, and `document.scrollWidth` remains 390 px. A horizontal scrollbar is visible and right-side content is clipped. Sprint 1 must remove this overflow at the shared-shell level before any product surface is declared responsive. The prototype itself is reference-only and was not edited.

## Definition of Platform 55 reached

Platform 55 is reached only when all 95 rows are implemented or explicitly dispositioned, their production gates pass, business-source boundaries are preserved, and the final readiness surface has fresh production evidence. Architecture parity alone is not implementation completion, production readiness, or certified-live status.
