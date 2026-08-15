# Provider Service 360 — Build 4

## Cases and SLA

Branch: `provider-service-build4-cases`  
Base: `provider-service-build3-document-registry`  
Status: draft implementation; not deployed.

Build 4 makes the case, not the email thread, the durable Provider Service work object under `provider_relationship_id`.

Included: versioned case/SLA policies, database-generated `PSC-{ENTITY}-{SEQUENCE}` IDs, case lifecycle and priority, SLA snapshots, tasks, participants, document links, activation links, event timeline, RLS, and deterministic JavaScript rules for transitions, SLA state and work prioritization.

Canonical statuses are `new`, `open`, `waiting_provider`, `waiting_xbf`, `waiting_external`, `blocked`, `escalated`, `resolved`, `closed`, and `cancelled`.

Case types remain normalized identifiers so the system can support onboarding, customer setup, credit applications, document correction/renewal, compliance, payment support/disputes, POD/accessorial issues, banking changes, operational support, reactivation, suspension and offboarding without schema changes.

A case is scoped to one provider relationship and one XBF legal entity. Document and activation links use composite foreign keys so XBF US/MX data cannot be crossed.

Focused case-domain reproduction: 5 tests, 5 passed, 0 failed. The disposable Supabase sandbox accepted the case-policy schema, but final clean migration validation remains blocked by issue #19 because the preview branch cannot replay the full canonical Rateware migration chain.

Build 5 will add Communications Inbox and attach Gmail threads/messages/attachments to existing `provider_relationship_id`, `case_id`, and Document Registry objects rather than making Gmail a second source of truth.
