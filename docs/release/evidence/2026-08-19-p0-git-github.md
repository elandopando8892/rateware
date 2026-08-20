# P0 Git and GitHub Release Baseline

**Collected:** 2026-08-19T23:32:59.1811035-06:00 (America/Mexico_City)
**Repository:** `elandopando8892/rateware`
**Live `origin/main`:** `c5200a39b175729ae2ed63c68d83f5f5bc76e674`

## Collection and isolation

The release controller had already created this linked worktree from live `origin/main` and cherry-picked the approved P0 documentation. Per the binding ruling, it was documented rather than recreated. No checkout, branch, remote configuration, remote ref, PR, deployment, secret, or production state was written.

Exact collection commands (PowerShell):

```powershell
git -C 'C:\Users\andre\OneDrive\Documents\Rateware' rev-parse --show-toplevel
git -C 'C:\Users\andre\OneDrive\Documents\Rateware' status --short
git -C 'C:\Users\andre\OneDrive\Documents\Rateware' worktree list --porcelain
Test-Path 'C:\Users\andre\OneDrive\Documents\Rateware_P0_Release_Baseline'
git rev-parse --git-dir
git rev-parse --git-common-dir
git branch --show-current
git rev-parse --show-superproject-working-tree
git rev-parse HEAD
git rev-parse origin/main
git merge-base HEAD origin/main
git ls-remote origin refs/heads/main
git branch -a --no-color
git worktree list --porcelain
git for-each-ref --format='%(refname:short)|%(objectname)|%(committerdate:iso8601)' refs/heads refs/remotes/origin
gh auth status
gh pr list --repo elandopando8892/rateware --state open --limit 100 --json number,title,isDraft,headRefName,headRefOid,baseRefName,baseRefOid,mergeable,reviewDecision,statusCheckRollup,url
gh pr view <each live open number> --repo elandopando8892/rateware --json number,title,state,isDraft,headRefName,headRefOid,baseRefName,baseRefOid,mergeable,reviewDecision,statusCheckRollup,commits,files,url
```

The GitHub CLI session authenticated as `elandopando8892`; all 33 numbers returned by the live list were then viewed successfully. The isolated worktree reports `git-dir` `C:/Users/andre/OneDrive/Documents/Rateware/.git/worktrees/Rateware_P0_Release_Baseline`, common dir `C:/Users/andre/OneDrive/Documents/Rateware/.git`, branch `codex/p0-release-baseline`, and no superproject: it is a linked worktree, not a submodule.

`HEAD` is `96db8d597d7d29d07791189d93aa4a233398050d`; its `origin/main` and merge-base are both `c5200a39b175729ae2ed63c68d83f5f5bc76e674`. `git ls-remote` returned that same SHA for the live main branch. The isolated worktree was clean before these two documentation changes.

## Primary checkout preservation

Primary path: `C:\Users\andre\OneDrive\Documents\Rateware`, on `codex/phase-0-1-action-contract` at `d33e30f131762958c25485d7623fb31cebbc516f`.

It had 12 modified paths and 13 untracked paths at collection, including action-contract sources/tests, RFX files, migrations, Agentic MarkOS files, and `.superpowers/`. Those paths are concurrent work, not P0 baseline input. They were neither staged nor edited by this task.

## Complete local worktree table

Path key: `D/` is `C:/Users/andre/OneDrive/Documents/`; `U/` is `C:/Users/andre/`; `F/` is `C:/Users/andre/Freight Cost Model/`; `T/` is `C:/Users/andre/AppData/Local/Temp/`. `DETACHED` means no local branch is checked out.

