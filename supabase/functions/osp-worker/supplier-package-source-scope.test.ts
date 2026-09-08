// deno-lint-ignore no-import-prefix -- match the existing runtime test harness
import { assertEquals as equal, assertRejects } from "jsr:@std/assert@1.0.14";
import type { SqlPort } from "../_shared/osp/database-context.ts";
import { createPostgresSupplierPackageRecordStore } from "./supplier-package-runtime.ts";

const uuid = (n: number) =>
  `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${
    String(n).repeat(3)
  }-${String(n).repeat(12)}`;
const input = {
  organizationId: uuid(1),
  caseId: uuid(2),
  snapshotId: uuid(3),
  jobId: uuid(4),
  leaseToken: uuid(5),
};

Deno.test("different source stops before reservation or download", async () => {
  let writes = 0;
  const sql = ((strings: TemplateStringsArray) => {
    const query = strings.join("?");
    if (query.includes("from osp_private.background_jobs")) {
      return Promise.resolve([{ id: input.jobId }]);
    }
    if (query.startsWith("select snapshot.canonical_sha256")) {
      return Promise.resolve([{
        snapshot_sha256: "a".repeat(64),
        source_version_id: uuid(1),
        source_sha256: "b".repeat(64),
      }]);
    }
    if (query.includes("from osp_private.generated_packages")) {
      return Promise.resolve([{
        id: uuid(8),
        source_version_id: uuid(9),
        source_sha256: "b".repeat(64),
      }]);
    }
    if (/^(insert|update)/.test(query)) writes++;
    return Promise.resolve([]);
  }) as SqlPort;
  sql.begin = async <T>(fn: (tx: SqlPort) => Promise<T>) => await fn(sql);
  const store = createPostgresSupplierPackageRecordStore({
    databaseUrl: "postgresql://fixture.invalid/test",
    postgresFactory: () => sql,
    storageClient: {
      storage: {
        from: () => {
          throw new Error("UNEXPECTED_STORAGE_ACCESS");
        },
      },
    } as never,
  });
  await assertRejects(
    () => store.prepare(input),
    Error,
    "SUPPLIER_PACKAGE_SOURCE_SCOPE_CONFLICT",
  );
  equal(writes, 0);
});

for (
  const scenario of [
    "same",
    "different",
    "different_hash",
    "legacy",
    "none",
  ] as const
) {
  Deno.test(`package replacement preserves source scope: ${scenario}`, async () => {
    const mutations: string[] = [];
    const sql = ((strings: TemplateStringsArray) => {
      const query = strings.join("?");
      if (query.startsWith("select package_id")) {
        return Promise.resolve([{
          package_id: uuid(6),
          object_id: uuid(7),
          package_version: 2,
          status: "prepared",
        }]);
      }
      if (query.includes("from osp_private.generated_packages")) {
        return Promise.resolve(
          scenario === "none" ? [] : [{
            id: uuid(8),
            source_version_id: scenario === "legacy"
              ? null
              : scenario === "different"
              ? uuid(9)
              : uuid(1),
            source_sha256: scenario === "different_hash"
              ? "b".repeat(64)
              : "a".repeat(64),
          }],
        );
      }
      if (/^(update|insert)/.test(query)) mutations.push(query);
      return Promise.resolve([]);
    }) as SqlPort;
    sql.begin = async <T>(fn: (tx: SqlPort) => Promise<T>) => await fn(sql);
    const store = createPostgresSupplierPackageRecordStore({
      databaseUrl: "postgresql://fixture.invalid/test",
      postgresFactory: () => sql,
      storageClient: {} as never,
    });
    const call = () =>
      store.recordGenerated({
        ...input,
        receipt: {
          packageId: uuid(6),
          objectId: uuid(7),
          artifact: {
            sourceVersionId: uuid(1),
            sourceSha256: "a".repeat(64),
            packageSnapshotId: input.snapshotId,
            packageSnapshotSha256: "c".repeat(64),
            outputSha256: "d".repeat(64),
            version: 2,
            contentType: "application/pdf",
            mappings: [],
          },
        },
      });
    if (scenario === "same" || scenario === "none") {
      await call();
      equal(mutations.length, scenario === "same" ? 3 : 2);
    } else {
      await assertRejects(
        call,
        Error,
        "SUPPLIER_PACKAGE_SOURCE_SCOPE_CONFLICT",
      );
      equal(mutations.length, 0);
    }
  });
}
