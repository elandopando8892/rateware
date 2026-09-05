import { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import { readAnswerMemorySummary } from "./answer-memory.ts";
import type { SqlPort, SqlRow } from "../_shared/osp/database-context.ts";

const org = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const caseId = "33333333-3333-4333-8333-333333333333";
const instanceId = "44444444-4444-4444-8444-444444444444";
const templateId = "55555555-5555-4555-8555-555555555555";
const entityId = "66666666-6666-4666-8666-666666666666";

Deno.test("saved answers create an isolated, versioned pending inbox without entering approved memory", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema osp_private;
      create role anon; create role authenticated; create role service_role;
      create role osp_worker; create role osp_workflow_api;
      grant usage on schema osp_private to osp_workflow_api;
      create table public.legal_entities(organization_id uuid,id uuid,unique(organization_id,id));
      create table osp_private.customer_registration_cases(organization_id uuid,id uuid,unique(organization_id,id));
      create table osp_private.form_template_versions(organization_id uuid,id uuid,status text,schema_sha256 text,unique(organization_id,id));
      create table osp_private.form_fields(organization_id uuid,template_version_id uuid,field_key text,definition_json jsonb);
      create table osp_private.case_profile_bindings(organization_id uuid,case_id uuid,legal_entity_id uuid,revision integer);
      create table osp_private.case_form_instances(organization_id uuid,id uuid,case_id uuid,template_version_id uuid,
        version integer,values_json jsonb,unique(organization_id,id));
      create table public.provider_legal_entity_facts(id uuid);
      insert into public.legal_entities values('${org}','${entityId}'),('${org}','${other}');
      insert into osp_private.customer_registration_cases values('${org}','${caseId}');
      insert into osp_private.form_template_versions values('${org}','${templateId}','published','${
      "a".repeat(64)
    }');
      insert into osp_private.case_profile_bindings values('${org}','${caseId}','${entityId}',1);
      select set_config('osp.organization_id','${org}',false);
    `);
    const field = async (key: string, canonical: string, kind = "text") =>
      await db.query(
        "insert into osp_private.form_fields values ($1,$2,$3,$4::jsonb)",
        [
          org,
          templateId,
          key,
          JSON.stringify({
            canonicalFieldId: canonical,
            label: key,
            definition: { kind },
          }),
        ],
      );
    await field("website", "supplier.website");
    await field("bank", "banking.accountNumber");
    await field("credential", "portal.password");
    await field("signature", "signature.legalRepresentative", "signature");
    await field("credit", "credit.amount");
    await field("refs", "supplier.references", "table");
    await field("unknown", "supplier.custom");
    await field("other_kind", "supplier.email", "table");
    // A saved instance before the migration is deliberately NOT backfilled.
    await db.query(
      "insert into osp_private.case_form_instances values ($1,$2,$3,$4,1,$5::jsonb)",
      [
        org,
        instanceId,
        caseId,
        templateId,
        JSON.stringify({ website: "https://old.example.test" }),
      ],
    );
    await db.exec(
      await Deno.readTextFile(
        new URL(
          "../../migrations/20260905053000_osp_case_answer_memory_candidates.sql",
          import.meta.url,
        ),
      ),
    );
    const rows = async () =>
      (await db.query<Record<string, unknown>>(
        "select * from osp_private.case_answer_memory_candidates order by source_instance_version",
      )).rows;
    assertEquals(await rows(), []);
    await t.step(
      "save captures only permitted scalar answers with source and entity context",
      async () => {
        await db.query(
          "update osp_private.case_form_instances set version=2,values_json=$1::jsonb",
          [JSON.stringify({
            website: "https://new.example.test",
            bank: "synthetic-bank",
            credential: "synthetic-secret",
            signature: "synthetic-signature",
            credit: 50000,
            refs: [{ company: "Synthetic" }],
            unknown: "unclassified",
            other_kind: "not a scalar definition",
          })],
        );
        const captured = await rows();
        assertEquals(captured.length, 1);
        assertEquals(captured[0].answer_value, "https://new.example.test");
        assertEquals(captured[0].legal_entity_id, entityId);
        assertEquals(captured[0].binding_revision, 1);
        assertEquals(captured[0].source_instance_version, 2);
        assertEquals(captured[0].reuse_scope, "case_only");
        assertEquals(captured[0].review_status, "pending_review");
        assertEquals(String(captured[0].answer_sha256).length, 64);
      },
    );
    await t.step(
      "same saved revision is idempotent; changing values preserves the prior candidate",
      async () => {
        await db.exec(
          "update osp_private.case_form_instances set values_json=values_json",
        );
        assertEquals((await rows()).length, 1);
        await db.query(
          "update osp_private.case_form_instances set version=3,values_json=$1::jsonb",
          [JSON.stringify({ website: "https://changed.example.test" })],
        );
        const history = await rows();
        assertEquals(history.map((row) => row.source_instance_version), [2, 3]);
        assertEquals(history[0].answer_value, "https://new.example.test");
        assertEquals(
          history[0].answer_sha256 === history[1].answer_sha256,
          false,
        );
      },
    );
    await t.step(
      "rebinding an entity never relabels older candidates",
      async () => {
        await db.exec(
          `update osp_private.case_profile_bindings set legal_entity_id='${other}',revision=2;
        update osp_private.case_form_instances set version=4;`,
        );
        assertEquals((await rows()).map((row) => row.legal_entity_id), [
          entityId,
          entityId,
          other,
        ]);
      },
    );
    await t.step(
      "missing entity binding remains explicit, never guessed",
      async () => {
        await db.exec(
          "delete from osp_private.case_profile_bindings; update osp_private.case_form_instances set version=5;",
        );
        assertEquals((await rows()).at(-1)?.legal_entity_id, null);
        assertEquals((await rows()).at(-1)?.binding_revision, null);
      },
    );
    await t.step(
      "blank values and unclassified fields do not produce candidates",
      async () => {
        const before = (await rows()).length;
        await db.query(
          "update osp_private.case_form_instances set version=6,values_json=$1::jsonb",
          [JSON.stringify({ website: "   ", unknown: "still unknown" })],
        );
        assertEquals((await rows()).length, before);
      },
    );
    await t.step(
      "capture rolls back together with its source transaction",
      async () => {
        const before = (await rows()).length;
        await db.exec("begin");
        await db.query(
          "update osp_private.case_form_instances set version=7,values_json=$1::jsonb",
          [JSON.stringify({ website: "https://rollback.example.test" })],
        );
        assertEquals((await rows()).length, before + 1);
        await db.exec("rollback");
        assertEquals((await rows()).length, before);
      },
    );
    await t.step(
      "changing a saved value without a new version is rejected",
      async () => {
        await assertRejects(
          () =>
            db.query(
              "update osp_private.case_form_instances set values_json=$1::jsonb",
              [JSON.stringify({ website: "https://unversioned.example.test" })],
            ),
          Error,
          "ANSWER_MEMORY_REVISION_REQUIRED",
        );
        assertEquals((await rows()).length, 4);
      },
    );
    await t.step(
      "cross-tenant writes fail and API reads are tenant scoped and read-only",
      async () => {
        await db.exec(
          `select set_config('osp.organization_id','${other}',false)`,
        );
        await assertRejects(
          () => db.exec("update osp_private.case_form_instances set version=7"),
          Error,
          "ANSWER_MEMORY_TENANT_MISMATCH",
        );
        await db.exec("set role osp_workflow_api");
        assertEquals(await rows(), []);
        await db.exec(
          `select set_config('osp.organization_id','${org}',false)`,
        );
        assertEquals((await rows()).length, 4);
        await assertRejects(
          () =>
            db.exec(
              "update osp_private.case_answer_memory_candidates set review_status='pending_review'",
            ),
          Error,
          "permission denied",
        );
        await assertRejects(
          () =>
            db.exec("delete from osp_private.case_answer_memory_candidates"),
          Error,
          "permission denied",
        );
        await db.exec("reset role");
      },
    );
    await t.step(
      "the API read summary exposes counts, never reusable approval or candidate values",
      async () => {
        const tx =
          (async (strings: TemplateStringsArray, ...values: unknown[]) => {
            const query = strings.reduce(
              (text, part, index) => text + (index ? `$${index}` : "") + part,
              "",
            );
            return (await db.query(query, values)).rows as SqlRow[];
          }) as SqlPort;
        await db.exec(
          "grant select on osp_private.case_form_instances, osp_private.case_profile_bindings to osp_workflow_api; set role osp_workflow_api",
        );
        try {
          assertEquals(await readAnswerMemorySummary(tx, org, caseId), {
            pendingCount: 4,
            unboundCount: 1,
            staleCount: 4,
            approvedForReuse: false,
          });
          assertEquals(await readAnswerMemorySummary(tx, org, other), {
            pendingCount: 0,
            unboundCount: 0,
            staleCount: 0,
            approvedForReuse: false,
          });
          await db.exec(
            `select set_config('osp.organization_id','${other}',false)`,
          );
          assertEquals(await readAnswerMemorySummary(tx, org, caseId), {
            pendingCount: 0,
            unboundCount: 0,
            staleCount: 0,
            approvedForReuse: false,
          });
        } finally {
          await db.exec("reset role");
        }
      },
    );
    await t.step(
      "basic multiline, phone and email answers remain pending scalars",
      async () => {
        await db.exec("begin");
        try {
          await db.exec(
            `select set_config('osp.organization_id','${org}',false)`,
          );
          await field("address", "supplier.address", "textarea");
          await field("phone", "supplier.phone", "phone");
          await field("email", "supplier.email", "email");
          await db.query(
            "update osp_private.case_form_instances set version=7,values_json=$1::jsonb",
            [JSON.stringify({
              address: "Synthetic office\nExample city",
              phone: "+52 81 0000 0001",
              email: "test@example.test",
            })],
          );
          const captured = (await rows()).filter((row) =>
            row.source_instance_version === 7
          );
          assertEquals(captured.length, 3);
          assertEquals(
            captured.every((row) =>
              row.review_status === "pending_review" &&
              row.reuse_scope === "case_only"
            ),
            true,
          );
        } finally {
          await db.exec("rollback");
        }
      },
    );
    assertEquals(
      (await db.query<{ count: number }>(
        "select count(*)::int as count from public.provider_legal_entity_facts",
      )).rows[0].count,
      0,
    );
  } finally {
    await db.close();
  }
});
