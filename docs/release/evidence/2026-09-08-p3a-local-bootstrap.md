# P3-A: isolated local bootstrap

## Completed development

Prepared a separate local configuration under `.rateware-local/supabase` on D:.
The generator is versioned; generated runtime state is ignored. Project identity
is `rateware-carrier-local-v1`, API port 56431, database port 56432, shadow port
56430. The generator refuses existing targets rather than overwriting state.
It does not copy production credentials, link a hosted project, execute commands,
apply migrations or seed data. Google, Edge Runtime, outbound email registration,
Storage and other unused services remain disabled during bootstrap.

The root Supabase configuration remains unchanged. Its project_id resembles the
production reference (not itself a remote connection), and its configured seed
file is missing. Neither setting is reused by this bootstrap.

## Verification on 2026-09-08

- Branch: `codex/carrier-list-templates`; base HEAD: `fb371b1`.
- `node --test tests/prepare-rateware-local.test.mjs`: 2/2 passed.
- `npm run test:carrier-list-templates`: browser domain passed; Node 8/8;
  Deno 74/74. These are local contracts, not deployed authenticated evidence.
- `npx --yes supabase@2.117.0 --version`: 2.117.0.
- Docker already hosts four `xbf-desk-auth-local-v1` containers. They were not
  stopped, modified or reused. Rateware services were not started in this step.
- D: had approximately 260 GB free. Docker reports about 20.8 GB total memory;
  this is its limit, not available memory. Docker's Windows backing-disk location
  has not yet been verified; only the configuration location is confirmed on D:.
- Requested legacy global AGENTS path was absent; the current codex-home
  AGENTS.md was empty. Repository AGENTS.md was read and followed.

## Next acceptance gates (still pending)

1. Confirm loopback-only published ports and runtime storage location before start.
2. Start the isolated pinned CLI stack and verify service health.
3. Audit/replay repository migrations locally; do not invent missing baseline
   tables or import production data to make migration tests pass.
4. Add synthetic organization A/B and read-only fixtures; configure only required
   functions with external communications disabled.
5. Configure Google OAuth local callback through an approved credential handoff;
   no OAuth credentials or cloud client settings were changed here.
6. Run authenticated local probes, then the browser journey and MARKSMAN evidence.

P3-A remains incomplete. No production release, migration, activation, invitation,
message, new Git branch or paid resource was performed. Cloud acceptance remains
a separate P4 release gate.

CLI workflow reference: https://supabase.com/docs/guides/local-development/cli/getting-started

## Follow-up: first runtime attempt

- Verified WSL registry and actual `docker_data.vhdx` at
  `D:\andre\containers\docker-desktop\DockerDesktopWSL\disk`.
- Docker automatic address pools were exhausted. No existing networks were
  removed. After inspecting Docker subnets and Windows routes, created dedicated
  `rateware-carrier-local-v1`, `10.253.64.0/24`, with default host binding 127.0.0.1.
- Pinned CLI 2.117.0 downloaded PostgreSQL 17.6.1.167 and PostgREST v16.2.
- Actual PostgreSQL publication was **0.0.0.0 and IPv6 wildcard**, overriding the
  bridge default. This failed the isolation gate. The exact Rateware database
  container was immediately stopped and its CLI start process terminated.
  No Rateware migrations, seeds or production credentials had been loaded.
- The CLI also created Auth, REST and Kong during shutdown; Kong likewise used
  wildcard publication. All three were explicitly stopped. Final Docker inventory
  must show only the original other-project services running; no Rateware ports
  56431/56432 may remain listening. No containers or volumes were deleted.
- Added `tools/check-rateware-local.mjs`, which checks required container health,
  loopback bindings and expected database/API endpoints without printing secrets.
  Four bootstrap/verifier tests pass; live readiness remains FAIL.
- Configuration now uses `local_smtp` instead of deprecated `inbucket`.

Next: implement explicit per-container loopback publication using a supported
runtime configuration; do not retry this CLI start command unchanged. Preserve
the stopped local volume for inspection, and do not prune other projects.
This step has **not** produced a running, accepted local environment.

