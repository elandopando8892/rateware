import { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { assertEquals } from "jsr:@std/assert@1.0.14";
import {
  type PreparationCandidate,
  prepareCaseForm,
} from "./automatic-preparation.ts";

const org = "11111111-1111-4111-8111-111111111111";
const entity = "22222222-2222-4222-8222-222222222222";
const otherEntity = "33333333-3333-4333-8333-333333333333";
const caseId = "44444444-4444-4444-8444-444444444444";
const secondCase = "55555555-5555-4555-8555-555555555555";
const otherCase = "66666666-6666-4666-8666-666666666666";
const factId = "77777777-7777-4777-8777-777777777777";

Deno.test("approved profile memory is reused across bound cases without learning unreviewed or stale values", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema osp_private;
      create role anon; create role authenticated; create role osp_worker; create role osp_workflow_api;
      create table osp_private.case_profile_bindings(organization_id uuid, case_id uuid, legal_entity_id uuid);
      create table public.legal_entities(organization_id uuid, id uuid, status text);
      create table public.provider_legal_entity_facts(id uuid, organization_id uuid, legal_entity_id uuid,
        field_code text, fact_value jsonb, fact_status text, sensitivity text, source_review_id uuid,
        source_review_field_id uuid, source_promotion_id uuid, effective_at timestamptz);
      create table public.provider_entity_document_reviews(id uuid, organization_id uuid, legal_entity_id uuid,
        review_status text, decided_at timestamptz, document_asset_id uuid);
      create table public.provider_entity_document_review_fields(id uuid, organization_id uuid, review_id uuid,
        field_code text, field_status text, proposed_value jsonb, reviewer_value jsonb, sensitivity text);
      create table public.provider_legal_entity_fact_promotions(id uuid, organization_id uuid, legal_entity_id uuid,
        review_id uuid, promotion_status text);
      create table public.provider_legal_entity_document_assets(id uuid, organization_id uuid, legal_entity_id uuid,
        lifecycle_status text, verification_status text, effective_date date, expiration_date date);
      insert into osp_private.case_profile_bindings values ('${org}','${caseId}','${entity}'),
        ('${org}','${secondCase}','${entity}'),('${org}','${otherCase}','${otherEntity}');
      insert into public.legal_entities values ('${org}','${entity}','active'),('${org}','${otherEntity}','active');
      insert into public.provider_legal_entity_facts values ('${factId}','${org}','${entity}', 'website',
        '"https://example.test"', 'current','internal','${factId}','${factId}','${factId}',now());
      insert into public.provider_entity_document_reviews values ('${factId}','${org}','${entity}','approved',now(),'${factId}');
      insert into public.provider_entity_document_review_fields values ('${factId}','${org}','${factId}',
        'website','accepted','"https://example.test"',null,'internal');
      insert into public.provider_legal_entity_fact_promotions values ('${factId}','${org}','${entity}','${factId}','applied');
      insert into public.provider_legal_entity_document_assets values ('${factId}','${org}','${entity}',
        'active','verified',current_date - 1,current_date + 10);
      select set_config('osp.organization_id','${org}',false);
    `);
    const migration = await Deno.readTextFile(
      new URL(
        "../../migrations/20260905050000_osp_approved_profile_memory_reuse.sql",
        import.meta.url,
      ),
    );
    await db.exec(migration);
    await db.exec(migration); // Reapplying the function must not create facts or business records.
    const load = async (id = caseId) =>
      (await db.query<
        { field_key: string; value_json: string; evidence_id: string }
      >(
        "select * from osp_private.load_xbf_customer_setup_candidates_for_case($1,$2)",
        [org, id],
      )).rows;
    await t.step(
      "one persisted approved fact serves two providers of the same XBF entity",
      async () => {
        const candidates = await load();
        assertEquals(candidates, [{
          field_key: "supplier.website",
          value_json: "https://example.test",
          evidence_id: `rateware:legal-entity-fact:${factId}`,
        }]);
        assertEquals(await load(secondCase), candidates);
        assertEquals(await load(otherCase), []);
        const plan = prepareCaseForm({
          caseId,
          extractionId: "synthetic",
          templateVersionId: "synthetic",
          fields: [{
            fieldId: "site",
            canonicalFieldId: "supplier.website",
            supplierAliases: [],
            required: true,
          }],
          candidates: candidates.map((row): PreparationCandidate => ({
            fieldKey: row.field_key,
            value: row.value_json,
            evidenceIds: [row.evidence_id],
            source: "rateware",
            confidence: 1,
            validation: "valid",
          })),
          currentValues: {},
        });
        assertEquals(plan.values, { site: "https://example.test" });
        assertEquals(plan.fields[0].evidenceIds, [candidates[0].evidence_id]);
        assertEquals(plan.externalEffects, false);
      },
    );
    await t.step(
      "all supported corporate concepts retain their explicit mapping",
      async () => {
        const vocabulary = [
          ["legal_name", "supplier.legalName"],
          ["rfc", "fiscal.taxIdentifier"],
          ["tax_id", "fiscal.taxIdentifier"],
          ["fiscal_address", "supplier.address"],
          ["phone", "supplier.phone"],
          ["email", "supplier.email"],
          ["website", "supplier.website"],
          ["legal_representative", "legal.representativeName"],
          ["tax_regime", "fiscal.taxRegime"],
          ["bank_name", "banking.bankName"],
          ["bank_account", "banking.accountNumber"],
          ["bank_account_number", "banking.accountNumber"],
          ["clabe", "banking.accountNumber"],
        ];
        await db.exec("begin");
        try {
          for (const [code, key] of vocabulary) {
            await db.query(
              "update public.provider_legal_entity_facts set field_code=$1",
              [code],
            );
            await db.query(
              "update public.provider_entity_document_review_fields set field_code=$1",
              [code],
            );
            assertEquals((await load()).map((row) => row.field_key), [key]);
          }
        } finally {
          await db.exec("rollback");
        }
      },
    );
    const holds = [
      [
        "unapproved review",
        "update public.provider_entity_document_reviews set review_status='pending'",
      ],
      [
        "withheld answer",
        "update public.provider_entity_document_review_fields set field_status='withheld'",
      ],
      [
        "unpromoted answer",
        "update public.provider_legal_entity_fact_promotions set promotion_status='pending'",
      ],
      [
        "expired evidence",
        "update public.provider_legal_entity_document_assets set expiration_date=current_date-1",
      ],
      [
        "future evidence",
        "update public.provider_legal_entity_document_assets set effective_date=current_date+1",
      ],
      [
        "revoked evidence",
        "update public.provider_legal_entity_document_assets set lifecycle_status='revoked'",
      ],
      [
        "unverified evidence",
        "update public.provider_legal_entity_document_assets set verification_status='unverified'",
      ],
      [
        "superseded fact",
        "update public.provider_legal_entity_facts set fact_status='superseded'",
      ],
      [
        "restricted fact",
        "update public.provider_legal_entity_facts set sensitivity='restricted'",
      ],
      [
        "restricted source field",
        "update public.provider_entity_document_review_fields set sensitivity='highly_restricted'",
      ],
      [
        "future fact",
        "update public.provider_legal_entity_facts set effective_at=now()+interval '1 day'",
      ],
      [
        "value changed after approval",
        "update public.provider_legal_entity_facts set fact_value='\"changed\"'",
      ],
      ["inactive entity", "update public.legal_entities set status='inactive'"],
      [
        "foreign source review",
        `update public.provider_entity_document_reviews set legal_entity_id='${otherEntity}'`,
      ],
      [
        "foreign tenant context",
        `select set_config('osp.organization_id','${otherEntity}',false)`,
      ],
      [
        "carrier-specific term not in vocabulary",
        "update public.provider_legal_entity_facts set field_code='credit_amount'",
      ],
    ];
    for (const [label, mutation] of holds) {
      await t.step(label, async () => {
        await db.exec("begin");
        try {
          await db.exec(mutation);
          assertEquals(await load(), []);
        } finally {
          await db.exec("rollback");
        }
      });
    }
    await t.step(
      "reviewed correction is reused only when it matches the promoted value",
      async () => {
        await db.exec("begin");
        try {
          await db.exec(
            `update public.provider_entity_document_review_fields set field_status='corrected',
          proposed_value='"wrong"',reviewer_value='"https://example.test"'`,
          );
          assertEquals((await load()).length, 1);
        } finally {
          await db.exec("rollback");
        }
      },
    );
    assertEquals(
      (await db.query<{ count: number }>(
        "select count(*)::int as count from public.provider_legal_entity_facts",
      )).rows[0].count,
      1,
    );
  } finally {
    await db.close();
  }
});
