/** Isolated table adapter. It models query scope and mutation readback, not PostgreSQL/RLS. */
export type Row = Record<string, any>;
export function memoryClient(tables: Record<string, Row[]>) {
  const calls: Row[] = [];
  const field = (row: Row, key: string) => key.split('.').reduce((value, part) => value?.[part], row);
  const client = { from(table: string) {
    if (!(table in tables)) throw new Error(`Unmocked table: ${table}`);
    const call: Row = { table, op: 'select', filters: [], columns: '*', payload: null };
    calls.push(call);
    const filters: ((row: Row) => boolean)[] = [], orders: [string, boolean][] = [];
    let one = false, requiredOne = false, head = false, start = 0, end = Infinity;
    const query = new Proxy({}, { get(_target, name) {
      if (name === 'then') return (resolve: (value: unknown) => void) => {
        let rows = tables[table].filter(row => filters.every(test => test(row)));
        if (call.op === 'update') rows.forEach(row => Object.assign(row, structuredClone(call.payload)));
        if (call.op === 'insert') {
          rows = (Array.isArray(call.payload) ? call.payload : [call.payload]).map((row: Row) => ({ id: crypto.randomUUID(), ...structuredClone(row) }));
          tables[table].push(...rows);
        }
        if (call.op === 'upsert') {
          const keys = String(call.onConflict || 'id').split(',');
          rows = (Array.isArray(call.payload) ? call.payload : [call.payload]).map((row: Row) => {
            const old = tables[table].find(item => keys.every(key => item[key] === row[key]));
            if (old) { Object.assign(old, structuredClone(row)); return old; }
            const created = { id: crypto.randomUUID(), ...structuredClone(row) };
            tables[table].push(created); return created;
          });
        }
        if (call.op === 'delete') tables[table] = tables[table].filter(row => !filters.every(test => test(row)));
        const count = rows.length;
        rows = [...rows].sort((a, b) => {
          for (const [key, ascending] of orders) { const n = String(field(a, key) ?? '').localeCompare(String(field(b, key) ?? '')); if (n) return ascending ? n : -n; }
          return 0;
        }).slice(start, end + 1);
        const project = (row: Row) => call.columns.includes('*') ? structuredClone(row) : Object.fromEntries(call.columns.split(',').map((key: string) => [key, row[key]]));
        if (requiredOne && rows.length !== 1) { resolve({ data: null, error: { code: 'PGRST116', message: 'Expected exactly one scoped row' }, count }); return; }
        resolve({ data: head ? null : one ? rows[0] ? project(rows[0]) : null : rows.map(project), error: null, count });
      };
      return (...args: any[]) => {
        const key = String(args[0]);
        if (name === 'select') { call.columns = args[0] || '*'; head = args[1]?.head === true; }
        else if (name === 'single' || name === 'maybeSingle') { one = true; requiredOne = name === 'single'; }
        else if (name === 'update' || name === 'insert' || name === 'upsert') { call.op = name; call.payload = args[0]; call.onConflict = args[1]?.onConflict; }
        else if (name === 'delete') call.op = name;
        else if (name === 'range') { start = args[0]; end = args[1]; }
        else if (name === 'limit') end = args[0] - 1;
        else if (name === 'order') orders.push([key, args[1]?.ascending !== false]);
        else if (name === 'eq') filters.push(row => field(row, key) === args[1]);
        else if (name === 'neq') filters.push(row => field(row, key) !== args[1]);
        else if (name === 'in') filters.push(row => args[1].includes(field(row, key)));
        else if (name === 'is') filters.push(row => (field(row, key) ?? null) === args[1]);
        else if (name === 'gt') filters.push(row => field(row, key) > args[1]);
        else if (name === 'gte') filters.push(row => field(row, key) >= args[1]);
        else if (name === 'contains') filters.push(row => Object.entries(args[1]).every(([k, v]) => field(row, key)?.[k] === v));
        else if (name === 'not' && args[1] === 'is') filters.push(row => (field(row, key) ?? null) !== args[2]);
        else throw new Error(`Unmocked query method: ${String(name)} on ${table}`);
        if (['eq', 'neq', 'in', 'is', 'gt', 'gte', 'contains', 'not'].includes(String(name))) call.filters.push([name, ...args]);
        return query;
      };
    } });
    return query;
  } };
  return { client, calls, tables, writes: () => calls.filter(call => call.op !== 'select') };
}
