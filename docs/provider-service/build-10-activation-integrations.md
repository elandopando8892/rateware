# Provider Service 360 — Build 10

## Activation Integrations

Branch: `provider-service-build10`  
Base: `provider-service-build9-native-compliance`  
Status: draft implementation; not deployed.

Build 10 defines Rateware as the orchestration source of truth for downstream provider setup. External systems receive bounded, idempotent commands instead of being written by the agent directly.

### Architecture

```text
provider_relationship
        |
        +--> provider_system_links
        |
        +--> provider_sync_commands
                  |
                  +--> worker / adapter (future)
                          |
                          +--> Fleet Rocket
                          +--> MARKSMAN ERP
                          +--> other configured systems
                  |
                  +--> provider_sync_receipts
                  +--> provider_system_reconciliations
```

### Safety contract

Outbound actions require a published `provider_integration_action_policies` row. Each policy fixes the legal entity, system, action, sensitivity and whether the action is required for activation.

Commands use a deterministic SHA-256 idempotency key derived from system, provider relationship, action and canonical payload. Replaying the same intended mutation therefore resolves to the same logical command instead of creating duplicate downstream records.

Sensitive actions carry an explicit approval reference. The worker queue only surfaces work whose policy is still published and whose required approval has already been consumed.

### Reconciliation

External identity is not considered ready merely because an external ID exists. A required system mapping is ready only when:

```text
mapping status = active
external reference exists
latest reconciliation = in_sync
no expected/actual fingerprint drift
```

The activation link stores which Build 2 activation depends on which downstream system mapping. This makes downstream setup a typed readiness dependency rather than a free-form note.

### Current scope

Implemented:

- system mapping state;
- idempotent sync commands;
- command retry metadata;
- sync receipts;
- reconciliation records;
- activation-to-system links;
- versioned outbound action policies;
- worker queue projection;
- fail-closed RLS and direct-write revokes;
- deterministic JavaScript fingerprint, readiness, retry and execution-gate rules.

Not implemented in this build:

- live Fleet Rocket API credentials;
- live MARKSMAN ERP credentials;
- network adapters or workers;
- production mutations;
- automatic provider activation after a downstream response.

### Known pre-merge items

The transactional enqueue routine that atomically consumes a matching approval and creates the outbox command remains to be finalized. Direct table writes stay revoked until that routine exists. Clean migration replay also remains blocked by issue #19.

## Next build

Build 11 creates the Provider 360 UI contract over the relationship, activation, documents, cases, communications, approvals, portal, compliance and integrations built in Builds 1–10.
