# Provider Onboarding production rollout

## Preconditions

1. Review the cumulative stack and promote it in order: Build 17 PR #42 through Build 30 PR #55, then Build 31.
2. Re-run `clean-migration-replay` on the exact cumulative head.
3. Confirm production backups, migration owner, application owner, security owner, Gmail owner, pilot owner, and rollback owner.
4. Confirm the private `provider-entity-vault` bucket and service-role-only read models.
5. Configure secret values only in the production secret store:
   - `GMAIL_TOKEN_ENCRYPTION_KEY`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `PROVIDER_GMAIL_ALLOWED_ACCOUNT`
   - `PROVIDER_GMAIL_PUBSUB_AUDIENCE`
   - `PROVIDER_GMAIL_PUBSUB_SERVICE_ACCOUNT`
   - `RATEWARE_SUPABASE_SERVICE_ROLE_KEY`
6. Confirm Google OAuth redirect, Pub/Sub topic/subscription, exact OIDC audience, exact service-account email, and mailbox ownership.
7. Keep `release_enabled=false` until the private canary is ready.

## Dry run

Run the synthetic fixture and the release validator. Verify all UI surfaces with no production document, signature, or outbound send.

## Private canary

1. Enable `private_canary` for one XBF legal entity only.
2. Ingest the supplied XBF files through the bounded private-vault upload; never add them to GitHub or browser storage.
3. Classify and scan each asset; verify content hashes and quarantine any mismatch.
4. Complete human field/document review and promote only approved facts.
5. Evaluate readiness and open one onboarding case.
6. Create the exact release manifest and obtain required separated human approvals.
7. Register the JAGP signature PNG as a verified private signature asset. Do not use it until the signer provides explicit package-scoped, recipient-scoped, purpose-scoped, expiring, single-use consent.
8. Assemble the private output; verify package, template, input/output hashes and size.
9. Draft one Gmail message. Verify mailbox, recipient domain, exact package, attachment hash and human approver.
10. Send only after the designated human presses the final controlled action.
11. Disable automatic follow-ups during canary and confirm the Gmail thread manually.
12. Verify the case timeline, immutable events, audit IDs, and Rateware Onboarding workspace.

## Acceptance

- no cross-tenant or cross-entity reads;
- no sensitive value in logs, UI summaries, GitHub, Vercel artifacts, or email metadata beyond the approved recipient;
- every stage matches the exact case, package, manifest, revision, actor, and expiry;
- Gmail message/thread IDs persisted;
- no duplicate send under repeated idempotency key;
- rollback drill completed.

## Rollback

1. Disable the mailbox policy and release flag.
2. Stop/disable the Pub/Sub subscription and Gmail watch.
3. Revoke pending signature authorizations and release packages.
4. Cancel queued/approved outbound messages; do not delete audit events.
5. Quarantine new vault assets while preserving evidence.
6. Roll back application traffic to the last green deployment.
7. Use the database rollback approved for the exact migration set; never drop evidence or event ledgers.
8. Record incident/reason, affected case IDs, timestamps, owners, and recovery verification.

## Expansion

After the canary remains clean, increase legal entities and messages through a separately reviewed policy change. Never enable autonomous signatures or unrestricted outbound delivery.
