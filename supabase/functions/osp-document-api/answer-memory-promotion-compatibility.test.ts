import { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import { readAnswerMemoryEvidence } from "../osp-form-api/answer-memory-evidence.ts";
import {
  linkAnswerMemoryEvidence,
  type LinkAnswerMemoryEvidenceInput,
} from "../osp-form-api/answer-memory-evidence.ts";
import type { SqlPort, SqlRow } from "../_shared/osp/database-context.ts";

import {
  caseId,
  entity,
  initializeAnswerEvidenceFixture,
  newReviewId,
  org,
  reviewId,
} from "./answer-evidence.test-fixture.ts";

// Characterization of existing SQL, not an authorization to use the command as
// a single-answer promotion bridge. No application runtime imports this test.
Deno.test("existing fact promotion compatibility exposes batch scope and unchanged-source limits", async (t) => {
  const db = new PGlite();
  try {
    await initializeAnswerEvidenceFixture(db);
    const tx = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.reduce(
        (text, part, index) => text + (index ? `$${index}` : "") + part,
        "",
      );
      return (await db.query(sql, values)).rows as SqlRow[];
    }) as SqlPort;

    const preflight = async () => {
      await db.exec("set role osp_workflow_api");
      try {
        return await readAnswerMemoryEvidence(tx, org, caseId, caseId);
      } finally {
        await db.exec("reset role");
      }
    };

    await t.step(
      "preflight shows full document scope without promoting or granting reuse",
      async () => {
        const result = await preflight();
        assertEquals(result.readOnly, true);
        assertEquals(result.externalEffects, false);
        assertEquals(result.options.length, 1);
        assertEquals(result.options[0].state, "document_promotion_required");
        assertEquals(result.options[0].documentFieldCount, 2);
        assertEquals(result.options[0].currentFactId, null);
      },
    );
    const counts = async () =>
      (await db.query<{ facts: number; promotions: number }>(
        `select (select count(*)::int from public.provider_legal_entity_facts) as facts,
       (select count(*)::int from public.provider_legal_entity_fact_promotions) as promotions`,
      )).rows[0];
    const hash = async (id: string) =>
      (await db.query<{ hash: string }>(
        "select osp_private.profile_review_candidate_sha256($1,$2,1) as hash",
        [org, id],
      )).rows[0].hash;
    const promote = async (
      id: string,
      expectations: Record<string, string | null>,
    ) => {
      const candidateHash = await hash(id);
      await db.exec("set role osp_workflow_api");
      try {
        return (await db.query<
          {
            promoted_fact_count: number;
            unchanged_fact_count: number;
            replayed: boolean;
          }
        >(
          "select * from osp_private.promote_profile_review_facts_command($1,$2,1,$3,$4::jsonb,'test-operator','osp:operate')",
          [org, id, candidateHash, JSON.stringify(expectations)],
        )).rows[0];
      } finally {
        await db.exec("reset role");
      }
    };
    const load = async () =>
      (await db.query<
        { field_key: string; value_json: unknown; evidence_id: string }
      >(
        "select * from osp_private.load_xbf_customer_setup_candidates_for_case($1,$2)",
        [org, caseId],
      )).rows;

    await t.step(
      "one selected answer cannot be promoted by omitting the other document fields",
      async () => {
        await assertRejects(
          () => promote(reviewId, { phone: null }),
          Error,
          "PROFILE_FACT_EXPECTATION_INCOMPLETE",
        );
        assertEquals(await counts(), { facts: 0, promotions: 0 });
      },
    );
    await t.step(
      "the existing action promotes the complete review and its exact replay creates no duplicates",
      async () => {
        const first = await promote(reviewId, { phone: null, website: null });
        assertEquals(first.promoted_fact_count, 2);
        assertEquals(first.replayed, false);
        assertEquals(
          (await promote(reviewId, { phone: null, website: null })).replayed,
          true,
        );
        assertEquals(await counts(), { facts: 2, promotions: 1 });
        assertEquals((await load()).length, 2);
        assertEquals((await preflight()).options[0].state, "already_reusable");
      },
    );
    await t.step(
      "an identical value does not replace its original evidence even with a newer approved document",
      async () => {
        await db.exec(`
        insert into public.provider_legal_entity_document_assets values('${newReviewId}','${org}','${entity}',
          'active','verified',current_date-1,current_date+30);
        insert into public.provider_entity_document_reviews values('${newReviewId}','${org}','${entity}',1,'approved','${newReviewId}',now());
        insert into public.provider_entity_document_review_fields
          select gen_random_uuid(),organization_id,'${newReviewId}',field_code,field_status,proposed_value,reviewer_value,sensitivity
          from public.provider_entity_document_review_fields where review_id='${reviewId}';
      `);
        const facts = (await db.query<{ id: string; field_code: string }>(
          "select id,field_code from public.provider_legal_entity_facts",
        )).rows;
        const next = await promote(
          newReviewId,
          Object.fromEntries(facts.map((fact) => [fact.field_code, fact.id])),
        );
        assertEquals(next.promoted_fact_count, 0);
        assertEquals(next.unchanged_fact_count, 2);
        assertEquals(
          (await db.query<{ source_review_id: string }>(
            "select distinct source_review_id from public.provider_legal_entity_facts",
          )).rows,
          [{ source_review_id: reviewId }],
        );
        // This is the limitation the bridge MUST handle, not desired renewal behavior.
        await db.query(
          "update public.provider_legal_entity_document_assets set expiration_date=current_date-1 where id=$1",
          [reviewId],
        );
        assertEquals(await load(), []);
        assertEquals(await counts(), { facts: 2, promotions: 2 });
        assertEquals(
          (await preflight()).options.map((option) => option.state),
          ["renewal_required"],
        );
      },
    );
    await t.step(
      "preflight fails closed for stale, foreign, restricted or unreviewed sources",
      async () => {
        for (
          const change of [
            "update osp_private.case_answer_memory_reviews set decision='pending_review'",
            "update osp_private.case_form_instances set version=2",
            "update osp_private.case_profile_bindings set revision=2",
            "update public.legal_entities set status='draft'",
            "update public.provider_legal_entity_facts set sensitivity='restricted'",
            "update public.provider_entity_document_review_fields set sensitivity='restricted'",
            `update public.provider_legal_entity_document_assets set expiration_date=current_date-1 where id='${newReviewId}'`,
            `select set_config('osp.organization_id','${newReviewId}',false)`,
          ]
        ) {
          await db.exec("begin");
          try {
            await db.exec(change);
            assertEquals((await preflight()).options, [], change);
          } finally {
            await db.exec("rollback");
          }
        }
        const before = await counts();
        await preflight();
        await preflight();
        assertEquals(await counts(), before);
      },
    );
    const linkCount = async () =>
      (await db.query<{ count: number }>(
        "select count(*)::int as count from osp_private.answer_memory_evidence_links",
      )).rows[0].count;
    const option = (await preflight()).options[0];
    const request: LinkAnswerMemoryEvidenceInput = {
      organizationId: org,
      subject: "verified-operator",
      permission: "osp:operate",
      caseId,
      candidateId: caseId,
      answerSha256: "a".repeat(64),
      reviewFieldId: option.reviewFieldId,
      factId: option.currentFactId!,
      expectationSha256: option.expectationSha256!,
      action: "renew",
      reason: "Confirmo el nuevo respaldo documental.",
      idempotencyKey: "renew-test",
      confirmed: true,
    };
    const invoke = async (input = request, change?: string) => {
      await db.exec("begin");
      try {
        if (change) await db.exec(change);
        await db.exec("set local role osp_workflow_api");
        const result = await linkAnswerMemoryEvidence(tx, input);
        await db.exec("commit");
        return result;
      } catch (error) {
        await db.exec("rollback");
        throw error;
      }
    };
    await t.step(
      "renewal rejects changed expectations and every stale or unauthorized source without a receipt",
      async () => {
        for (
          const change of [
            "update osp_private.case_answer_memory_reviews set decision='rejected'",
            "update osp_private.case_form_instances set version=2",
            "update osp_private.case_profile_bindings set revision=2",
            "update public.legal_entities set status='draft'",
            "update public.provider_legal_entity_facts set sensitivity='restricted'",
            "update public.provider_legal_entity_facts set fact_status='withdrawn'",
            "update public.provider_legal_entity_facts set fact_value='\"different\"'",
            `update public.provider_entity_document_reviews set revision=2 where id='${newReviewId}'`,
            `update public.provider_entity_document_review_fields set field_status='withheld' where review_id='${newReviewId}'`,
            `update public.provider_legal_entity_document_assets set expiration_date=current_date-1 where id='${newReviewId}'`,
            `update public.provider_legal_entity_document_assets set lifecycle_status='withdrawn' where id='${reviewId}'`,
            `update public.provider_legal_entity_document_assets set expiration_date=current_date+40 where id='${newReviewId}'`,
            `select set_config('osp.organization_id','${newReviewId}',false)`,
          ]
        ) await assertRejects(() => invoke(request, change));
        await assertRejects(
          () => invoke({ ...request, expectationSha256: "f".repeat(64) }),
          Error,
          "FORM_MEMORY_EVIDENCE_CHANGED",
        );
        await assertRejects(
          () => invoke({ ...request, permission: "osp:read" as "osp:operate" }),
          Error,
          "FORM_MEMORY_FORBIDDEN",
        );
        await assertRejects(
          () => invoke({ ...request, action: "link" }),
          Error,
          "FORM_MEMORY_EVIDENCE_CHANGED",
        );
        assertEquals(await linkCount(), 0);
      },
    );
    await t.step(
      "explicit renewal restores only the confirmed fact and leaves original sources and other facts untouched",
      async () => {
        const before = await db.query(
          "select * from public.provider_legal_entity_facts order by id",
        );
        const result = await invoke();
        assertEquals(result.action, "renew");
        assertEquals(result.externalEffects, false);
        assertEquals(result.replayed, false);
        assertEquals(await linkCount(), 1);
        assertEquals((await load()).map((row) => row.field_key), [
          "supplier.phone",
        ]);
        assertEquals((await preflight()).options[0].state, "already_reusable");
        assertEquals(
          (await db.query(
            "select * from public.provider_legal_entity_facts order by id",
          )).rows,
          before.rows,
        );
        const replay = await invoke();
        assertEquals(replay.receiptId, result.receiptId);
        assertEquals(replay.replayed, true);
        await assertRejects(
          () => invoke({ ...request, reason: "Otra intención documental." }),
          Error,
          "IDEMPOTENCY_CONFLICT",
        );
        assertEquals(await linkCount(), 1);
        assertEquals(await counts(), { facts: 2, promotions: 2 });
      },
    );
    await t.step(
      "a renewal receipt is not evergreen permission; reader rechecks evidence, dates, scope and original source",
      async () => {
        for (
          const change of [
            "update public.provider_legal_entity_facts set fact_status='withdrawn'",
            "update public.provider_legal_entity_facts set sensitivity='restricted'",
            "update public.legal_entities set status='draft'",
            `update public.provider_entity_document_reviews set revision=2 where id='${newReviewId}'`,
            `update public.provider_entity_document_reviews set review_status='rejected' where id='${newReviewId}'`,
            `update public.provider_legal_entity_document_assets set expiration_date=current_date-1 where id='${newReviewId}'`,
            `update public.provider_legal_entity_document_assets set expiration_date=current_date+99 where id='${newReviewId}'`,
            `update public.provider_legal_entity_document_assets set lifecycle_status='withdrawn' where id='${reviewId}'`,
            `update public.provider_legal_entity_document_assets set verification_status='rejected' where id='${newReviewId}'`,
            `update public.provider_entity_document_review_fields set sensitivity='restricted' where review_id='${newReviewId}'`,
            `update public.provider_legal_entity_fact_promotions set promotion_status='failed' where review_id='${newReviewId}'`,
            `select set_config('osp.organization_id','${newReviewId}',false)`,
          ]
        ) {
          await db.exec("begin");
          try {
            await db.exec(change);
            assertEquals(await load(), [], change);
          } finally {
            await db.exec("rollback");
          }
        }
        // Other cases bound to this entity receive the validated fact, not answers
        // from the originating case. Another entity receives nothing.
        await db.exec(
          `insert into osp_private.case_profile_bindings values('${org}','${newReviewId}','${entity}',1)`,
        );
        assertEquals(
          (await db.query(
            "select * from osp_private.load_xbf_customer_setup_candidates_for_case($1,$2)",
            [org, newReviewId],
          )).rows.length,
          1,
        );
        await db.exec(
          `update osp_private.case_profile_bindings set legal_entity_id='${newReviewId}' where case_id='${newReviewId}'`,
        );
        assertEquals(
          (await db.query(
            "select * from osp_private.load_xbf_customer_setup_candidates_for_case($1,$2)",
            [org, newReviewId],
          )).rows.length,
          0,
        );
      },
    );
    await t.step(
      "link an already reusable fact without another renewal or fact write, with no direct receipt mutation grants",
      async () => {
        const fresh = (await preflight()).options[0];
        const result = await invoke({
          ...request,
          action: "link",
          expectationSha256: fresh.expectationSha256!,
          idempotencyKey: "link-test",
        });
        assertEquals(result.action, "link");
        assertEquals(await linkCount(), 2);
        for (
          const role of [
            "osp_workflow_api",
            "osp_worker",
            "authenticated",
            "anon",
            "service_role",
          ]
        ) {
          await db.exec(`set role ${role}`);
          await assertRejects(() =>
            db.exec("delete from osp_private.answer_memory_evidence_links")
          );
          await db.exec("reset role");
        }
        assertEquals(await linkCount(), 2);
      },
    );
  } finally {
    await db.close();
  }
});