| Path | Branch | HEAD |
|---|---|---|
| `D/Rateware` | `codex/phase-0-1-action-contract` | `d33e30f131762958c25485d7623fb31cebbc516f` |
| `T/Rateware_UX0_PR24_Responsive` | `codex/ux0-pr24-responsive` | `18c540ddfd4cc70c51994e0d001aea4cb8318409` |
| `F/rateware-fcm-gmail` | `codex/fcm-gmail-receiver` | `e3c832323c57e585269c8f0a3310f039d98f8501` |
| `F/rateware-fcm-gmail-current` | `codex/fcm-gmail-receiver-current` | `452cdb545bd51365e8fb759fa6b62b904f649302` |
| `D/Rateware_ActionContract_Discovery_Baseline_Hotfix` | `codex/action-contract-discovery-baseline-hotfix` | `2cfb461c5ce5e7c8b699424471062f991dc27b37` |
| `D/Rateware_Clean_Replay_Vendor_Batching` | `main` | `4742cce9a74c41cc76e4dd189f5ac66bd5bfae67` |
| `D/Rateware_Hotfix_Canonical_Commercial_Models` | `codex/hotfix-canonical-commercial-models` | `92a5626550c9f3d91856abacf641d3613c234478` |
| `D/Rateware_P0_Release_Baseline` | `codex/p0-release-baseline` | `96db8d597d7d29d07791189d93aa4a233398050d` |
| `D/Rateware_Phase0_1_Eighteenth_Review` | `DETACHED` | `11bb58be7b10f7b0dc497c90135f39f8967d54ad` |
| `D/Rateware_Phase0_1_Eighth_Review` | `DETACHED` | `db78335de49feac36d4f87008d35739927be3d27` |
| `D/Rateware_Phase0_1_Eleventh_Review` | `DETACHED` | `cc9774a6d2cc6a8c5dfdb3df5285217b8f454199` |
| `D/Rateware_Phase0_1_Fifteenth_Review` | `DETACHED` | `4ec8c2412cc98516ba668e02fe28197f5f8fe7dc` |
| `D/Rateware_Phase0_1_Fifth_Review` | `DETACHED` | `9e5aad9591e29b2cd97a5a9b729e3dce12d1c22c` |
| `D/Rateware_Phase0_1_Fourteenth_Review` | `DETACHED` | `9efea4d106125806efa53ee29e8323105d9df441` |
| `D/Rateware_Phase0_1_Fourth_Review` | `DETACHED` | `469be2b3571c052a33ae294708a3b6103b70a971` |
| `D/Rateware_Phase0_1_H07_Review` | `DETACHED` | `df6fb5f09a3693e7e28264a4192d38dec7d98bfc` |
| `D/Rateware_Phase0_1_Hardening` | `codex/phase-0-1-hardening` | `a6e1f3aca7281263aa9b6bca9fb690f45bd46fc6` |
| `D/Rateware_Phase0_1_Nineteenth_Review` | `DETACHED` | `851a3732b86df6e75abefb8990faa7c49b3a8a04` |
| `D/Rateware_Phase0_1_Ninth_Review` | `DETACHED` | `ce27cbb026fad4167addfe9cd441b5b247818dc6` |
| `D/Rateware_Phase0_1_Seventeenth_Review` | `DETACHED` | `21e572072eea1d3835c1d151e2c13869129d2abb` |
| `D/Rateware_Phase0_1_Seventh_Review` | `DETACHED` | `88cb5191d060696c178321acddb3704630582b25` |
| `D/Rateware_Phase0_1_Sixteenth_Review` | `DETACHED` | `8f42c6ff94d0be3364cc373f65310b475d9352d3` |
| `D/Rateware_Phase0_1_Sixth_Review` | `DETACHED` | `de1a01b540b4ac2970a7a5208386a8faf41c1096` |
| `D/Rateware_Phase0_1_Tenth_Review` | `DETACHED` | `5ebffa139e2bacb9a7c4d5ac7f297101cabea751` |
| `D/Rateware_Phase0_1_Third_Hardening` | `codex/phase-0-1-third-hardening` | `df6fb5f09a3693e7e28264a4192d38dec7d98bfc` |
| `D/Rateware_Phase0_1_Third_Review` | `DETACHED` | `a6e1f3aca7281263aa9b6bca9fb690f45bd46fc6` |
| `D/Rateware_Phase0_1_Thirteenth_Review` | `DETACHED` | `8661d39bd6f192accb0bea57396ff484de23a722` |
| `D/Rateware_Phase0_1_Twelfth_Review` | `DETACHED` | `a8114ef2d969de9577a94b8e5b03ab75887121db` |
| `D/Rateware_Phase0_1_Twentieth_Review` | `DETACHED` | `64f010e0ba5a3ad8a5963442e4952f3252649d1c` |
| `D/Rateware_Phase0_2_First_Review` | `DETACHED` | `b59d902c021495b367a14df7ec1c5784e559d9ec` |
| `D/Rateware_Phase0_2_Independent_Review` | `DETACHED` | `c1b87a86236228a83ac61c6afa6c7748db770db4` |
| `D/Rateware_Phase0_2_Runtime_Enforcement` | `codex/phase-0-2-runtime-enforcement` | `2c5c02336f2156e96ed4ff75d2ae3e853c27ef2b` |
| `D/Rateware_Phase0_2_Second_Independent_Review` | `DETACHED` | `7ccf42d199589cdee4afb07dd7c33d2079c407fd` |
| `D/Rateware_Phase0_2_Tenant_Identity` | `codex/phase-0-2-tenant-identity` | `7ccf42d199589cdee4afb07dd7c33d2079c407fd` |
| `D/Rateware_Phase0_2B_Runtime_Independent_Review` | `DETACHED` | `eb89d7219740da2309050e6e5546d85ec7e27296` |
| `D/Rateware_Phase0_2B_Runtime_Second_Independent_Review` | `DETACHED` | `3e6909a87d89d86af3633c0546ca2d00ee905a22` |
| `D/Rateware_Phase0_2C_Shadow_Hardening` | `codex/phase-0-2c-shadow-hardening` | `96f71ed78e73c6c1c46570a7d8bcd8cf62c9650e` |
| `D/Rateware_Phase0_2D_AllIn_Hotfix` | `codex/hotfix-preserve-all-in-smoke` | `34b660cd2fd4f7a970721577d494d7902b7fe22a` |
| `D/Rateware_Phase0_2E_Shadow_Readiness` | `codex/phase-0-2e-shadow-readiness` | `36c8a42d810ae44cd392619688ff1b4ee00a347c` |
| `D/Rateware_Platform55_Parity_Sprint0` | `codex/platform55-parity-sprint0` | `dd318f594f5f7b8f75103104d8bb0fdf7c170dbc` |
| `D/Rateware_Platform55_Sprint10_PlatformReadiness` | `codex/platform55-platform-readiness-sprint10` | `4765c38343aa0528ba7602ef2c770c9a7f204e47` |
| `D/Rateware_Platform55_Sprint1_SharedShell` | `codex/platform55-shared-shell-sprint1` | `bd0bc7d6d74b8cd4e53ab856f15ad69b20d62325` |
| `D/Rateware_Platform55_Sprint2_OperatorHome` | `codex/platform55-operator-home-sprint2` | `67735a448e686a7aa409c676784c7c22ffe8e38d` |
| `D/Rateware_Platform55_Sprint3_GovernedRateIntake` | `codex/platform55-governed-rate-intake-sprint3` | `484516fdd145a77a66ff5fc7b32f54e275661e67` |
| `D/Rateware_Platform55_Sprint4_ProcurementExecution` | `codex/platform55-procurement-execution-sprint4` | `06d57c5b66fc217db1e7973c0d042500781fe901` |
| `D/Rateware_Platform55_Sprint5_CommercialNetwork` | `codex/platform55-commercial-network-sprint5` | `e7c0f657299eb0bc48e1640c91ae129fd0e3bafc` |
| `D/Rateware_Platform55_Sprint6_OperationsHandoff` | `codex/platform55-operations-handoff-sprint6` | `b19af32b6d87e3f1444e90bcb10245754070bf7a` |
| `D/Rateware_Platform55_Sprint7_FinanceHandoff` | `codex/platform55-finance-handoff-sprint7` | `05ae2a562bcad94757f335727d1ecf92ab500aeb` |
| `D/Rateware_Platform55_Sprint8_IntelligenceBrief` | `codex/pr35-main-integration` | `42381154d335eb007a977070a3f1b078c71135f8` |
| `D/Rateware_Platform55_Sprint9_AdminGovernance` | `codex/platform55-admin-governance-sprint9` | `c582526066fbc4f6e007039f267a316d8266c0fc` |
| `D/Rateware_PR11_Sprint1_Review` | `DETACHED` | `bd0bc7d6d74b8cd4e53ab856f15ad69b20d62325` |
| `D/Rateware_PR12_IndependentReview` | `DETACHED` | `67735a448e686a7aa409c676784c7c22ffe8e38d` |
| `D/Rateware_PR13_IndependentReview` | `DETACHED` | `6d19210113895515ff2788b668202d417f3a3349` |
| `D/Rateware_PR13_IndependentReview_Fix` | `DETACHED` | `484516fdd145a77a66ff5fc7b32f54e275661e67` |
| `D/Rateware_PR14_Independent_Review` | `DETACHED` | `06d57c5b66fc217db1e7973c0d042500781fe901` |
| `D/Rateware_PR15_Independent_Review` | `DETACHED` | `e7c0f657299eb0bc48e1640c91ae129fd0e3bafc` |
| `D/Rateware_PR24_Independent_Review` | `DETACHED` | `d13143bcd114814f12f295f1beea2562d82d1b38` |
| `D/Rateware_PR24_Main_Integration` | `DETACHED` | `e2fa42aef4ed69d68210f2df18165532e7e05fe4` |
| `D/Rateware_PR24_Second_Independent_Review` | `DETACHED` | `4629a4d4f3dac3e27fda88c1d86ef00a0659bdbe` |
| `D/Rateware_PR24_Third_Independent_Review` | `DETACHED` | `05ae2a562bcad94757f335727d1ecf92ab500aeb` |
| `D/Rateware_PR35_Independent_Final` | `DETACHED` | `ee5419ba27c6c9245a7f7356a423b77e2e941017` |
| `D/Rateware_PR35_Independent_Second_30e9ff2` | `DETACHED` | `30e9ff272d1532d02fdcd28272cc7408085cc4a7` |
| `D/Rateware_PR35_Independent_Third_e39b651` | `DETACHED` | `e39b6512fccaaff76cd099bc27fc16ed8e1efc47` |
| `D/Rateware_PR35_Main_Integration` | `DETACHED` | `ae64862f3c26ce849daa914799cbbb964895ec08` |
| `D/Rateware_PR37_Stack_Integration` | `DETACHED` | `5357cd2cd22bd88acdb1b5bf21fe5a00fcb0b690` |
| `D/Rateware_PR39_Final_Review` | `DETACHED` | `4765c38343aa0528ba7602ef2c770c9a7f204e47` |
| `D/Rateware_PR39_Stack_Integration` | `DETACHED` | `46f5e80ff7c914c3ae4a0922c840364fbf8a052d` |
| `D/Rateware_PR58_Independent_Review` | `DETACHED` | `2cfb461c5ce5e7c8b699424471062f991dc27b37` |
| `D/Rateware_PR5_Rebased_Final_Independent_Review` | `DETACHED` | `2c5c02336f2156e96ed4ff75d2ae3e853c27ef2b` |
| `D/Rateware_PR6_Independent_Final_Review` | `DETACHED` | `626fa5bf7d721a26a2815b7d695c9f8c2b393cc5` |
| `D/Rateware_PR7_Fifth_Final_Review` | `DETACHED` | `3770cf2350f1d76e90aa973d39d8f8c7d2120c56` |
| `D/Rateware_PR7_Final_Independent_Review` | `DETACHED` | `c4477375f600fb59958bb34886dec744a629b831` |
| `D/Rateware_PR7_Fourth_Final_Review` | `DETACHED` | `28ab66075935d17725d91279a4752ca984b73fce` |
| `D/Rateware_PR7_Multi_Service_Final_Review` | `DETACHED` | `96f71ed78e73c6c1c46570a7d8bcd8cf62c9650e` |
| `D/Rateware_PR7_Second_Final_Independent_Review` | `DETACHED` | `4b01052700a43c80c4299dd59f51058ff20c9ded` |
| `D/Rateware_PR7_Structured_Service_Final_Review` | `DETACHED` | `df45e24acf21ff676e7b5a55dbc45645697432a4` |
| `D/Rateware_PR7_Third_Final_Independent_Review` | `DETACHED` | `8618a016377d2f1477fdb05e2bd4527afc4bd80d` |
| `D/Rateware_PR8_Final_Independent_Review_34b660c` | `DETACHED` | `34b660cd2fd4f7a970721577d494d7902b7fe22a` |
| `D/Rateware_PR8_Independent_Review` | `DETACHED` | `58c99e786a0a9320dc8a16cc3ade59bd94d544ef` |
| `U/rateware-baseline-main` | `DETACHED` | `c5200a39b175729ae2ed63c68d83f5f5bc76e674` |
| `U/rateware-onboarding` | `feat/provider-service-onboarding-production` | `bfe181e08252c6c9e595be8d7bc0bb532765dd3b` |

