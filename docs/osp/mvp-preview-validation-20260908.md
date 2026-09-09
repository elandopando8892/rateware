# MVP notice release evidence — 2026-09-08

- UI source c9830cb; private branch pushed. Read-only inventory correction 75c3b2c pushed separately; not deployed.
- Vitest completed session 20969: 41 files passed, one skipped; 489 tests passed, four skipped. TypeScript and Vite build passed.
- Additional boundary suite initially failed: unregistered notice import/inventory and stale PipelineOverview/CorporateProfileWorkspace fingerprints. Reviewed prior changes 087c060, e14dddd, 6e16817; reconciled inventory and added a strict no-call/no-action rule for the notice. Final boundary suite: 40 passed.
- Preview dpl_GixuGvWr8U5HEeiDxGsgM71nx5KZ built READY on the existing project. Generated URL: https://osp-customer-setup-2fhwrc8ju-elandopando8892s-projects.vercel.app.
- Browser smoke did NOT pass: empty app accessibility tree at the generated origin and approved preview alias. Authentication and notice visibility remain unproven. Cause not established; do not promote.
- Restored approved preview alias `osp-customer-setup-closeout-b8fc6fb-elandopando8892s-projects.vercel.app` to prior `osp-customer-setup-164g0xtee-elandopando8892s-projects.vercel.app`; Vercel CLI confirmed assignment. Post-rollback browser verification pending.
- No production promotion, Supabase mutation, signature, email, webhook or historical case modification.

## Recovery verified

- Preview environment inventory lacked `VITE_OSP_PREVIEW_ORIGIN`; runtime.ts rejects a live preview without its exact approved origin before React mounts. Rebuilt 75c3b2c with only that build-time origin override, preserving domain validation and existing Supabase authentication.
- New deployment `dpl_CnHSRnAT57rnFZuBAxoz9KCFo7SH` READY, generated URL https://osp-customer-setup-d2moaw2z1-elandopando8892s-projects.vercel.app. Approved preview alias now points to it. Previous deployment remains available for rollback.
- Runtime configuration suite: 28 passed.
- In-app browser tab 16 rendered the real Crane case under existing `sales@heymarksman.com` / OSP ADMINISTRATOR session. MVP acknowledgement visible, case version 2 AWAITING CLARIFICATION, four open decisions, Save revised review disabled, entity binding disabled, profile unbound and draft unassembled. No buttons clicked or data saved during this smoke.
- This proves authenticated read-only notice rendering, not full-original Crane coverage or package acceptance. UI still shows the controlled QF147 canary with one message/two documents, not the original six-form request and amendment.

Next: reconcile complete original request coverage and remaining artifact acceptance; no promotion based solely on this smoke. This is not OSP closure evidence.
