import { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import {
  entity,
  initializeAnswerEvidenceFixture,
  newReviewId,
  org,
  reviewId,
} from "./answer-evidence.test-fixture.ts";
import { ProfilePromotionBatchSchema } from "../../../apps/osp/src/features/profile/profile-promotion-batch-contract.ts";

Deno.test("complete documentary batch: full comparison, locked confirmation, exact replay and masking", async (t) => {
  const db = new PGlite();
  try {
    await initializeAnswerEvidenceFixture(db);
    await db.exec(
      `select osp_private.promote_profile_review_facts_command('${org}','${reviewId}',1,
      osp_private.profile_review_candidate_sha256('${org}','${reviewId}',1),'{"phone":null,"website":null}','operator','osp:operate');
      insert into public.provider_legal_entity_document_assets values('${newReviewId}','${org}','${entity}','active','verified',current_date-1,current_date+30);
      insert into public.provider_entity_document_reviews values('${newReviewId}','${org}','${entity}',1,'approved','${newReviewId}',now());
      insert into public.provider_entity_document_review_fields values
        (gen_random_uuid(),'${org}','${newReviewId}','phone','corrected','"+52 81 0000 0001"','"+52 81 0000 0002"','internal'),
        (gen_random_uuid(),'${org}','${newReviewId}','website','accepted','"https://example.test"',null,'internal'),
        (gen_random_uuid(),'${org}','${newReviewId}','email','accepted','"ops@example.test"',null,'internal'),
        (gen_random_uuid(),'${org}','${newReviewId}','bank_account','withheld','"NEVER-EXPOSE-SYNTHETIC"',null,'highly_restricted'),
        (gen_random_uuid(),'${org}','${newReviewId}','legacy_contact','rejected','"NEVER-EXPOSE-REJECTED"',null,'internal');`,
    );
    await db.exec(
      await Deno.readTextFile(
        new URL(
          "../../migrations/20260905143000_osp_profile_complete_batch_confirmation.sql",
          import.meta.url,
        ),
      ),
    );
    const read = async (tenant = org) =>
      (await db.query<{ batch: unknown }>(
        "select osp_private.load_profile_review_promotion_batch($1,$2) batch",
        [tenant, newReviewId],
      )).rows[0].batch;
    const batch = ProfilePromotionBatchSchema.parse(await read());
    const candidateSha = (await db.query<{ sha: string }>(
      "select osp_private.profile_review_candidate_sha256($1,$2,1) sha",
      [org, newReviewId],
    )).rows[0].sha;
    const expectations = Object.fromEntries(
      batch.rows.filter((row) =>
        ["new", "replace", "unchanged"].includes(row.change)
      ).map((row) => [row.fieldCode, row.currentFactId]),
    );
    const counts = async () =>
      (await db.query(
        "select (select count(*)::int from public.provider_legal_entity_facts) facts, (select count(*)::int from public.provider_legal_entity_fact_promotions) promotions",
      )).rows[0];
    const command = async (
      comparisonSha = batch.comparisonSha256,
      ids = expectations,
      actor = "operator",
    ) => {
      await db.exec("set local role osp_workflow_api");
      return (await db.query<Record<string, unknown>>(
        "select * from osp_private.promote_profile_review_complete_batch($1,$2,1,$3,$4::jsonb,$5,'osp:operate',$6)",
        [
          org,
          newReviewId,
          candidateSha,
          JSON.stringify(ids),
          actor,
          comparisonSha,
        ],
      )).rows[0];
    };
    const invoke = async (
      comparisonSha = batch.comparisonSha256,
      ids = expectations,
      actor = "operator",
    ) => {
      await db.exec("begin");
      try {
        const result = await command(comparisonSha, ids, actor);
        await db.exec("commit");
        return result;
      } catch (error) {
        await db.exec("rollback");
        throw error;
      }
    };
    await t.step(
      "all five dispositions are visible; excluded values and other tenants never leak",
      async () => {
        assertEquals(batch.totalFields, 5);
        assertEquals(batch.ready, true);
        assertEquals(batch.rows.map((row) => row.change), [
          "withheld",
          "new",
          "rejected",
          "replace",
          "unchanged",
        ]);
        assert(!JSON.stringify(batch).includes("NEVER-EXPOSE"));
        assertEquals(await read(newReviewId), null);
        assertEquals(await counts(), { facts: 2, promotions: 1 });
        for (
          const role of ["anon", "authenticated", "service_role", "osp_worker"]
        ) {
          await db.exec(`set role ${role}`);
          await assertRejects(() => read());
          await db.exec("reset role");
        }
      },
    );
    await t.step(
      "stale excluded fields, current values, restrictions, review and asset invalidate the complete comparison",
      async () => {
        for (
          const change of [
            `update public.provider_entity_document_review_fields set proposed_value='"changed"' where review_id='${newReviewId}' and field_status='rejected'`,
            `update public.provider_legal_entity_facts set fact_value='"changed"' where field_code='phone'`,
            `update public.provider_entity_document_review_fields set sensitivity='restricted' where review_id='${newReviewId}' and field_code='phone'`,
            `update public.provider_entity_document_reviews set revision=2 where id='${newReviewId}'`,
            `update public.provider_legal_entity_document_assets set expiration_date=current_date-1 where id='${newReviewId}'`,
            `update public.provider_legal_entity_document_assets set verification_status='needs_review' where id='${newReviewId}'`,
            `update public.legal_entities set status='draft'`,
          ]
        ) {
          await db.exec("begin");
          try {
            await db.exec(change);
            await assertRejects(
              () => command(),
              Error,
              "PROFILE_FACT_BATCH_CHANGED",
            );
          } finally {
            await db.exec("rollback");
          }
        }
        assertEquals(await counts(), { facts: 2, promotions: 1 });
      },
    );
    await t.step(
      "no stale comparison or incomplete selection can reach the old promotion command",
      async () => {
        await assertRejects(
          () => invoke("f".repeat(64)),
          Error,
          "PROFILE_FACT_BATCH_CHANGED",
        );
        await assertRejects(
          () => invoke(batch.comparisonSha256, { phone: expectations.phone }),
          Error,
          "PROFILE_FACT_EXPECTATION_INCOMPLETE",
        );
        await db.exec("set role osp_workflow_api");
        await assertRejects(() =>
          db.exec(
            `select osp_private.promote_profile_review_facts_command('${org}','${newReviewId}',1,'${candidateSha}','{}','operator','osp:operate')`,
          )
        );
        await db.exec("reset role");
        assertEquals(await counts(), { facts: 2, promotions: 1 });
      },
    );
    await t.step(
      "complete publication preserves unchanged origin, exclusions and exact receipt replay",
      async () => {
        const first = await invoke();
        assertEquals(first.promoted_fact_count, 2);
        assertEquals(first.unchanged_fact_count, 1);
        assertEquals(first.withheld_field_count, 1);
        assertEquals(first.replayed, false);
        const replay = await invoke();
        assertEquals(replay, { ...first, replayed: true });
        assertEquals(await counts(), { facts: 4, promotions: 2 });
        assertEquals(
          (await db.query(
            "select source_review_id from public.provider_legal_entity_facts where field_code='website'",
          )).rows,
          [{ source_review_id: reviewId }],
        );
        assertEquals(
          (await db.query(
            "select count(*)::int n from public.provider_legal_entity_facts where field_code in ('bank_account','legacy_contact')",
          )).rows,
          [{ n: 0 }],
        );
        await assertRejects(
          () => invoke(batch.comparisonSha256, expectations, "other-operator"),
          Error,
          "PROFILE_FACT_PROMOTION_CONFLICT",
        );
        await assertRejects(
          () => invoke(batch.comparisonSha256, {}),
          Error,
          "PROFILE_FACT_PROMOTION_CONFLICT",
        );
      },
    );
  } finally {
    await db.close();
  }
});
