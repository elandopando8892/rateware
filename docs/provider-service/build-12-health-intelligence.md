# Provider Service 360 — Build 12

Build 12 adds deterministic Provider Health & Intelligence over the read model from Build 11. Health prioritizes work; it never activates, suspends, merges or offboards a provider.

`provider_health_policies` versions six weights that must total 100: activation, documents, cases, communications, compliance and integrations. It also versions score bands and a hard-blocker cap.

`provider_health_evaluations` stores score snapshots, six component scores, hard-blocker codes, policy version, source-signal snapshot and evaluation time. `provider_health_latest` and `provider_health_intelligence_queue` provide the latest operational prioritization layer.

`src/provider-service-health-domain.js` derives scores only from explicit Provider 360 facts. Non-compliant compliance or an explicit primary blocker triggers the policy hard-blocker cap. Health states are `healthy`, `watch`, `at_risk`, `critical` and `unknown`.

Provider health tables are RLS-protected and not browser-writable. Build 12 does not call AI, make credit decisions or change lifecycle state.

The full stack remains draft/unmerged until issue #19 restores clean canonical migration replay and the documented pre-merge gates in Builds 7, 8, 10 and 11 are closed.
