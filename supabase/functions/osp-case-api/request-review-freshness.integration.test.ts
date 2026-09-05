// Runs the real migration and API source SELECT against ephemeral PostgreSQL.
// No Supabase connection, files with business data, or providers are used.
import { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import type { SqlPort, SqlRow } from "../_shared/osp/database-context.ts";
import { createPostgresRequestSemanticGate } from "./request-semantic-gate.ts";

const org = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const m1 = "33333333-3333-4333-8333-333333333333";
const m2 = "44444444-4444-4444-8444-444444444444";
const sha = "a".repeat(64);

Deno.test("SQL trigger and API reject old, missing, mismatched and superseded reviews", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema osp_private;
      create role anon;
      create role authenticated;
      create role service_role;
      create role osp_worker;
      create role osp_workflow_api;
      create table osp_private.customer_registration_cases (
        organization_id uuid, id uuid, state text
      );
      create table osp_private.request_manifest_drafts (
        organization_id uuid, case_id uuid, id uuid, version integer,
        manifest_sha256 text, manifest_json jsonb
      );
      create table osp_private.request_manifest_decision_reviews (
        organization_id uuid, case_id uuid, manifest_draft_id uuid,
        manifest_version integer, manifest_sha256 text, status text,
        review_version integer, reviewed_at timestamptz
      );
    `);
    await db.exec(
      await Deno.readTextFile(
        new URL(
          "../../migrations/20260902130000_osp_operations_review_contract_gate.sql",
          import.meta.url,
        ),
      ),
    );

    let sourceQueries = 0;
    const port =
      (async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.reduce(
          (text, part, i) => text + (i ? `$${i}` : "") + part,
          "",
        );
        if (query.includes("request_manifest_drafts manifest")) {
          sourceQueries++;
          return (await db.query(query, values)).rows as SqlRow[];
        }
        return [];
      }) as SqlPort;
    port.begin = async <T>(fn: (tx: SqlPort) => Promise<T>) => await fn(port);
    const gate = createPostgresRequestSemanticGate({
      databaseUrl: "postgresql://example.invalid/test",
      postgresFactory: () => port,
    });
    const manifest = JSON.stringify({
      requestType: "customer_setup",
      targetXbfEntity: "XBFMX",
      forms: [{
        name: "Registration",
        format: "pdf",
        action: "fill",
        required: true,
        evidenceIds: ["test:source"],
      }],
      requestedDocuments: [],
      requirements: [],
    });
    const addManifest = (id: string, version: number, organization = org) =>
      db.query(
        "insert into osp_private.request_manifest_drafts values ($1,$2,$3,$4,$5,$6)",
        [organization, caseId, id, version, sha, manifest],
      );
    const addReview = (
      id: string,
      version: number,
      reviewVersion: number,
      status = "resolved",
      hash = sha,
      organization = org,
    ) =>
      db.query(
        "insert into osp_private.request_manifest_decision_reviews values ($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          organization,
          caseId,
          id,
          version,
          hash,
          status,
          reviewVersion,
          "2026-09-04T10:00:00Z",
        ],
      );
    const reset = async () => {
      await db.exec(
        "truncate osp_private.customer_registration_cases, osp_private.request_manifest_drafts, osp_private.request_manifest_decision_reviews",
      );
      await db.query(
        "insert into osp_private.customer_registration_cases values ($1,$2,'operations_review')",
        [org, caseId],
      );
    };
    const transition = () =>
      db.query(
        "update osp_private.customer_registration_cases set state = 'signature_approval' where organization_id=$1 and id=$2",
        [org, caseId],
      );
    const checkBlocked = async () => {
      await assertRejects(transition, Error, "REQUEST_FULFILLMENT_BLOCKED");
      assertEquals(
        (await db.query(
          "select state from osp_private.customer_registration_cases",
        )).rows[0],
        { state: "operations_review" },
      );
      await assertRejects(
        () => gate.load({ organizationId: org, caseId }),
        Error,
        "REQUEST_FULFILLMENT_BLOCKED",
      );
    };
    await t.step("missing manifest", async () => {
      await reset();
      await checkBlocked();
    });
    await t.step("manifest without review", async () => {
      await reset();
      await addManifest(m1, 1);
      await checkBlocked();
    });
    await t.step(
      "old resolved review cannot cover a new unreviewed manifest",
      async () => {
        await reset();
        await addManifest(m1, 1);
        await addReview(m1, 1, 1);
        await addManifest(m2, 2);
        await checkBlocked();
      },
    );
    await t.step(
      "newer unresolved review wins, including equal timestamps",
      async () => {
        await reset();
        await addManifest(m1, 1);
        await addReview(m1, 1, 1);
        await addReview(m1, 1, 2, "needs_external_clarification");
        await checkBlocked();
      },
    );
    await t.step(
      "latest review hash mismatch cannot fall back to an older valid review",
      async () => {
        await reset();
        await addManifest(m1, 1);
        await addReview(m1, 1, 1);
        await addReview(m1, 1, 2, "resolved", "b".repeat(64));
        await checkBlocked();
      },
    );
    await t.step("manifest version mismatch", async () => {
      await reset();
      await addManifest(m1, 2);
      await addReview(m1, 1, 1);
      await checkBlocked();
    });
    await t.step(
      "another tenant's review cannot satisfy this case",
      async () => {
        await reset();
        await addManifest(m1, 1);
        await addReview(
          m1,
          1,
          1,
          "resolved",
          sha,
          "55555555-5555-4555-8555-555555555555",
        );
        await checkBlocked();
      },
    );
    await t.step(
      "multiple reviewed manifests select only the latest",
      async () => {
        await reset();
        await addManifest(m1, 1);
        await addReview(m1, 1, 1);
        await addManifest(m2, 2);
        await addReview(m2, 2, 1);
        await transition();
        const matrix = await gate.load({ organizationId: org, caseId });
        // The review prerequisite passes, but missing evidence still blocks signing/send.
        assertEquals(matrix.gates.send, false);
        assertEquals(matrix.items[0].status, "missing");
      },
    );
    assertEquals(sourceQueries, 8);
  } finally {
    await db.close();
  }
});
