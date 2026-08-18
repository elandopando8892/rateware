# Provider Service Onboarding — Sprint Plan (rev 2)

Branch: `feat/provider-service-onboarding-production` @ 28 commits, 62 files, ~8,500 insertions.
Date: 2026-08-18. Supersedes rev 1 of 2026-08-17.

Goal unchanged: `carriers@xbfreight.com` as a supervised superagent for **XBF Customer
Setup**. Reley.ai keeps provider onboarding *into* XBF; this does not duplicate it.

---

## What changed since rev 1

Rev 1 named the corpus mount as the critical path. That was wrong, and the reason
matters more than the correction.

**The corpus was never the blocker.** It sits in `H:\Mi unidad\Socios\Legal &
Cumplimiento`, 32 documents across `XBFus` and `XBFmx`, and the importer has already
planned it end to end.

**The real blocker is deployment.** Eight migrations on this branch — including the
service_role grants without which *no command can write at all* — have never been
applied to production. Every command, the agent intake, and the new Document Review
surface work locally and fail in production with `permission denied`. Nothing
downstream can be verified against the real system until that changes.

### Sprints closed

| Sprint | Outcome |
| --- | --- |
| 1 — agent reachable | `provider-gmail-sync.ts` calls the intake: thread resolution, classification, entity resolution. Done. |
| 3 — read the attachments | PDF/XLSX/DOCX question extraction mapped through the ontology. Done. |
| 6 (partial) — Document Review | Built and verified in-browser. Withheld values never render. |
| 7 (partial) — E2E gate | Seven-stage synthetic gate chaining the real modules. Done. |

### The defect class that reshaped the plan

Three separate times, a gate was green over a path nothing had executed: orphaned
modules nothing imported, a `security_invoker` view with no base-table grants, and
finally 30 of 35 tables with no `service_role` grant at all. Structural tests, the
runtime syntax gate, the action contract validator and clean migration replay all
passed throughout — **none of them runs a query**.

Rev 1's standing rule ("a module is done when an entrypoint calls it") was necessary
and insufficient. Rev 2 replaces it:

> A capability is done when it has been **executed against a database** and observed to
> produce its effect. Not when its tests pass, and not when something calls it.

Sprint A exists to enforce that rule retroactively across everything already built.

---

## Sprint A — Deploy and smoke-test (the new critical path)

**Goal:** the code that works locally also works in production.

1. Apply the 8 branch migrations to production. Note the deadlock hazard in
   `20260801015155_harden_public_data_api_access.sql` — it takes `AccessExclusiveLock`
   on every public table in a loop and can deadlock against live connections. Set
   `lock_timeout` and retry.
2. Build a **runtime smoke test**: execute every wired command once against a real
   database and assert its effect. This is the gate that would have caught all three
   grant defects, and it is the sprint's real deliverable.
3. Re-run the importer's dry run against production to confirm the entity picker
   resolves the real organization and both legal entities.

**Blocked by:** authorization to deploy, plus production credentials. This is a human
decision by design — 353 migrations applied to production for the first time should not
be an agent acting alone.
**Exit:** every wired command demonstrably writes in production.

---

## Sprint B — Ingest and review the corpus

**Goal:** the Entity Vault holds reviewed canonical facts for both XBF entities.

1. `node tools/import-entity-vault.mjs --all "H:\Mi unidad\Socios\Legal & Cumplimiento" --commit --actor <id>` — one command, both entities.
2. Human review of all 32 documents through the Document Review surface. Two need
   manual classification: a PNG with no descriptive name, and a file whose name has a
   typo (`Opinion de Cumpliento`).
3. Promote reviewed facts. Record any conflict between documents as a review task
   rather than resolving it silently.

**Depends on:** Sprint A. **Blocked by:** nothing else — corpus and screen both exist.
**Exit:** a form field maps to a real value with provenance.

---

## Sprint C — Fill, package, approve

**Goal:** an approved package produces a real filled document.

- Wire form assembly to the concrete assembler.
- Approval Center surface.
- Release manifest and disclosure decisions.

**Blocked by:** **approver roles.** `operations` = `ops@xbfreight.com` is settled;
`compliance`, `data_owner` and `legal` are not, and the approval threshold per
sensitivity is undecided. Separation of duties means the requester cannot approve, so at
least two identities are required.
**Exit:** a filled PDF and XLSX assembled from reviewed facts, signature consent bound
to the exact template.

---

## Sprint D — Reply and follow up

**Goal:** the round trip closes.

- Draft the reply (third LLM capability, same provider interface).
- Wire Gmail delivery: dry-run, approval-gated send, same thread.
- Interpret the provider's response — harder than the inbound classification, since
  "attached the corrected form, please sign" and "you are now registered" look alike and
  mean opposite things.
- Configurable follow-ups, cancelled on reply.

**Blocked by:** a redirect URI on the **existing** OAuth client, and
`PROVIDER_GMAIL_ALLOWED_ACCOUNT`. Rev 1 claimed a new Google Cloud project was needed —
that was wrong. Rateware already has one: `gmail-oauth-callback` is in production and
uses the same `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GMAIL_TOKEN_ENCRYPTION_KEY`
that the provider code reuses by design. Pub/Sub is optional — manual sync works without
a topic. Also blocked by the sender allowlist and recipient-domain policy, which is why
delivery stays deliberately unwired, asserted by test.
**Exit:** dry-run produces the expected email and attachments; a synthetic confirmation
advances the case to activated.

---

## Sprint E — Remaining operator surfaces

Entity Vault, Approval Center, Delivery Workspace. Read models and read actions exist;
only the surfaces are missing. Worth doing after Sprint B, when the vault holds 32 real
documents and the screens have something to show.

**Blocked by:** nothing.

---

## Sprint F — Release and rollout

Extend the E2E gate to cover delivery once Sprint D lands. Observability metrics. The
remaining §23 documents: architecture, data model, Gmail, operator runbook, rollout,
rollback. Deployment order, canary, monitoring, rollback owner.

**Blocked by:** production secret owners, migration window, canary entity, rollback
owner.

---

## Critical path

```
Sprint A (deploy + smoke)  ──►  Sprint B (ingest + review)  ──►  Sprint C (fill)  ──►  Sprint D (deliver)
        ▲                                    │                        ▲                     ▲
   authorization                             └──► Sprint E (surfaces) │                     │
   + credentials                                                 approver roles      redirect URI
                                                                                   + sender policy
```

**Sprint E is the only one fully unblocked today.** Everything else waits on Sprint A,
and Sprint A waits on a decision only the operator can make.

## Human decisions, by what they block

| Decision | Blocks | Status |
| --- | --- | --- |
| Authorize production deployment + credentials | Sprint A → everything | **open — now the top blocker** |
| `compliance`, `data_owner`, `legal` approvers; threshold per sensitivity | Sprint C | partially answered (`operations` set) |
| Redirect URI on the existing OAuth client; `PROVIDER_GMAIL_ALLOWED_ACCOUNT` | Sprint D | open |
| Sender allowlist, recipient-domain policy | Sprint D | agreed in principle, not configured |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` in Supabase secrets | degrades the classifier to keywords | open |
| Drop the `https://mail.google.com/` scope | security hardening | open — affects the Quote Desk too |
| Production secret owners, migration window, canary, rollback owner | Sprint F | open |

## Standing rules

1. A capability is done when it has been executed against a database and observed to
   produce its effect.
2. A gate that cannot fail on a broken path is not a gate. Prefer one that runs the
   thing over three that inspect it.
3. Nothing that reaches an external system gets wired before its policy exists.
