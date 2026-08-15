# Build 26 — Onboarding case workflow

Build 26 turns readiness evaluations into an operational case and task pipeline suitable for the Rateware module.

## Included

- one active case per legal entity, external party, and onboarding program;
- optimistic case revisions and immutable lifecycle events;
- case ownership, due dates, pipeline status, and readiness linkage;
- deterministic tasks for missing facts, missing or expired documents, verification, conflicts, human review, and re-evaluation;
- an approval-package task only when readiness is complete;
- terminal cancellation with reason and automatic cancellation of remaining work.

## Pipeline

`draft → evidence_collection / blocked → ready_for_approval`

Human-review and readiness-check statuses are reserved for the UI/orchestration layer. This build does not implement external submission.

## Rateware fit

The case table supplies the pipeline rows, the task table supplies “My Work” and queue items, and the event ledger supplies the audit timeline. Build 30 will render these surfaces in the Rateware UI.

## Privacy and authority boundary

Task metadata contains reason codes, references, statuses, and hashes—not document bytes or canonical fact values. No supplied XBF document or signature is committed. Ready for approval does not authorize release, signing, email, or submission.

## Validation

Clean migration replay, Provider Service tests, authorization no-regression, product regression, workflow invariants, and TypeScript parsing cover this build.
