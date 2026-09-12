// deno-lint-ignore-file no-import-prefix -- pinned local integration dependency
import { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import type { SqlPort, SqlRow } from "../_shared/osp/database-context.ts";
import { loadReviewedPackageSetSources } from "./supplier-package-set-sources.ts";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = {
  organizationId: id(1),
  caseId: id(2),
  snapshotId: id(3),
  jobId: id(4),
  leaseToken: id(5),
};
const sha = (character: string) => character.repeat(64);

Deno.test("PGlite loader accepts only exact reviewed native targets", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema osp_private;
      create table osp_private.case_package_input_snapshots (id uuid, organization_id uuid, case_id uuid, canonical_sha256 text, case_version integer, form_instance_id uuid, form_instance_version integer, template_version_id uuid, extraction_ids uuid[], review_decision_ids uuid[], document_version_ids uuid[], mapping_refs jsonb, field_evidence_refs jsonb default '[]');
      create table osp_private.customer_registration_cases (id uuid, organization_id uuid, state text, aggregate_version integer);
      create table osp_private.case_form_instances (id uuid, organization_id uuid, case_id uuid, version integer, values_json jsonb);
      create table osp_private.supplier_form_mappings (id uuid, organization_id uuid, case_id uuid, template_version_id uuid, extraction_id uuid, status text, review_decision_id uuid, version integer, before_sha256 text, after_sha256 text, mapping_json jsonb);
      create table osp_private.review_decisions (id uuid, organization_id uuid, case_id uuid, subject_kind text, subject_id uuid, decision text, before_sha256 text, after_sha256 text);
      create table osp_private.document_extractions (id uuid, organization_id uuid, case_id uuid, source_version_id uuid, status text);
      create table osp_private.document_versions (id uuid, organization_id uuid, source_sha256 text, bucket_id text, opaque_object_key text, content_type text, document_type text, status text);
      create table osp_private.form_fields (id uuid, organization_id uuid, template_version_id uuid, field_key text, definition_json jsonb, position integer);
      create table osp_private.extraction_fields (id uuid, organization_id uuid, extraction_id uuid, field_key text, evidence_json jsonb);
    `);
    const template = id(6), instance = id(7);
    const specs = [
      {
        n: 10,
        contentType: "application/pdf",
        fieldKey: "legal_name",
        canonicalFieldId: "company.name",
        value: "Synthetic XBF",
        target: {
          kind: "acroform",
          canonicalFieldId: "company.name",
          fieldName: "legal_name",
        },
      },
      {
        n: 20,
        contentType: "application/pdf",
        fieldKey: "tax_id",
        canonicalFieldId: "company.tax_id",
        value: "XAXX010101000",
        target: {
          kind: "overlay",
          canonicalFieldId: "company.tax_id",
          page: 1,
          x: 10,
          y: 20,
          width: 180,
          height: 14,
          fontSize: 10,
        },
      },
      {
        n: 30,
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fieldKey: "contact_name",
        canonicalFieldId: "contact.name",
        value: "Ada Lovelace",
        target: {
          kind: "content_control",
          canonicalFieldId: "contact.name",
          targetTag: "contact.name",
        },
      },
    ];
    const refs = specs.map(({ n }) => ({
      mappingId: id(n + 1),
      mappingVersion: "1",
      mappingSha256: sha("b"),
      extractionId: id(n + 2),
      reviewDecisionId: id(n + 3),
    }));
    await db.query(
      "insert into osp_private.customer_registration_cases values ($1,$2,'operations_review',1)",
      [input.caseId, input.organizationId],
    );
    await db.query(
      "insert into osp_private.case_form_instances values ($1,$2,$3,1,$4)",
      [
        instance,
        input.organizationId,
        input.caseId,
        JSON.stringify(
          Object.fromEntries(specs.map((item) => [item.fieldKey, item.value])),
        ),
      ],
    );
    await db.query(
      "insert into osp_private.case_package_input_snapshots values ($1,$2,$3,$4,1,$5,1,$6,$7,$8,$9,$10)",
      [
        input.snapshotId,
        input.organizationId,
        input.caseId,
        sha("a"),
        instance,
        template,
        specs.map(({ n }) => id(n + 2)),
        specs.map(({ n }) => id(n + 3)),
        specs.map(({ n }) => id(n)),
        JSON.stringify(refs),
      ],
    );
    for (const [index, spec] of specs.entries()) {
      const sourceId = id(spec.n), mappingId = id(spec.n + 1);
      const extractionId = id(spec.n + 2), decisionId = id(spec.n + 3);
      await db.query(
        "insert into osp_private.document_versions values ($1,$2,$3,'originals',$4,$5,'supplier_requirement','approved')",
        [
          sourceId,
          input.organizationId,
          sha("c"),
          `source-${spec.n}`,
          spec.contentType,
        ],
      );
      await db.query(
        "insert into osp_private.document_extractions values ($1,$2,$3,$4,'reviewed')",
        [extractionId, input.organizationId, input.caseId, sourceId],
      );
      await db.query(
        "insert into osp_private.form_fields values ($1,$2,$3,$4,$5,$6)",
        [
          id(100 + index),
          input.organizationId,
          template,
          spec.fieldKey,
          JSON.stringify({ canonicalFieldId: spec.canonicalFieldId }),
          index,
        ],
      );
      await db.query(
        "insert into osp_private.supplier_form_mappings values ($1,$2,$3,$4,$5,'accepted',$6,1,$7,$8,$9)",
        [
          mappingId,
          input.organizationId,
          input.caseId,
          template,
          extractionId,
          decisionId,
          sha("d"),
          sha("b"),
          JSON.stringify({
            artifactTargetSchemaVersion: 1,
            artifactTargetSource: {
              sourceVersionId: sourceId,
              sourceSha256: sha("c"),
            },
            artifactTargets: [spec.target],
          }),
        ],
      );
      await db.query(
        "insert into osp_private.review_decisions values ($1,$2,$3,'form_mapping',$4,'accepted',$5,$6)",
        [
          decisionId,
          input.organizationId,
          input.caseId,
          mappingId,
          sha("d"),
          sha("b"),
        ],
      );
    }
    const sql =
      (async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.reduce(
          (text, part, index) => text + (index ? `$${index}` : "") + part,
          "",
        );
        return (await db.query(query, values)).rows as SqlRow[];
      }) as SqlPort;

    await t.step(
      "AcroForm, overlay and content-control targets load",
      async () => {
        const rows = await loadReviewedPackageSetSources(sql, input);
        assertEquals(
          rows.map((row) => (row.mappings as { kind: string }[])[0].kind),
          [
            "acroform",
            "overlay",
            "content_control",
          ],
        );
      },
    );
    const blocked = async (sqlText: string, values: unknown[]) => {
      await db.query(sqlText, values);
      await assertRejects(
        () => loadReviewedPackageSetSources(sql, input),
        Error,
        "SUPPLIER_PACKAGE_SET_SOURCE_CONFLICT",
      );
    };
    await t.step("absent native target blocks", async () => {
      await blocked(
        "update osp_private.supplier_form_mappings set mapping_json=jsonb_set(mapping_json,'{artifactTargets}','[]') where id=$1",
        [id(11)],
      );
      await db.query(
        "update osp_private.supplier_form_mappings set mapping_json=jsonb_set(mapping_json,'{artifactTargets}',$1::jsonb) where id=$2",
        [JSON.stringify([specs[0].target]), id(11)],
      );
    });
    await t.step("source hash mismatch blocks", async () => {
      await blocked(
        "update osp_private.document_versions set source_sha256=$1 where id=$2",
        [sha("e"), id(20)],
      );
      await db.query(
        "update osp_private.document_versions set source_sha256=$1 where id=$2",
        [sha("c"), id(20)],
      );
    });
    await t.step("stale human review hash blocks", async () => {
      await blocked(
        "update osp_private.review_decisions set after_sha256=$1 where id=$2",
        [sha("e"), id(33)],
      );
      await db.query(
        "update osp_private.review_decisions set after_sha256=$1 where id=$2",
        [sha("b"), id(33)],
      );
    });
    await t.step("stale mapping version blocks", async () => {
      const staleRefs = structuredClone(refs);
      staleRefs[2].mappingVersion = "2";
      await blocked(
        "update osp_private.case_package_input_snapshots set mapping_refs=$1",
        [JSON.stringify(staleRefs)],
      );
      await db.query(
        "update osp_private.case_package_input_snapshots set mapping_refs=$1",
        [JSON.stringify(refs)],
      );
    });
    await t.step(
      "appendix is never promoted to original completion",
      async () => {
        await blocked(
          "update osp_private.supplier_form_mappings set mapping_json=jsonb_set(mapping_json,'{artifactTargets}',$1::jsonb) where id=$2",
          [
            JSON.stringify([{
              kind: "appendix",
              canonicalFieldId: "company.name",
            }]),
            id(11),
          ],
        );
        await db.query(
          "update osp_private.supplier_form_mappings set mapping_json=jsonb_set(mapping_json,'{artifactTargets}',$1::jsonb) where id=$2",
          [JSON.stringify([specs[0].target]), id(11)],
        );
      },
    );
    await t.step(
      "parallel reviewed target decisions are ambiguous",
      async () => {
        const duplicateMapping = id(90), duplicateDecision = id(91);
        await db.query(
          "insert into osp_private.supplier_form_mappings select $1,organization_id,case_id,template_version_id,extraction_id,status,$2,version,before_sha256,after_sha256,mapping_json from osp_private.supplier_form_mappings where id=$3",
          [duplicateMapping, duplicateDecision, id(11)],
        );
        await db.query(
          "insert into osp_private.review_decisions values ($1,$2,$3,'form_mapping',$4,'accepted',$5,$6)",
          [
            duplicateDecision,
            input.organizationId,
            input.caseId,
            duplicateMapping,
            sha("d"),
            sha("b"),
          ],
        );
        const ambiguousRefs = [...refs, {
          ...refs[0],
          mappingId: duplicateMapping,
          reviewDecisionId: duplicateDecision,
        }];
        await db.query(
          "update osp_private.case_package_input_snapshots set review_decision_ids=array_append(review_decision_ids,$1),mapping_refs=$2",
          [duplicateDecision, JSON.stringify(ambiguousRefs)],
        );
        await assertRejects(
          () => loadReviewedPackageSetSources(sql, input),
          Error,
          "SUPPLIER_PACKAGE_SET_SOURCE_CONFLICT",
        );
      },
    );
  } finally {
    await db.close();
  }
});
