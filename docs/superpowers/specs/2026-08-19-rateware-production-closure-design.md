# Rateware Production Closure Design

## Purpose

Take the current Rateware platform from partially released, partially reviewed implementation to a controlled and evidence-backed production release.

The target is the Rateware Core product: Platform 55, canonical tenant identity, operational safeguards, authenticated end-to-end validation, and a monitored production release. Agentic MarkOS and Provider Service remain separate post-core product tracks unless a defect in either blocks the core release.

## Definition of 100%

Rateware reaches 100% production readiness only when all of the following are true:

- The release candidate is derived from one clean, identified Git commit.
- Required database migrations, Edge Functions, frontend assets, and configuration are deployed.
- Automated suites and the Action Contract validator pass against that commit.
- An independent review reports no open P0, P1, or P2 findings.
- Authenticated end-to-end smokes pass in the deployed environment.
- Consequential actions remain behind explicit human approval.
- Tenant isolation is supported by production evidence rather than local mocks.
- Rollback procedures are documented and exercised sufficiently to be credible.
- Production monitoring remains healthy for the agreed 24-to-48-hour stabilization window.

Local implementation, a green preview, or a package labelled production candidate does not independently satisfy this definition.

## Scope Boundaries

### Included

- Platform 55 release closure.
- Intelligence brief and its auditable lineage rules.
- Phase 0.2E shadow readiness and the decision gate for required tenant enforcement.
- Release preflight, observability, idempotency, security review, and rollback readiness.
- Authenticated end-to-end testing of the core Rateware workflow.
- Controlled production deployment and stabilization.

### Excluded

- New autonomous communication or execution capabilities.
- Provider-specific Agentic MarkOS executors.
- Unapproved phone calls, emails, WhatsApp messages, CRM writes, TMS writes, financial approvals, bids, or production inserts.
- Provider Service feature expansion unrelated to the core release.
- Treating Build 12 reference assets as deployed production functionality.

## Delivery Strategy

Use a release-first sequence. Freeze new feature expansion while the P0-P5 closure train is active, except for defects or missing controls that directly block a gate. Each sprint produces an independently reviewable outcome and advances the weighted production score only after its exit criteria are met.

The provisional starting score is 63%. Sprint P0 recalibrates that score from live GitHub, Vercel, Supabase, and production evidence. A recalibration may move the baseline in either direction; it may not award points for unverified local work.

## Progress Model

Every status update reports both general production progress and sprint-specific progress.

### General production milestones

| Milestone | Expected cumulative progress |
|---|---:|
| Provisional baseline | 63% |
| P0 complete | 67% |
| P1 complete | 76% |
| P2 complete | 83% |
| P3 complete | 90% |
| P4 complete | 96% |
| P5 complete | 100% |

### Sprint progress scale

| Sprint state | Progress |
|---|---:|
| Not started | 0% |
| Scope and acceptance criteria closed | 10% |
| Tests and evidence plan defined | 25% |
| Implementation complete | 55% |
| Complete automated suite passes | 70% |
| Independent review reports GO | 85% |
| Preview and smoke pass | 93% |
| Production deployment complete | 97% |
| Production smoke and monitoring pass | 100% |

Progress never advances past a failed gate. A later P0, P1, or P2 finding may reduce the score to the last independently supported milestone.

## Sprint P0: Release Baseline and Consolidation

### Goal

Establish one trustworthy release baseline from the current branches, pull requests, worktrees, deployments, and local changes.

### Work

- Verify the exact state of `origin/main` and every release-relevant pull request.
- Inventory worktrees and classify changes as owned, already released, pending integration, superseded, or unrelated.
- Preserve the dirty primary checkout without broad staging or cleanup.
- Identify one clean release-integration branch and its exact base commit.
- Verify that no more than one Supabase preview branch is active.
- Record Vercel and Supabase deployment identities without exposing secrets.
- Produce a release ledger that separates implementation, review, preview, merge, deployment, and production verification.

### Exit criteria

- One exact release base and one ordered release queue.
- No unclassified release-critical files or commits.
- No unresolved ambiguity about which PR contains each Platform 55 sprint.
- No extra paid Supabase preview branch.
- Recalibrated overall progress percentage backed by current evidence.

## Sprint P1: Platform 55 Release Closure

### Goal

Integrate the remaining Platform 55 work into production sequentially without allowing stacked changes to hide regressions.

### Work

- Close the Intelligence brief adversarial-review findings.
- Rebase or reconstruct stale stacked branches against current `main` when needed.
- Re-run deterministic suites, Action Contract validation, syntax checks, dependency audit, and focused adversarial probes for each candidate.
- Require an immutable detached independent review for each material release candidate.
- Merge one pull request at a time.
- Run preview QA and a production smoke after each merge before advancing to the next candidate.
- Verify the resulting UI and workflow against the approved Platform 55 experience rather than only static selectors.

### Exit criteria

