import assert from "node:assert/strict";

import {
  createInMemoryCaseStore,
  createPostgresCaseStore,
} from "./postgres-store.ts";
import * as postgresStoreModule from "./postgres-store.ts";
import { buildClarificationDraft } from "../osp-worker/clarification-draft.ts";

const authority = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  issuer: "https://auth.example.test",
  subject: "operator",
  email: "operator@example.test",
  permissions: ["osp:operate"],
  correlationId: "correlation-1",
} as const;
const secondAuthority = {
  ...authority,
  organizationId: "22222222-2222-4222-8222-222222222222",
  correlationId: "correlation-2",
} as const;
const caseId = "33333333-3333-4333-8333-333333333333";

function command(
  idempotencyKey: string,
  expectedVersion = 0,
  body = "Need tax certificate",
) {
  return {
    version: 1 as const,
    action: "add_case_comment" as const,
    idempotency_key: idempotencyKey,
    expected_version: expectedVersion,
    input: { caseId, body },
  };
}

Deno.test("case commands reject stale writers and advance the aggregate exactly once", async () => {
  const store = createInMemoryCaseStore([{
    id: caseId,
    organizationId: authority.organizationId,
    supplierId: "supplier-1",
    state: "received",
    aggregateVersion: 0,
  }]);
  const [left, right] = await Promise.allSettled([
    store.addComment(authority, command("one")),
    store.addComment(authority, command("two")),
  ]);
  assert.equal(
    [left, right].filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    [left, right].filter((result) =>
      result.status === "rejected" &&
      /VERSION_CONFLICT/.test(String(result.reason))
    ).length,
    1,
  );
  assert.equal((await store.getCase(authority, caseId)).aggregateVersion, 1);
});

Deno.test("case commands return a saved receipt only for an identical idempotency request", async () => {
  const store = createInMemoryCaseStore([{
    id: caseId,
    organizationId: authority.organizationId,
    supplierId: "supplier-1",
    state: "received",
    aggregateVersion: 0,
  }]);
  const first = await store.addComment(authority, command("same-key"));
  assert.deepEqual(
    await store.addComment(authority, command("same-key")),
    first,
  );
  await assert.rejects(
    store.addComment(authority, command("same-key", 0, "Changed request")),
    /IDEMPOTENCY_CONFLICT/,
  );
  assert.equal((await store.getCase(authority, caseId)).aggregateVersion, 1);
});

Deno.test("case store enforces tenant isolation and keeps audit events append-only", async () => {
  const store = createInMemoryCaseStore([{
    id: caseId,
    organizationId: authority.organizationId,
    supplierId: "supplier-1",
    state: "received",
    aggregateVersion: 0,
  }]);
  await assert.rejects(
    store.getCase(secondAuthority, caseId),
    /CASE_NOT_FOUND/,
  );
  await assert.rejects(
    store.addComment(secondAuthority, command("wrong-tenant")),
    /CASE_NOT_FOUND/,
  );
  await store.appendEvent({
    transactionId: "tx-1",
    organizationId: authority.organizationId,
  }, {
    id: "44444444-4444-4444-8444-444444444444",
    organizationId: authority.organizationId,
    caseId,
    sequence: 1,
    state: "received",
    actorSubject: "operator",
    authorityRole: "operations",
    sourceVersion: 0,
    occurredAt: "2026-08-23T00:00:00.000Z",
    reasonCode: "case_received",
    correlationId: "correlation-1",
  });
  await assert.rejects(
    store.appendEvent({
      transactionId: "tx-1",
      organizationId: authority.organizationId,
    }, {
      id: "55555555-5555-4555-8555-555555555555",
      organizationId: authority.organizationId,
      caseId,
      sequence: 1,
      state: "received",
      actorSubject: "operator",
      authorityRole: "operations",
      sourceVersion: 0,
      occurredAt: "2026-08-23T00:00:00.000Z",
      reasonCode: "case_received",
      correlationId: "correlation-1",
    }),
    /APPEND_ONLY_CONFLICT/,
  );
});

