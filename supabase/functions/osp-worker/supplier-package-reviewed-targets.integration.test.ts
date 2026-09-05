import { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import type { SqlPort, SqlRow } from "../_shared/osp/database-context.ts";
import { createPostgresSupplierPackageRecordStore } from "./supplier-package-runtime.ts";

const uuid = (n: number) =>
  `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const input = {
  organizationId: uuid(1),
  caseId: uuid(2),
  snapshotId: uuid(3),
  jobId: uuid(4),
  leaseToken: uuid(5),
};

Deno.test("runtime source SQL resolves reviewed tables without dropping invalid targets or bypassing snapshot authority", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema osp_private;
      create table osp_private.case_package_input_snapshots (id uuid primary key, organization_id uuid, case_id uuid, canonical_sha256 text, case_version integer, form_instance_id uuid, form_instance_version integer, template_version_id uuid, extraction_ids uuid[], review_decision_ids uuid[], document_version_ids uuid[], mapping_refs jsonb);
      create table osp_private.customer_registration_cases (id uuid, organization_id uuid, state text, aggregate_version integer);
      create table osp_private.case_form_instances (id uuid, organization_id uuid, case_id uuid, version integer, values_json jsonb);
      create table osp_private.supplier_form_mappings (id uuid, organization_id uuid, case_id uuid, template_version_id uuid, extraction_id uuid, status text, review_decision_id uuid, version integer, after_sha256 text, mapping_json jsonb);
      create table osp_private.document_extractions (id uuid, organization_id uuid, case_id uuid, source_version_id uuid, status text);
      create table osp_private.document_versions (id uuid primary key, organization_id uuid, source_sha256 text, bucket_id text, opaque_object_key text, content_type text, document_type text, status text);
      create table osp_private.form_fields (organization_id uuid, template_version_id uuid, field_key text, definition_json jsonb);
    `);
    const { organizationId: org, caseId, snapshotId } = input;
    const instance = uuid(6),
      template = uuid(7),
      extraction = uuid(8),
      decision = uuid(9),
      source = uuid(10),
      mapping = uuid(11);
    const sha = "a".repeat(64);
    const references = ["Alpha", "Beta", "Gamma"].map((company) => ({
      company,
      contact: `Contact ${company}`,
      email: `${company}@example.test`,
    }));
    const scalar = {
      canonicalFieldId: "company.name",
      sheet: "1-2",
      cell: "B2",
    };
    const targets = [
      scalar,
      ...references.flatMap((_row, rowIndex) =>
        ["company", "contact", "email"].map((columnId, col) => ({
          fieldKey: "references",
          rowIndex,
          columnId,
          sheet: "2-2",
          cell: `${String.fromCharCode(66 + col)}${10 + rowIndex}`,
        }))
      ),
    ];
    await db.query(
      "insert into osp_private.case_package_input_snapshots values ($1,$2,$3,$4,1,$5,1,$6,$7,$8,$9,$10)",
      [
        snapshotId,
        org,
        caseId,
        sha,
        instance,
        template,
        [extraction],
        [decision],
        [source],
        JSON.stringify([{
          mappingId: mapping,
          mappingVersion: 1,
          mappingSha256: sha,
          extractionId: extraction,
          reviewDecisionId: decision,
        }]),
      ],
    );
    await db.query(
      "insert into osp_private.customer_registration_cases values ($1,$2,'operations_review',1)",
      [caseId, org],
    );
    await db.query(
      "insert into osp_private.case_form_instances values ($1,$2,$3,1,$4)",
      [
        instance,
        org,
        caseId,
        JSON.stringify({ legal_name: "Synthetic XBF", references }),
      ],
    );
    await db.query(
      "insert into osp_private.supplier_form_mappings values ($1,$2,$3,$4,$5,'accepted',$6,1,$7,$8)",
      [
        mapping,
        org,
        caseId,
        template,
        extraction,
        decision,
        sha,
        JSON.stringify({ artifactTargets: targets }),
      ],
    );
    await db.query(
      "insert into osp_private.document_extractions values ($1,$2,$3,$4,'reviewed')",
      [extraction, org, caseId, source],
    );
    await db.query(
      "insert into osp_private.document_versions values ($1,$2,$3,'synthetic','source','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','supplier_requirement','approved')",
      [source, org, sha],
    );
    const metadata = (canonicalFieldId: string | null, definition: unknown) =>
      JSON.stringify({
        label: "Synthetic field",
        required: true,
        canonicalFieldId,
        supplierAliases: [],
        definition,
      });
    await db.query("insert into osp_private.form_fields values ($1,$2,$3,$4)", [
      org,
      template,
      "legal_name",
      metadata("company.name", { kind: "text", minLength: 1, maxLength: 100 }),
    ]);
    await db.query("insert into osp_private.form_fields values ($1,$2,$3,$4)", [
      org,
      template,
      "references",
      metadata(null, {
        kind: "repeating_table",
        minRows: 3,
        maxRows: 4,
        columns: [{
          id: "company",
          label: "Company",
          valueType: "text",
          required: true,
        }, {
          id: "contact",
          label: "Contact",
          valueType: "text",
          required: true,
        }, { id: "email", label: "Email", valueType: "email", required: true }],
      }),
    ]);
    let downloads = 0, reservations = 0;
    const sql =
      (async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.reduce(
          (text, part, index) => text + (index ? `$${index}` : "") + part,
          "",
        );
        if (
          query.includes("'reviewedTarget'") ||
          query.startsWith("select field.field_key")
        ) return (await db.query(query, values)).rows as SqlRow[];
        if (query.startsWith("select id from osp_private.background_jobs")) {
          return [{ id: input.jobId }];
        }
        if (query.includes("coalesce(max(version)")) return [{ version: 1 }];
        if (
          query.startsWith(
            "insert into osp_private.supplier_package_generation_runs",
          )
        ) reservations++;
        return [];
      }) as SqlPort;
    sql.begin = async <T>(fn: (tx: SqlPort) => Promise<T>) => await fn(sql);
    const storageClient = {
      storage: {
        from: () => ({
          download: () => {
            downloads++;
            return Promise.resolve({
              error: null,
              data: new Blob([new Uint8Array([1])]),
            });
          },
        }),
      },
    } as unknown as Parameters<
      typeof createPostgresSupplierPackageRecordStore
    >[0]["storageClient"];
    const store = createPostgresSupplierPackageRecordStore({
      databaseUrl: "postgresql://example.invalid/test",
      storageClient,
      postgresFactory: () => sql,
    });
    await t.step(
      "scalar and complete reference cells resolve together",
      async () => {
        const prepared = await store.prepare(input);
        assertEquals(prepared.kind, "ready");
        if (
          prepared.kind !== "ready" || prepared.input.kind !== "xlsx"
        ) throw Error("UNEXPECTED_RESULT");
        assertEquals(prepared.input.mappings.length, 10);
        assertEquals(
          prepared.input.mappings.find((item) =>
            item.canonicalFieldId === "references.row3.email"
          )?.value,
          "Gamma@example.test",
        );
        assertEquals(downloads, 1);
      },
    );
    const blocked = async (nextTargets: unknown[], error: string) => {
      await db.query(
        "update osp_private.supplier_form_mappings set mapping_json=$1",
        [JSON.stringify({ artifactTargets: nextTargets })],
      );
      downloads = 0;
      reservations = 0;
      await assertRejects(() => store.prepare(input), Error, error);
      assertEquals(downloads, 0);
      assertEquals(reservations, 0);
    };
    const projectedTargets = [
      scalar,
      ...references.flatMap((_row, rowIndex) => [{
        fieldKey: "references",
        rowIndex,
        columnIds: ["company", "contact"],
        separator: " — ",
        sheet: "2-2",
        cell: `B${10 + rowIndex}`,
      }, {
        fieldKey: "references",
        rowIndex,
        columnId: "email",
        sheet: "2-2",
        cell: `D${10 + rowIndex}`,
      }]),
    ];
    await t.step(
      "SQL passes explicit joined selectors to the resolver without losing contacts",
      async () => {
        await db.query(
          "update osp_private.supplier_form_mappings set mapping_json=$1",
          [
            JSON.stringify({ artifactTargets: projectedTargets }),
          ],
        );
        const prepared = await store.prepare(input);
        if (prepared.kind !== "ready" || prepared.input.kind !== "xlsx") {
          throw Error("UNEXPECTED_RESULT");
        }
        assertEquals(prepared.input.mappings.length, 7);
        assertEquals(
          prepared.input.mappings.find((item) =>
            item.canonicalFieldId === "references.row3.joined.company.contact"
          )?.value,
          "Gamma — Contact Gamma",
        );
      },
    );
    await t.step(
      "invalid joined selector fails before reservation or source download",
      () =>
        blocked([
          scalar,
          { ...projectedTargets[1], columnIds: ["company", "missing"] },
          ...projectedTargets.slice(2),
        ], "ARTIFACT_MAPPING_INVALID"),
    );
    await t.step(
      "joined mapping still requires accepted or corrected review authority",
      async () => {
        await db.query(
          "update osp_private.supplier_form_mappings set status='suggested'",
        );
        await blocked(projectedTargets, "SUPPLIER_PACKAGE_INPUT_INVALID");
        await db.query(
          "update osp_private.supplier_form_mappings set status='accepted'",
        );
      },
    );
    await t.step(
      "unknown target is retained and rejected instead of silently filtered",
      () =>
        blocked([...targets, {
          canonicalFieldId: "unknown.field",
          sheet: "1-2",
          cell: "Z1",
        }], "ARTIFACT_MAPPING_INVALID"),
    );
    await t.step(
      "partial table targets cannot generate a shortened spreadsheet",
      () => blocked(targets.slice(0, -1), "ARTIFACT_TABLE_TARGETS_INCOMPLETE"),
    );
    await t.step(
      "entirely omitted required table blocks scalar-only output",
      () => blocked([scalar], "ARTIFACT_TABLE_TARGETS_INCOMPLETE"),
    );
    await t.step("mapping hash drift does not acquire any source", async () => {
      await db.query(
        "update osp_private.supplier_form_mappings set after_sha256=$1",
        ["b".repeat(64)],
      );
      await blocked(targets, "SUPPLIER_PACKAGE_INPUT_INVALID");
    });
  } finally {
    await db.close();
  }
});
