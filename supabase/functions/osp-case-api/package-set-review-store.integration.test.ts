// deno-lint-ignore-file no-import-prefix
import {
  createReviewTestDatabase,
  type TestConnection,
} from "./package-review-test-db.ts";
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import type { SqlPort, SqlRow } from "../_shared/osp/database-context.ts";
import { canonicalPackageSetJson } from "../_shared/osp/package-set-json.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";
import {
  type PackageMemberReview,
  preparePackageSetReview,
} from "./package-set-review.ts";
import {
  createPackageSetOperationsReviewStore,
  type PackageSetReviewCommand,
} from "./package-set-review-store.ts";
import { loadLockedPackageSetReview } from "./package-set-review-source.ts";
import { createPackageMemberReviewStore } from "./package-member-review-store.ts";
import {
  loadPackageMemberInspections,
  parseWorkflowPackageSet,
} from "./workflow-package-set.ts";
import { withOrganizationTransaction } from "../_shared/osp/database-context.ts";
import { createPostgresApprovalStore } from "../_shared/osp/approval-store.ts";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = id(1), caseId = id(2), snapshotId = id(4), sha = "a".repeat(64);
Deno.test("set review receipt and existing Operations transition commit atomically in PostgreSQL", async (t) => {
  const db = await createReviewTestDatabase();
  try {
    await db.exec(`
      do $$ declare fixture_role text; begin
        foreach fixture_role in array array['anon','authenticated','service_role','osp_worker','osp_workflow_api'] loop
          if not exists(select 1 from pg_roles where rolname=fixture_role) then
            execute format('create role %I',fixture_role);
          end if;
          if exists(select 1 from pg_roles where rolname=fixture_role and (rolsuper or rolbypassrls or rolcanlogin)) then
            raise exception 'UNSAFE_REHEARSAL_ROLE';
          end if;
        end loop;
      end $$;
      create schema osp_private; create schema extensions;
      grant usage on schema osp_private, extensions to osp_workflow_api;
      create function extensions.gen_random_uuid() returns uuid language sql as 'select gen_random_uuid()';
      create table osp_private.customer_registration_cases (
        organization_id uuid, id uuid, state text, aggregate_version bigint,
        updated_at timestamptz, primary key (organization_id,id));
      create table osp_private.background_jobs (organization_id uuid,id uuid,kind text,
        lease_token uuid,completed_at timestamptz,leased_until timestamptz,opaque_payload jsonb,
        idempotency_key text, primary key(organization_id,id),
        unique(organization_id,kind,idempotency_key));
      create table osp_private.case_package_input_snapshots (
        organization_id uuid, case_id uuid, id uuid, case_version bigint,
        canonical_sha256 text, created_at timestamptz default now(),
        document_version_ids uuid[] not null default '{}', extraction_ids uuid[] not null default '{}',
        mapping_refs jsonb not null default '[]', form_instance_id uuid,
        form_instance_version integer, template_version_id uuid, unique(organization_id,case_id,id));
      create table osp_private.documents (organization_id uuid,id uuid,case_id uuid);
      create table osp_private.document_versions (organization_id uuid,id uuid,document_id uuid,
        document_type text,status text,source_sha256 text,content_type text,bucket_id text,
        valid_from date,expires_at date,version integer,
        retention_disposition text not null default 'retained',primary key(organization_id,id));
      create table osp_private.document_extractions (organization_id uuid,case_id uuid,id uuid,status text);
      create table osp_private.case_form_instances (organization_id uuid,case_id uuid,id uuid,
        version integer,template_version_id uuid);
      create table osp_private.supplier_form_mappings (organization_id uuid,case_id uuid,id uuid,
        version integer,after_sha256 text,review_decision_id uuid,status text);
      create table osp_private.approval_events (
        id uuid, organization_id uuid, case_id uuid, case_version bigint,
        event_type text, actor_subject text, actor_role text,
        authorization_session_id text, command_sha256 text, evidence_refs jsonb);
      create table osp_private.command_receipts (id uuid, organization_id uuid, operation text, idempotency_key text, request_hash text, response_json jsonb);
      grant select, insert on osp_private.command_receipts to osp_workflow_api;
      grant select, update on osp_private.customer_registration_cases to osp_workflow_api;
      grant select on osp_private.case_package_input_snapshots,osp_private.documents,
        osp_private.document_versions,osp_private.document_extractions,
        osp_private.case_form_instances,osp_private.supplier_form_mappings to osp_workflow_api;
      grant insert on osp_private.approval_events to osp_workflow_api;
    `);
    const migration = (file: string) =>
      Deno.readTextFile(new URL(`../../migrations/${file}`, import.meta.url));
    // Production enqueues generation inside the snapshot transaction. Exercise
    // the shipped trigger instead of silently omitting this release dependency.
    const generationSql = await migration(
      "20260829070649_osp_supplier_package_generation.sql",
    );
    const enqueueStart = generationSql.indexOf(
      "create function osp_private.enqueue_supplier_package_generation()",
    );
    assert(enqueueStart >= 0);
    await db.exec(generationSql.slice(enqueueStart));
    // Execute the actual production validators, not permissive test stubs.
    // Tables remain a scoped fixture; this is not a full-schema/native rehearsal.
    await db.exec(
      await migration("20260831133838_osp_sales_superuser_approval_policy.sql"),
    );
    const signatureSql = await migration(
      "20260824111323_osp_signature_application.sql",
    );
    const snapshotStart = signatureSql.indexOf(
      "create or replace function osp_private.package_snapshot_hash_is_current(",
    );
    const snapshotEnd = signatureSql.indexOf("$$;", snapshotStart);
    assert(snapshotStart >= 0 && snapshotEnd > snapshotStart);
    await db.exec(signatureSql.slice(snapshotStart, snapshotEnd + 3));
    await db.exec(
      "revoke all on function osp_private.package_snapshot_hash_is_current(uuid,uuid,text) from public,anon,authenticated; grant execute on function osp_private.package_snapshot_hash_is_current(uuid,uuid,text) to osp_workflow_api",
    );
    await db.exec(
      await migration(
        "20260830034601_osp_approval_snapshot_read_only_lock_fix.sql",
      ),
    );
    const legacy = await Deno.readTextFile(
      new URL(
        "../../migrations/20260824101605_osp_approval_communications.sql",
        import.meta.url,
      ),
    );
    const start = legacy.indexOf(
      "create function osp_private.complete_operations_review_command(",
    );
    const end = legacy.indexOf(
      "create function osp_private.approve_signature_command(",
      start,
    );
    if (start < 0 || end <= start) throw new Error("LEGACY_FUNCTION_NOT_FOUND");
    await db.exec(legacy.slice(start, end));
    await db.exec(
      await migration("20260908160000_osp_supplier_package_sets.sql"),
    );
    await db.exec(
      await Deno.readTextFile(
        new URL(
          "../../migrations/20260908180000_osp_package_set_operations_reviews.sql",
          import.meta.url,
        ),
      ),
    );
    await db.query(
      "insert into osp_private.customer_registration_cases values ($1,$2,'operations_review',7,now())",
      [org, caseId],
    );
    await db.query(
      "insert into osp_private.case_package_input_snapshots (organization_id,case_id,id,case_version,canonical_sha256,created_at,form_instance_id,form_instance_version,template_version_id) values ($1,$2,$3,7,$4,now(),$2,1,$3)",
      [org, caseId, snapshotId, sha],
    );
    await t.step(
      "production snapshot trigger enqueues exactly once and rolls back with its snapshot",
      async () => {
        const jobsForSnapshot = async (value: string) =>
          (await db.query(
            "select kind,opaque_payload,lease_token,completed_at from osp_private.background_jobs where organization_id=$1 and idempotency_key=$2",
            [org, `supplier-package:${value}`],
          )).rows;
        assertEquals(await jobsForSnapshot(snapshotId), [{
          kind: "generate_supplier_package",
          opaque_payload: { caseId, snapshotId },
          lease_token: null,
          completed_at: null,
        }]);
        const rolledBackSnapshot = id(990);
        await assertRejects(
          () =>
            db.transaction(async (tx) => {
              await tx.query(
                "insert into osp_private.case_package_input_snapshots (organization_id,case_id,id,case_version,canonical_sha256) values ($1,$2,$3,7,$4)",
                [org, caseId, rolledBackSnapshot, sha],
              );
              const queued = await tx.query(
                "select id from osp_private.background_jobs where organization_id=$1 and idempotency_key=$2",
                [org, `supplier-package:${rolledBackSnapshot}`],
              );
              assertEquals(queued.rows.length, 1);
              throw new Error("ROLLBACK_SNAPSHOT_CANARY");
            }),
          Error,
          "ROLLBACK_SNAPSHOT_CANARY",
        );
        assertEquals(await jobsForSnapshot(rolledBackSnapshot), []);
        assertEquals(
          (await db.query(
            "select id from osp_private.case_package_input_snapshots where organization_id=$1 and id=$2",
            [org, rolledBackSnapshot],
          )).rows,
          [],
        );
      },
    );
    await db.query(
      "insert into osp_private.case_form_instances values ($1,$2,$2,1,$3)",
      [org, caseId, snapshotId],
    );
    const manifest = {
      schemaVersion: 1,
      organizationId: org,
      caseId,
      setId: id(3),
      snapshotId,
      snapshotSha256: sha,
      version: 1,
      planSha256: "b".repeat(64),
      members: [5, 6].map((n) => ({
        requirementId: `file:${id(n)}`,
        objectId: `${org}:${caseId}:${id(3)}:${id(n)}`,
        artifact: {
          sourceVersionId: id(n),
          sourceSha256: "c".repeat(64),
          packageSnapshotId: snapshotId,
          packageSnapshotSha256: sha,
          version: 1,
          outputSha256: "d".repeat(64),
          contentType: "application/pdf",
        },
      })),
    };
    const manifestSha256 = await sha256Hex(
      new TextEncoder().encode(canonicalPackageSetJson(manifest)),
    );
    await db.query(
      "insert into osp_private.background_jobs (organization_id,id,kind) values ($1,$2,'generate_supplier_package')",
      [org, id(70)],
    );
    await db.query(
      `insert into osp_private.supplier_package_sets
      (organization_id,id,case_id,input_snapshot_id,input_snapshot_sha256,job_id,version,plan_sha256,source_plan_json,status)
      values ($1,$2,$3,$4,$5,$6,1,$7,$8::text::jsonb,'prepared')`,
      [
        org,
        id(3),
        caseId,
        snapshotId,
        sha,
        id(70),
        manifest.planSha256,
        JSON.stringify(
          manifest.members.map((member) => ({
            requirementId: member.requirementId,
            sourceVersionId: member.artifact.sourceVersionId,
          })),
        ),
      ],
    );
    const context = {
      receipt: { ...manifest, manifestSha256 },
      organizationId: org,
      caseId,
      caseVersion: 7,
      snapshotSha256: sha,
      requestManifestSha256: "e".repeat(64),
      expectedSetManifestSha256: manifestSha256,
      reviews: [5, 6].map((n): PackageMemberReview => ({
        sourceVersionId: id(n),
        outputSha256: "d".repeat(64),
        requirementId: `file:${id(n)}`,
        reviewDecisionId: id(n + 10),
        status: "approved",
        completenessVerified: true,
        signatureRequirement: "none",
        signaturePolicyVersion: null,
      })),
    };
    const basis = await preparePackageSetReview(context);
    const command: PackageSetReviewCommand = {
      organizationId: org,
      caseId,
      expectedCaseVersion: 7,
      expectedSnapshotSha256: sha,
      expectedReviewSha256: basis.reviewSha256,
      idempotencyKey: "k".repeat(256),
      actor: {
        organizationId: org,
        subject: "operations",
        verifiedEmail: "ops@xbfreight.com",
        permissions: ["osp:operate"],
        role: "operations_reviewer",
        authorizationSessionId: "session-1",
        authorizationSessionIssuedAt: new Date().toISOString(),
        active: true,
      },
    };
    let failReceipt = false, loads = 0;
    const port = (connection: TestConnection) =>
      ((strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.reduce(
          (s, part, index) =>
            s + part + (index < values.length ? `$${index + 1}` : ""),
          "",
        );
        if (
          failReceipt &&
          query.includes(
            "insert into osp_private.package_set_operations_reviews",
          )
        ) throw new Error("INJECTED_RECEIPT_FAILURE");
        return connection.query(query, values).then((r) => r.rows as SqlRow[]);
      }) as SqlPort;
    const sql = port(db);
    const transactionBackends = new Set<number>();
    sql.begin = async <T>(operation: (tx: SqlPort) => Promise<T>) => {
      return await db.transaction(async (tx) => {
        if (db.native) {
          transactionBackends.add(
            Number((await tx.query("select pg_backend_pid() pid")).rows[0].pid),
          );
        }
        return await operation(port(tx));
      });
    };
    // Explicit synthetic trusted-source seam. Not a production decision loader.
    let store = createPackageSetOperationsReviewStore({
      sql,
      now: () => new Date(),
      loadLocked: async (tx) => {
        loads++;
        await tx`select id from osp_private.customer_registration_cases where organization_id = ${org}::uuid and id = ${caseId}::uuid for update`;
        return structuredClone(context);
      },
    });
    const counts = async () => ({
      state: (await db.query(
        "select state, aggregate_version::integer as aggregate_version from osp_private.customer_registration_cases",
      )).rows[0],
      receipts: (await db.query(
        "select count(*)::integer as n from osp_private.package_set_operations_reviews",
      )).rows[0],
      events: (await db.query(
        "select count(*)::integer as n from osp_private.approval_events",
      )).rows[0],
    });
    await t.step(
      "receipt failure rolls back case transition and approval event",
      async () => {
        failReceipt = true;
        await assertRejects(
          () => store.complete(command),
          Error,
          "INJECTED_RECEIPT_FAILURE",
        );
        assertEquals(await counts(), {
          state: { state: "operations_review", aggregate_version: 7 },
          receipts: { n: 0 },
          events: { n: 0 },
        });
        failReceipt = false;
      },
    );
    await t.step(
      "stale review, rejected member and unauthorized identity write nothing",
      async () => {
        await assertRejects(
          () =>
            store.complete({
              ...command,
              expectedReviewSha256: "f".repeat(64),
            }),
          Error,
          "PACKAGE_SET_REVIEW_STALE",
        );
        context.reviews[1].status = "rejected";
        await assertRejects(
          () => store.complete(command),
          Error,
          "PACKAGE_SET_REVIEW_BLOCKED",
        );
        context.reviews[1].status = "approved";
        await assertRejects(
          () =>
            store.complete({
              ...command,
              actor: { ...command.actor, permissions: ["osp:read"] },
            }),
          Error,
          "APPROVAL_FORBIDDEN",
        );
        assertEquals((await counts()).receipts, { n: 0 });
        await assertRejects(
          () => store.complete({ ...command, idempotencyKey: "k".repeat(257) }),
          Error,
          "PACKAGE_SET_REVIEW_BLOCKED",
        );
      },
    );
    await t.step(
      "default source reads persisted final reviews, not mappings",
      async () => {
        await db.exec(`
        create table osp_private.request_manifest_drafts (organization_id uuid,case_id uuid,id uuid,
          version integer,manifest_sha256 text,manifest_json jsonb);
        create table osp_private.request_manifest_decision_reviews (organization_id uuid,case_id uuid,id uuid,
          manifest_draft_id uuid,review_version integer,manifest_version integer,manifest_sha256 text,status text);
        grant select on osp_private.supplier_package_sets,osp_private.documents,osp_private.document_versions,
          osp_private.request_manifest_drafts,osp_private.request_manifest_decision_reviews to osp_workflow_api;
      `);
        await db.exec(
          await Deno.readTextFile(
            new URL(
              "../../migrations/20260908190000_osp_package_set_member_reviews.sql",
              import.meta.url,
            ),
          ),
        );
        await db.query(
          "update osp_private.supplier_package_sets set status='current',manifest_sha256=$1,receipt_json=$2::text::jsonb,input_snapshot_id=$3,input_snapshot_sha256=$4",
          [manifestSha256, JSON.stringify(context.receipt), snapshotId, sha],
        );
        await db.query(
          "update osp_private.case_package_input_snapshots set document_version_ids=$1",
          [[id(5), id(6)]],
        );
        for (const n of [5, 6]) {
          await db.query(
            "insert into osp_private.documents values ($1,$2,$3)",
            [org, id(100 + n), caseId],
          );
          await db.query(
            "insert into osp_private.document_versions (organization_id,id,document_id,document_type,status,source_sha256,content_type,bucket_id,valid_from,expires_at,version) values ($1,$2,$3,'supplier_requirement','approved',$4,'application/pdf','osp-derived-documents',null,null,1)",
            [org, id(n), id(100 + n), "c".repeat(64)],
          );
        }
        await db.query(
          "insert into osp_private.request_manifest_drafts values ($1,$2,$3,1,$4,$5::text::jsonb)",
          [
            org,
            caseId,
            id(90),
            context.requestManifestSha256,
            JSON.stringify({
              requestType: "customer_setup",
              targetXbfEntity: "XBFUS",
              forms: [5, 6].map((n) => ({
                name: `Form ${n}`,
                format: "pdf",
                action: "complete",
                required: true,
                evidenceIds: [`file:${id(n)}`],
              })),
              requestedDocuments: [],
              requirements: [{ text: "Complete all forms at 100%." }],
            }),
          ],
        );
        await db.query(
          "insert into osp_private.request_manifest_decision_reviews values ($1,$2,$3,$4,1,1,$5,'resolved')",
          [org, caseId, id(91), id(90), context.requestManifestSha256],
        );
        store = createPackageSetOperationsReviewStore({
          sql,
          now: () => new Date(),
        });
        await assertRejects(
          () => store.complete(command),
          Error,
          "PACKAGE_SET_REVIEW_BLOCKED",
        ); // Mapping/source approval alone is insufficient.
        await db.exec(
          await Deno.readTextFile(
            new URL(
              "../../migrations/20260908200000_osp_member_review_command_identity.sql",
              import.meta.url,
            ),
          ),
        );
        const memberStore = createPackageMemberReviewStore({
          sql,
          now: () => new Date(),
        });
        for (const n of [5, 6]) {
          const inspection = {
            reviewId: id(n + 10),
            organizationId: org,
            caseId,
            setId: id(3),
            sourceVersionId: id(n),
            expectedCaseVersion: 7,
            inputSnapshotSha256: sha,
            setManifestSha256: manifestSha256,
            requestManifestSha256: context.requestManifestSha256,
            outputSha256: "d".repeat(64),
            status: "approved" as const,
            fullOutputInspected: true,
            completionPercent: 100,
            pageCount: 2,
            signatureRequirement: "none" as const,
            signaturePolicyVersion: null,
            actor: command.actor,
          };
          await assertRejects(
            () =>
              memberStore.save({ ...inspection, fullOutputInspected: false }),
            Error,
            "INVALID_MEMBER_REVIEW",
          );
          await assertRejects(
            () => memberStore.save({ ...inspection, expectedCaseVersion: 8 }),
            Error,
            "PACKAGE_SET_REVIEW_STALE",
          );
          await assertRejects(
            () =>
              memberStore.save({ ...inspection, outputSha256: "f".repeat(64) }),
            Error,
            "PACKAGE_SET_REVIEW_STALE",
          );
          await assertRejects(
            () =>
              memberStore.save({
                ...inspection,
                actor: { ...command.actor, permissions: ["osp:read"] },
              }),
            Error,
            "APPROVAL_FORBIDDEN",
          );
          assertEquals(await memberStore.save(inspection), {
            reviewId: inspection.reviewId,
            reviewVersion: 1,
            replayed: false,
          });
          assertEquals(await memberStore.save(inspection), {
            reviewId: inspection.reviewId,
            reviewVersion: 1,
            replayed: true,
          });
          assertEquals(
            await memberStore.save({
              ...inspection,
              actor: {
                ...inspection.actor,
                authorizationSessionId: "fresh-session",
                authorizationSessionIssuedAt: new Date().toISOString(),
              },
            }),
            {
              reviewId: inspection.reviewId,
              reviewVersion: 1,
              replayed: true,
            },
          );
          await assertRejects(
            () =>
              memberStore.save({
                ...inspection,
                actor: { ...inspection.actor, subject: "other-operator" },
              }),
            Error,
            "IDEMPOTENCY_CONFLICT",
          );
          await assertRejects(
            () => memberStore.save({ ...inspection, completionPercent: 50 }),
            Error,
            "IDEMPOTENCY_CONFLICT",
          );
        }
        assertEquals((await counts()).state, {
          state: "operations_review",
          aggregate_version: 7,
        });
        assertEquals((await counts()).events, { n: 0 });
        const projected = await withOrganizationTransaction(
          sql,
          org,
          async (tx) =>
            await loadPackageMemberInspections(
              tx,
              org,
              caseId,
              await parseWorkflowPackageSet(context.receipt, {
                organizationId: org,
                caseId,
                snapshotSha256: sha,
              }),
            ),
        );
        assertEquals(
          projected.files.map((file) => ({
            source: file.sourceVersionId,
            decision: file.latestReview?.reviewId,
            completion: file.latestReview?.completionPercent,
          })),
          [5, 6].map((n) => ({
            source: id(n),
            decision: id(n + 10),
            completion: 100,
          })),
        );
        const legacy = createPostgresApprovalStore({
          databaseUrl: "postgresql://synthetic.example.test/osp",
          postgresFactory: () => sql,
          now: () => new Date(),
        });
        await assertRejects(
          () =>
            legacy.transact({
              type: "complete_operations_review",
              organizationId: org,
              caseId,
              expectedCaseVersion: 7,
              inputSnapshotSha256: sha,
              idempotencyKey: "legacy-cannot-approve-set",
              actor: command.actor,
            }),
          Error,
          "REQUEST_FULFILLMENT_BLOCKED",
        );
        assertEquals((await counts()).state, {
          state: "operations_review",
          aggregate_version: 7,
        });
        failReceipt = true;
        await assertRejects(
          () => store.complete(command),
          Error,
          "INJECTED_RECEIPT_FAILURE",
        );
        failReceipt = false;
        assertEquals((await counts()).events, { n: 0 });
        await db.exec(
          "update osp_private.document_versions set status='rejected'",
        );
        await assertRejects(
          () => store.complete(command),
          Error,
          "PACKAGE_SET_REVIEW_BLOCKED",
        );
        await db.exec(
          "update osp_private.document_versions set status='approved'; update osp_private.request_manifest_decision_reviews set status='pending'",
        );
        await assertRejects(
          () => store.complete(command),
          Error,
          "PACKAGE_SET_REVIEW_BLOCKED",
        );
        await db.exec(
          "update osp_private.request_manifest_decision_reviews set status='resolved'",
        );
        await assertRejects(
          () => store.complete({ ...command, expectedCaseVersion: 8 }),
          Error,
          "PACKAGE_SET_REVIEW_STALE",
        );
        await assertRejects(
          () =>
            db.exec(
              "update osp_private.package_set_member_reviews set status='rejected'",
            ),
          Error,
          "PACKAGE_SET_MEMBER_REVIEW_IMMUTABLE",
        );
      },
    );
    await t.step(
      "incomplete final output and missing corporate documents cannot advance Operations",
      async () => {
        const probe = async (mutation: (tx: SqlPort) => Promise<unknown>) => {
          await assertRejects(
            () =>
              sql.begin!(async (tx) => {
                await tx`select set_config('osp.organization_id',${org},true)`;
                await mutation(tx);
                await tx`set local role osp_workflow_api`;
                await assertRejects(
                  () => loadLockedPackageSetReview(tx, command),
                  Error,
                  "PACKAGE_SET_REVIEW_BLOCKED",
                );
                throw new Error("PROBE_ROLLBACK");
              }),
            Error,
            "PROBE_ROLLBACK",
          );
        };
        await probe((tx) =>
          tx`insert into osp_private.package_set_member_reviews
        (id,organization_id,case_id,package_set_id,source_version_id,review_version,set_manifest_sha256,request_manifest_sha256,output_sha256,status,full_output_inspected,completion_percent,page_count,signature_requirement,signature_policy_version,actor_json)
        select ${
            id(200)
          }::uuid,organization_id,case_id,package_set_id,source_version_id,2,set_manifest_sha256,request_manifest_sha256,output_sha256,'approved',true,50,page_count,signature_requirement,signature_policy_version,actor_json
        from osp_private.package_set_member_reviews where source_version_id=${
            id(5)
          }::uuid`
        );
        await probe((tx) =>
          tx`update osp_private.request_manifest_drafts set manifest_json = jsonb_set(manifest_json,'{requestedDocuments}',${
            JSON.stringify([{
              documentType: "Constancia de situación fiscal",
              required: true,
              acceptableAlternatives: [],
              evidenceIds: ["email:canary"],
            }])
          }::text::jsonb)`
        );
        assertEquals((await counts()).events, { n: 0 });
      },
    );
    await t.step(
      "production actor SQL rejects expired, mixed and impersonated authority",
      async () => {
        const probe = (
          email: string,
          permissions: string[],
          issuedAt: string,
        ) =>
          withOrganizationTransaction(
            sql,
            org,
            (tx) =>
              tx`select osp_private.assert_approval_actor(
          ${org}::uuid,'complete_operations_review','fixture-actor',${email},
          ${permissions}::text[],'operations_reviewer','fixture-session',${issuedAt}::timestamptz)`,
          );
        await probe(
          "sales@heymarksman.com",
          ["osp:read", "osp:superuser"],
          new Date().toISOString(),
        );
        await assertRejects(
          () =>
            probe(
              "ops@xbfreight.com",
              ["osp:superuser"],
              new Date().toISOString(),
            ),
          Error,
          "OSP_APPROVAL_FORBIDDEN",
        );
        await assertRejects(
          () =>
            probe(
              "sales@heymarksman.com",
              ["osp:superuser", "osp:operate"],
              new Date().toISOString(),
            ),
          Error,
          "OSP_APPROVAL_FORBIDDEN",
        );
        await assertRejects(
          () =>
            probe(
              "ops@xbfreight.com",
              ["osp:operate"],
              new Date(Date.now() - 6 * 60_000).toISOString(),
            ),
          Error,
          "OSP_APPROVAL_FORBIDDEN",
        );
        await assertRejects(
          () =>
            probe(
              "sales@heymarksman.com",
              ["osp:superuser"],
              new Date(Date.now() - 31 * 60_000).toISOString(),
            ),
          Error,
          "OSP_APPROVAL_FORBIDDEN",
        );
        assertEquals((await counts()).events, { n: 0 });
      },
    );
    await t.step(
      "production snapshot SQL rejects stale forms, disposed or superseded documents and missing evidence",
      async () => {
        const probe = async (mutation: string) => {
          await assertRejects(
            () =>
              db.transaction(async (tx) => {
                await tx.exec(mutation);
                await tx.query(
                  "select set_config('osp.organization_id',$1,true)",
                  [
                    org,
                  ],
                );
                await tx.exec("set local role osp_workflow_api");
                await assertRejects(
                  () =>
                    tx.query(
                      "select osp_private.assert_package_snapshot_hash_current($1::uuid,$2::uuid,$3)",
                      [org, caseId, sha],
                    ),
                  Error,
                  "OSP_SNAPSHOT_MISMATCH",
                );
                throw new Error("PROBE_ROLLBACK");
              }),
            Error,
            "PROBE_ROLLBACK",
          );
        };
        await probe(
          "update osp_private.case_form_instances set version=version+1",
        );
        await probe(
          "update osp_private.document_versions set retention_disposition='disposed'",
        );
        await probe(
          "update osp_private.document_versions set document_type='bank_statement',valid_from=current_date-31,expires_at=current_date-1",
        );
        await probe(
          `update osp_private.case_package_input_snapshots set extraction_ids=array['${
            id(80)
          }'::uuid]`,
        );
        await probe(
          `update osp_private.case_package_input_snapshots set mapping_refs='[{"mappingId":"${
            id(80)
          }","mappingVersion":1,"mappingSha256":"${sha}","reviewDecisionId":"${
            id(81)
          }"}]'::jsonb`,
        );
        await probe(
          `insert into osp_private.document_versions (organization_id,id,document_id,document_type,status,source_sha256,content_type,bucket_id,version)
        select organization_id,'${
            id(80)
          }'::uuid,document_id,document_type,'approved',source_sha256,content_type,bucket_id,version+1 from osp_private.document_versions where id='${
            id(5)
          }'`,
        );
        await probe(
          `insert into osp_private.case_package_input_snapshots (organization_id,case_id,id,case_version,canonical_sha256,created_at)
        values ('${org}','${caseId}','${id(80)}',7,'${
            "f".repeat(64)
          }',now()+interval '1 second')`,
        );
        assertEquals((await counts()).state, {
          state: "operations_review",
          aggregate_version: 7,
        });
        assertEquals((await counts()).events, { n: 0 });
      },
    );
    await t.step(
      "success with default SQL source stores all members and actor with one transition",
      async () => {
        transactionBackends.clear();
        const results = db.native
          ? await Promise.all([
            store.complete(command),
            store.complete(command),
          ])
          : [await store.complete(command)];
        assertEquals(results.filter((result) => !result.replayed).length, 1);
        if (db.native) {
          assertEquals(results.filter((result) => result.replayed).length, 1);
          assertEquals(transactionBackends.size, 2);
          console.log(
            "Concurrent completion used two distinct PostgreSQL sessions and produced one receipt.",
          );
        }
        assertEquals(results.find((result) => !result.replayed), {
          caseId,
          caseVersion: 8,
          state: "signature_approval",
          replayed: false,
        });
        assertEquals(await counts(), {
          state: { state: "signature_approval", aggregate_version: 8 },
          receipts: { n: 1 },
          events: { n: 1 },
        });
        const rows = await db.query(
          "select basis_json, actor_json from osp_private.package_set_operations_reviews",
        );
        assertEquals((rows.rows[0] as SqlRow).basis_json, basis);
        assertEquals((rows.rows[0] as SqlRow).actor_json, command.actor);
      },
    );
    await t.step(
      "exact replay survives changed state without reloading or duplicate event",
      async () => {
        const before = loads;
        context.reviews[1].status = "rejected";
        assertEquals((await store.complete(command)).replayed, true);
        assertEquals(
          (await store.complete({
            ...command,
            actor: {
              ...command.actor,
              authorizationSessionId: "fresh-completion-session",
              authorizationSessionIssuedAt: new Date().toISOString(),
            },
          })).replayed,
          true,
        );
        assertEquals(loads, before);
        assertEquals((await counts()).events, { n: 1 });
        await assertRejects(
          () =>
            store.complete({
              ...command,
              expectedReviewSha256: "f".repeat(64),
            }),
          Error,
          "IDEMPOTENCY_CONFLICT",
        );
      },
    );
    await t.step("published review is immutable even to owner", async () => {
      await assertRejects(
        () =>
          db.exec(
            "update osp_private.package_set_operations_reviews set actor_json = actor_json",
          ),
        Error,
        "PACKAGE_SET_REVIEW_IMMUTABLE",
      );
      await assertRejects(
        () => db.exec("delete from osp_private.package_set_operations_reviews"),
        Error,
        "PACKAGE_SET_REVIEW_IMMUTABLE",
      );
    });
    await t.step(
      "tenant role cannot read or insert another tenant receipt",
      async () => {
        await assertRejects(
          () =>
            db.transaction(async (tx) => {
              await tx.exec("set local role osp_workflow_api");
              await tx.query(
                "select set_config('osp.organization_id',$1,true)",
                [
                  id(99),
                ],
              );
              assertEquals(
                (await tx.query(
                  "select * from osp_private.package_set_operations_reviews",
                )).rows,
                [],
              );
              await assertRejects(
                () =>
                  tx.query(
                    "insert into osp_private.package_set_operations_reviews (id, organization_id, case_id, package_set_id, idempotency_key, command_sha256, review_sha256, basis_json, actor_json, result_json) values ($1,$2,$3,$4,'foreign-tenant',$5,$6,$7::text::jsonb,$8::text::jsonb,$9::text::jsonb)",
                    [
                      id(88),
                      org,
                      caseId,
                      id(3),
                      sha,
                      basis.reviewSha256,
                      JSON.stringify(basis),
                      JSON.stringify(command.actor),
                      JSON.stringify({
                        caseId,
                        state: "signature_approval",
                        caseVersion: 8,
                        replayed: false,
                      }),
                    ],
                  ),
                Error,
                "row-level security",
              );
              throw new Error("PROBE_ROLLBACK");
            }),
          Error,
          "PROBE_ROLLBACK",
        );
        await assertRejects(
          () =>
            db.transaction(async (tx) => {
              await tx.exec("set local role osp_worker");
              await assertRejects(() =>
                tx.query(
                  "select * from osp_private.package_set_operations_reviews",
                )
              );
              throw new Error("PROBE_ROLLBACK");
            }),
          Error,
          "PROBE_ROLLBACK",
        );
      },
    );
  } finally {
    await db.close();
  }
});
