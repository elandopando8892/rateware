# P1 aggregate release-candidate independent review

reviewed_sha: fa8e35c96c8fb30635ddac21b894614172831083

**Verdict:** NO-GO for advancing P1 to 93%.

The three Platform 55 feature sets are code-safe and are live in production, but the production Supabase migration ledger is not reproducible from the exact production SHA. This finding does not block unrelated isolated development; it blocks only the aggregate P1 release-readiness promotion.

## Findings

- **P0:** none.
- **P1:** the `Supabase Preview` check on the exact production SHA failed with `Remote migration versions not found in local migrations directory.` Production reports 369 migrations while the reviewed repository contains 345. The 24 remote-only versions begin at `20260815071846` and end at `20260821011805`.
- **P2:** `main` has no GitHub branch protection, so the failed production check is not enforced as a merge gate.
- **P2 inherited:** Action Contract reports zero errors and one existing warning for the missing declaration path of `declaration.edge.whatsapp-healthcheck`.

The migration mismatch predates and is outside the seven-file PR #35/#37/#39 feature scopes. It still prevents an aggregate GO because production state cannot be replayed from the production commit.

## Exact production and merge mappings

- PR #35: feature `243f0dd60381728803f303f98a6e534f3d9f46ce` -> squash merge `efef3c0f8916bd6d4e95afede1098a00f4a312cb` -> current production ancestry.
- PR #37: feature `000d494479b2e73da7ad22b313bd87b1236bae74` -> squash merge `e0c91cc0c3ae86db6786923b80f8e69fcbfadf42` -> current production ancestry.
- PR #39: feature `cf2f0ecaf370df228d6c8cd5f9375fb5539f4ce3` -> squash merge and current production `fa8e35c96c8fb30635ddac21b894614172831083`.
- Each feature-head tree equals its squash-merge tree. Each squash merge is an ancestor of the exact current production SHA.
- Vercel production deployment: `dpl_9qzBYLrBaAmMZ2AwE2WaSKu8tBh7`, `READY`, target `production`, source `main`, exact SHA `fa8e35c96c8fb30635ddac21b894614172831083`.
- Stable alias: `https://rateware.vercel.app`.

## Missing migration range

The reviewed checkout ends at `20260815032049_provider_onboarding_service_role_read_grants`. The following 24 versions exist remotely but not in the exact production commit:

1. `20260815071846_grant_provider_document_processor_service_role`
2. `20260817052654_provider_neutral_inbox_persistence`
3. `20260817090000_provider_entity_vault_workspace`
4. `20260817100000_provider_onboarding_operator_read_models`
5. `20260817110000_provider_onboarding_approval_commands`
6. `20260817120000_provider_onboarding_approval_revision_scope`
7. `20260817130000_provider_onboarding_signature_template_binding`
8. `20260817140000_provider_agent_model_assisted_runtime`
9. `20260818090000_provider_onboarding_service_role_runtime_grants`
10. `20260818091000_provider_onboarding_identity_read_grants`
11. `20260819090000_provider_entity_operator_attested_scan`
12. `20260819100000_provider_entity_review_seeding_grants`
13. `20260819213354_provider_onboarding_requirement_waivers`
14. `20260819214744_provider_release_item_hash_check_null_safe`
15. `20260819220858_provider_onboarding_single_admin_approval`
16. `20260819221154_provider_release_approval_separation_allows_flagged_self`
17. `20260819221616_provider_release_approval_sets_expiry`
18. `20260819223635_provider_mailbox_policy_domain_shape`
19. `20260819223726_provider_mailbox_policy_enabled_domains_cardinality`
20. `20260819224030_provider_mailbox_domain_predicate_execution_hardening`
21. `20260820043613_provider_onboarding_redacting_transforms`
22. `20260821010652_provider_read_model_service_role_grants`
23. `20260821010804_provider_read_model_service_role_grants_chain`
24. `20260821011805_provider_command_service_role_grants`

Supabase remained `ACTIVE_HEALTHY`; exactly one persistent non-default preview remained (`fcm-gmail-staging`, `FUNCTIONS_DEPLOYED`, `ACTIVE_HEALTHY`); default `main` continued to report `MIGRATIONS_FAILED`. No branch was created or changed.

## Verification reproduced independently

- Focused intelligence, administration, and platform-readiness adversarial suites: PASS.
- Aggregate hostile-fixture probe: PASS; accessors were not executed, builders failed closed, and material-action controls remained `false`.
- Full `npm test`: PASS; all 20 commanded components completed.
- Action Contract validator: PASS — 397 contract, 395 discovered, 291 Edge, 104 Postgres, zero errors, one inherited warning.
- `npm audit --audit-level=low`: zero vulnerabilities.
- Eight changed JavaScript/test files: `node --check` PASS.
- Aggregate `git diff --check`: PASS.
- Secret-shaped scan across the 15 changed files and the three PR bodies/comments: zero hits.

## Authenticated production smoke

- Command Center and six representative existing flows loaded under `sales@heymarksman.com | full access` without browser-console errors or horizontal overflow.
- Decision Brief opened `Blocked`, local-only, with no API call or write.
- Governance and Platform Readiness opened `Blocked`; Platform reported one observed and seven blocked surfaces.
- Vercel runtime error scan for the new production deployment returned zero error entries in the reviewed window.
- No save, download, refresh action, mutation, or consequential control was invoked.

## Review isolation and preservation

- Independent worktree: `C:\Users\andre\.codex\worktrees\rateware-p1-aggregate-20260820-192451-772e0c6a`.
- Worktree HEAD: exact reviewed SHA; detached and clean with zero staged, unstaged, or untracked entries.
- The primary checkout remained at `d33e30f131762958c25485d7623fb31cebbc516f` on `codex/phase-0-1-action-contract`; its original 25-path dirty set was preserved exactly.
- No candidate/controller source edit, push, PR mutation, deployment, promotion, Supabase/Kinde change, or production-data write occurred during the independent review.

## Required unblock

Reconcile the 24-version authoritative migration-history gap through a separately reviewed and authorized workflow, then obtain a green Supabase check on the exact release SHA. Until then, retain P1 at 55% while unrelated isolated development continues.
