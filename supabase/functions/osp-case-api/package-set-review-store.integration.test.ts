// deno-lint-ignore-file no-import-prefix
import { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
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

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = id(1), caseId = id(2), snapshotId = id(4), sha = "a".repeat(64);
Deno.test("set review receipt and existing Operations transition commit atomically in PostgreSQL", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create role osp_worker; create role osp_workflow_api;
      create schema osp_private; create schema extensions;
      grant usage on schema osp_private, extensions to osp_workflow_api;
      create function extensions.gen_random_uuid() returns uuid language sql as 'select gen_random_uuid()';
      create table osp_private.customer_registration_cases (
        organization_id uuid, id uuid, state text, aggregate_version bigint,
        updated_at timestamptz, primary key (organization_id,id));
      create table osp_private.supplier_package_sets (
        organization_id uuid, id uuid, case_id uuid, primary key (organization_id,id));
      create table osp_private.case_package_input_snapshots (
        organization_id uuid, case_id uuid, id uuid, case_version bigint,
        canonical_sha256 text, created_at timestamptz default now());
      create table osp_private.approval_events (
        id uuid, organization_id uuid, case_id uuid, case_version bigint,
        event_type text, actor_subject text, actor_role text,
        authorization_session_id text, command_sha256 text, evidence_refs jsonb);
      -- Reduced-schema dependency stubs only; authority is also checked by the real TS policy.
      create function osp_private.assert_approval_actor(uuid,text,text,text,text[],text,text,timestamptz)
      returns void language plpgsql as $$ begin
        if $1::text is distinct from current_setting('osp.organization_id',true)
          or $2 <> 'complete_operations_review' or $6 <> 'operations_reviewer'
          then raise exception 'ACTOR_REJECTED'; end if;
      end $$;
      create function osp_private.assert_package_snapshot_hash_current(uuid,uuid,text)
      returns void language sql as 'select';
      grant select, update on osp_private.customer_registration_cases to osp_workflow_api;
      grant select on osp_private.case_package_input_snapshots to osp_workflow_api;
      grant insert on osp_private.approval_events to osp_workflow_api;
    `);
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
      "insert into osp_private.supplier_package_sets values ($1,$2,$3)",
      [org, id(3), caseId],
    );
    await db.query(
      "insert into osp_private.case_package_input_snapshots values ($1,$2,$3,7,$4,now())",
      [org, caseId, snapshotId, sha],
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
        authorizationSessionIssuedAt: "2026-09-08T12:00:00.000Z",
        active: true,
      },
    };
    let failReceipt = false, loads = 0;
    const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.reduce(
        (s, part, index) =>
          s + part + (index < values.length ? `$${index + 1}` : ""),
        "",
      );
      if (
        failReceipt &&
        query.includes("insert into osp_private.package_set_operations_reviews")
      ) throw new Error("INJECTED_RECEIPT_FAILURE");
      return db.query(query, values).then((r) => r.rows as SqlRow[]);
    }) as SqlPort;
    sql.begin = async <T>(operation: (tx: SqlPort) => Promise<T>) => {
      await db.exec("begin");
      try {
        const value = await operation(sql);
        await db.exec("commit");
        return value;
      } catch (error) {
        await db.exec("rollback");
        throw error;
      }
    };
    // Explicit synthetic trusted-source seam. Not a production decision loader.
    let store = createPackageSetOperationsReviewStore({
      sql,
      now: () => new Date("2026-09-08T12:01:00Z"),
      loadLocked: async (tx) => {
        loads++;
        await tx`select id from osp_private.customer_registration_cases where organization_id = ${org}::uuid and id = ${caseId}::uuid for update`;
        return structuredClone(context);
      },
    });
    const counts = async () => ({
      state: (await db.query(
        "select state, aggregate_version from osp_private.customer_registration_cases",
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
        alter table osp_private.supplier_package_sets add column status text,
          add column manifest_sha256 text, add column receipt_json jsonb,
          add column input_snapshot_id uuid, add column input_snapshot_sha256 text;
        alter table osp_private.case_package_input_snapshots add column document_version_ids uuid[];
        create table osp_private.documents (organization_id uuid,id uuid,case_id uuid);
        create table osp_private.document_versions (organization_id uuid,id uuid,document_id uuid,
          document_type text,status text,source_sha256 text,content_type text,bucket_id text,
          valid_from date,expires_at date,version integer,primary key(organization_id,id));
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
          "update osp_private.supplier_package_sets set status='current',manifest_sha256=$1,receipt_json=$2,input_snapshot_id=$3,input_snapshot_sha256=$4",
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
            "insert into osp_private.document_versions values ($1,$2,$3,'supplier_requirement','approved',$4,'application/pdf','osp-derived-documents',null,null,1)",
            [org, id(n), id(100 + n), "c".repeat(64)],
          );
        }
        await db.query(
          "insert into osp_private.request_manifest_drafts values ($1,$2,$3,1,$4,$5)",
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
          now: () => new Date("2026-09-08T12:01:00Z"),
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
          now: () => new Date("2026-09-08T12:01:00Z"),
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
          }::jsonb)`
        );
        assertEquals((await counts()).events, { n: 0 });
      },
    );
    await t.step(
      "success with default SQL source stores all members and actor with one transition",
      async () => {
        assertEquals(await store.complete(command), {
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
        await db.exec("begin; set local role osp_workflow_api");
        try {
          await db.query("select set_config('osp.organization_id',$1,true)", [
            id(99),
          ]);
          assertEquals(
            (await db.query(
              "select * from osp_private.package_set_operations_reviews",
            )).rows,
            [],
          );
          await assertRejects(
            () =>
              db.query(
                "insert into osp_private.package_set_operations_reviews (id, organization_id, case_id, package_set_id, idempotency_key, command_sha256, review_sha256, basis_json, actor_json, result_json) values ($1,$2,$3,$4,'foreign-tenant',$5,$6,$7,$8,$9)",
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
        } finally {
          await db.exec("rollback");
        }
        await db.exec("begin; set local role osp_worker");
        try {
          await assertRejects(() =>
            db.query("select * from osp_private.package_set_operations_reviews")
          );
        } finally {
          await db.exec("rollback");
        }
      },
    );
  } finally {
    await db.close();
  }
});
