# Provider Service 360 — Build 9

## Native Compliance Engine

**Branch:** `provider-service-build9-native-compliance`  
**Base:** `provider-service-build8-portal-foundation`  
**Status:** deterministic compliance foundation; no external compliance connector enabled

Build 9 creates Rateware-native compliance state without making AI extraction authoritative.

```text
versioned rule set
  → named deterministic evaluator
  → evaluation snapshot
  → per-rule result
  → verified evidence
  → compliance status / hold recommendation
```

### Core decisions

- Rules reference `evaluator_code`; arbitrary SQL evaluators are not part of the model.
- Each evaluation snapshots the rule-set identity/version and belongs to one provider relationship and XBF legal entity.
- A completed rule result is immutable; later changes require a new evaluation.
- A rule configured with `evidence_required` cannot be considered safely passed by the domain contract without qualifying evidence.
- Build 3 documents qualify as compliance evidence only when their effective state is `verified`.
- External/manual evidence requires explicit verification metadata.
- Compliance can recommend a hold; it does not directly update `provider_relationships.lifecycle_status` or force activation state.
- Findings can later be remediated or waived only through the Provider Service case/approval system; the compliance engine does not silently waive failures.

### Objects

- `provider_compliance_rule_sets`
- `provider_compliance_rules`
- `provider_compliance_evaluations`
- `provider_compliance_rule_results`
- `provider_compliance_evidence_links`
- `provider_compliance_findings`
- `provider_compliance_events`
- `provider_compliance_document_evidence`
- `provider_compliance_relationship_status`

### Domain validation

`src/provider-service-compliance-domain.js` implements evidence qualification, expiry, required-evidence behavior, blocking-failure rollup, hold recommendation and the prohibition on dynamic SQL evaluators.

Local focused validation: **6/6 passed**.

### Non-goals

No FMCSA, SAT, insurance, fraud, identity or external compliance API is connected in this build. No provider is suspended automatically. No production data is backfilled or deployed.

The clean migration replay blocker in issue #19 remains a pre-merge gate for the complete Provider Service stack.

## Next build

Build 10 adds Activation Integrations: durable external-system mappings, transactional outbox commands and reconciliation for Fleet Rocket and MARKSMAN ERP. It will not let the Agent write directly into either external system.
