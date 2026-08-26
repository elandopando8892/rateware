import assert from 'node:assert/strict';

import { withOrganizationTransaction, type SqlPort } from './database-context.ts';

Deno.test('organization transaction sets the fixed workflow role and parameterized tenant context before work', async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const transaction = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join('$'), values });
    return Promise.resolve([]);
  }) as SqlPort;
  const root = Object.assign(transaction, { begin: async <T>(operation: (tx: SqlPort) => Promise<T>) => await operation(transaction) });
  const result = await withOrganizationTransaction(root, '11111111-1111-4111-8111-111111111111', async () => 'committed');
  assert.equal(result, 'committed');
  assert.deepEqual(calls, [
    { text: 'set local role osp_workflow_api', values: [] },
    { text: "select set_config('osp.organization_id', $, true)", values: ['11111111-1111-4111-8111-111111111111'] },
  ]);
});

Deno.test('organization transaction rejects an invalid tenant before beginning work', async () => {
  let began = false;
  const sql = Object.assign((() => Promise.resolve([])) as SqlPort, { begin: async <T>(_operation: (tx: SqlPort) => Promise<T>) => { began = true; throw new Error('must not run'); } });
  await assert.rejects(withOrganizationTransaction(sql, 'not-a-uuid', async () => 'never'), /INVALID_ORGANIZATION/);
  assert.equal(began, false);
});
