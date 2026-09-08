# Carrier List Templates — Non-production browser evidence

## Narrative

The next bounded development after the Carrier CRM and Carrier Fit implementation is to prove the operator journey in a real browser without touching Supabase, CRM data, RFx records, messages, or delivery providers. The existing local simulated preview remains the source of fixtures; this increment adds a Playwright smoke that exercises the visible workflow instead of relying only on reducer tests or static source checks.

## Scope

- Run Library → Builder → Carrier Fit → Message with deterministic simulated data.
- Prove CRM-only member selection, CSV/XLSX reconciliation outcomes, active save, exact Carrier Fit counts, blocked exception rows, partial selection, and the exact Message CTA.
- Verify no draft, invitation, provider call, persistence call, or Delivery queue action occurs.
- Capture desktop, tablet, and mobile screenshots plus a JSON report under `tmp/carrier-list-templates-evidence/`.
- Assert zero horizontal overflow, unnamed controls, page errors, console errors, HTTP asset errors, and outbound requests.
- Close the mobile-preview navigation after an internal route transition so the scrim cannot block the destination workspace.

## Model, effort, and capacity

- Recommended implementation model: GPT-5.6-terra, high reasoning.
- Follow-up/test triage: GPT-5.6-luna, medium reasoning.
- Sprint shape: one week bounded verification slice, 70% planned capacity, 30% buffer.
- Dependencies: existing preview fixture, Playwright runtime, Chrome executable, no Supabase or provider credentials.

## Exit gates

1. The browser runner completes all three viewports.
2. Library, Builder, Carrier Fit, and Message assertions pass.
3. Four mutually exclusive Carrier Fit exception categories remain visible and nonselectable where required.
4. The exact CTA opens Message with only selected eligible carriers.
5. Report records `external_effects: none`; no external request is observed.
6. Focus, overflow, and control-name checks pass at every viewport.
7. The tracked test suite passes and the local evidence remains untracked.

## Explicitly out of scope

- Tenant/permission probes against a remote Supabase environment.
- Applying migrations, enabling the release flag, pushing, merging, deploying, or changing production data.
- Sending email, WhatsApp, invitations, bids, or any other external communication.