## Open GitHub PR table

All listed PRs are open drafts, have no recorded review decision, and were returned by the live API. Check summaries are from the live `statusCheckRollup`; `S` is successful, `F` failed, and `K` skipped. Each row was separately inspected with `gh pr view`, including commits and changed-file metadata.

| PR | Base SHA <- head SHA | Review / mergeability | Checks | Scope owner |
|---|---|---|---|---|
| #9 | `main@c5200a39b175729ae2ed63c68d83f5f5bc76e674 <- codex/phase-0-2e-shadow-readiness@36c8a42d810ae44cd392619688ff1b4ee00a347c` | draft, no decision, MERGEABLE | replay S; preview K; Vercel S | Phase 0.2E (excluded) |
| #18 | `provider-service-build1-20260813@50b0326168d87dd21dc22f20d339893d93fb441a <- provider-service-build2-activation-engine@2c25cd7abe1b5ad62c8c075513890a03c9f0a4ca` | draft, no decision, MERGEABLE | preview K; Vercel S | Provider Service (excluded) |
| #20 | `provider-service-build2-activation-engine@2c25cd7abe1b5ad62c8c075513890a03c9f0a4ca <- provider-service-build3-document-registry@6f71c2cdde997195f24203aaf1c61f2542916939` | draft, no decision, MERGEABLE | preview K; Vercel S | Provider Service (excluded) |
| #22 | `provider-service-build3-document-registry@6f71c2cdde997195f24203aaf1c61f2542916939 <- provider-service-build4-cases@287a2101d9f9fbf48861fde517566fb8a91d1a16` | draft, no decision, MERGEABLE | preview K; Vercel S | Provider Service (excluded) |
| #25 | `provider-service-build4-cases@287a2101d9f9fbf48861fde517566fb8a91d1a16 <- provider-service-build5-communications@c7d4f5c28543be611fd3713793abd6836cf63ed0` | draft, no decision, MERGEABLE | preview K; Vercel S | Provider Service (excluded) |
| #26 | `provider-service-build5-communications@c7d4f5c28543be611fd3713793abd6836cf63ed0 <- provider-service-build6-agent-core@46cd96654c46f16db7c92cf9f7c524a8b03c5609` | draft, no decision, MERGEABLE | preview K; Vercel S | Provider Service (excluded) |
| #27 | `provider-service-build6-agent-core@46cd96654c46f16db7c92cf9f7c524a8b03c5609 <- provider-service-build7-approvals-signatures@cf69fb118dd83a48aa532df1d9dcbedd1c65772b` | draft, no decision, MERGEABLE | preview K; Vercel F | Provider Service (excluded) |
| #28 | `provider-service-build7-approvals-signatures@cf69fb118dd83a48aa532df1d9dcbedd1c65772b <- provider-service-build8-portal-foundation@f899c8b9410f9235f9e15b9c5ee0deec89a2254a` | draft, no decision, MERGEABLE | preview K; Vercel F | Provider Service (excluded) |
| #29 | `provider-service-build8-portal-foundation@f899c8b9410f9235f9e15b9c5ee0deec89a2254a <- provider-service-build9-native-compliance@1c4d7b582021eb107bf931865b7ac5955061178c` | draft, no decision, MERGEABLE | preview K; Vercel F | Provider Service (excluded) |
| #30 | `provider-service-build9-native-compliance@1c4d7b582021eb107bf931865b7ac5955061178c <- provider-service-build10@f5bc7ef3e59b42887065774280ccc5614b8bcfd4` | draft, no decision, MERGEABLE | preview K; Vercel S | Provider Service (excluded) |
| #31 | `provider-service-build10@f5bc7ef3e59b42887065774280ccc5614b8bcfd4 <- provider-service-build11-provider-360-ui@2d3ee1950915ec05d2085e443b4dc1c6685a1e24` | draft, no decision, MERGEABLE | preview K; Vercel F | Provider Service (excluded) |
| #32 | `provider-service-build11-provider-360-ui@2d3ee1950915ec05d2085e443b4dc1c6685a1e24 <- provider-service-build12-health-intelligence@59977ee5361a56a2608af9105036d92bdb273a56` | draft, no decision, MERGEABLE | preview K; Vercel F | Provider Service (excluded) |
| #33 | `main@d1bab3b2aa84a91cb17fd1b6a2514d96e044b76b <- hardening-clean-migration-replay@0da39e2792b693262ceb62c4e88f2d5f662524de` | draft, no decision, CONFLICTING | replay S; preview K; Vercel S | Hardening (excluded) |
| #35 | `main@c5200a39b175729ae2ed63c68d83f5f5bc76e674 <- codex/platform55-intelligence-brief-sprint8@42381154d335eb007a977070a3f1b078c71135f8` | draft, no decision, MERGEABLE | replay S; preview K; Vercel S | Platform 55 core |
| #36 | `provider-service-convergence-hardening@d0ab02225fec0dfc5bfe96127fe20f30be2d8ef2 <- provider-service-build14-rateware-ui@a8f57ddea5d39087026dfd320a8b9f71f5cba861` | draft, no decision, MERGEABLE | replay S; preview K; Vercel F | Provider Service (excluded) |
| #37 | `codex/platform55-intelligence-brief-sprint8@ee5419ba27c6c9245a7f7356a423b77e2e941017 <- codex/platform55-admin-governance-sprint9@5357cd2cd22bd88acdb1b5bf21fe5a00fcb0b690` | draft, no decision, CONFLICTING | preview K; Vercel F | Platform 55 core |
| #38 | `provider-service-build14-rateware-ui@a8f57ddea5d39087026dfd320a8b9f71f5cba861 <- provider-service-build15-communications-inbox@ab03173f6f33ee904088680f9a903acbec9aea75` | draft, no decision, MERGEABLE | replay S; preview K; Vercel S | Provider Service (excluded) |
| #39 | `codex/platform55-admin-governance-sprint9@5357cd2cd22bd88acdb1b5bf21fe5a00fcb0b690 <- codex/platform55-platform-readiness-sprint10@46f5e80ff7c914c3ae4a0922c840364fbf8a052d` | draft, no decision, MERGEABLE | preview K; Vercel F | Platform 55 core |
| #41 | `provider-service-build15-communications-inbox@ab03173f6f33ee904088680f9a903acbec9aea75 <- provider-service-build16-gmail-intake@db79c4bc1fbe4846c680a2a6b6ca55330b700cc2` | draft, no decision, MERGEABLE | replay S; preview K; Vercel F | Provider Service (excluded) |
| #42 | `provider-service-build16-gmail-intake@db79c4bc1fbe4846c680a2a6b6ca55330b700cc2 <- provider-service-build17-pubsub-inbound@e1c840d565bf9220b988d256dc5d2caa620f89d9` | draft, no decision, MERGEABLE | replay S; preview K; Vercel S | Provider Service (excluded) |
| #43 | `provider-service-build17-pubsub-inbound@e1c840d565bf9220b988d256dc5d2caa620f89d9 <- provider-service-build18-entity-vault@69c68391197b2ea15e7ed65c6a02ba92dfcadc2a` | draft, no decision, MERGEABLE | replay S; preview K; Vercel S | Provider Service (excluded) |
| #44 | `provider-service-build18-entity-vault@69c68391197b2ea15e7ed65c6a02ba92dfcadc2a <- provider-service-build19-private-document-ingestion@0ce92473ece3d92113e3884f43d49148e42c9f51` | draft, no decision, MERGEABLE | replay S; preview K; Vercel S | Provider Service (excluded) |
| #45 | `provider-service-build19-private-document-ingestion@0ce92473ece3d92113e3884f43d49148e42c9f51 <- provider-service-build20-bounded-upload-orchestration@f65cdd2630624b15214998cf367e5539409839a1` | draft, no decision, MERGEABLE | replay S; preview K; Vercel S | Provider Service (excluded) |
| #46 | `provider-service-build20-bounded-upload-orchestration@f65cdd2630624b15214998cf367e5539409839a1 <- provider-service-build21-scan-hash-classification@c585696689ad93fcbcc96cd35e298ee6ffda92ee` | draft, no decision, MERGEABLE | replay S; preview K; Vercel S | Provider Service (excluded) |
| #47 | `provider-service-build21-scan-hash-classification@c585696689ad93fcbcc96cd35e298ee6ffda92ee <- provider-service-build22-human-document-review@bde6d8eab4b5079bbdb1d3ee695ce5ac5f1b6a08` | draft, no decision, MERGEABLE | replay S; preview K; Vercel S | Provider Service (excluded) |
| #48 | `provider-service-build22-human-document-review@bde6d8eab4b5079bbdb1d3ee695ce5ac5f1b6a08 <- provider-service-build23-review-decision-commands@41253db810983f34874c47b79902b0f526c1c07d` | draft, no decision, MERGEABLE | replay S; preview K; Vercel S | Provider Service (excluded) |
| #49 | `provider-service-build23-review-decision-commands@41253db810983f34874c47b79902b0f526c1c07d <- provider-service-build24-reviewed-fact-promotion@abd93b8a362aa6bcfb8bc77dd6cf2ebc32d05575` | draft, no decision, MERGEABLE | replay S; preview K; Vercel F | Provider Service (excluded) |
| #50 | `provider-service-build24-reviewed-fact-promotion@abd93b8a362aa6bcfb8bc77dd6cf2ebc32d05575 <- provider-service-build25-onboarding-readiness@3ca8f897a966830af9ffd4189284b3d473270b15` | draft, no decision, MERGEABLE | replay S; preview K; Vercel F | Provider Service (excluded) |
| #51 | `provider-service-build25-onboarding-readiness@3ca8f897a966830af9ffd4189284b3d473270b15 <- provider-service-build26-onboarding-case-workflow@c0c1c05d904bae05b7823b2e877b3a5d8af2f061` | draft, no decision, MERGEABLE | replay S; preview K; Vercel F | Provider Service (excluded) |
| #52 | `provider-service-build26-onboarding-case-workflow@c0c1c05d904bae05b7823b2e877b3a5d8af2f061 <- provider-service-build27-controlled-release-package@79d28af56bbbb05bea7a982b46df88b30b6e6a22` | draft, no decision, MERGEABLE | replay S; preview K; Vercel F | Provider Service (excluded) |
| #53 | `provider-service-build27-controlled-release-package@79d28af56bbbb05bea7a982b46df88b30b6e6a22 <- provider-service-build28-form-assembly-signature-consent@48e8ab590a5973a7e180ef3c7bc6992d0c873467` | draft, no decision, MERGEABLE | replay S; preview K; Vercel S | Provider Service (excluded) |
| #54 | `provider-service-build28-form-assembly-signature-consent@48e8ab590a5973a7e180ef3c7bc6992d0c873467 <- provider-service-build29-gmail-delivery-followup@079e0d4dd200c9f76b011fe4857683a7a1659f1c` | draft, no decision, MERGEABLE | replay S; preview K; Vercel S | Provider Service (excluded) |
| #55 | `provider-service-build29-gmail-delivery-followup@079e0d4dd200c9f76b011fe4857683a7a1659f1c <- provider-service-build30-rateware-onboarding-ui@1f55f7cfff5f09c03cb8df6cf5a32703ddc5679f` | draft, no decision, MERGEABLE | replay S; preview K; Vercel S | Provider Service (excluded) |

