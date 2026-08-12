/**
 * @typedef {{ table: string, rows: Array<Record<string, unknown>>, onConflict: string, enabled?: boolean }} CatalogSyncOperation
 * @param {{ dryRun?: boolean, operations?: CatalogSyncOperation[], upsert: (table: string, rows: Array<Record<string, unknown>>, onConflict: string) => Promise<unknown> }} options
 */
export async function executeCatalogSyncPlan({ dryRun = false, operations = [], upsert }) {
  const planned = operations.filter((operation) => operation.enabled !== false);
  if (dryRun) return { tables_written: 0, operations_planned: planned.length };

  for (const operation of planned) {
    await upsert(operation.table, operation.rows, operation.onConflict);
  }
  return { tables_written: planned.length, operations_planned: planned.length };
}
