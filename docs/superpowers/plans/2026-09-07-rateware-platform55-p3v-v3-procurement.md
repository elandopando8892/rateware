# Platform 55 P3-V3 Procurement and Carrier Lifecycle Implementation Plan

## Outcome

Make the five procurement routes read as one MARKSMAN workspace: clear project and event identity, a stable review hierarchy, visible carrier/lane context, and explicit human confirmation boundaries. The implementation is presentation-only. Existing controllers, Supabase actions, tenant checks, staging-first imports, and approval gates remain authoritative.

## Route matrix

| Route | Operational context | Primary user decision | Required visible states |
| --- | --- | --- | --- |
| `vendors.html` | Carrier CRM / source network | qualify, filter, or open a carrier/template workspace | loaded, empty, capability error, review-required |
| `rfx-process.html` | RFx project lifecycle | select a project and review its readiness | empty selection, draft, active, blocked, loading |
| `rfx-events.html` | Bid Room / invitation wave | prepare lanes and participants, then review delivery | event list, setup, review, delivery queue, blocked |
| `ratebook.html` | Route-book review | inspect source/rate health and propose distribution | loading, empty, selected book, decision queue |
| `outreach.html` | Invitation administration | edit templates and draft queues without dispatch | campaigns, templates, drafts, history, approval-needed |

## Shared composition

Each route gets the same interior contract:

1. A `p55-v3-page` wrapper with MARKSMAN page header, eyebrow, title, and one sentence of operational intent.
2. A context strip that names the current source (`Carrier CRM`, `RFx`, `Bid Room`, `Ratebook`, or `Invitation Admin`) and states the next human decision.
3. A compact metric or status row that stays above the first workspace surface at desktop and reflows into a horizontal scroll region on mobile.
4. One primary workspace card with a distinct header, toolbar, contained tables, and a reserved secondary/detail region.
5. A non-dismissible boundary note for actions that remain proposals, drafts, or approval-gated. No hidden mutation panel becomes visible through styling.

## Visual direction

- MARKSMAN roles: Charcoal Grey `#1e1e1e` for headings and navigation anchors, Electric Orange `#ea5e27` for active/primary emphasis, Industrial Grey `#484848` for secondary text, Cloud Grey `#efefef` for page surfaces.
- Preserve accessible contrast and the current approved icon/logo assets. Font fallback remains the existing system stack because licensed New Black Typeface and Lenia Mono files are not present in the checkout; do not silently claim those fonts are loaded.
- Use restrained borders, no blue full-page backgrounds, and no dense two-column stacking below the compact breakpoint.
- Keep focus-visible outlines, table horizontal containment, and reduced-motion behavior.

## Safety and data boundaries

- No API, Edge Function, SQL, migration, DDL, DML, auth, CORS, or provider change.
- No production record creation, invitation send, WhatsApp/email dispatch, award approval, or rate insertion.
- Route controllers and action contracts remain byte-for-byte authoritative except for the new presentation hooks.

## Validation and exit gates

1. Structural contract proves exactly these five routes carry the P3-V3 hooks, preserve their controller IDs, and keep source/approval boundary copy.
2. Browser certification covers authenticated/private boundary, loaded and non-happy states, desktop `1440x900`, compact `1024x900`, and mobile `390x844`.
3. Accessibility checks prove heading order, focus-visible styles, tab semantics, table containment, and no clipped primary action.
4. Existing procurement, Carrier List Templates, action-contract, and migration-ledger suites remain green.
5. P3-V3 is not credited in the route matrix until an immutable independent review reports `GO` for all five routes.

