import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const image = process.env.RATEWARE_LEDGER_POSTGRES_IMAGE || "public.ecr.aws/supabase/postgres:17.6.1.165";
const container = `rateware-resolver-ledger-95-${process.pid}`;
const database = "rateware_ledger_95";
const password = `local-only-${process.pid}`;
const migrationPath = resolve(import.meta.dirname, "../supabase/migrations/20260901193000_rfx_private_resolver_request_ledger.sql");
const migration = await readFile(migrationPath, "utf8");
const healthMigrationPath = resolve(import.meta.dirname, "../supabase/migrations/20260901230000_rfx_private_resolver_ledger_health.sql");
const healthMigration = await readFile(healthMigrationPath, "utf8");

function run(command, args, { input = "", allowFailure = false } = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { code, stdout: stdout.trim(), stderr: stderr.trim() };
      if (code === 0 || allowFailure) resolveRun(result);
      else reject(new Error(`${command} ${args.join(" ")} failed (${code})\n${stderr || stdout}`));
    });
    child.stdin.end(input);
  });
}

const docker = (...args) => run("docker", args);
const psql = (sql, options = {}) => run("docker", ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database, "-At"], { ...options, input: sql });
const asServiceRole = (sql, options = {}) => psql(`set role service_role;\n${sql}`, options);

async function waitReady() {
  let consecutive = 0;
  let stableSince = 0;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = await run("docker", ["exec", container, "psql", "-X", "-U", "supabase_admin", "-d", database, "-At", "-c", "select 1"], { allowFailure: true });
    if (ready.code === 0 && ready.stdout === "1") {
      consecutive += 1;
      stableSince ||= Date.now();
    } else {
      consecutive = 0;
      stableSince = 0;
    }
    if (consecutive >= 3 && Date.now() - stableSince >= 5_000) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Supabase Postgres container did not become ready");
}

function claimSql({ requestId, requestHash, action = "resolve_and_submit_bid_canary" }) {
  return `select public.claim_rfx_private_resolver_request(
    '${requestId}'::uuid, '${requestHash}', '${action}', 'marksman-loads', 'preview-9-5',
    'org-acme', '22222222-2222-4222-8222-222222222222'::uuid,
    '33333333-3333-4333-8333-333333333333'::uuid,
    '44444444-4444-4444-8444-444444444444'::uuid,
    '${"b".repeat(64)}', '${"c".repeat(64)}', '${"d".repeat(64)}',
    '2026-09-01T22:30:00Z'::timestamptz, '2026-09-01T22:35:00Z'::timestamptz
  );`;
}

