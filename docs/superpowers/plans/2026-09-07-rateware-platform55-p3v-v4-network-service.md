# Platform 55 P3-V4 Network, Provider, Support, and Improvement Plan

## Outcome

Make the seven Network / Service routes read as one MARKSMAN operating workspace while preserving their existing data contracts, controller IDs, and human approval boundaries:

- Shipper CRM: customer master and commercial progress.
- Vendor Support: carrier questions, escalations, and case status.
- Vendor CI: evidence-backed carrier improvement work.
- Provider Service: provider relationship health and next attention.
- Provider Onboarding: evidence collection and readiness gates.
- Provider Gmail: read-only inbound connectivity.
- Provider Communications: read-only thread triage and proposal context.

The deliverable is a reversible visual and semantic slice. It does not add API calls, database tables, migrations, authentication rules, outbound delivery, ticket resolution, CRM writeback, provider activation, or production inserts.

## Design direction

Use the MARKSMAN manual as the authoritative reference: Precision Freight Networks, short structured voice, charcoal `#1e1e1e`, electric orange `#ea5e27`, industrial grey `#484848`, and cloud grey `#efefef`. Keep the currently licensed/system font fallback documented; do not redraw or substitute brand marks.

The seven routes share a thin shell, context boundary, metric rail, master/detail or table workspace, and explicit next-action language. Their interiors remain distinct:

| Route | Primary question | Human boundary that must remain visible |
| --- | --- | --- |
| shipper-crm | Which customer account needs commercial attention? | Won/Lost never approves rates, sends communication, creates a workspace, or commits a customer. |
| vendor-support | Which carrier case needs a response or escalation? | Case actions do not silently resolve, message, or change the carrier record. |
| vendor-improvement | What evidence-backed improvement work is next? | Reminders and recalculation remain governed actions; no autonomous carrier outreach. |
| provider-service | Which provider relationship is blocked or needs attention? | Readiness is a queue signal, not activation or release authority. |
| provider-onboarding | What evidence and approval gate is missing? | Documents, recipients, signatures, and delivery remain bounded and human-controlled. |
| provider-gmail | Is inbound Gmail connectivity healthy? | `gmail.readonly`; no compose, send, delete, or outbound scope. |
| provider-communications | Which inbound thread needs matching or review? | Threads are read-only; drafts/proposals never become messages without confirmation. |

## Implementation scope

1. Add P3-V4 route hooks and context banners to exactly seven HTML entry points.
2. Extend `src/platform55-visual-parity.css` with shared P3-V4 tokens, page framing, focus, overflow, and mobile rules.
3. Extend `src/platform55-network-service.css` with route-neutral profile, health, timeline, readiness, and master/detail geometry. Keep existing controller-specific CSS selectors intact.
4. Add a structural contract test that rejects missing routes, changed controller IDs, hidden boundaries, brand-role regressions, and prohibited mutation language.
5. Add a source-supersession record and loader validation so historical P2-S4 evidence remains immutable while the seven current route blobs are explicitly bound to this sprint.

## Exit gates

- `npm run test:platform55:p3v4` passes.
- Existing P3-V1/P3-V2/P3-V3 visual contracts pass.
- `npm run validate:action-contract` reports zero new errors.
- `git diff --check` is clean for intended files.
- Each route has loaded and non-happy evidence planned for desktop (1440/1024) and mobile (390), including signed-out/blocked states where the controller supports them.
- No browser certification or production credit is claimed until an independent reviewer reproduces the exact candidate SHA and reports `GO` for all seven routes.
- No invitations, messages, ticket resolutions, carrier/provider updates, or production records are created by this sprint.

## Deferred

P3-V5 intelligence/admin/public routes, P3-V6 aggregate certification, and any backend/auth/domain/migration work remain separate. The P3-V4 visual credit stays withheld until independent review and desktop/mobile evidence are complete.
