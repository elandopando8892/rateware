# P0 authoritative release baseline

**Decision:** the baseline is complete enough to establish an auditable, non-executing release queue. It is **not authorization to mark a PR ready, merge, deploy, change Supabase, or activate tenant enforcement**. The next production change remains **NO-GO** until the exact gates in this report are met and the release controller receives the required human authorization.

**Recalibrated progress:** **65.8% general; P0 70%**. This score records completed baseline evidence and deterministic repository verification only. It does not count a release, preview smoke, deployment, production smoke, or independent GO review.

## Evidence basis

| Collected | Source | Authoritative use |
| --- | --- | --- |
| 2026-08-19T23:32:59.1811035-06:00 | `docs/release/evidence/2026-08-19-p0-git-github.md` | live `origin/main`, local ownership snapshot, and open-PR state |
| 2026-08-19T23:59:10.3685285-06:00 | `docs/release/evidence/2026-08-19-p0-vercel.md` | stable production deployment and exact preview-to-SHA mappings |
| 2026-08-20T06:18:48.105Z | `docs/release/evidence/2026-08-19-p0-supabase.md` | production project, branches, migrations, functions, and safe tenant posture |

The collection points above are timestamped snapshots. A later release decision must refresh the affected live state; historical checks and previews are not approval or production proof.

## Current production baseline

- Vercel project: `elandopando8892s-projects/rateware` (`prj_69ftWCsXDmSPzWchQWR5FaXxcLYv`).
- Stable alias: `https://rateware.vercel.app`.
- Production deployment: `dpl_9XoGqdPhCx6wovXodxZsjPE21jUn`, `READY`, target `production`, created `2026-08-15T01:52:37-06:00`.
- Production Git SHA: `c5200a39b175729ae2ed63c68d83f5f5bc76e674`; it is a local commit object and an ancestor of live `origin/main` at collection.
- Supabase production: `rateware-prod` (`alqjqzqagdmcywpjtnnr`), `ACTIVE_HEALTHY`, PostgreSQL `17.6.1.127`; 366 applied migrations, maximum `20260820043613 provider_onboarding_redacting_transforms`.

### Deployed component versions

| Component | Version | Updated (UTC) |
| --- | ---: | --- |
| `interpret-upload` | 110 | 2026-08-12T22:52:24.595Z |
| `create-raw-upload` | 66 | 2026-08-12T07:30:39.695Z |
| `rateware-api` | 430 | 2026-08-15T08:04:13.444Z |
| `sync-rateware-catalog` | 69 | 2026-08-12T16:30:41.557Z |
| `rfx-bid-api` | 135 | 2026-08-12T00:29:31.491Z |
| `gmail-oauth-callback` | 60 | 2026-08-01T04:57:33.389Z |
| `google-chat-app` | 52 | 2026-08-01T04:57:43.402Z |
| `carrier-profile-api` | 55 | 2026-08-01T04:57:11.885Z |
| `whatsapp-webhook` | 64 | 2026-08-01T04:58:32.168Z |
| `shipper-profile-api` | 32 | 2026-08-12T16:29:31.353Z |
| `ratebook-carrier-api` | 23 | 2026-08-01T04:57:53.540Z |
| `shipper-directory-api` | 29 | 2026-08-15T06:24:32.448Z |
| `noop` | 19 | 2026-08-07T07:47:49.633Z |
| `sync-banxico-fx` | 15 | 2026-08-09T07:16:48.411Z |
| `provider-gmail-intake-api` | 15 | 2026-08-19T17:27:14.327Z |
| `provider-gmail-oauth-callback` | 10 | 2026-08-15T06:24:32.448Z |
| `provider-gmail-push` | 11 | 2026-08-17T06:01:45.137Z |
| `provider-document-canary-processor` | 9 | 2026-08-15T07:25:30.297Z |
| `provider-release-package-api` | 5 | 2026-08-15T16:53:25.320Z |
| `provider-entity-document-processor` | 10 | 2026-08-19T04:40:01.608Z |

This component inventory is deployment metadata, not an application-behavior smoke or a statement that every function belongs to the core queue.

## Reconciled workstreams

`not captured` means the timestamped evidence did not collect that field; it is deliberately not inferred. `historical READY` means Vercel built the exact SHA but does not prove the current release is reviewed, authorized, or in production.