## Follow-up: loopback correction accepted for infrastructure only

The preceding failed attempt remains historical evidence. The next attempt
recreated only DB and Kong using the Docker Engine API, with explicit HostIp
127.0.0.1. Their stopped originals remain as `-pre-loopback` backups. DB retains
the same local volume; Kong's generated local configuration was transferred in
memory, without printing or committing credentials. No containers were deleted.

- `tools/repair-rateware-local-bindings.mjs` rejects running containers and names
  or networks outside this exact bootstrap. It does not start containers.
- Six bootstrap, binding repair and verifier tests passed.
- Started the four exact local Rateware containers using `docker start`, not the
  CLI start command that previously produced wildcard bindings.
- `node tools/check-rateware-local.mjs`: PASS after health checks completed.
- PostgreSQL is published on `127.0.0.1:56432`; Kong on `127.0.0.1:56431`.
- Local SQL confirmed `auth.users=0` and `public_tables=0`.
- `GET http://127.0.0.1:56431/auth/v1/health` returned HTTP 200.
- Other-project containers remain running and unchanged.

This closes **local infrastructure bootstrap**, not P3-A or authenticated E2E.
Google OAuth, Rateware schema replay, synthetic fixtures and Edge Functions remain
pending. Do not run the root project's Supabase commands against this environment.
Do not start the `-pre-loopback` backup containers, which retain unsafe bindings.
The repair script is a one-time recovery tool, not an idempotent startup command.
To validate subsequent starts, always run `node tools/check-rateware-local.mjs`.

## Follow-up: migration dependency probe

Added a hash-pinned, local-only transactional dry-run for the first two reviewed
migrations. It runs solely through `docker exec` against the exact local database
container after the infrastructure gate passes. It uses ON_ERROR_STOP, timeouts,
and ROLLBACK; it does not accept a remote database URL or migration list.

- Two new probe tests passed, including rejection of changed SQL before execution.
- Actual dry-run: FAIL, `relation "storage.buckets" does not exist` in the first
  migration. The second migration has not yet been exercised by that run.
- Post-failure query confirmed zero public tables: transactional rollback worked.
- The minimal bootstrap has Storage disabled and lacks `storage.buckets` and
  `storage.objects`. Next step is official Storage schema initialization, not
  fabricated placeholder tables or editing historical migrations to omit them.
- Repository contains 374 migration files. The Banxico scheduling migration
  `20260807130000_schedule_banxico_fx_sync.sql` creates a cron HTTP call; historical
  import migrations also exist. These have not been executed or certified safe.

No migration was committed to the database. P3-A remains incomplete.

## Follow-up: official Storage dependency resolved

Initialized the official Storage schema using the image's own
`dist/scripts/migrate-call.js`, not hand-written replacement tables. Image:
`public.ecr.aws/supabase/storage-api:v1.70.3`, pinned for execution to digest
`sha256:528ec49c3c32561908b07ee91bced7f8456f3b688164e341eaa422441767a0bd`.

- First attempt with the `postgres` role failed with schema permission denial.
  It did not justify granting extra privileges. Using the existing dedicated
  `supabase_storage_admin` role succeeded.
- `tools/init-rateware-local-storage.mjs` verifies the local infrastructure gate,
  obtains only existing local bootstrap credentials in memory, invokes the
  official migration-only container, and suppresses raw provider logs. No new
  ports, production secrets or storage file mounts are involved.
- `storage.buckets` and `storage.objects` now exist.
- The exact two-migration Rateware transactional dry-run now **PASS**es.
- Public table count after ROLLBACK remains zero. These Rateware migrations were
  validated but **not applied**. This does not certify the other 372 migrations.
- Infrastructure loopback/health gate remains PASS.

Storage schema initialization is complete. Storage HTTP service and upload tests
are not configured by this migration-only step. Next: review and replay the
remaining schema dependencies in safe local batches, then synthetic tenant
fixtures, Edge Functions and Google OAuth. P3-A remains incomplete.

## Follow-up: first 12 Rateware migrations applied locally

