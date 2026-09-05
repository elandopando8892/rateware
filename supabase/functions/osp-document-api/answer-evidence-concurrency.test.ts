import postgres from "npm:postgres@3.4.7";
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import {
  caseId,
  initializeAnswerEvidenceFixture,
  newReviewId,
  org,
  reviewId,
} from "./answer-evidence.test-fixture.ts";
import {
  linkAnswerMemoryEvidence,
  type LinkAnswerMemoryEvidenceInput,
  readAnswerMemoryEvidence,
} from "../osp-form-api/answer-memory-evidence.ts";
import type { SqlPort } from "../_shared/osp/database-context.ts";
import { ProfilePromotionBatchSchema } from "../../../apps/osp/src/features/profile/profile-promotion-batch-contract.ts";

// Opt-in, loopback-only native PostgreSQL. Never reads DATABASE_URL or Supabase credentials.
Deno.test({
  name:
    "native PostgreSQL: concurrent evidence intents preserve exact receipts and source locks",
  ignore: Deno.env.get("OSP_LOCAL_PG_CONCURRENCY") !== "1",
  fn: async (t) => {
    const expectedDirectory = Deno.env.get("OSP_LOCAL_PG_DIRECTORY");
    const database = Deno.env.get("OSP_LOCAL_PG_DATABASE") ??
      "osp_evidence_concurrency";
    assert(/^osp_evidence_concurrency(?:_run_[0-9]+)?$/.test(database));
    assert(
      expectedDirectory &&
        /[\\/]tmp[\\/]osp-s13-pg-concurrency-tools[\\/]cluster$/.test(
          expectedDirectory,
        ),
    );
    const connect = () =>
      postgres({
        hostname: "127.0.0.1",
        port: 55471,
        database,
        username: "osp_local_test",
        password: "",
        max: 1,
        ssl: false,
        prepare: false,
        connect_timeout: 3,
        connection: {
          statement_timeout: 6000,
          application_name: "osp-local-evidence-test",
        },
      });
    const admin = connect(), a = connect(), b = connect();
    const connections = [admin, a, b];
    const normalize = (value: string) =>
      value.replaceAll("\\", "/").toLowerCase();
    try {
      for (const sql of connections) {
        const [identity] =
          await sql`select current_database() db, current_user usr, current_setting('data_directory') dir,
          host(inet_server_addr()) host, inet_server_port() port, pg_backend_pid() pid`;
        assertEquals(identity.db, database);
        assertEquals(identity.usr, "osp_local_test");
        assertEquals(identity.host, "127.0.0.1");
        assertEquals(identity.port, 55471);
        assertEquals(normalize(identity.dir), normalize(expectedDirectory));
      }
      const [before] =
        await admin`select count(*)::int n from pg_tables where schemaname='public'`;
      assertEquals(
        before.n,
        0,
        "Refuse a nonempty database; start a fresh isolated cluster.",
      );
      const pids = await Promise.all(
        connections.map(async (sql) =>
          (await sql`select pg_backend_pid() pid`)[0].pid
        ),
      );
      assertEquals(new Set(pids).size, 3);
      console.log(
        JSON.stringify({
          engine: (await admin`select version() v`)[0].v,
          backendPids: pids,
          syntheticOnly: true,
        }),
      );
      await initializeAnswerEvidenceFixture({
        exec: async (query) => await admin.unsafe(query),
      }, true);
      await admin.unsafe(
        `select osp_private.promote_profile_review_facts_command('${org}','${reviewId}',1,
        osp_private.profile_review_candidate_sha256('${org}','${reviewId}',1),'{"phone":null,"website":null}',
        'test-operator','osp:operate')`,
      );
      for (const sql of [a, b]) {
        await sql`select set_config('osp.organization_id', ${org}, false)`;
      }
      const fresh = async () => {
        await a`set role osp_workflow_api`;
        try {
          return (await readAnswerMemoryEvidence(
            a as unknown as SqlPort,
            org,
            caseId,
            caseId,
          )).options[0];
        } finally {
          await a`reset role`;
        }
      };
      const option = await fresh();
      assertEquals(option.state, "already_reusable");
      const input: LinkAnswerMemoryEvidenceInput = {
        organizationId: org,
        subject: "verified-operator",
        permission: "osp:operate",
        caseId,
        candidateId: caseId,
        reviewFieldId: option.reviewFieldId,
        factId: option.currentFactId!,
        answerSha256: "a".repeat(64),
        expectationSha256: option.expectationSha256!,
        action: "link",
        reason: "Confirmo este respaldo documental completo.",
        idempotencyKey: "concurrency-exact",
        confirmed: true,
      };
      const begin = async (sql: typeof a) => {
        await sql`begin`;
        await sql`set local role osp_workflow_api`;
      };
      const invoke = (sql: typeof a, request = input) =>
        linkAnswerMemoryEvidence(sql as unknown as SqlPort, request);
      const count = async () =>
        (await admin`select count(*)::int n from osp_private.answer_memory_evidence_links`)[
          0
        ].n;
      const waitForBlocked = async (pid: number, kind: string) => {
        const deadline = Date.now() + 4000;
        while (Date.now() < deadline) {
          const rows =
            await admin`select 1 from pg_locks where pid=${pid} and not granted and locktype=${kind}`;
          if (rows.length) return;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        throw new Error(
          `Expected observable ${kind} lock wait for backend ${pid}`,
        );
      };
      const capture = <T>(promise: Promise<T>) =>
        promise.then(
          (value) => ({ value, error: null }),
          (error: Error) => ({ value: null, error }),
        );

      await t.step(
        "each source row held by another transaction conflicts without a partial receipt",
        async () => {
          const sources = [
            `osp_private.case_answer_memory_candidates where id='${caseId}'`,
            `osp_private.case_form_instances where id='${caseId}'`,
            `osp_private.case_profile_bindings where case_id='${caseId}'`,
            `osp_private.case_answer_memory_reviews where candidate_id='${caseId}'`,
            `public.legal_entities where organization_id='${org}'`,
            `public.provider_entity_document_reviews where id='${reviewId}'`,
            `public.provider_entity_document_review_fields where id='${option.reviewFieldId}'`,
            `public.provider_legal_entity_document_assets where id='${reviewId}'`,
            `public.provider_legal_entity_fact_promotions where review_id='${reviewId}'`,
            `public.provider_legal_entity_facts where id='${option.currentFactId}'`,
          ];
          for (const source of sources) {
            await a`begin`;
            try {
              await a.unsafe(`select 1 from ${source} for update`);
              await begin(b);
              await assertRejects(
                () => invoke(b),
                Error,
                "FORM_MEMORY_EVIDENCE_CONFLICT",
              );
            } finally {
              await b`rollback`;
              await a`rollback`;
            }
            assertEquals(await count(), 0, source);
          }
        },
      );
      await t.step(
        "a committed edit after the comparison invalidates the old intent",
        async () => {
          await a`update public.provider_entity_document_reviews set revision=2 where id=${reviewId}`;
          await begin(b);
          try {
            await assertRejects(
              () => invoke(b),
              Error,
              "FORM_MEMORY_EVIDENCE_CHANGED",
            );
          } finally {
            await b`rollback`;
          }
          assertEquals(await count(), 0);
          await a`update public.provider_entity_document_reviews set revision=1 where id=${reviewId}`;
        },
      );
      await t.step(
        "two simultaneous identical intents yield one committed receipt and one exact replay",
        async () => {
          await begin(a);
          await begin(b);
          let pending: ReturnType<typeof capture> | undefined;
          try {
            const first = await invoke(a);
            assertEquals(first.replayed, false);
            pending = capture(invoke(b));
            await waitForBlocked(pids[2], "advisory");
            assertEquals(await count(), 0, "Uncommitted receipt is invisible.");
            await a`commit`;
            const second = await pending;
            if (second.error) throw second.error;
            assertEquals(second.value, { ...first, replayed: true });
            await b`commit`;
          } finally {
            await a`rollback`;
            if (pending) await pending;
            await b`rollback`;
          }
          assertEquals(await count(), 1);
        },
      );
      await t.step("another intent cannot reuse a committed key", async () => {
        await begin(b);
        try {
          await assertRejects(
            () =>
              invoke(b, {
                ...input,
                reason: "Una intención diferente para el documento.",
              }),
            Error,
            "IDEMPOTENCY_CONFLICT",
          );
        } finally {
          await b`rollback`;
        }
        assertEquals(await count(), 1);
      });
      await t.step(
        "different keys racing for the same binding cannot create duplicate receipts",
        async () => {
          // A separate synthetic candidate permits a fresh uniqueness race.
          const candidateId = "66666666-6666-4666-8666-666666666666";
          await admin`insert into osp_private.case_answer_memory_candidates
          select ${candidateId}::uuid, organization_id,case_id,source_instance_id,source_instance_version,source_template_version_id,
            field_key,answer_value,canonical_field_id,legal_entity_id,binding_revision,answer_sha256
          from osp_private.case_answer_memory_candidates where id=${caseId}`;
          await admin`insert into osp_private.case_answer_memory_reviews(organization_id,candidate_id,decision,answer_sha256)
          values(${org},${candidateId},'accepted',${input.answerSha256})`;
          const next = (await readAnswerMemoryEvidence(
            a as unknown as SqlPort,
            org,
            caseId,
            candidateId,
          )).options[0];
          const race = {
            ...input,
            candidateId,
            expectationSha256: next.expectationSha256!,
            idempotencyKey: "race-one",
          };
          await begin(a);
          await begin(b);
          let pending: ReturnType<typeof capture> | undefined;
          try {
            await invoke(a, race);
            pending = capture(
              invoke(b, { ...race, idempotencyKey: "race-two" }),
            );
            await waitForBlocked(pids[2], "transactionid");
            await a`commit`;
            const second = await pending;
            assert(
              second.error?.message.includes("FORM_MEMORY_EVIDENCE_CONFLICT"),
            );
          } finally {
            await a`rollback`;
            if (pending) await pending;
            await b`rollback`;
          }
          assertEquals(await count(), 2);
        },
      );
      await t.step(
        "receipt never bypasses a later withdrawal; master facts remain unchanged",
        async () => {
          await admin`update public.provider_legal_entity_document_assets set lifecycle_status='withdrawn' where id=${reviewId}`;
          assertEquals(
            [...await admin`select * from osp_private.load_xbf_customer_setup_candidates_for_case(${org},${caseId})`],
            [],
          );
          const [totals] =
            await admin`select (select count(*)::int from public.provider_legal_entity_facts) facts,
          (select count(*)::int from public.provider_legal_entity_fact_promotions) promotions`;
          assertEquals(totals, { facts: 2, promotions: 1 });
          assertEquals(await count(), 2);
        },
      );
      await admin.unsafe(
        await Deno.readTextFile(
          new URL(
            "../../migrations/20260905143000_osp_profile_complete_batch_confirmation.sql",
            import.meta.url,
          ),
        ),
      );
      await admin.unsafe(`
        insert into public.provider_legal_entity_document_assets
          select '${newReviewId}',organization_id,legal_entity_id,'active','verified',effective_date,expiration_date
          from public.provider_legal_entity_document_assets where id='${reviewId}';
        insert into public.provider_entity_document_reviews
          select '${newReviewId}',organization_id,legal_entity_id,1,'approved','${newReviewId}',now()
          from public.provider_entity_document_reviews where id='${reviewId}';
        insert into public.provider_entity_document_review_fields
          select gen_random_uuid(),organization_id,'${newReviewId}',field_code,field_status,
            case when field_code='phone' then '"+52 81 0000 0002"'::jsonb else proposed_value end,reviewer_value,sensitivity
          from public.provider_entity_document_review_fields where review_id='${reviewId}';
        insert into public.provider_entity_document_review_fields
          select gen_random_uuid(),organization_id,'${newReviewId}','email','accepted','"ops@example.test"'::jsonb,null,'internal'
          from public.provider_entity_document_reviews where id='${reviewId}';
      `);
      const batch = ProfilePromotionBatchSchema.parse(
        (await admin`select osp_private.load_profile_review_promotion_batch(${org},${newReviewId}) batch`)[
          0
        ].batch,
      );
      const ids = Object.fromEntries(
        batch.rows.map((row) => [row.fieldCode, row.currentFactId]),
      );
      const candidateSha =
        (await admin`select osp_private.profile_review_candidate_sha256(${org},${newReviewId},1) sha`)[
          0
        ].sha;
      const promoteBatch = async (sql: typeof a) =>
        (await sql`select * from osp_private.promote_profile_review_complete_batch(
        ${org},${newReviewId},1,${candidateSha},${
          JSON.stringify(ids)
        }::text::jsonb,'verified-operator','osp:operate',${batch.comparisonSha256})`)[
          0
        ];
      await t.step(
        "native driver receives an object via text cast, not double-encoded JSON",
        async () => {
          const [types] = await admin`select jsonb_typeof(${
            JSON.stringify(ids)
          }::jsonb) legacy, jsonb_typeof(${
            JSON.stringify(ids)
          }::text::jsonb) guarded`;
          assertEquals(types, { legacy: "string", guarded: "object" });
        },
      );
      await t.step(
        "complete batch refuses a concurrently held asset or current fact",
        async () => {
          for (
            const source of [
              `public.provider_legal_entity_document_assets where id='${newReviewId}'`,
              `public.provider_legal_entity_facts where id='${ids.phone}'`,
            ]
          ) {
            await a`begin`;
            try {
              await a.unsafe(`select 1 from ${source} for update`);
              await begin(b);
              await assertRejects(
                () => promoteBatch(b),
                Error,
                "PROFILE_FACT_PROMOTION_CONFLICT",
              );
            } finally {
              await b`rollback`;
              await a`rollback`;
            }
          }
          assertEquals(
            (await admin`select count(*)::int n from public.provider_legal_entity_fact_promotions`)[
              0
            ].n,
            1,
          );
        },
      );
      await t.step(
        "two exact full-batch requests serialize to one publication and one replay",
        async () => {
          await begin(a);
          await begin(b);
          let pending: ReturnType<typeof capture> | undefined;
          try {
            const first = await promoteBatch(a);
            assertEquals(first.promoted_fact_count, 2);
            assertEquals(first.unchanged_fact_count, 1);
            pending = capture(promoteBatch(b));
            await waitForBlocked(pids[2], "advisory");
            await a`commit`;
            const second = await pending;
            if (second.error) throw second.error;
            assertEquals(second.value, { ...first, replayed: true });
            await b`commit`;
          } finally {
            await a`rollback`;
            if (pending) await pending;
            await b`rollback`;
          }
          assertEquals(
            (await admin`select count(*)::int n from public.provider_legal_entity_fact_promotions`)[
              0
            ].n,
            2,
          );
          assertEquals(
            (await admin`select count(*)::int n from public.provider_legal_entity_facts`)[
              0
            ].n,
            4,
          );
          assertEquals(
            (await admin`select count(*)::int n from public.provider_legal_entity_facts where fact_status='current'`)[
              0
            ].n,
            3,
          );
        },
      );
    } finally {
      await Promise.all(connections.map((sql) => sql.end({ timeout: 1 })));
    }
  },
});