let created = false;
try {
  await docker("run", "--name", container, "-e", `POSTGRES_PASSWORD=${password}`, "-e", `POSTGRES_DB=${database}`, "-d", image);
  created = true;
  await waitReady();

  await psql(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
    end $$;
    create table public.vendors (id uuid primary key);
    create table public.rfx_events (id uuid primary key);
    create table public.rfx_lanes (id uuid primary key);
    insert into public.vendors values ('22222222-2222-4222-8222-222222222222');
    insert into public.rfx_lanes values ('33333333-3333-4333-8333-333333333333');
    insert into public.rfx_events values ('44444444-4444-4444-8444-444444444444');
  `);
  await psql(migration);
  await psql(healthMigration);

  const requestId = "55555555-5555-4555-8555-555555555555";
  const requestHash = "a".repeat(64);
  const contenders = await Promise.all(Array.from({ length: 16 }, () => asServiceRole(claimSql({ requestId, requestHash }))));
  const claims = contenders.map((item) => JSON.parse(item.stdout.split(/\r?\n/).at(-1)));
  assert.equal(claims.filter((item) => item.claimed === true).length, 1, "exactly one concurrent request must claim the identifier");
  assert.equal(claims.filter((item) => item.mismatch === true).length, 0);
  assert.ok(claims.every((item) => item.record.status === "processing"));

  const completedRaw = await asServiceRole(`select public.complete_rfx_private_resolver_request(
    '${requestId}'::uuid, '${requestHash}', 'rlv-local-postgres', 'viewed',
    'RATEWARE_PRIVATE_RESOLUTION_CANDIDATE_POSTGRES', '2026-09-01T22:30:01Z'::timestamptz
  );`);
  const completed = JSON.parse(completedRaw.stdout.split(/\r?\n/).at(-1));
  assert.equal(completed.status, "resolution_canary_passed");
  assert.equal(completed.external_execution, false);

  const duplicateRaw = await asServiceRole(claimSql({ requestId, requestHash }));
  const duplicate = JSON.parse(duplicateRaw.stdout.split(/\r?\n/).at(-1));
  assert.equal(duplicate.claimed, false);
  assert.equal(duplicate.mismatch, false);
  assert.equal(duplicate.record.status, "resolution_canary_passed");
  assert.equal(duplicate.record.resolver_ref, "rlv-local-postgres");

  const mismatchRaw = await asServiceRole(claimSql({ requestId, requestHash: "f".repeat(64) }));
  const mismatch = JSON.parse(mismatchRaw.stdout.split(/\r?\n/).at(-1));
  assert.equal(mismatch.claimed, false);
  assert.equal(mismatch.mismatch, true);

  const secondCompletion = await asServiceRole(`select public.complete_rfx_private_resolver_request(
    '${requestId}'::uuid, '${requestHash}', 'rlv-impossible', 'viewed',
    'RATEWARE_PRIVATE_RESOLUTION_CANDIDATE_POSTGRES', now()
  );`, { allowFailure: true });
  assert.notEqual(secondCompletion.code, 0);
  assert.match(secondCompletion.stderr, /REQUEST_LEDGER_STATE_CONFLICT/);

  const failedId = "66666666-6666-4666-8666-666666666666";
  await asServiceRole(claimSql({ requestId: failedId, requestHash }));
  await asServiceRole(`select public.fail_rfx_private_resolver_request(
    '${failedId}'::uuid, '${requestHash}', 'PRIVATE_INVITATION_NOT_FOUND', '2026-09-01T22:30:02Z'::timestamptz
  );`);
  const failedRetryRaw = await asServiceRole(claimSql({ requestId: failedId, requestHash }));
  const failedRetry = JSON.parse(failedRetryRaw.stdout.split(/\r?\n/).at(-1));
  assert.equal(failedRetry.record.status, "failed");
  assert.equal(failedRetry.record.error_code, "PRIVATE_INVITATION_NOT_FOUND");

  const processingId = "77777777-7777-4777-8777-777777777777";
  await asServiceRole(claimSql({ requestId: processingId, requestHash }));
  const healthRaw = await asServiceRole("select public.get_rfx_private_resolver_ledger_health();");
  const health = JSON.parse(healthRaw.stdout.split(/\r?\n/).at(-1));
  assert.equal(Number(health.processingCurrent) + Number(health.processingExpired), 1);
  assert.equal(health.requestBodyStored, false);
  assert.equal(health.credentialMaterialStored, false);
  assert.equal(health.externalExecutionPossible, false);

  for (const role of ["anon", "authenticated"]) {
    const denied = await psql(`set role ${role}; select count(*) from public.rfx_private_resolver_requests;`, { allowFailure: true });
    assert.notEqual(denied.code, 0, `${role} must not read the ledger`);
    assert.match(denied.stderr, /permission denied/);
    const healthDenied = await psql(`set role ${role}; select public.get_rfx_private_resolver_ledger_health();`, { allowFailure: true });
    assert.notEqual(healthDenied.code, 0, `${role} must not execute ledger health`);
    assert.match(healthDenied.stderr, /permission denied/);
  }
  const serviceCount = await asServiceRole("select count(*) from public.rfx_private_resolver_requests;");
  assert.equal(Number(serviceCount.stdout.split(/\r?\n/).at(-1)), 3);

  const externalWrite = await psql(`update public.rfx_private_resolver_requests set external_execution=true where request_id='${requestId}'::uuid;`, { allowFailure: true });
  assert.notEqual(externalWrite.code, 0);
  assert.match(externalWrite.stderr, /check constraint/);

  const columnsRaw = await psql("select column_name from information_schema.columns where table_schema='public' and table_name='rfx_private_resolver_requests' order by ordinal_position;");
  const columns = columnsRaw.stdout.split(/\r?\n/).filter(Boolean);
  const forbidden = ["request_body", "signature", "invitation_token", "operational_fit", "bid_rate", "notes", "commercial_model"];
  assert.deepEqual(columns.filter((column) => forbidden.includes(column)), []);

  console.log(JSON.stringify({
    status: "PASS",
    image,
    migrations: ["20260901193000_rfx_private_resolver_request_ledger.sql", "20260901230000_rfx_private_resolver_ledger_health.sql"],
    concurrentClaims: claims.length,
    atomicWinners: 1,
    exactRetry: "same_terminal_result",
    alteredReplay: "mismatch_blocked",
    terminalFailure: "preserved",
    rls: { anon: "denied", authenticated: "denied", service_role: "allowed" },
    externalExecutionConstraint: "enforced_false",
    aggregateHealth: "service_role_only",
    retentionPolicy: "not_configured_release_blocker",
    storedColumns: columns.length,
    sensitiveColumns: 0,
    remoteEffects: false,
  }, null, 2));
} finally {
  if (created) await run("docker", ["rm", "-f", container], { allowFailure: true });
}
