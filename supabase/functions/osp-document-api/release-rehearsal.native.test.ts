import postgres from "npm:postgres@3.4.7";
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import type { SqlPort } from "../_shared/osp/database-context.ts";
import { createPostgresOspReadStore } from "../osp-read-api/postgres-store.ts";
import { getCorporateProfile } from "../osp-read-api/read-models.ts";
import { createPostgresFormStore } from "../osp-form-api/postgres-store.ts";
import { createFormApiHandler } from "../osp-form-api/handler.ts";
import {
  readAnswerMemoryCandidates,
  reviewAnswerMemory,
} from "../osp-form-api/answer-memory-review.ts";
import {
  linkAnswerMemoryEvidence,
  readAnswerMemoryEvidence,
} from "../osp-form-api/answer-memory-evidence.ts";
import { ProfilePromotionBatchSchema } from "../../../apps/osp/src/features/profile/profile-promotion-batch-contract.ts";

const org = "11111111-1111-4111-8111-111111111111";
const entity = "22222222-2222-4222-8222-222222222222";
const caseId = "33333333-3333-4333-8333-333333333333";
const reviewId = "44444444-4444-4444-8444-444444444444";
const templateId = "55555555-5555-4555-8555-555555555555";
const otherCase = "66666666-6666-4666-8666-666666666666";
const website = "https://fixture.example.test";
const actor = "fixture:operator";