Deno.test("Postgres store replays an identical concurrent command after the aggregate lock commits", async () => {
  let receiptReads = 0;
  let releaseReceiptBarrier!: () => void;
  const receiptBarrier = new Promise<void>((resolve) => {
    releaseReceiptBarrier = resolve;
  });
  let caseLocked = false;
  let releaseCaseLock!: () => void;
  const caseLockReleased = new Promise<void>((resolve) => {
    releaseCaseLock = resolve;
  });
  let aggregateVersion = 0;
  let receipt:
    | { request_hash: string; response_json: Record<string, unknown> }
    | undefined;
  const query =
    (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("$");
      if (/set local role|set_config/.test(text)) return [];
      if (/pg_advisory_xact_lock/.test(text)) return [];
      if (
        /select request_hash, response_json from osp_private\.command_receipts/
          .test(text)
      ) {
        receiptReads += 1;
        if (receiptReads === 2) releaseReceiptBarrier();
        await receiptBarrier;
        return receipt ? [receipt] : [];
      }
      if (/select id, supplier_id, state, aggregate_version/.test(text)) {
        if (caseLocked) await caseLockReleased;
        caseLocked = true;
        return [{
          id: caseId,
          supplier_id: "supplier-1",
          state: "received",
          aggregate_version: aggregateVersion,
          blocked_by_duplicate_review: false,
        }];
      }
      if (/insert into osp_private\.case_comments/.test(text)) return [];
      if (
        /update osp_private\.customer_registration_cases set aggregate_version/
          .test(text)
      ) {
        aggregateVersion += 1;
        return [{
          id: caseId,
          supplier_id: "supplier-1",
          state: "received",
          aggregate_version: aggregateVersion,
          blocked_by_duplicate_review: false,
        }];
      }
      if (/insert into osp_private\.case_events/.test(text)) return [];
      if (/insert into osp_private\.command_receipts/.test(text)) {
        receipt = {
          request_hash: String(values[4]),
          response_json: JSON.parse(String(values[5])),
        };
        releaseCaseLock();
        return [];
      }
      throw new Error(`UNEXPECTED_QUERY:${text}`);
    }) as unknown as ((
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => Promise<unknown[]>);
  Object.assign(query, {
    begin: async <T>(operation: (transaction: typeof query) => Promise<T>) =>
      await operation(query),
  });
  const store = createPostgresCaseStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => query,
  });
  const makeCommand = () => command("concurrent-replay");
  const results = await Promise.all([
    store.addComment(authority, makeCommand()),
    store.addComment(authority, makeCommand()),
  ]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].aggregateVersion, 1);
  assert.equal(aggregateVersion, 1);
});

Deno.test("Postgres store rejects a duplicate resolution when the candidate is not in the tenant", async () => {
  const query =
    (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("$");
      if (/set local role|set_config/.test(text)) return [];
      if (/pg_advisory_xact_lock/.test(text)) return [];
      if (
        /select request_hash, response_json from osp_private\.command_receipts/
          .test(text)
      ) return [];
      if (/select id, supplier_id, state, aggregate_version/.test(text)) {
        return [{
          id: caseId,
          supplier_id: "supplier-1",
          state: "received",
          aggregate_version: 0,
          blocked_by_duplicate_review: true,
        }];
      }
      if (/update osp_private\.duplicate_candidates/.test(text)) return [];
      if (
        /update osp_private\.customer_registration_cases set aggregate_version/
          .test(text)
      ) {
        return [{
          id: caseId,
          supplier_id: "supplier-1",
          state: "received",
          aggregate_version: 1,
          blocked_by_duplicate_review: true,
        }];
      }
      if (
        /insert into osp_private\.case_events|insert into osp_private\.command_receipts/
          .test(text)
      ) return [];
      throw new Error(`UNEXPECTED_QUERY:${text}`);
    }) as unknown as ((
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => Promise<unknown[]>);
  Object.assign(query, {
    begin: async <T>(operation: (transaction: typeof query) => Promise<T>) =>
      await operation(query),
  });
  const store = createPostgresCaseStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => query,
  });
  await assert.rejects(
    store.resolveDuplicate(authority, {
      version: 1,
      action: "resolve_duplicate_candidate",
      idempotency_key: "missing-candidate",
      expected_version: 0,
      input: {
        caseId,
        candidateId: "66666666-6666-4666-8666-666666666666",
        resolution: "keep_separate",
        reasonCode: "not_same_supplier",
      },
    }),
    /DUPLICATE_NOT_FOUND/,
  );
});

