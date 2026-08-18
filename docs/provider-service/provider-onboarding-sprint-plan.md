# Provider Service Onboarding — Sprint Plan

Branch: `feat/provider-service-onboarding-production` @ 19 commits, 44 files, ~6,200 insertions.
Date: 2026-08-17

The goal is `carriers@xbfreight.com` operating as a supervised superagent for
**XBF Customer Setup** — the carrier asks XBF to register as their customer, the agent
reads the request and its attachments, fills the forms, escalates what it cannot answer,
and after human approval sends and follows up until the alta is confirmed. Reley.ai keeps
provider onboarding *into* XBF; this system does not duplicate it.

---

## 0. Where the work actually stands

Eight agent capabilities from §3:

| Capability | State |
| --- | --- |
| Match provider to relationship | Built |
| Resolve XBF entity (MX / US) | Built |
| Resolve thread → provider + vendor_id | Built |
| Classify the request | Built (OpenAI → Anthropic → deterministic) |
| Map answers to canonical facts | Partial — ontology built, no canonical facts exist |
| Extract questions from attachments | **Not built** |
| Draft the reply | **Not built** |
| Follow-up loop to activation | **Not built** |

### The finding that sets Sprint 1

**Every module built for the agent this session is unwired.** `provider-agent-resolution`,
`provider-agent-thread-resolution`, `provider-agent-classifier`,
`provider-onboarding-assembler` and `provider-entity-import` are imported by no
entrypoint — exactly the defect found in Builds 22–29 and criticized in
`provider-onboarding-current-state.md` §1.

The eight command modules were wired; the agent modules were not. Sprint 1 closes that
before any new capability is added, and every later sprint ends with its module reachable
rather than merely tested.

---

## Sprint 1 — Make the agent reachable

**Goal:** an inbound email produces a linked, classified case. Nothing new is written.

- Call `resolveProviderThread` from `provider-gmail-sync.ts`, replacing the hardcoded
  `matching_status: 'unmatched'` / `match_method: 'none'`.
- Call `classifyOnboardingRequest` on intake; persist the proposal (engine, model, prompt
  version, context digest, confidence) as an agent run, never the body.
- Call `resolveXbfEntity`; ambiguous evidence creates a review task instead of selecting.
- Wire `beginProviderEntitySignedUpload` into the importer's `--commit` path.

**Depends on:** nothing. **Blocked by:** nothing.
**Exit:** a synthetic inbound fixture produces a thread linked to a `vendor_id`, a
classification proposal, and an entity decision or review task. Envelope refreshed.

---

## Sprint 2 — Canonical facts exist

**Goal:** the Entity Vault holds real, reviewed legal-entity facts for both XBF entities.

- Mount the corpus; run the importer for real.
- Human review of every extracted fact through the already-wired review commands.
- Promote reviewed facts via `promote_provider_entity_review_facts`.
- Record conflicts between `Onboarding.txt` and the official documents as review tasks —
  never resolved silently.

**Depends on:** Sprint 1's upload path.
**Blocked by:** **the corpus mount** — `/mnt/data` is absent, so all 13 documents are
missing. Nothing downstream can produce a truthful filled form until this lands.
**Exit:** `provider_entity_vault_workspace` returns verified facts for MX and US, and a
form field maps to a real value with provenance.

---

## Sprint 3 — Read the attachments

**Goal:** an attached packet yields a structured question list.

- PDF AcroForm field extraction (adapter exists; extraction does not).
- XLSX and DOCX question extraction.
- Flat-PDF path → human layout review, no OCR.
- Map extracted questions through the ontology; unmapped and low-confidence stay pending.

**Depends on:** Sprint 2 for anything to map *to*.
**Blocked by:** nothing technical.
**Exit:** a synthetic packet produces a field list with provenance, confidence and
pending markers, and no invented values.

---

## Sprint 4 — Fill and package

**Goal:** an approved package produces a real filled document, privately stored.

- Wire `queueProviderOnboardingFormAssembly` / `processProviderOnboardingFormAssembly` to
  the concrete assembler.
- Field review UI so an operator can accept, correct, reject or withhold.
- Release manifest and disclosure decisions through the existing approval RPCs.

**Depends on:** Sprint 3.
**Blocked by:** **approver role assignments** — nothing maps a user to
`operations` / `compliance` / `data_owner` / `legal`, so the approval commands cannot be
used in production even though they work.
**Exit:** a filled PDF and XLSX assembled from reviewed facts, hash recorded, signature
consent bound to the exact template.

---

## Sprint 5 — Reply and follow up

**Goal:** the round trip closes.

- Draft the reply (the third LLM capability, behind the same provider interface).
- Wire Gmail delivery: dry-run first, approval-gated send, same thread.
- Interpret the provider's response — the harder classification, since "attached the
  corrected form, please sign" and "you are now registered, vendor #X" look alike and mean
  opposite things.
- Configurable follow-ups, cancelled on reply.

**Depends on:** Sprint 4.
**Blocked by:** **Gmail OAuth + Pub/Sub**, and **sender allowlist + recipient-domain
policy** — form assembly and Gmail delivery stay deliberately unwired until these exist,
asserted by test.
**Exit:** dry-run produces the expected email and attachments; a synthetic confirmation
advances the case to activated.

---

## Sprint 6 — Operator surfaces

**Goal:** the four remaining UI surfaces, on read models and actions that already exist.

Entity Vault, Document Review, Approval Center, Delivery Workspace. Read models and read
actions were built in this session; only the surfaces are missing.

**Depends on:** Sprints 2–5 for meaningful data.
**Blocked by:** nothing.
**Exit:** responsive, accessible, no restricted value rendered.

---

## Sprint 7 — Release gate and rollout

- The 16-stage synthetic end-to-end gate from §18 Phase 9.
- Observability metrics.
- Remaining §23 documents: architecture, data model, Gmail, operator runbook, rollout,
  rollback.
- Deployment order, canary, monitoring, rollback owner.

**Blocked by:** production secret owners, migration window, canary entity, rollback owner.

---

## Critical path

```
Sprint 1 (wiring)  ──► Sprint 3 (extraction) ──► Sprint 4 (fill) ──► Sprint 5 (deliver)
        │                      ▲                        ▲                    ▲
        └──► Sprint 2 (facts) ─┘                        │                    │
                   ▲                          approver roles        Gmail OAuth,
             corpus mount                                          sender allowlist
```

Only Sprint 1 is fully unblocked today. Sprint 2 is the true bottleneck: without the
corpus there are no canonical facts, so Sprints 3–5 can only ever run on synthetic
fixtures, and the release gate would certify a system that has never filled a real form.

## Human decisions, by the sprint they block

| Decision | Blocks |
| --- | --- |
| Mount the 13-document corpus | Sprint 2 — and transitively everything after it |
| Approver role assignments | Sprint 4 |
| Gmail OAuth client, consent screen | Sprint 5 |
| Pub/Sub topic and IAM | Sprint 5 |
| Sender allowlist, recipient-domain policy | Sprint 5 |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` secrets | Degrades Sprint 1 to keyword-only |
| Production secret owners, migration window, canary entity, rollback owner | Sprint 7 |

## Standing rule for every sprint

A module is not done when its tests pass. It is done when an entrypoint calls it. This
session produced eight wired commands and five unwired agent modules; the sprint exit
criteria above make reachability the gate, not test count.