Deno.test({
  name:
    "PG17 nine-migration upgrade, real store reads, guarded writes and rollback compatibility",
  ignore: Deno.env.get("OSP_LOCAL_PG_REHEARSAL") !== "1",
  fn: async (t) => {
    const directory = Deno.env.get("OSP_LOCAL_PG_DIRECTORY") ?? "";
    const database = Deno.env.get("OSP_LOCAL_PG_DATABASE") ?? "";
    assert(/[\\/]tmp[\\/]osp-s13-pg17-rehearsal[\\/]cluster$/.test(directory));
    assert(/^osp_release_rehearsal_run_[0-9]+$/.test(database));
    const connect = () =>
      postgres({
        hostname: "127.0.0.1",
        port: 55472,
        username: "osp_local_rehearsal",
        password: "",
        database,
        ssl: false,
        prepare: false,
        max: 1,
        connect_timeout: 3,
        connection: {
          statement_timeout: 6000,
          application_name: "osp-pg17-rehearsal",
        },
      });
    const admin = connect(), reader = connect(), workflow = connect();
    const normalize = (s: string) => s.replaceAll("\\", "/").toLowerCase();
    const repo = new URL("../../../", import.meta.url);
    const read = (path: string) => Deno.readTextFile(new URL(path, repo));
    const artifacts: Record<string, unknown> = {};
    const step = async (name: string, fn: () => Promise<void>) => {
      assert(
        await t.step(name, fn),
        `Stop rehearsal after failed step: ${name}`,
      );
    };
    try {
      for (const sql of [admin, reader, workflow]) {
        const [identity] =
          await sql`select current_database() db,current_user usr,current_setting('data_directory') dir,
          host(inet_server_addr()) host,inet_server_port() port,current_setting('server_version_num') version,pg_backend_pid() pid`;
        assertEquals(identity.db, database);
        assertEquals(identity.usr, "osp_local_rehearsal");
        assertEquals(normalize(identity.dir), normalize(directory));
        assertEquals(identity.host, "127.0.0.1");
        assertEquals(identity.port, 55472);
        assert(
          Number(identity.version) >= 170000 &&
            Number(identity.version) < 180000,
        );
      }
      assertEquals(
        (await admin`select count(*)::int n from pg_tables where schemaname not in ('pg_catalog','information_schema')`)[
          0
        ].n,
        0,
      );
      console.log(
        JSON.stringify({
          engine: (await admin`select version() v`)[0].v,
          database,
          syntheticOnly: true,
        }),
      );
      await admin.unsafe(
        await read("tests/fixtures/osp-release-foundation.sql"),
      );
      for (
        const file of [
          "20260814110000_provider_legal_entity_fact_promotion.sql",
          "20260828213328_osp_profile_fact_promotion.sql",
        ]
      ) {
        await admin.unsafe(await read(`supabase/migrations/${file}`));
      }
      const guards = await read(
        "supabase/migrations/20260824015136_osp_sprint2_intelligence_forms.sql",
      );
      for (
        const name of [
          "protect_form_instance",
          "protect_published_template_version",
        ]
      ) {
        const definition = guards.match(
          new RegExp(
            `create function osp_private\\.${name}\\(\\)[\\s\\S]*?\\$function\\$;`,
          ),
        )?.[0];
        assert(definition);
        await admin.unsafe(definition);
      }
      for (
        const name of [
          "osp_form_instance_integrity",
          "osp_published_template_versions_append_only",
        ]
      ) {
        const definition = guards.match(
          new RegExp(`create trigger ${name}[\\s\\S]*?;`),
        )?.[0];
        assert(definition);
        await admin.unsafe(definition);
      }
      await admin.unsafe(`
        insert into public.organizations values('${org}');
        insert into public.legal_entities values('${org}','${entity}','XBFMX','Synthetic XBF entity','MX','MXN','active');
        insert into osp_private.supplier_counterparties values('${org}','${entity}','Synthetic carrier');
        insert into osp_private.customer_registration_cases values('${org}','${caseId}','${entity}','preparing',1),
          ('${org}','${otherCase}','${entity}','received',1);
        insert into osp_private.case_profile_bindings values('${org}','${caseId}','${entity}',1);
        insert into osp_private.form_templates values('${org}','${templateId}','Synthetic request',now());
        insert into osp_private.form_template_versions values('${org}','${templateId}','${templateId}',1,'draft',repeat('a',64));
        insert into osp_private.form_fields values('${templateId}','${org}','${templateId}',1,'website',
          '{"label":"Website","required":true,"canonicalFieldId":"supplier.website","supplierAliases":[],"definition":{"kind":"text","minLength":1,"maxLength":200}}');
        update osp_private.form_template_versions set status='published' where id='${templateId}';
        insert into osp_private.case_form_instances(organization_id,id,case_id,template_version_id,version,values_json)
          values('${org}','${caseId}','${caseId}','${templateId}',1,'{"website":"https://before.fixture.example.test"}');
        insert into public.provider_legal_entity_document_assets values('${reviewId}','${org}','${entity}','tax_status_certificate','fixture',
          'active','verified','internal','review_required',current_date-1,current_date+30);
        insert into public.provider_entity_document_reviews(id,organization_id,legal_entity_id,revision,review_status,document_asset_id,decided_at)
          values('${reviewId}','${org}','${entity}',1,'approved','${reviewId}',now());
        insert into public.provider_entity_document_review_fields values('${reviewId}','${org}','${reviewId}','website','accepted','"${website}"',null,'internal');
        insert into public.provider_legal_entity_profile_fields values('${reviewId}','${org}','${entity}','website','Website','"${website}"','needs_review','internal','active');
        grant select on all tables in schema public,osp_private to osp_workflow_api;
      `);
      const manifest = JSON.parse(
        await read("docs/osp/releases/2026-09-05-activation-preflight.json"),
      );
      const applied: string[] = [];
      await step(
        "applies all nine exact files together without backfilling or changing a case",
        async () => {
          for (const item of manifest.pendingMigrations) {
            const sql = await read(`supabase/migrations/${item.file}`);
            const hash = Array.from(
              new Uint8Array(
                await crypto.subtle.digest(
                  "SHA-256",
                  new TextEncoder().encode(sql),
                ),
              ),
              (x) => x.toString(16).padStart(2, "0"),
            ).join("");
            assertEquals(hash, item.sha256);
            await admin.begin((tx) => tx.unsafe(sql));
            applied.push(item.file);
          }
          assertEquals(applied.length, 9);
          assertEquals(
            (await admin`select count(*)::int n from osp_private.case_answer_memory_candidates`)[
              0
            ].n,
            0,
          );
          assertEquals(
            (await admin`select count(*)::int n from public.provider_legal_entity_facts`)[
              0
            ].n,
            0,
          );
          assertEquals(
            (await admin`select state from osp_private.customer_registration_cases where id=${caseId}`)[
              0
            ].state,
            "preparing",
          );
        },
      );
      await reader`set default_transaction_read_only=on`;
      await reader`set role osp_workflow_api`;
      await reader`select set_config('osp.organization_id',${org},false)`;
      const profileStore = createPostgresOspReadStore({
        databaseUrl: "postgresql://127.0.0.1:55472/unused",
        postgresFactory: () => reader,
      });
      const formStore = createPostgresFormStore({
        databaseUrl: "postgresql://127.0.0.1:55472/unused",
        postgresFactory: () => reader,
      });
      const formHandler = createFormApiHandler({
        store: formStore,
        canonicalFieldIds: ["supplier.website"],
        verifyToken: () =>
          Promise.resolve({
            identity: {
              organization: org,
              subject: actor,
              email: "operator@example.test",
              issuer: "https://example.test",
              authorizedParty: "fixture",
              emailVerified: true,
            },
            permissions: ["osp:read"],
          }),
        incidentId: () => "rehearsal",
      });
      const formRead = async (id = caseId) => {
        const response = await formHandler(
          new Request("https://example.test/osp-form-api", {
            method: "POST",
            headers: {
              origin: "https://osp.heymarksman.com",
              authorization: "Bearer fixture",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              version: 1,
              action: "get_case_form_workspace",
              case_id: id,
            }),
          }),
        );
        const body = await response.json();
        assertEquals(response.status, 200, JSON.stringify(body));
        return body;
      };
      await step(
        "real profile SQL and form HTTP read without creating candidates, facts or bindings",
        async () => {
          artifacts.profile = {
            version: 1,
            data: await getCorporateProfile(profileStore, org, actor),
          };
          artifacts.form = await formRead();
          artifacts.unboundForm = await formRead(otherCase);
          assertEquals(
            (await admin`select count(*)::int n from osp_private.case_answer_memory_candidates`)[
              0
            ].n,
            0,
          );
          assertEquals(
            (await admin`select count(*)::int n from osp_private.case_profile_bindings`)[
              0
            ].n,
            1,
          );
          assertEquals(
            (await admin`select count(*)::int n from public.provider_legal_entity_facts`)[
              0
            ].n,
            0,
          );
        },
      );
      await step(
        "an old direct publication command is blocked after upgrade",
        async () => {
          await assertRejects(
            () =>
              reader`select * from osp_private.promote_profile_review_facts_command(${org}::uuid,${reviewId}::uuid,1,repeat('a',64),'{}'::jsonb,${actor},'osp:operate')`,
            Error,
            "permission denied",
          );
        },
      );
      await step(
        "real source trigger captures only future revisions; review alone never creates a fact",
        async () => {
          await admin`select set_config('osp.organization_id',${org},false)`;
          await admin`update osp_private.case_form_instances set version=2,values_json=${
            JSON.stringify({ website })
          }::text::jsonb where id=${caseId}`;
          const candidates = await readAnswerMemoryCandidates(
            reader as unknown as SqlPort,
            org,
            caseId,
          );
          assertEquals(candidates.length, 1);
          assertEquals(candidates[0].decision, "pending_review");
          await workflow.begin(async (tx) => {
            await tx`set local role osp_workflow_api`;
            await tx`select set_config('osp.organization_id',${org},true)`;
            const input = {
              organizationId: org,
              subject: actor,
              permission: "osp:operate" as const,
              caseId,
              candidateId: candidates[0].id,
              answerSha256: candidates[0].answerSha256,
              decision: "accepted" as const,
              reason: "Synthetic evidence review for release rehearsal.",
              idempotencyKey: "rehearsal-answer",
              confirmed: true,
            };
            const first = await reviewAnswerMemory(
              tx as unknown as SqlPort,
              input,
            );
            const replay = await reviewAnswerMemory(
              tx as unknown as SqlPort,
              input,
            );
            assertEquals(first.approvedForReuse, false);
            assertEquals(replay.replayed, true);
          });
          assertEquals(
            (await admin`select count(*)::int n from public.provider_legal_entity_facts`)[
              0
            ].n,
            0,
          );
          artifacts.reviewedForm = await formRead();
        },
      );
      await step(
        "comparison is non-mutating; whole-document publication and replay work with real JSON encoding",
        async () => {
          const batch = ProfilePromotionBatchSchema.parse(
            (await reader`select osp_private.load_profile_review_promotion_batch(${org}::uuid,${reviewId}::uuid) b`)[
              0
            ].b,
          );
          assertEquals(batch.ready, true);
          assertEquals(batch.totalFields, 1);
          const candidateSha =
            (await reader`select osp_private.profile_review_candidate_sha256(${org}::uuid,${reviewId}::uuid,1) h`)[
              0
            ].h;
          const expected = JSON.stringify({ website: null });
          const invoke = () =>
            workflow.begin(async (tx) => {
              await tx`set local role osp_workflow_api`;
              await tx`select set_config('osp.organization_id',${org},true)`;
              return await tx`select * from osp_private.promote_profile_review_complete_batch(${org}::uuid,${reviewId}::uuid,1,
            ${candidateSha},${expected}::text::jsonb,${actor},'osp:operate',${batch.comparisonSha256})`;
            });
          const first = await invoke();
          const replay = await invoke();
          assertEquals(first[0].promoted_fact_count, 1);
          assertEquals(replay[0].replayed, true);
          assertEquals(
            (await admin`select count(*)::int n from public.provider_legal_entity_facts`)[
              0
            ].n,
            1,
          );
          artifacts.publishedProfile = {
            version: 1,
            data: await getCorporateProfile(profileStore, org, actor),
          };
        },
      );
      await step(
        "link approved evidence and replay, with stale-source and cross-tenant rejection",
        async () => {
          const candidate = (await readAnswerMemoryCandidates(
            reader as unknown as SqlPort,
            org,
            caseId,
          ))[0];
          const option = (await readAnswerMemoryEvidence(
            reader as unknown as SqlPort,
            org,
            caseId,
            candidate.id,
          )).options[0];
          assertEquals(option.state, "already_reusable");
          const input = {
            organizationId: org,
            subject: actor,
            permission: "osp:operate" as const,
            caseId,
            candidateId: candidate.id,
            reviewFieldId: option.reviewFieldId,
            factId: option.currentFactId!,
            answerSha256: candidate.answerSha256,
            expectationSha256: option.expectationSha256!,
            action: "link" as const,
            reason: "Confirm synthetic documentary evidence.",
            idempotencyKey: "rehearsal-link",
            confirmed: true as const,
          };
          const invoke = (value = input) =>
            workflow.begin(async (tx) => {
              await tx`set local role osp_workflow_api`;
              await tx`select set_config('osp.organization_id',${org},true)`;
              return await linkAnswerMemoryEvidence(
                tx as unknown as SqlPort,
                value,
              );
            });
          await invoke();
          assertEquals((await invoke()).replayed, true);
          await assertRejects(
            () =>
              invoke({
                ...input,
                organizationId: otherCase,
                idempotencyKey: "wrong-tenant",
              }),
            Error,
            "FORM_MEMORY_FORBIDDEN",
          );
          await admin`update public.provider_legal_entity_document_assets set expiration_date=current_date-1 where id=${reviewId}`;
          assertEquals(
            (await readAnswerMemoryEvidence(
              reader as unknown as SqlPort,
              org,
              caseId,
              candidate.id,
            )).options.length,
            0,
          );
          await assertRejects(
            () => invoke({ ...input, idempotencyKey: "stale-source" }),
            Error,
          );
          assertEquals(
            (await admin`select count(*)::int n from osp_private.answer_memory_evidence_links`)[
              0
            ].n,
            1,
          );
        },
      );
      await step(
        "current-manifest gate rejects missing and stale review, then permits only a matched review",
        async () => {
          await admin`update osp_private.customer_registration_cases set state='operations_review' where id=${caseId}`;
          await assertRejects(
            () =>
              admin`update osp_private.customer_registration_cases set state='signature_approval' where id=${caseId}`,
            Error,
            "REQUEST_FULFILLMENT_BLOCKED",
          );
          await admin.unsafe(
            `insert into osp_private.request_manifest_drafts values('${org}','${caseId}','${caseId}',1,repeat('a',64),'{"requirements":[]}');
          insert into osp_private.request_manifest_decision_reviews(organization_id,id,case_id,manifest_draft_id,manifest_version,review_version,status,manifest_sha256)
          values('${org}','${caseId}','${caseId}','${caseId}',1,1,'resolved',repeat('b',64));`,
          );
          await assertRejects(
            () =>
              admin`update osp_private.customer_registration_cases set state='signature_approval' where id=${caseId}`,
            Error,
            "REQUEST_FULFILLMENT_BLOCKED",
          );
          await admin`update osp_private.request_manifest_decision_reviews set manifest_sha256=repeat('a',64)`;
          await admin`update osp_private.customer_registration_cases set state='signature_approval' where id=${caseId}`;
          assertEquals(
            (await admin`select state from osp_private.customer_registration_cases where id=${caseId}`)[
              0
            ].state,
            "signature_approval",
          );
        },
      );
      await step(
        "forward-fix accepts a 256-character subject without widening execute ACL",
        async () => {
          const longActor = "a".repeat(256);
          await admin`insert into osp_private.request_knowledge_promotions values(${org},${reviewId},${caseId},${caseId},${caseId},${longActor},'["field:supplier.website"]')`;
          await workflow.begin(async (tx) => {
            await tx`set local role osp_workflow_api`;
            await tx`select set_config('osp.organization_id',${org},true)`;
            const first =
              await tx`select * from osp_private.record_request_knowledge_constraints_command(${org}::uuid,${reviewId}::uuid,${longActor})`;
            const replay =
              await tx`select * from osp_private.record_request_knowledge_constraints_command(${org}::uuid,${reviewId}::uuid,${longActor})`;
            assertEquals(first[0].recorded_count, 1);
            assertEquals(replay[0].replayed, true);
          });
          assertEquals(
            (await admin`select has_function_privilege('authenticated','osp_private.record_request_knowledge_constraints_command(uuid,uuid,text)','execute') allowed`)[
              0
            ].allowed,
            false,
          );
        },
      );
      const path = new URL(`tmp/osp-s13-pg17-rehearsal/${database}.json`, repo);
      await Deno.writeTextFile(
        path,
        JSON.stringify(
          { syntheticOnly: true, appliedMigrations: applied, ...artifacts },
          null,
          2,
        ),
      );
      console.log(`Synthetic API evidence: ${path.pathname}`);
    } finally {
      await Promise.all(
        [admin, reader, workflow].map((sql) => sql.end({ timeout: 2 })),
      );
    }
  },
});