Deno.test("Postgres store rejects a cross-tenant aggregate row when the case query is unscoped", async () => {
  let caseQueryScoped = false;
  const query =
    (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("$");
      if (/set local role|set_config/.test(text)) return [];
      if (/pg_advisory_xact_lock/.test(text)) return [];
      if (
        /select request_hash, response_json from osp_private\.command_receipts/
          .test(text)
      ) return [];
      if (/select id, supplier_id, state, aggregate_version/.test(text)) {
        caseQueryScoped = /where organization_id = \$ and id = \$ for update/i
          .test(text);
        return caseQueryScoped ? [] : [{
          id: caseId,
          supplier_id: "supplier-2",
          state: "received",
          aggregate_version: 0,
          blocked_by_duplicate_review: false,
        }];
      }
      if (/insert into osp_private\.case_comments/.test(text)) return [];
      if (
        /update osp_private\.customer_registration_cases set aggregate_version/
          .test(text)
      ) {
        return [{
          id: caseId,
          supplier_id: "supplier-2",
          state: "received",
          aggregate_version: 1,
          blocked_by_duplicate_review: false,
        }];
      }
      if (
        /insert into osp_private\.case_events|insert into osp_private\.command_receipts/
          .test(text)
      ) return [];
      throw new Error(`UNEXPECTED_QUERY:${text}`);
    }) as unknown as ((
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => Promise<unknown[]>);
  Object.assign(query, {
    begin: async <T>(operation: (transaction: typeof query) => Promise<T>) =>
      await operation(query),
  });
  const store = createPostgresCaseStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => query,
  });
  await assert.rejects(
    store.addComment(authority, command("cross-tenant-case")),
    /CASE_NOT_FOUND/,
  );
  assert.equal(caseQueryScoped, true);
});

Deno.test("Postgres store serializes an idempotency key across different case aggregates", async () => {
  const firstCaseId = "77777777-7777-4777-8777-777777777777";
  const secondCaseId = "88888888-8888-4888-8888-888888888888";
  const cases = new Map([[firstCaseId, 0], [secondCaseId, 0]]);
  let receipt:
    | { request_hash: string; response_json: Record<string, unknown> }
    | undefined;
  let lockHeld = false;
  let releaseLock!: () => void;
  const lockReleased = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  let advisoryUsed = false;
  let receiptReads = 0;
  let releaseReceiptReads!: () => void;
  const receiptReadsReady = new Promise<void>((resolve) => {
    releaseReceiptReads = resolve;
  });
  const query =
    (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("$");
      if (/set local role|set_config/.test(text)) return [];
      if (/pg_advisory_xact_lock/.test(text)) {
        advisoryUsed = true;
        if (lockHeld) await lockReleased;
        lockHeld = true;
        return [];
      }
      if (
        /select request_hash, response_json from osp_private\.command_receipts/
          .test(text)
      ) {
        if (!advisoryUsed && !receipt) {
          receiptReads += 1;
          if (receiptReads === 2) releaseReceiptReads();
          await receiptReadsReady;
        }
        return receipt ? [receipt] : [];
      }
      if (/select id, supplier_id, state, aggregate_version/.test(text)) {
        const aggregateId = String(values[1]);
        return [{
          id: aggregateId,
          supplier_id: "supplier-1",
          state: "received",
          aggregate_version: cases.get(aggregateId) ?? 0,
          blocked_by_duplicate_review: false,
        }];
      }
      if (/insert into osp_private\.case_comments/.test(text)) return [];
      if (
        /update osp_private\.customer_registration_cases set aggregate_version/
          .test(text)
      ) {
        const aggregateId = String(values[1]);
        const version = (cases.get(aggregateId) ?? 0) + 1;
        cases.set(aggregateId, version);
        return [{
          id: aggregateId,
          supplier_id: "supplier-1",
          state: "received",
          aggregate_version: version,
          blocked_by_duplicate_review: false,
        }];
      }
      if (/insert into osp_private\.case_events/.test(text)) return [];
      if (/insert into osp_private\.command_receipts/.test(text)) {
        if (receipt) {
          const error = Object.assign(new Error("duplicate key"), {
            code: "23505",
          });
          throw error;
        }
        receipt = {
          request_hash: String(values[4]),
          response_json: JSON.parse(String(values[5])),
        };
        releaseLock();
        return [];
      }
      throw new Error(`UNEXPECTED_QUERY:${text}`);
    }) as unknown as ((
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => Promise<unknown[]>);
  Object.assign(query, {
    begin: async <T>(operation: (transaction: typeof query) => Promise<T>) =>
      await operation(query),
  });
  const store = createPostgresCaseStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => query,
  });
  const makeCommand = (aggregateId: string, body: string) => ({
    version: 1 as const,
    action: "add_case_comment" as const,
    idempotency_key: "operation-wide-key",
    expected_version: 0,
    input: { caseId: aggregateId, body },
  });
  const results = await Promise.allSettled([
    store.addComment(authority, makeCommand(firstCaseId, "first payload")),
    store.addComment(authority, makeCommand(secondCaseId, "different payload")),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) =>
      result.status === "rejected" &&
      /IDEMPOTENCY_CONFLICT/.test(String(result.reason))
    ).length,
    1,
  );
});