- Platform 55 release queue exhausted or explicitly dispositioned.
- No open P0, P1, or P2 findings.
- Production reflects the approved Platform 55 scope.
- Human approval boundaries remain intact.

## Sprint P2: Tenant Identity and Phase 0.2E

### Goal

Prove that canonical identity and tenant resolution are safe under real production traffic before tightening enforcement.

### Work

- Confirm `RATEWARE_TENANT_ENFORCEMENT=shadow` without revealing secret values.
- Verify the canonical identity, organization link, and workspace chain using SELECT-only queries.
- Re-run the pseudonymized shadow-readiness evaluator.
- Establish a continuous window of at least 24 hours containing legitimate traffic.
- Classify shadow rejections and prove zero legitimate-user rejection before recommending `required`.
- Re-run the five controlled smokes: `rateware-api`, `shipper-directory-api`, `create-raw-upload`, `interpret-upload` without automatic approval, and `sync-rateware-catalog` dry-run with zero writes.

### Exit criteria

- Evidence-backed GO to activate `required`; or
- An explicit, time-bounded decision to retain `shadow`, with the residual risk and next reevaluation documented.

Lack of 24-hour evidence is a NO-GO for activating `required`; it is not permission to infer readiness.

## Sprint P3: Platform Operations and Hardening

### Goal

Make releases observable, recoverable, tenant-aware, and resistant to duplicate or unauthorized execution.

### Work

- Turn the release preflight into a reproducible release gate.
- Standardize `request_id` and `operation_id` on high-risk paths.
- Capture bounded operational metrics for 4xx, 5xx, latency, tenant scope, actor type, and resource identity.
- Inventory non-idempotent operations and add explicit duplicate-execution guardrails.
- Review Admin, Finance, and Operations mutations for role, tenant, and approval enforcement.
- Document rollback procedures for database changes, Edge Functions, frontend, cache, and configuration.
- Verify environment identity and tenant-mode configuration without leaking secret contents.

### Exit criteria

- Release preflight passes on the exact candidate commit.
- No critical mutation lacks tenant scope, authorization evidence, and correlation identifiers.
- Rollback runbooks identify exact triggers, commands, owners, and verification queries.
- Operational dashboards or equivalent queries can show errors and latency during the release window.

## Sprint P4: Authenticated End-to-End Acceptance

### Goal

Validate the complete user and data journey in a controlled deployed environment.

### Required flows

- Login and canonical tenant resolution.
- Source upload, interpretation, and insertion into `rate_staging`.
- Human review followed by controlled approval.
- RFx creation, carrier response, award, and operations handoff.
- Finance handoff with canonical lineage and currency semantics.
- Intelligence brief with auditable evidence references.
- Admin permissions and cross-tenant denial controls.
- Read-only or dry-run integration smokes where a write is unnecessary.
- A rollback drill for at least one representative frontend, Edge Function, and database release failure.

### Exit criteria

- Each required flow has timestamped evidence tied to the release commit and deployed versions.
- No test automatically approves a staged rate or performs an unapproved consequential action.
- Independent release review produces a final GO recommendation.

## Sprint P5: Controlled Go-Live and Stabilization

### Goal

Release the approved candidate and establish stable production behavior.

### Work

- Freeze release scope and record the exact Git SHA, migrations, functions, frontend deployment, and environment posture.
- Deploy in the approved dependency order.
- Execute authenticated production smokes.
- Monitor errors, latency, tenant resolution, and unexpected writes for 24 to 48 hours.
- Exercise rollback if any release threshold is breached.
- Record final residual risks and operational owners.

### Exit criteria

- Production smoke passes.
- Stabilization window remains within agreed error and latency thresholds.
- No unexpected approval, external communication, CRM/TMS mutation, or production insert occurs.
- Release ledger, evidence, and rollback documentation are complete.
- Overall production progress reaches 100%.

## Model and Effort Policy

Before each sprint begins, report the chosen model and effort.

- P0: GPT-5.6 Sol, high effort.
- P1: GPT-5.6 Sol, high effort.
- P2: GPT-5.6 Sol, very high effort.
- P3: GPT-5.6 Sol, high effort.
- P4: GPT-5.6 Sol, very high effort.
- P5: GPT-5.6 Sol, very high effort.
- GPT-5.6 Terra or Luna may perform bounded, low-risk mechanical work, but security, tenant isolation, release decisions, and independent reviews remain Sol work.

## Reporting Contract

Every material update uses this structure:

- General progress toward production.
- Current sprint progress.
- Last completed evidence-backed action.
- Open blockers and their severity.
- Next exact action.
- Expected progress after the next gate.

No percentage is awarded merely because code exists locally. Production claims require deployed evidence.

## Post-Core Tracks

After P5 reaches 100%, plan Agentic MarkOS and Provider Service as independent product trains. Their future work does not reduce the already certified Rateware Core percentage; each receives its own progress baseline, release gates, and explicit authorization boundaries.
