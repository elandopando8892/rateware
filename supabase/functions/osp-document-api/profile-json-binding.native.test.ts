import postgres from 'postgres';
import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1.0.14';

// Explicit opt-in, fixed loopback endpoint, synthetic existing rehearsal DB only.
// No schema or business-data writes: this probes the production driver's binding.
Deno.test({
  name: 'PG17 preserves exact profile correction JSON with postgres 3.4.7',
  ignore: Deno.env.get('OSP_LOCAL_PG_REHEARSAL') !== '1',
  fn: async () => {
    const sql = postgres({ hostname: '127.0.0.1', port: 55472,
      username: 'osp_local_rehearsal', database: 'osp_release_rehearsal_run_4',
      ssl: false, prepare: false, max: 1, connect_timeout: 3 });
    try {
      const [identity] = await sql`select current_database() db, current_user usr, current_setting('server_version_num') version`;
      assertEquals(identity.db, 'osp_release_rehearsal_run_4');
      assertEquals(identity.usr, 'osp_local_rehearsal');
      assertEquals(Math.floor(Number(identity.version) / 10000), 17);
      const samples = ['XBFREIGHT SYSTEMS LLC', 'A "quoted" name', 'José González', 1771165, false, { verified: true }, ['one', 'two']];
      for (const value of samples) {
        const serialized = JSON.stringify(value);
        const [row] = await sql`select ${serialized}::text::jsonb as corrected, ${serialized}::jsonb as previous`;
        assertEquals(row.corrected, value);
        assertNotEquals(row.previous, value, 'The old binding must reproduce the double serialization');
      }
      const [empty] = await sql`select ${null}::text::jsonb as value`;
      assertEquals(empty.value, null);
    } finally {
      await sql.end({ timeout: 2 });
    }
  },
});