Deno.test("clarification store persists a grounded draft and an immutable Operations review under the case version", async () => {
  const exported = postgresStoreModule as unknown as Record<string, unknown>;
  assert.equal(typeof exported.createPostgresClarificationStore, "function");
  const queries: Array<{ text: string; values: unknown[] }> = [];
  let caseVersion = 4;
  const grounded = await buildClarificationDraft({
    caseId,
    evidenceIds: ["ev-1"],
    missing: [{
      fieldId: "supplier.address",
      question: "Please confirm the registered address.",
      evidenceIds: ["ev-1"],
    }],
    contradictions: [],
  });
  const sourceDraft = {
    id: "44444444-4444-4444-8444-444444444444",
    case_id: caseId,
    version: 1,
    status: "operations_review_required",
    canonical_sha256: grounded.canonicalSha256,
    authorization_mailbox: "sales@heymarksman.com",
    evidence_ids: ["ev-1"],
    questions_json: [{
      kind: "missing",
      fieldId: "supplier.address",
      question: "Please confirm the registered address.",
      evidenceIds: ["ev-1"],
    }],
  };
  const query = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim().toLowerCase();
      queries.push({ text, values });
      if (
        text.startsWith("set local role") ||
        text.startsWith("select set_config")
      ) return [];
      if (
        text.includes("from osp_private.customer_registration_cases") &&
        text.includes("for update")
      ) {
        return [{
          id: caseId,
          state: "awaiting_clarification",
          aggregate_version: caseVersion,
        }];
      }
      if (
        text.includes("from osp_private.clarification_drafts") &&
        text.includes("source_draft_id is null") && text.includes("for update")
      ) return [sourceDraft];
      if (text.startsWith("insert into osp_private.clarification_drafts")) {
        return [{
          id: "55555555-5555-4555-8555-555555555555",
          case_id: caseId,
          version: 2,
          status: "operations_reviewed",
          canonical_sha256: "b".repeat(64),
          authorization_mailbox: "sales@heymarksman.com",
          evidence_ids: ["ev-1"],
          questions_json: values.find((value) => Array.isArray(value)),
        }];
      }
      if (
        text.startsWith(
          "update osp_private.customer_registration_cases set aggregate_version",
        )
      ) {
        caseVersion += 1;
        return [{ aggregate_version: caseVersion }];
      }
      if (text.startsWith("insert into osp_private.case_events")) return [];
      throw new Error(`UNEXPECTED_QUERY:${text}`);
    },
    {
      begin: async <T>(operation: (transaction: typeof query) => Promise<T>) =>
        await operation(query),
    },
  );
  const createStore = exported.createPostgresClarificationStore as (
    options: unknown,
  ) => {
    saveOperationsReview(input: unknown): Promise<Record<string, unknown>>;
  };
  const store = createStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => query,
  });
  const reviewed = await store.saveOperationsReview({
    organizationId: authority.organizationId,
    subject: authority.subject,
    draftId: sourceDraft.id,
    expectedCaseVersion: 4,
    expectedCanonicalSha256: sourceDraft.canonical_sha256,
    questions: [{
      kind: "missing",
      fieldId: "supplier.address",
      question: "Please provide the current registered address.",
      evidenceIds: ["ev-1"],
    }],
  });
  assert.equal(reviewed.status, "operations_reviewed");
  assert.equal(caseVersion, 5);
  assert.equal(
    queries.some((entry) =>
      entry.text.includes("source_draft_id") &&
      entry.text.startsWith("insert into osp_private.clarification_drafts")
    ),
    true,
  );
  assert.equal(
    queries.some((entry) =>
      entry.text.startsWith("insert into osp_private.case_events")
    ),
    true,
  );
});