## Immutable release queue

No merge, ready-for-review change, or deployment is authorized by this inventory. The human release controller owns every transition; branch naming identifies code ownership only and is not a substitute for an approved owner.

| Order | Scope / exact candidate | Dependency and state | Required owner action |
|---|---|---|---|
| 0 | P0 baseline: `origin/main@c5200a3`; baseline docs at `96db8d5` | Immutable inventory point | Keep this SHA as the comparison base. |
| 1 | Platform 55 P0-P7 local heads: `dd318f5`, `bd0bc7d`, `67735a4`, `484516f`, `06d57c5`, `e7c0f65`, `b19af32`, `05ae2a5` | No corresponding open PR was returned live; detached review worktrees exist for S1-S7. | Reconcile each candidate against live main and establish a reviewed, authorized PR sequence. |
| 2 | Platform 55 Sprint 8 / PR #35: `42381154d335eb007a977070a3f1b078c71135f8` | Draft, mergeable, main-based, no review decision; recorded checks are replay S, preview K, Vercel S. | Human review and explicit ready/merge authorization only after the preceding sequence is reconciled. |
| 3 | Platform 55 Sprint 9 / PR #37: live head `5357cd2cd22bd88acdb1b5bf21fe5a00fcb0b690` | Draft, conflicting, based on PR #35 branch at `ee5419b`; local Sprint 9 head differs (`c582526`). | Rebase/reconcile only under an approved change; rerun checks and independent review. |
| 4 | Platform 55 Sprint 10 / PR #39: live head `46f5e80ff7c914c3ae4a0922c840364fbf8a052d` | Draft, mergeable but depends on #37's head; Vercel failed and preview skipped. | Wait for authorized resolution of #37, then review/check/smoke in sequence. |

