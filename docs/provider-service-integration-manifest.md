# Provider Service cumulative integration manifest

Status: draft integration candidate. No production deployment or merge has been performed.

## Purpose

This manifest defines the atomic integration boundary for Provider Service. The historical Build 1–12 pull requests remain review slices, but the cumulative integration candidate is PR #34 (`provider-service-convergence-hardening`) targeted directly to `main`.

The objective is to prevent intermediate incomplete Provider Service states from being merged to `main` one build at a time.

## Baseline

- Main baseline SHA used by Build 1: `d1bab3b2aa84a91cb17fd1b6a2514d96e044b76b`
- Main remained at that same SHA when PR #34 was retargeted on 2026-08-14.
- Cumulative head before this manifest commit: `b4c795fb36c55745f5be3a35b3dafdf83ce184cf`

## Historical review slices

| Build | PR | Head branch | Base branch | Purpose |
|---|---:|---|---|---|
| 1 | #16 | `provider-service-build1-20260813` | `main` | Provider relationship core |
| 2 | #18 | `provider-service-build2-activation-engine` | Build 1 | Mutual activation engine |
| 3 | #20 | `provider-service-build3-document-registry` | Build 2 | Native document registry |
| 4 | #22 | `provider-service-build4-cases` | Build 3 | Cases and SLA |
| 5 | #25 | `provider-service-build5-communications` | Build 4 | Communications Inbox |
| 6 | #26 | `provider-service-build6-agent-core` | Build 5 | Agent Core |
| 7 | #27 | `provider-service-build7-approvals-signatures` | Build 6 | Approval & Signature Center |
| 8 | #28 | `provider-service-build8-portal-foundation` | Build 7 | Provider Portal Foundation |
| 9 | #29 | `provider-service-build9-native-compliance` | Build 8 | Native Compliance |
| 10 | #30 | `provider-service-build10` | Build 9 | Activation Integrations |
| 11 | #31 | `provider-service-build11-provider-360-ui` | Build 10 | Provider 360 UI |
| 12 | #32 | `provider-service-build12-health-intelligence` | Build 11 | Health & Intelligence |
| convergence | #34 | `provider-service-convergence-hardening` | `main` | Builds 1–12 + final hardening |

All historical Build 1–12 PRs were confirmed open, draft, unmerged and `mergeable=true` before the cumulative retarget.

## Convergence corrections

The cumulative branch closes pre-merge gaps that intentionally remained open in the historical slices:

- bounded `provider_service_request_approval` command;
- separation of provider/legal-entity/agent-run scope;
- exact approved-payload binding for outbound integration execution;
- transactional, idempotent and policy-gated sync enqueue;
- Provider Portal terminal review/event fail-closed hardening;
- Provider 360 authenticated internal API dispatch and Vendor CRM lazy drawer wiring;
- Build 2 migration replay corrections;
- Communications entity-scope FK ordering correction;
- clean migration-history validation and full zero-state replay CI.

## Required CI gate

A cumulative merge candidate is not acceptable unless the PR merge ref against `main` passes all of the following in one GitHub Actions run:

1. migration history validation;
2. full `tests/provider-service-*.test.mjs` suite;
3. clean local Supabase start;
4. application of every migration through the Provider Service convergence head;
5. `supabase db reset --local` from zero;
6. public schema dump;
7. verification that canonical tenant objects `organizations` and `workspace_registry` survive replay;
8. clean shutdown.

The previous stacked convergence run `31759858078` passed 88/88 Provider Service tests and replayed 323 migrations through `20260813235020_provider_sync_enqueue_command.sql`. Retargeting PR #34 to `main` requires a fresh run; the previous result is evidence but not a substitute for the main-target merge-ref gate.

## Security invariants

The integration must preserve these fail-closed rules:

- no direct browser write access to Provider Service canonical tables;
- no provider action may cross organization, legal entity or provider relationship scope;
- restricted or externally consequential actions require the configured approval class;
- requester self-approval remains forbidden;
- expired approvals cannot be consumed;
- approved integrations must execute the exact approved payload;
- portal submissions remain proposals/review inputs and do not directly mutate canonical vendor/provider records;
- signatures, banking changes, liability/indemnity actions, guarantees, UCC/security interests and other legal side effects are not automatically executed;
- health/intelligence scoring cannot activate, suspend, merge or offboard a provider.

## Merge policy

Until PR #34 passes its fresh cumulative gate and human review:

- keep PR #34 draft;
- do not merge Build 1–12 individually;
- do not merge the standalone replay PR #33 as a substitute for the cumulative code gate;
- do not mutate production database state;
- do not deploy Provider Service runtime changes to production.

If PR #34 is ultimately approved and merged atomically, the historical Build 1–12 PRs and standalone replay PR #33 can be closed as superseded review artifacts.

## Post-merge deployment gate

Merge and production deployment are separate decisions. A successful code merge does not authorize production migration or runtime rollout. Production rollout requires a separate controlled deployment plan with backup/rollback, migration head verification, runtime configuration review, least-privilege credentials, and smoke tests before enabling any external side effect.