Deno.test("clarification store persists an append-only manifest decision review and advances only the case state", async () => {
  const exported = postgresStoreModule as unknown as Record<string, unknown>;
  const manifestId = "44444444-4444-4444-8444-444444444444";
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const manifest = {
    clarificationQuestions: [{
      fieldId: "targetXbfEntity",
      question: "Which XBF entity?",
      evidenceIds: ["email:body"],
    }],
    contradictions: [],
    missingInformation: [],
  };
  const query = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim().toLowerCase();
      queries.push({ text, values });
      if (
        text.startsWith("set local role") ||
        text.startsWith("select set_config")
      ) return [];
      if (
        text.includes("from osp_private.customer_registration_cases") &&
        text.includes("for update")
      ) {
        return [{
          id: caseId,
          state: "analyzing_requirements",
          aggregate_version: 4,
          blocked_by_duplicate_review: false,
        }];
      }
      if (
        text.includes("from osp_private.request_manifest_drafts") &&
        text.includes("status = 'review_required'")
      ) {
        return [{
          id: manifestId,
          version: 1,
          manifest_json: JSON.stringify(manifest),
          manifest_sha256: "a".repeat(64),
        }];
      }
      if (
        text.includes("from osp_private.request_manifest_decision_reviews")
      ) return [];
      if (
        text.startsWith(
          "insert into osp_private.request_manifest_decision_reviews",
        )
      ) return [{ id: values[0] }];
      if (
        text.startsWith(
          "update osp_private.customer_registration_cases set state",
        )
      ) return [{ aggregate_version: 5 }];
      if (text.startsWith("insert into osp_private.case_events")) return [];
      throw new Error(`UNEXPECTED_QUERY:${text}`);
    },
    {
      begin: async <T>(operation: (transaction: typeof query) => Promise<T>) =>
        await operation(query),
    },
  );
  const createStore = exported.createPostgresClarificationStore as (
    options: unknown,
  ) => {
    saveRequestManifestReview(input: unknown): Promise<Record<string, unknown>>;
  };
  const store = createStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => query,
  });
  const reviewed = await store.saveRequestManifestReview({
    organizationId: authority.organizationId,
    subject: authority.subject,
    caseId,
    expectedCaseVersion: 4,
    expectedManifestSha256: "a".repeat(64),
    decisions: [{
      decisionId: "clarification:0",
      outcome: "answered",
      resolution: "Use XBFUS.",
    }],
  });
  assert.equal(reviewed.status, "resolved");
  assert.equal(reviewed.caseVersion, 5);
  assert.equal(reviewed.replayed, false);
  assert.equal(
    queries.some((entry) =>
      entry.text.startsWith(
        "insert into osp_private.request_manifest_decision_reviews",
      )
    ),
    true,
  );
  assert.equal(
    queries.some((entry) =>
      entry.text.startsWith(
        "update osp_private.customer_registration_cases set state",
      ) && entry.values.includes("awaiting_xbf_information")
    ),
    true,
  );
  assert.equal(
    queries.some((entry) => /\b(?:send|webhook|email)\b/.test(entry.text)),
    false,
  );
});