Expanded the fully read, hash-pinned batch to the first 12 chronological migration
files (through `20260608223000_mx_fuel_fx_normalization.sql`). These create intake,
vendors, segments and normalization structures. The only public reference seed is
the migration's fixed ten-row border-crossing catalog, not customer/carrier/rate
data. No historical imports, scheduler or outbound HTTP migrations were included.

- Default transactional dry-run passed for all 12 files.
- Explicit `--apply-local-empty` passed against the exact local container.
- New guard requires zero public tables and zero auth users before bootstrap,
  with an advisory transaction lock. Local execution hashes are recorded in
  `rateware_local_control.migration_batches` within the same transaction.
  This is a local-only ledger, not the production Supabase migration ledger.
- SQL checks: ledger 12; public tables 17; vendors 0; rate_staging 0; auth users 0;
  border_crossing_pairs 10.
- A second apply attempt failed at the empty-schema guard as expected, before
  any migration replay. This is an expected safety rejection, not readiness PASS.
- Nine local tooling tests pass. The runner is a one-time bootstrap tool; later
  batches need their own reviewed incremental runner and predecessor hashes.

The remaining 362 migration files are not certified. Early historical policies
are not proof of final tenant security; do not introduce authenticated fixtures
or claim template acceptance before the later tenant/schema migrations are
reviewed and applied. P3-A remains open; no production operations occurred.

## Follow-up: incremental batch 13–20

Read and hash-pinned the next eight chronological files, through
`20260609005000_fix_service_from_quote_markers.sql`. Added an incremental runner
which requires all 12 exact predecessor ledger entries, unchanged predecessor
files, empty users/vendors/staging/uploads, an exclusive ledger lock and the
same local advisory lock. The batch and its ledger insert share one transaction.

Dry-run passed, then explicit local application passed. Ledger now contains 20
entries. Users, vendors and staging rows remain zero. Reapplication was rejected
at the predecessor-ledger guard. Two new tests verify hashes and transaction
guards. No scheduler, external calls or historical business imports were run.

This batch includes bundled seed catalogs and fuel/FX **example assumptions**,
including date-relative seed periods. These are not current market observations,
carrier quotations or approved commercial rates and must never be represented
as such. They exist only in the isolated test database.

These chronological prerequisites still do not include final template or tenant
security migrations. Remaining 354 files are not certified; authenticated users
and business fixtures remain deferred. P3-A is not complete.

## Follow-up: incremental batch 21–29

Read all nine files through `20260609130000_sourcing_procurement_vendor_base.sql`.
Extended the incremental runner with explicit `--batch-three`, exact 20-entry
predecessor validation (including file hashes), the same local-only gate and
atomic ledger. Dry-run passed; local apply passed. Ledger is now 29; auth users,
vendors and staging rows remain zero. Infrastructure remains PASS.

The new batch covers archive status, geographic reference aliases, trailer flags,
historical normalization updates on empty staging, and vendor sourcing metadata.
The normalization DML was exercised for SQL compatibility only: zero-row updates
do not prove correctness on real quotations. Three incremental-runner tests pass,
including altered-predecessor rejection for this batch.

The next chronological file is a 2.3 MB historical sourcing import. It has not
been run. Before advancing beyond it, review it for schema dependencies and
record a hash-bound, explicit nonproduction data-import exclusion. Never mark a
skipped data import as applied or claim full production migration parity.
Template/tenant acceptance is still pending. No production changes or messages.

## Follow-up: historical vendor import excluded explicitly

Verified the entire 2,325,887-byte historical import against SHA-256
`1b280bf887570c639e548f5068f61a44215b1618562d3dc43b28d8675955b695`.
A narrow lexical inspection found two top-level statements: DELETE FROM and
INSERT INTO public.vendors. No SQL was executed. The lexer assumes PostgreSQL
standard_conforming_strings=on, which was checked in the local database; it
rejects unsupported forms and is not a general SQL semantic safety validator.

