export type SqlRow = Record<string, unknown>;
export type SqlPort = ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<SqlRow[]>) & {
  begin?: <T>(operation: (transaction: SqlPort) => Promise<T>) => Promise<T>;
};

export async function withOrganizationTransaction<T>(sql: SqlPort, organizationId: string, action: (transaction: SqlPort) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(organizationId)) {
    throw new Error('INVALID_ORGANIZATION');
  }
  if (!sql.begin) throw new Error('DATABASE_TRANSACTION_UNAVAILABLE');
  return await sql.begin(async (transaction) => {
    await transaction`set local role osp_workflow_api`;
    await transaction`select set_config('osp.organization_id', ${organizationId}, true)`;
    return await action(transaction);
  });
}

export async function withWorkerTransaction<T>(sql: SqlPort, action: (transaction: SqlPort) => Promise<T>): Promise<T> {
  if (!sql.begin) throw new Error('DATABASE_TRANSACTION_UNAVAILABLE');
  return await sql.begin(async (transaction) => {
    await transaction`set local role osp_worker`;
    return await action(transaction);
  });
}