Deno.test("an Operations clarification edit after Sales authorization supersedes authority and returns to review", async () => {
  const exported = postgresStoreModule as unknown as Record<string, unknown>;
  const grounded = await buildClarificationDraft({
    caseId,
    evidenceIds: ["ev-1"],
    missing: [{
      fieldId: "supplier.address",
      question: "Please confirm the registered address.",
      evidenceIds: ["ev-1"],
    }],
    contradictions: [],
  });
  const sourceDraft = {
    id: "44444444-4444-4444-8444-444444444444",
    case_id: caseId,
    version: 1,
    status: "operations_review_required",
    canonical_sha256: grounded.canonicalSha256,
    authorization_mailbox: "sales@heymarksman.com",
    evidence_ids: grounded.evidenceIds,
    questions_json: grounded.questions,
  };
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const query = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim().toLowerCase();
      queries.push({ text, values });
      if (
        text.startsWith("set local role") ||
        text.startsWith("select set_config")
      ) return [];
      if (
        text.includes("from osp_private.customer_registration_cases") &&
        text.includes("for update")
      ) return [{ id: caseId, state: "ready_to_send", aggregate_version: 9 }];
      if (
        text.includes("from osp_private.clarification_drafts") &&
        text.includes("source_draft_id is null") && text.includes("for update")
      ) return [sourceDraft];
      if (text.startsWith("insert into osp_private.clarification_drafts")) {
        return [{
          ...sourceDraft,
          id: "55555555-5555-4555-8555-555555555555",
          version: 2,
          status: "operations_reviewed",
          canonical_sha256: "b".repeat(64),
          questions_json: values.find((value) => Array.isArray(value)),
        }];
      }
      if (
        text.startsWith("update osp_private.sales_authorizations set status")
      ) return [{ id: "66666666-6666-4666-8666-666666666666" }];
      if (
        text.startsWith(
          "update osp_private.customer_registration_cases set state",
        )
      ) return [{ aggregate_version: 10 }];
      if (
        text.startsWith("insert into osp_private.approval_events") ||
        text.startsWith("insert into osp_private.case_events")
      ) return [];
      throw new Error(`UNEXPECTED_QUERY:${text}`);
    },
    {
      begin: async <T>(operation: (transaction: typeof query) => Promise<T>) =>
        await operation(query),
    },
  );
  const createStore = exported.createPostgresClarificationStore as (
    options: unknown,
  ) => {
    saveOperationsReview(input: unknown): Promise<Record<string, unknown>>;
  };
  const store = createStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => query,
  });
  const reviewed = await store.saveOperationsReview({
    organizationId: authority.organizationId,
    subject: authority.subject,
    draftId: sourceDraft.id,
    expectedCaseVersion: 9,
    expectedCanonicalSha256: sourceDraft.canonical_sha256,
    questions: sourceDraft.questions_json,
  });
  assert.equal(reviewed.caseVersion, 10);
  assert.equal(
    queries.some((entry) =>
      entry.text.startsWith(
        "update osp_private.sales_authorizations set status",
      )
    ),
    true,
  );
  assert.equal(
    queries.some((entry) =>
      entry.text.startsWith("insert into osp_private.approval_events") &&
      entry.values.includes("approval_invalidated")
    ),
    true,
  );
  assert.equal(
    queries.some((entry) =>
      entry.text.startsWith(
        "update osp_private.customer_registration_cases set state",
      ) && entry.values.includes("awaiting_clarification")
    ),
    true,
  );
});