## Explicit post-core exclusions

- Phase 0.2E is PR #9 (`36c8a42`), a separate draft main-based line; it is not part of the Platform 55 core queue.
- PR #33 is conflicting against obsolete main SHA `d1bab3b`; it is excluded from the current main queue.
- Sprint 11 and Agentic MarkOS appear only as uncommitted primary-checkout work at collection; neither has a P0 release candidate or open PR in the live list.
- Provider Service is its own 30-build draft stack: open PRs #18, #20, #22, #25-32, #36, #38, and #41-55. It is explicitly excluded from the P0 core release queue.
- The dirty primary checkout and all detached audit worktrees are evidence locations, not merge candidates.

## Blockers and limitations

1. The primary checkout is dirty and must remain isolated from all P0 commits.
2. Platform 55 P0-P7 have local candidates but no live open PRs returned by this collection; their relationship to the live #35/#37/#39 stack must be reconciled before any release decision.
3. PR #37 is conflicting; PR #39 depends on it. Both #37 and #39 report a failed Vercel status and skipped Supabase Preview. A previous successful preview is not current release proof.
4. PR #35 is draft with no review decision. Its successful checks are historical PR evidence, not production evidence.
5. The full GitHub table records 33 open drafts and their current API state only. It does not assert production deployment, approval, or merge eligibility.
6. A post-collection self-review observed the unrelated `U/rateware-onboarding` worktree advance from the recorded snapshot SHA `bfe181e08252c6c9e595be8d7bc0bb532765dd3b` to `fb60d1a491b84a23df6c65e1d09dda3448a86cb4`. The table intentionally preserves the timestamped collection snapshot; this concurrent movement is not a P0 change.
