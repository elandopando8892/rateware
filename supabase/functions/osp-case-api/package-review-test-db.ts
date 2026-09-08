// deno-lint-ignore-file no-import-prefix
// Test-only adapter. Native writes are restricted to an empty, named database
// in the previously established local PG17 rehearsal cluster.
import { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import postgres from "npm:postgres@3.4.7";
import { assert, assertEquals } from "jsr:@std/assert@1.0.14";
import type { SqlRow } from "../_shared/osp/database-context.ts";

export type TestConnection = {
  exec(query: string): Promise<unknown>;
  query(query: string, values?: unknown[]): Promise<{ rows: SqlRow[] }>;
};
export type ReviewTestDatabase = TestConnection & {
  native: boolean;
  transaction<T>(operation: (tx: TestConnection) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

export async function createReviewTestDatabase(): Promise<ReviewTestDatabase> {
  if (Deno.env.get("OSP_LOCAL_PACKAGE_REVIEW") !== "1") {
    const db = new PGlite();
    const wrap = (
      connection: Pick<PGlite, "exec" | "query">,
    ): TestConnection => ({
      exec: (query) => connection.exec(query),
      query: async (query, values) => ({
        rows: (await connection.query(query, values)).rows as SqlRow[],
      }),
    });
    return {
      ...wrap(db),
      native: false,
      transaction: (operation) => db.transaction((tx) => operation(wrap(tx))),
      close: () => db.close(),
    };
  }
  const database = Deno.env.get("OSP_LOCAL_PG_DATABASE") ?? "";
  const directory = Deno.env.get("OSP_LOCAL_PG_DIRECTORY") ?? "";
  const normalize = (value: string) =>
    value.replaceAll("\\", "/").toLowerCase();
  const permittedDirectory =
    "D:/andre/apps/codex-data/worktrees/Rateware/osp-s7-main-integration/tmp/osp-s13-pg17-rehearsal/cluster";
  assert(/^osp_package_review_run_[0-9]+$/.test(database));
  assertEquals(normalize(directory), normalize(permittedDirectory));
  const sql = postgres({
    hostname: "127.0.0.1",
    port: 55472,
    username: "osp_local_rehearsal",
    password: "",
    database,
    ssl: false,
    prepare: false,
    max: 3,
    connect_timeout: 3,
    connection: {
      statement_timeout: 6000,
      application_name: "osp-package-review-rehearsal",
    },
  });
  try {
    const [identity] = await sql`select current_database() db,current_user usr,
      current_setting('data_directory') dir,host(inet_server_addr()) host,
      inet_server_port() port,current_setting('server_version_num') version`;
    assertEquals(identity.db, database);
    assertEquals(identity.usr, "osp_local_rehearsal");
    assertEquals(normalize(identity.dir), normalize(directory));
    assertEquals(identity.host, "127.0.0.1");
    assertEquals(identity.port, 55472);
    assert(
      Number(identity.version) >= 170000 && Number(identity.version) < 180000,
    );
    assertEquals(
      (await sql`select count(*)::integer n from pg_tables where schemaname not in ('pg_catalog','information_schema')`)[
        0
      ].n,
      0,
    );
    console.log(
      JSON.stringify({
        native: true,
        database,
        serverVersion: identity.version,
        syntheticOnly: true,
      }),
    );
    const wrap = (connection: Pick<typeof sql, "unsafe">): TestConnection => ({
      exec: (query) => connection.unsafe(query),
      query: async (query, values = []) => ({
        rows: [
          ...await connection.unsafe(
            query,
            values as postgres.ParameterOrJSON<never>[],
          ),
        ] as unknown as SqlRow[],
      }),
    });
    return {
      ...wrap(sql),
      native: true,
      transaction: (operation) =>
        sql.begin((tx) => operation(wrap(tx))) as ReturnType<typeof operation>,
      close: () => sql.end({ timeout: 2 }),
    };
  } catch (error) {
    await sql.end({ timeout: 2 });
    throw error;
  }
}