Deno.test("clarification store lists only latest tenant-safe review data", async () => {
  const exported = postgresStoreModule as unknown as Record<string, unknown>;
  const createStore = exported.createPostgresClarificationStore as (
    options: unknown,
  ) => Record<string, unknown>;
  const seen: string[] = [];
  const query = Object.assign(async (strings: TemplateStringsArray) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim().toLowerCase();
    seen.push(text);
    if (
      text.startsWith("set local role") || text.startsWith("select set_config")
    ) return [];
    return [{
      id: "44444444-4444-4444-8444-444444444444",
      case_id: caseId,
      case_version: 4,
      version: 1,
      status: "operations_review_required",
      canonical_sha256: "a".repeat(64),
      authorization_mailbox: "sales@heymarksman.com",
      evidence_ids: ["ev-1"],
      questions_json: [{
        kind: "missing",
        fieldId: "supplier.address",
        question: "Please confirm the registered address.",
        evidenceIds: ["ev-1"],
      }],
    }];
  }, {
    begin: async <T>(operation: (transaction: typeof query) => Promise<T>) =>
      await operation(query),
  });
  const store = createStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => query,
  });
  assert.equal(typeof store.listForReview, "function");
  const rows = await (store.listForReview as (
    organizationId: string,
  ) => Promise<Array<Record<string, unknown>>>)(authority.organizationId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].caseVersion, 4);
  assert.equal(
    seen.some((text) =>
      text.includes("distinct on") &&
      text.includes("aggregate_version as case_version")
    ),
    true,
  );
  assert.equal(
    seen.some((text) => /body|attachment_ids|created_by_subject/.test(text)),
    false,
  );
});

Deno.test("clarification store persists one generated grounded draft idempotently", async () => {
  const exported = postgresStoreModule as unknown as Record<string, unknown>;
  const createStore = exported.createPostgresClarificationStore as (
    options: unknown,
  ) => Record<string, unknown>;
  const grounded = await buildClarificationDraft({
    caseId,
    evidenceIds: ["ev-1"],
    missing: [{
      fieldId: "supplier.address",
      question: "Please confirm the registered address.",
      evidenceIds: ["ev-1"],
    }],
    contradictions: [],
  });
  let caseVersion = 0;
  let persisted: Record<string, unknown> | undefined;
  let eventCount = 0;
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const query = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim().toLowerCase();
      queries.push({ text, values });
      if (
        text.startsWith("set local role") ||
        text.startsWith("select set_config")
      ) return [];
      if (text.startsWith("select pg_advisory_xact_lock")) return [{}];
      if (
        text.includes("from osp_private.clarification_drafts") &&
        text.includes("canonical_sha256") && !text.includes("for update")
      ) {
        return persisted ? [{ ...persisted, case_version: caseVersion }] : [];
      }
      if (
        text.includes("from osp_private.customer_registration_cases") &&
        text.includes("for update")
      ) {
        return [{
          id: caseId,
          state: "analyzing_requirements",
          aggregate_version: caseVersion,
        }];
      }
      if (text.includes("coalesce(max(version)")) {
        return [{ latest_version: 0 }];
      }
      if (text.startsWith("insert into osp_private.clarification_drafts")) {
        assert.equal(typeof values[6], "string");
        assert.deepEqual(JSON.parse(values[6] as string), grounded.questions);
        persisted = {
          id: values[0],
          case_id: caseId,
          version: 1,
          status: "operations_review_required",
          questions_json: grounded.questions,
          evidence_ids: grounded.evidenceIds,
          canonical_sha256: grounded.canonicalSha256,
          authorization_mailbox: grounded.authorizationMailbox,
        };
        return [persisted];
      }
      if (
        text.startsWith("update osp_private.customer_registration_cases set")
      ) {
        caseVersion += 1;
        return [{ aggregate_version: caseVersion }];
      }
      if (text.startsWith("insert into osp_private.case_events")) {
        eventCount += 1;
        return [];
      }
      throw new Error(`UNEXPECTED_QUERY:${text}:${values.length}`);
    },
    {
      begin: async <T>(operation: (transaction: typeof query) => Promise<T>) =>
        await operation(query),
    },
  );
  const store = createStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => query,
  });
  assert.equal(typeof store.saveGeneratedDraft, "function");
  const save = store.saveGeneratedDraft as (
    input: unknown,
  ) => Promise<Record<string, unknown>>;
  const first = await save({
    organizationId: authority.organizationId,
    draft: grounded,
    correlationId: "clarification-job-1",
  });
  const replay = await save({
    organizationId: authority.organizationId,
    draft: grounded,
    correlationId: "clarification-job-1",
  });
  assert.deepEqual(replay, first);
  assert.equal(first.caseVersion, 1);
  assert.equal(eventCount, 1);
  assert.equal(
    queries.some((entry) =>
      entry.text.startsWith("select pg_advisory_xact_lock")
    ),
    true,
  );
});