| Workstream | PR | Base SHA | Head SHA | Review | Preview | Production | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Production baseline | none | `c5200a39b175729ae2ed63c68d83f5f5bc76e674` | `c5200a39b175729ae2ed63c68d83f5f5bc76e674` | not applicable | stable production deployment | `dpl_9XoGqdPhCx6wovXodxZsjPE21jUn` | already production |
| Platform 55 P0 parity | no live PR; historical preview PR #10 | not captured | `dd318f594f5f7b8f75103104d8bb0fdf7c170dbc` | not captured | historical READY, ancestor of main | included in production main history | already production |
| Platform 55 P1 shared shell | no live PR; historical preview PR #11 | not captured | `bd0bc7d6d74b8cd4e53ab856f15ad69b20d62325` | not captured | historical READY, ancestor of main | included in production main history | already production |
| Platform 55 P2 operator home | no live PR; historical preview PR #12 | not captured | `67735a448e686a7aa409c676784c7c22ffe8e38d` | not captured | historical READY, not ancestor of main | not production | release queue |
| Platform 55 P3 governed rate intake | no live PR; historical preview PR #13 | not captured | `484516fdd145a77a66ff5fc7b32f54e275661e67` | not captured | historical READY, not ancestor of main | not production | release queue |
| Platform 55 P4 procurement execution | no live PR; historical preview PR #14 | not captured | `06d57c5b66fc217db1e7973c0d042500781fe901` | not captured | historical READY, not ancestor of main | not production | release queue |
| Platform 55 P5 commercial network | no live PR; historical preview PR #15 | not captured | `e7c0f657299eb0bc48e1640c91ae129fd0e3bafc` | not captured | historical READY, not ancestor of main | not production | release queue |
| Platform 55 P6 operations handoff | no live PR; historical preview PR #40 | not captured | `b19af32b6d87e3f1444e90bcb10245754070bf7a` | not captured | historical READY, not ancestor of main | not production | release queue |
| Platform 55 P7 finance handoff | no live PR; historical preview PR #24 | not captured | `05ae2a562bcad94757f335727d1ecf92ab500aeb` | not captured | historical READY, not ancestor of main | not production | release queue |
| Platform 55 P8 intelligence brief | #35, draft | `c5200a39b175729ae2ed63c68d83f5f5bc76e674` | `42381154d335eb007a977070a3f1b078c71135f8` | no decision | current READY, not ancestor of main | not production | release queue |
| Platform 55 P9 admin governance | #37, draft | `ee5419ba27c6c9245a7f7356a423b77e2e941017` | `5357cd2cd22bd88acdb1b5bf21fe5a00fcb0b690` | no decision | no current preview; Vercel failed | not production | blocked |
| Platform 55 P10 platform readiness | #39, draft | `5357cd2cd22bd88acdb1b5bf21fe5a00fcb0b690` | `46f5e80ff7c914c3ae4a0922c840364fbf8a052d` | no decision | only obsolete READY `4765c38343aa0528ba7602ef2c770c9a7f204e47`; current Vercel failed | not production | blocked |
| Phase 0.2E tenant enforcement (P2) | #9, draft | `c5200a39b175729ae2ed63c68d83f5f5bc76e674` | `36c8a42d810ae44cd392619688ff1b4ee00a347c` | no decision | READY, not ancestor of main | `required` activation NO-GO | blocked |
| Agentic MarkOS / Sprint 11 | no live PR | not captured | not captured | not captured | not captured | not production | post-core |
| Provider Service stack | #18, #20, #22, #25-32, #36, #38, #41-55 (all draft) | `50b0326168d87dd21dc22f20d339893d93fb441a` (stack start) | `1f55f7cfff5f09c03cb8df6cf5a32703ddc5679f` (recorded terminal head) | no decisions | previews are skipped or mixed; not core release proof | production attribution separated; 21 remote-only migrations | post-core |
| Hardening clean migration replay | #33, draft | `d1bab3b2aa84a91cb17fd1b6a2514d96e044b76b` | `0da39e2792b693262ceb62c4e88f2d5f662524de` | no decision | skipped | not production | superseded |

## Ordered Platform 55 core release queue

The queue starts only after reconciliating P2-P7 against the live base and creating a reviewed release sequence. It is not a request to make changes.

1. **P2 operator home** — reconcile `67735a448e686a7aa409c676784c7c22ffe8e38d` with current `main`; create a PR only under approved change control, then run its current checks and independent review.
2. **P3 governed rate intake** — the same sequence for `484516fdd145a77a66ff5fc7b32f54e275661e67`, after P2 is accepted.
3. **P4 procurement execution** — reconcile `06d57c5b66fc217db1e7973c0d042500781fe901` after P3.
4. **P5 commercial network** — reconcile `e7c0f657299eb0bc48e1640c91ae129fd0e3bafc` after P4.
5. **P6 operations handoff** — reconcile `b19af32b6d87e3f1444e90bcb10245754070bf7a` after P5.
6. **P7 finance handoff** — reconcile `05ae2a562bcad94757f335727d1ecf92ab500aeb` after P6.
7. **P8 intelligence brief / #35** — current head `42381154d335eb007a977070a3f1b078c71135f8`; remains draft until the preceding sequence is reconciled and a human accepts independent review and explicitly authorizes Ready/merge.
8. **P9 admin governance / #37** — resolve its conflict and reconcile the mismatch between live head `5357cd2cd22bd88acdb1b5bf21fe5a00fcb0b690` and local Sprint 9 head `c582526066fbc4f6e007039f267a316d8266c0fc`, then regenerate checks, preview, and independent review under authorization.
9. **P10 platform readiness / #39** — only after #37 is resolved; current head `46f5e80ff7c914c3ae4a0922c840364fbf8a052d` requires a current successful build/preview and review. Its older READY SHA `4765c38343aa0528ba7602ef2c770c9a7f204e47` is superseded evidence.

