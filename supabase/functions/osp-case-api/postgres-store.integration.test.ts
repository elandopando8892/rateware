import assert from 'node:assert/strict';
import postgres from 'postgres';

import { createPostgresBackgroundJobStore } from '../_shared/osp/background-jobs.ts';
import { createPostgresCaseStore } from './postgres-store.ts';

const localUrl = Deno.env.get('OSP_LOCAL_DATABASE_URL');

Deno.test({
  name: 'local migration enforces one optimistic command winner and tenant RLS',
  ignore: !localUrl,
  async fn() {
    const sql = postgres(localUrl!, { prepare: false, max: 1 });
    const organizationId = crypto.randomUUID();
    const secondOrganizationId = crypto.randomUUID();
    const supplierId = crypto.randomUUID();
    const caseId = crypto.randomUUID();
    const authority = { organizationId, issuer: 'https://auth.example.test', subject: 'operator', email: 'operator@example.test', permissions: ['osp:operate'], correlationId: crypto.randomUUID() } as const;
    const appSql = postgres(localUrl!, { prepare: false, max: 1, ssl: false });
    try {
      await sql`insert into osp_private.supplier_counterparties (id, organization_id, legal_name) values (${supplierId}, ${organizationId}, 'Synthetic Supplier')`;
      await sql`insert into osp_private.customer_registration_cases (id, organization_id, supplier_id, state) values (${caseId}, ${organizationId}, ${supplierId}, 'received')`;
      const store = createPostgresCaseStore({ databaseUrl: localUrl!, postgresFactory: () => appSql });
      const makeCommand = (key: string) => ({ version: 1 as const, action: 'add_case_comment' as const, idempotency_key: key, expected_version: 0, input: { caseId, body: 'Synthetic note' } });
      const results = await Promise.allSettled([store.addComment(authority, makeCommand('first')), store.addComment(authority, makeCommand('second'))]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1, results.map((result) => result.status === 'rejected' ? String(result.reason) : 'fulfilled').join(' | '));
      assert.equal(results.filter((result) => result.status === 'rejected' && /VERSION_CONFLICT/.test(String(result.reason))).length, 1);
      const replayCommand = { version: 1 as const, action: 'add_case_comment' as const, idempotency_key: 'same-concurrent-replay', expected_version: 1, input: { caseId, body: 'Same replay' } };
      const replayResults = await Promise.all([store.addComment(authority, replayCommand), store.addComment(authority, replayCommand)]);
      assert.deepEqual(replayResults[0], replayResults[1]);
      assert.equal(replayResults[0].aggregateVersion, 2);
      const secondSameTenantCaseId = crypto.randomUUID();
      await sql`insert into osp_private.customer_registration_cases (id, organization_id, supplier_id, state) values (${secondSameTenantCaseId}, ${organizationId}, ${supplierId}, 'received')`;
      const crossCaseCommands = [
        { version: 1 as const, action: 'add_case_comment' as const, idempotency_key: 'same-operation-wide-key', expected_version: 2, input: { caseId, body: 'first operation payload' } },
        { version: 1 as const, action: 'add_case_comment' as const, idempotency_key: 'same-operation-wide-key', expected_version: 0, input: { caseId: secondSameTenantCaseId, body: 'different operation payload' } },
      ];
      const crossCaseResults = await Promise.allSettled(crossCaseCommands.map((command) => store.addComment(authority, command)));
      assert.equal(crossCaseResults.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(crossCaseResults.filter((result) => result.status === 'rejected' && /IDEMPOTENCY_CONFLICT/.test(String(result.reason))).length, 1);
      await assert.rejects(store.getCase({ ...authority, organizationId: secondOrganizationId }, caseId), /CASE_NOT_FOUND/);
      const otherSupplierId = crypto.randomUUID();
      const otherCaseId = crypto.randomUUID();
      await sql`insert into osp_private.supplier_counterparties (id, organization_id, legal_name) values (${otherSupplierId}, ${secondOrganizationId}, 'Other Synthetic Supplier')`;
      await sql`insert into osp_private.customer_registration_cases (id, organization_id, supplier_id, state) values (${otherCaseId}, ${secondOrganizationId}, ${otherSupplierId}, 'received')`;
      await assert.rejects(store.addComment(authority, { version: 1, action: 'add_case_comment', idempotency_key: 'cross-tenant-case', expected_version: 0, input: { caseId: otherCaseId, body: 'must not cross tenant' } }), /CASE_NOT_FOUND/);
      await assert.rejects(sql`insert into osp_private.case_events (id, organization_id, case_id, sequence, state, actor_subject, authority_role, source_version, occurred_at, reason_code, correlation_id) values (${crypto.randomUUID()}, ${organizationId}, ${otherCaseId}, 1, 'received', 'operator', 'operations', 0, now(), 'case_received', 'integration')`);
      const foreignJobId = crypto.randomUUID();
      const foreignLeaseToken = crypto.randomUUID();
      await sql`insert into osp_private.background_jobs (id, organization_id, kind, opaque_payload, idempotency_key, lease_token, leased_until) values (${foreignJobId}, ${secondOrganizationId}, 'gmail_ingest', ${JSON.stringify({ gmailMessageId: 'foreign-job' })}, 'foreign-job', ${foreignLeaseToken}, now() + interval '1 minute')`;
      const workerStore = createPostgresBackgroundJobStore({ databaseUrl: localUrl!, postgresFactory: () => appSql });
      await assert.rejects(workerStore.complete({ jobId: foreignJobId, leaseToken: crypto.randomUUID(), completedAt: new Date() }), /LEASE_CONFLICT/);
      const untouchedForeignJob = await sql`select completed_at, lease_token from osp_private.background_jobs where id = ${foreignJobId}`;
      assert.equal(untouchedForeignJob.length, 1);
      assert.equal(untouchedForeignJob[0].completed_at, null);
      assert.equal(untouchedForeignJob[0].lease_token, foreignLeaseToken);
      const availableJobId = crypto.randomUUID();
      await sql`insert into osp_private.background_jobs (id, organization_id, kind, opaque_payload, idempotency_key) values (${availableJobId}, ${organizationId}, 'gmail_ingest', ${JSON.stringify({ gmailMessageId: 'available-job' })}, 'available-job')`;
      const futureRetryJobId = crypto.randomUUID();
      await sql`insert into osp_private.background_jobs (id, organization_id, kind, opaque_payload, idempotency_key, retry_at) values (${futureRetryJobId}, ${organizationId}, 'gmail_ingest', ${JSON.stringify({ gmailMessageId: 'future-retry-job' })}, 'future-retry-job', now() + interval '10 minutes')`;
      const unexpiredJobId = crypto.randomUUID();
      const unexpiredLeaseToken = crypto.randomUUID();
      await sql`insert into osp_private.background_jobs (id, organization_id, kind, opaque_payload, idempotency_key, lease_token, leased_until) values (${unexpiredJobId}, ${organizationId}, 'gmail_ingest', ${JSON.stringify({ gmailMessageId: 'unexpired-job' })}, 'unexpired-job', ${unexpiredLeaseToken}, now() + interval '10 minutes')`;
      const serverClockClaims = await workerStore.claim({ workerId: 'server-clock-probe', now: new Date('2099-01-01T00:00:00.000Z'), leaseMs: 60_000, limit: 100 });
      assert.equal(serverClockClaims.some((job) => new Set<string>([futureRetryJobId, unexpiredJobId]).has(job.id)), false);
      const attacker = postgres(localUrl!, { prepare: false, max: 1, ssl: false });
      try {
        await assert.rejects(attacker.begin(async (tx) => {
          await tx`set local role osp_worker`;
          await tx`select id, opaque_payload from osp_private.background_jobs where id = ${availableJobId}`;
        }), /permission denied|row-level security|insufficient_privilege/i);
      } finally {
        await attacker.end({ timeout: 1 });
      }
      const untouchedAvailableJob = await sql`select last_error_code, lease_token from osp_private.background_jobs where id = ${availableJobId}`;
      assert.equal(untouchedAvailableJob.length, 1);
      assert.equal(untouchedAvailableJob[0].last_error_code, null);
      assert.equal(typeof untouchedAvailableJob[0].lease_token, 'string');
      await sql`delete from osp_private.customer_registration_cases where organization_id = ${secondOrganizationId}`;
      await sql`delete from osp_private.supplier_counterparties where organization_id = ${secondOrganizationId}`;
    } finally {
      await sql`delete from osp_private.case_events where organization_id in (${organizationId}, ${secondOrganizationId})`;
      await sql`delete from osp_private.case_comments where organization_id in (${organizationId}, ${secondOrganizationId})`;
      await sql`delete from osp_private.command_receipts where organization_id in (${organizationId}, ${secondOrganizationId})`;
      await sql`delete from osp_private.background_jobs where organization_id in (${organizationId}, ${secondOrganizationId})`;
      await sql`delete from osp_private.customer_registration_cases where organization_id in (${organizationId}, ${secondOrganizationId})`;
      await sql`delete from osp_private.supplier_counterparties where organization_id in (${organizationId}, ${secondOrganizationId})`;
      await appSql.end({ timeout: 1 });
      await sql.end({ timeout: 1 });
    }
  },
});
