// deno-lint-ignore-file no-import-prefix -- pinned local integration dependencies
import { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import { PDFDocument } from "pdf-lib";
import type { SqlPort, SqlRow } from "../_shared/osp/database-context.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";
import {
  generateSupplierPackageSet,
  type SupplierPackageSetInput,
} from "./supplier-package-set.ts";
import { createSupplierPackageSetStore } from "./supplier-package-set-store.ts";
import { tryGenerateSupplierPackageSet } from "./supplier-package-set-runtime.ts";
import { loadWorkflowPackageSet } from "../osp-case-api/workflow-package-set.ts";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = id(1), caseId = id(2), leaseToken = id(3);

Deno.test("package-set persistence uses real SQL, tenant role and atomic publication", async (t) => {
  const db = new PGlite();
  let failPublication = false;
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create role osp_worker; create role osp_workflow_api;
      create schema osp_private;
      grant usage on schema osp_private to osp_worker, osp_workflow_api;
      create table osp_private.customer_registration_cases (
        organization_id uuid, id uuid, state text, aggregate_version integer,
        primary key (organization_id,id)
      );
      create table osp_private.case_package_input_snapshots (
        organization_id uuid, case_id uuid, id uuid, canonical_sha256 text,
        case_version integer, document_version_ids uuid[], review_decision_ids uuid[],
        created_at timestamptz not null default clock_timestamp(),
        primary key (organization_id,case_id,id), unique (organization_id,canonical_sha256)
      );
      create table osp_private.background_jobs (
        organization_id uuid, id uuid, kind text, opaque_payload jsonb,
        lease_token uuid, leased_until timestamptz, completed_at timestamptz,
        primary key (organization_id,id)
      );
      create table osp_private.document_versions (
        organization_id uuid, id uuid, source_sha256 text, content_type text,
        document_type text, status text, primary key (organization_id,id)
      );
      grant select on osp_private.case_package_input_snapshots,
        osp_private.document_versions to osp_worker;
    `);
    await db.exec(
      await Deno.readTextFile(
        new URL(
          "../../migrations/20260908160000_osp_supplier_package_sets.sql",
          import.meta.url,
        ),
      ),
    );
    await db.query(
      "insert into osp_private.customer_registration_cases values ($1,$2,'operations_review',1)",
      [org, caseId],
    );
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    pdf.getForm().createTextField("name").addToPage(page);
    const bytes = await pdf.save();
    const sourceSha = await sha256Hex(bytes);
    for (const sourceId of [id(5), id(6)]) {
      await db.query(
        "insert into osp_private.document_versions values ($1,$2,$3,'application/pdf','supplier_requirement','approved')",
        [org, sourceId, sourceSha],
      );
    }
    const createInput = async (
      number: number,
    ): Promise<
      {
        input: SupplierPackageSetInput;
        job: { jobId: string; leaseToken: string };
      }
    > => {
      const sha = String(number).repeat(64);
      const snapshotId = id(100 + number),
        jobId = id(200 + number),
        setId = id(300 + number);
      await db.query(
        "insert into osp_private.case_package_input_snapshots (organization_id,case_id,id,canonical_sha256,case_version,document_version_ids,review_decision_ids) values ($1,$2,$3,$4,1,$5,$6)",
        [org, caseId, snapshotId, sha, [id(5), id(6)], [id(7)]],
      );
      await db.query(
        "insert into osp_private.background_jobs values ($1,$2,'generate_supplier_package',$3,$4,clock_timestamp() + interval '1 hour',null)",
        [org, jobId, JSON.stringify({ caseId, snapshotId }), leaseToken],
      );
      return {
        input: {
          organizationId: org,
          caseId,
          setId,
          snapshotId,
          snapshotSha256: sha,
          version: number,
          members: [id(5), id(6)].map((sourceVersionId, index) => ({
            requirementId: `form.${index}`,
            artifact: {
              kind: "pdf",
              flatten: false,
              sourceVersionId,
              sourceSha256: sourceSha,
              sourceBytes: bytes,
              packageSnapshotId: snapshotId,
              packageSnapshotSha256: sha,
              approvedMappingDecisionIds: [id(7)],
              version: number,
              mappings: [{
                kind: "acroform",
                fieldName: "name",
                mappingDecisionId: id(7),
                canonicalFieldId: "company.name",
                value: `Synthetic ${index}`,
              }],
            },
          })),
        },
        job: { jobId, leaseToken },
      };
    };
    const sql = (() => {
      throw new Error("TRANSACTION_REQUIRED");
    }) as SqlPort;
    sql.begin = <T>(fn: (tx: SqlPort) => Promise<T>) =>
      db.transaction(async (dbtx) => {
        const tx =
          (async (strings: TemplateStringsArray, ...values: unknown[]) => {
            const query = strings.reduce(
              (text, part, index) => text + (index ? `$${index}` : "") + part,
              "",
            );
            if (failPublication && query.includes("set status = 'current'")) {
              throw new Error("INJECTED_DATABASE_FAILURE");
            }
            return (await dbtx.query(query, values)).rows as SqlRow[];
          }) as SqlPort;
        return await fn(tx);
      });
    const written = new Map<string, Uint8Array>();
    const objects = {
      writeExclusive: (entry: { objectId: string; bytes: Uint8Array }) => {
        if (written.has(entry.objectId)) {
          assertEquals(written.get(entry.objectId), entry.bytes);
        }
        written.set(entry.objectId, entry.bytes);
        return Promise.resolve();
      },
    };
    const one = await createInput(1);
    const first = await createSupplierPackageSetStore(sql, one.input, one.job);
    await t.step(
      "reserve and publish two files as one current set",
      async () => {
        assertEquals(await first.reserve(), null);
        assertEquals(await first.reserve(), null);
        const receipt = await generateSupplierPackageSet(one.input, {
          objects,
          publisher: first,
        });
        assertEquals(
          (await first.load(one.input.setId))?.manifestSha256,
          receipt.manifestSha256,
        );
        assertEquals((await first.reserve())?.members.length, 2);
        await first.publish(receipt);
        assertEquals(written.size, 2);
      },
    );
    await t.step(
      "changed mapping cannot reuse the reserved snapshot",
      async () => {
        const changed = structuredClone(one.input);
        (changed.members[0].artifact.mappings[0] as { value: string }).value =
          "Changed";
        const store = await createSupplierPackageSetStore(
          sql,
          changed,
          one.job,
        );
        await assertRejects(
          () => store.reserve(),
          Error,
          "SUPPLIER_PACKAGE_SET_PLAN_CONFLICT",
        );
      },
    );
    await t.step(
      "tenant reader cannot see another organization's set",
      async () => {
        await db.transaction(async (tx) => {
          await tx.exec("set local role osp_workflow_api");
          await tx.query("select set_config('osp.organization_id',$1,true)", [
            id(99),
          ]);
          assertEquals(
            (await tx.query("select * from osp_private.supplier_package_sets"))
              .rows.length,
            0,
          );
        });
        await assertRejects(
          () =>
            db.transaction(async (tx) => {
              await tx.exec("set local role osp_workflow_api");
              await tx.exec(
                "update osp_private.supplier_package_sets set status='superseded'",
              );
            }),
          Error,
          "permission denied",
        );
      },
    );
    await t.step("stale snapshot and expired job cannot reserve", async () => {
      await db.query(
        "update osp_private.customer_registration_cases set aggregate_version=2",
      );
      await assertRejects(
        () => first.reserve(),
        Error,
        "SUPPLIER_PACKAGE_SET_STALE_SNAPSHOT",
      );
      await db.query(
        "update osp_private.customer_registration_cases set aggregate_version=1",
      );
      await db.query(
        "update osp_private.background_jobs set leased_until=clock_timestamp()-interval '1 second'",
      );
      await assertRejects(() => first.reserve(), Error, "LEASE_CONFLICT");
      await db.query(
        "update osp_private.background_jobs set leased_until=clock_timestamp()+interval '1 hour'",
      );
    });
    await t.step(
      "locking helper is worker-only and rejects a mismatched tenant",
      async () => {
        const rights = (await db.query<
          { reader: boolean; browser: boolean; case_update: boolean }
        >(`
        select has_function_privilege('osp_workflow_api',
          'osp_private.lock_supplier_package_set_context(uuid,uuid,uuid,text,uuid,uuid)', 'execute') as reader,
          has_function_privilege('authenticated',
          'osp_private.lock_supplier_package_set_context(uuid,uuid,uuid,text,uuid,uuid)', 'execute') as browser,
          has_table_privilege('osp_worker', 'osp_private.customer_registration_cases', 'update') as case_update
      `)).rows[0];
        assertEquals(rights, {
          reader: false,
          browser: false,
          case_update: false,
        });
        await assertRejects(
          () =>
            db.transaction(async (tx) => {
              await tx.exec("set local role osp_worker");
              await tx.query(
                "select set_config('osp.organization_id',$1,true)",
                [id(99)],
              );
              await tx.query(
                "select osp_private.lock_supplier_package_set_context($1,$2,$3,$4,$5,$6)",
                [
                  org,
                  caseId,
                  one.input.snapshotId,
                  one.input.snapshotSha256,
                  one.job.jobId,
                  leaseToken,
                ],
              );
            }),
          Error,
          "INVALID_ORGANIZATION",
        );
      },
    );
    const two = await createInput(2);
    const second = await createSupplierPackageSetStore(sql, two.input, two.job);
    await t.step(
      "older snapshot with the same case version cannot be republished",
      async () => {
        await assertRejects(
          () => first.reserve(),
          Error,
          "SUPPLIER_PACKAGE_SET_STALE_SNAPSHOT",
        );
      },
    );
    await t.step(
      "database failure after retiring old set rolls the retirement back",
      async () => {
        await second.reserve();
        failPublication = true;
        await assertRejects(
          () =>
            generateSupplierPackageSet(two.input, {
              objects,
              publisher: second,
            }),
          Error,
          "SUPPLIER_PACKAGE_SET_RECONCILIATION_REQUIRED",
        );
        failPublication = false;
        const rows = (await db.query<{ status: string }>(
          "select status from osp_private.supplier_package_sets order by version",
        )).rows;
        assertEquals(rows.map((r) => r.status), [
          "current",
          "manual_reconciliation_required",
        ]);
        assertEquals(written.size, 4);
        await assertRejects(
          () => second.reserve(),
          Error,
          "SUPPLIER_PACKAGE_SET_RECONCILIATION_REQUIRED",
        );
      },
    );
    const three = await createInput(3);
    const third = await createSupplierPackageSetStore(
      sql,
      three.input,
      three.job,
    );
    await t.step(
      "later successful set preserves old receipt and all stored files",
      async () => {
        const before = await first.load(one.input.setId);
        await third.reserve();
        await generateSupplierPackageSet(three.input, {
          objects,
          publisher: third,
        });
        assertEquals(await first.load(one.input.setId), before);
        const rows = (await db.query<{ status: string }>(
          "select status from osp_private.supplier_package_sets order by version",
        )).rows;
        assertEquals(rows.map((r) => r.status), [
          "superseded",
          "manual_reconciliation_required",
          "current",
        ]);
        assertEquals(written.size, 6);
      },
    );
    await t.step(
      "published receipt cannot be edited and an empty manifest is rejected",
      async () => {
        await assertRejects(
          () =>
            db.exec(
              "update osp_private.supplier_package_sets set receipt_json='{}' where status='current'",
            ),
          Error,
          "SUPPLIER_PACKAGE_SET_IMMUTABLE",
        );
        const receipt = await third.load(three.input.setId);
        await assertRejects(
          () => third.publish({ ...receipt!, members: [] }),
          Error,
          "SUPPLIER_PACKAGE_SET_RECEIPT_INVALID",
        );
      },
    );
    await t.step(
      "revoked source approval prevents publication preflight",
      async () => {
        await db.query(
          "update osp_private.document_versions set status='rejected' where id=$1",
          [id(5)],
        );
        await assertRejects(
          () => third.reserve(),
          Error,
          "SUPPLIER_PACKAGE_SET_SOURCE_CONFLICT",
        );
      },
    );
    await t.step(
      "worker resolves both originals, publishes all and reader returns both",
      async () => {
        await db.exec(`
        update osp_private.document_versions set status='approved';
        alter table osp_private.document_versions add column bucket_id text default 'osp-original-documents', add column opaque_object_key text default 'synthetic-original';
        alter table osp_private.case_package_input_snapshots
          add column template_version_id uuid, add column form_instance_id uuid,
          add column form_instance_version integer default 1, add column extraction_ids uuid[],
          add column mapping_refs jsonb, add column field_evidence_refs jsonb default '[]';
        create table osp_private.supplier_package_generation_runs (id uuid, organization_id uuid, input_snapshot_id uuid);
        create table osp_private.case_form_instances (id uuid,organization_id uuid,case_id uuid,version integer,values_json jsonb);
        create table osp_private.supplier_form_mappings (id uuid,organization_id uuid,case_id uuid,template_version_id uuid,extraction_id uuid,status text,review_decision_id uuid,version integer,after_sha256 text,mapping_json jsonb);
        create table osp_private.document_extractions (id uuid,organization_id uuid,case_id uuid,source_version_id uuid,status text);
        create table osp_private.form_fields (id uuid,organization_id uuid,template_version_id uuid,field_key text,definition_json jsonb,position integer);
        create table osp_private.extraction_fields (id uuid,organization_id uuid,extraction_id uuid,field_key text,evidence_json jsonb);
        grant select on osp_private.supplier_package_generation_runs,osp_private.case_form_instances,osp_private.supplier_form_mappings,osp_private.document_extractions,osp_private.form_fields,osp_private.extraction_fields,osp_private.customer_registration_cases to osp_worker;
        grant select on osp_private.case_package_input_snapshots,osp_private.document_versions to osp_workflow_api;
      `);
        const four = await createInput(4);
        const refs = [5, 6].map((n) => ({
          mappingId: id(40 + n),
          mappingVersion: "1",
          mappingSha256: "e".repeat(64),
          extractionId: id(50 + n),
          reviewDecisionId: id(7),
        }));
        await db.query(
          "update osp_private.case_package_input_snapshots set template_version_id=$1,form_instance_id=$2,extraction_ids=$3,mapping_refs=$4 where id=$5",
          [
            id(30),
            id(31),
            [id(55), id(56)],
            JSON.stringify(refs),
            four.input.snapshotId,
          ],
        );
        await db.query(
          "insert into osp_private.case_form_instances values ($1,$2,$3,1,$4)",
          [id(31), org, caseId, JSON.stringify({ name: "Synthetic XBF" })],
        );
        await db.query(
          "insert into osp_private.form_fields values ($1,$2,$3,'name',$4,1)",
          [
            id(32),
            org,
            id(30),
            JSON.stringify({ canonicalFieldId: "company.name" }),
          ],
        );
        for (const n of [5, 6]) {
          await db.query(
            "insert into osp_private.document_extractions values ($1,$2,$3,$4,'reviewed')",
            [id(50 + n), org, caseId, id(n)],
          );
          await db.query(
            "insert into osp_private.supplier_form_mappings values ($1,$2,$3,$4,$5,'accepted',$6,1,$7,'{}')",
            [
              id(40 + n),
              org,
              caseId,
              id(30),
              id(50 + n),
              id(7),
              "e".repeat(64),
            ],
          );
        }
        const storageClient = {
          storage: {
            from: () => ({
              download: () =>
                Promise.resolve({
                  error: null,
                  data: new Blob([bytes as BlobPart]),
                }),
            }),
          },
        };
        const jobInput = {
          organizationId: org,
          caseId,
          snapshotId: four.input.snapshotId,
          ...four.job,
        };
        const generated = await tryGenerateSupplierPackageSet(jobInput, {
          sql,
          objects,
          storageClient: storageClient as never,
        });
        assertEquals(generated?.members.length, 2);
        assertEquals(written.size, 8);
        assertEquals(
          (await tryGenerateSupplierPackageSet(jobInput, {
            sql,
            objects,
            storageClient: storageClient as never,
          }))?.manifestSha256,
          generated?.manifestSha256,
        );
        assertEquals(written.size, 8);
        await db.transaction(async (dbtx) => {
          await dbtx.exec("set local role osp_workflow_api");
          await dbtx.query("select set_config('osp.organization_id',$1,true)", [
            org,
          ]);
          const reader =
            (async (strings: TemplateStringsArray, ...values: unknown[]) =>
              (await dbtx.query(
                strings.reduce(
                  (text, part, index) =>
                    text + (index ? `$${index}` : "") + part,
                  "",
                ),
                values,
              )).rows as SqlRow[]) as SqlPort;
          const view = await loadWorkflowPackageSet(reader, {
            organizationId: org,
            caseId,
            snapshotSha256: four.input.snapshotSha256,
          });
          assertEquals(view?.files.length, 2);
          assertEquals(view?.files.map((file) => file.sourceVersionId), [
            id(5),
            id(6),
          ]);
        });
      },
    );
  } finally {
    await db.close();
  }
});
