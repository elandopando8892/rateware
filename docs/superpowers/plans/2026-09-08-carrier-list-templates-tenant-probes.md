# Carrier List Templates — tenant and permission probes

## Narrative

The browser preview already proved the visible Carrier CRM → Carrier Fit → Message journey. This bounded development closes the server-side safety gap that the preview intentionally left open: organization scope, read/write permission separation, foreign-member rejection, optimistic concurrency, and stale archived-template protection.

The probes call the real Rateware API handler with authenticated claims and deterministic Supabase fakes. They never use a remote Supabase project and never create a carrier, RFx participant, message, invitation, or delivery-queue record.

## Model, effort, and capacity

- Recommended implementation model: GPT-5.6-terra, high reasoning.
- Test harness/reporting: GPT-5.6-luna, medium reasoning.
- Sprint shape: bounded half-day verification slice, 70% planned capacity, 30% buffer.
- Dependencies: existing carrier-template contract fixtures and Deno runtime.

## Probe contract

1. An `org-b` principal cannot list or get an `org-a` template, even when the request body tries to provide `organization_id: org-a`.
2. A read-only principal can list active templates, while all five write families return `403` before any database trace.
3. A foreign-workspace UUID rejects the complete save and does not insert a template.
4. A stale `expected_version` returns `409` with the current version and does not update the template.
5. An archived template loaded by a stale Bid Room page returns `carrier_template_inactive` before participant mutation or success audit.

## Exit gates

- All five probes pass in one deterministic command.
- The command writes a JSON report under untracked `tmp/carrier-list-templates-evidence/`.
- The report declares `external_effects: none`.
- No production or remote non-production state is touched.