P0 parity and P1 shared shell precede this queue historically but are already in the production main history; they are not merge candidates.

## Separate P2: Phase 0.2E

PR #9 is not in the Platform 55 core sequence. Its `RATEWARE_TENANT_ENFORCEMENT=shadow` value is not independently proven by the collected secret metadata, and the evidence does not establish a continuous pseudonymized 24-hour legitimate-traffic window with zero legitimate shadow rejections. Therefore activation to `required` remains **NO-GO**, even though its historical preview is READY. The canonical aggregate evidence is safe but does not remove this operational gate.

## Post-core streams

- **Agentic MarkOS / Sprint 11:** only uncommitted primary-checkout work was observed; it has no recorded candidate SHA or live PR. It is post-core and cannot enter the core queue from this baseline.
- **Provider Service:** its 30-build draft stack is post-core. Production contains 21 Provider Service migration versions absent from the Rateware Core candidate, so a later Provider Service release must establish independent database ownership, exact per-PR review, and migration attribution before it affects a core release decision.

## Dirty-checkout ownership and preservation

The primary checkout `C:\\Users\\andre\\OneDrive\\Documents\\Rateware` was on `codex/phase-0-1-action-contract` at `d33e30f131762958c25485d7623fb31cebbc516f` during collection, with 12 modified and 13 untracked paths. The paths included action-contract sources/tests, RFX files, migrations, Agentic MarkOS files, and `.superpowers/`; they are concurrent work, not P0 baseline input. The P0 worktree is isolated and neither stages nor edits those paths. Detached review worktrees are evidence locations, not merge candidates. The unrelated `U/rateware-onboarding` worktree advanced after collection; the recorded SHA remains a timestamped snapshot, not a P0 change.

## Blockers and P1 entry criteria

### Blocking facts

1. P2-P7 have local candidate SHAs but no corresponding live open PRs in the collected GitHub inventory.
2. #35 is draft with no accepted independent release verdict; passing historical checks and its READY preview are not human authorization or production proof.
3. #37 is conflicting and has no current preview; #39 depends on #37 and its current head has failed Vercel/has no current successful preview.
4. Phase 0.2E remains NO-GO for `required` enforcement because shadow mode and the 24-hour legitimate-traffic, zero-rejection condition are not independently established.
5. Supabase default branch metadata reports `MIGRATIONS_FAILED` and its only preview reports `CREATING_PROJECT` while preview health says `ACTIVE_HEALTHY`; this must be reconciled before branch metadata is used as release proof.
6. The primary checkout is intentionally dirty and cannot be used as a release source.

### P1 may start only when

1. the P0 candidate receives a detached independent **GO** review with no P0/P1/P2 finding;
2. the reviewer reconfirms ledger gates/arithmetic, the exact production SHA, Vercel mappings, Supabase project and preview count, queue order, redaction, and preservation of the dirty primary checkout;
3. the release controller accepts that refreshed evidence and explicitly authorizes the first bounded P2 reconciliation; and
4. every later Ready, merge, deployment, migration, configuration, or enforcement transition receives its own explicit human authorization.

## Supabase preview-branch cost statement

At collection there was exactly **one** non-default, persistent preview branch: `fcm-gmail-staging` (`kyjdyqayuznhowlpcoab`). The acceptance gate of no more than one paid preview passed. The evidence does not contain a price, so no numeric monthly cost is claimed here. Do not create a second preview branch for this core queue; reuse/reconcile the existing preview only when separately authorized. Its `CREATING_PROJECT` state and the default branch `MIGRATIONS_FAILED` state mean neither branch status is release proof.

## Next exact action

Request the detached, read-only P0 independent review at the immutable candidate after this baseline commit. The reviewer must independently refresh the live GitHub/Vercel/Supabase observations, verify every P0 ledger gate and redaction boundary, and issue a written **GO** or **NO-GO**. No release action follows automatically from that review.

## Zero-external-mutation statement

This report reconciles committed read-only evidence only. It created no GitHub or Vercel object, no deployment, no preview branch, no Supabase branch, no secret or environment change, no DDL/DML, no upload, no approval, and no production change.