Added `config/local-migration-exclusions.json`: this import is explicitly
EXCLUDED_LOCAL_BUSINESS_DATA, applied=false. It is not entered into the applied
ledger or treated as production parity. Added two passing tests for exact hash,
literal/statement boundaries, unsupported forms, and changed-file rejection.

Read the subsequent owner-scoping migration: it adds owner columns and indexes
and backfills an owner on existing vendors. Local vendors remain empty. It has
not yet been applied. The subsequent large reference-location catalog also needs
review, distinct from the excluded carrier import. Next incremental runner must
check both the applied predecessor hashes and the separate exclusion manifest.
Current applied ledger remains 29; objective and P3-A remain active.

## Follow-up: batch four, reference catalogs and RFx foundation

Applied seven hash-pinned migrations from owner-scoping through RFx spot-book,
after successful transaction rollback probe. The carrier historical import was
not executed. Its hash and EXCLUDED_LOCAL_BUSINESS_DATA disposition are recorded
in a separate `rateware_local_control.exclusions` table, atomically with this
batch; the applied ledger contains only executed migrations.

The 1.3 MB reference-catalog file was inspected lexically across all statements
and matched INSERT targets `rateware_locations` and `rateware_lane_mileage`.
These are bundled reference data, not verified current mileage or real quotes.
The other six migrations were read directly. New base policies remain historical
and permissive; they do not certify final tenant authorization.

Evidence: six focused incremental/exclusion tests passed; dry-run PASS; apply
PASS. SQL counts: applied 36, excluded 1, users/vendors/RFx/staging each zero,
locations 1419, lane mileage 3559. Hash, predecessor and exclusion checks remain
mandatory. No business fixtures, messages, production changes or Google client
configuration were performed. Remaining template/tenant and E2E gates are open.

## Follow-up: batch five, outreach and organization foundation

Read and hash-pinned five migrations through `20260623013000_vendor_funnel.sql`.
The runner checks all 36 predecessor hashes and the separate excluded-import
ledger. Five focused runner tests passed; transactional dry-run passed; explicit
local application passed. Final SQL: applied 41; messages 0; campaigns 0; users 0;
organizations 0. This batch adds schema plus one invitation text template and four
interpretation rules. No invitations or messages were generated or sent.

The host slowed during application; the original process handle was followed to
completion without retrying the mutation. Counts were queried after completion.
Historical permissive policies are still not final tenant security. No Google
OAuth setup, authenticated acceptance, production changes or release occurred.

## Follow-up: declarative batch runner

Consolidated existing batch selection into a reviewed batch registry and
`batchPlan(number)`. New syntax: `--batch 2` through `--batch 5`; old named
commands remain compatible. Unknown/non-integer batch numbers fail before
database access. No unreviewed file discovery or automatic execution was added.

Six focused tests passed, including exact predecessor counts, legacy/new SQL
equivalence for batch five, hash/exclusion guards and conflicting-selection
rejection. This is tooling progress only: no new database migrations were run.
The last verified applied count remains 41. The next block includes geographic
catalog rebuilding and must be reviewed before execution; no batch six is
registered yet. P3-A, authenticated acceptance and production remain open.

## Follow-up: batch six and local tooling checkpoint

Registered three reviewed/hash-pinned geographic migrations through
`20260623193000_rebuild_location_catalog_from_user_lists.sql`. The two smaller
files were read fully; the generated catalog was inspected across its lexical
statement structure with only locations/mileage targets allowed, plus its
deactivation and upsert logic. It deactivates old reference sources, not carriers
or quotations. Reference values are not certified current operational data.

Full local tooling suite before this addition: 17/17 passed. After addition,
nine focused incremental/exclusion tests passed; batch-six dry-run PASS and
apply PASS. SQL counts: applied 44, vendors 0, staging 0, active locations 3897.
No skipped carrier import was executed. Migration history now covers six batches;
the remaining historical migrations and final tenant/template schema remain open.

This checkpoint versions tooling/evidence only, excluding unrelated `.codex`
configuration, `deno.lock` and temporary artifacts. No remote push, deploy,
production migration, external messages or Google client changes in this step.
