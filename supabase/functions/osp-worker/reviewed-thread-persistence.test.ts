import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import {
  createPostgresIntakePersistence,
  type ReviewedThreadInput,
} from "./postgres-intake-persistence.ts";
import type { SqlPort, SqlRow } from "../_shared/osp/database-context.ts";

const organizationId = "ca0a8f30-1382-4316-9bd5-cb76d9ab4920";
const targetCaseId = "22222222-2222-4222-8222-222222222222";
const priorJobId = "11111111-1111-4111-8111-111111111111";
const sha = (value: string) => value.repeat(64);

type State = {
  receipts: Map<string, { request_hash: string; response_json: string }>;
  cases: Set<string>;
  messages: Set<string>;
  supplierInserts: number;
  caseInserts: number;
  messageInserts: number;
  attachmentInserts: number;
  eventInserts: number;
};

function copy(state: State): State {
  return {
    ...state,
    receipts: new Map(state.receipts),
    cases: new Set(state.cases),
    messages: new Set(state.messages),
  };
}

function relayMessage(
  gmailMessageId: string,
  outerHash: string,
  emlHash: string,
  documentHash: string,
) {
  const document = {
    bytes: new Uint8Array([1, 2, 3]),
    sha256: documentHash,
    contentType: "application/pdf",
    filename: "QF.pdf",
    sourceRole: "original_attachment" as const,
    parentSourceSha256: emlHash,
    processingDisposition: "automatic_eligible" as const,
  };
  const eml = {
    bytes: new Uint8Array([4, 5, 6]),
    sha256: emlHash,
    contentType: "message/rfc822",
    filename: "original.eml",
    sourceRole: "original_eml" as const,
    parentSourceSha256: outerHash,
    processingDisposition: "automatic_eligible" as const,
  };
  return {
    source: {
      gmailMessageId,
      gmailThreadId: "crane-thread",
      rawMimeKey: `${organizationId}/33333333-3333-4333-8333-333333333333`,
      rawMimeHash: outerHash,
      attachments: [eml, document].map(({ bytes: _bytes, ...attachment }) => ({
        ...attachment,
        objectKey: `${organizationId}/55555555-5555-4555-8555-555555555555`,
      })),
      attachmentHashes: [emlHash, documentHash],
      receivedAt: "2026-09-08T00:00:00.000Z",
    },
    parsed: {
      senderEmail: "crane@carrier.example.test",
      senderDomain: "carrier.example.test",
      internetMessageId: `<${gmailMessageId}@gmail.test>`,
      supplierDomain: "carrier.example.test",
      to: ["ops@xbfreight.com"],
      cc: [],
      subject: "Crane onboarding",
      safeBody: "Please review.",
      attachments: [eml, document],
      requirementTokens: ["crane"],
      applicationReference: null,
      provenance: {
        relationship: "internal_relay" as const,
        parentEnvelope: {
          senderEmail: "relay@xbfreight.com",
          senderDomain: "xbfreight.com",
          internetMessageId: null,
          to: ["ops@xbfreight.com"],
          cc: [],
          subject: "Fwd",
          sourceSha256: outerHash,
        },
        originalEnvelope: {
          senderEmail: "crane@carrier.example.test",
          senderDomain: "carrier.example.test",
          internetMessageId:
            `<original-${gmailMessageId}@carrier.example.test>`,
          to: ["ops@xbfreight.com"],
          cc: [],
          subject: "Crane onboarding",
          sourceSha256: emlHash,
        },
        externalReplyTo: ["crane@carrier.example.test"],
        externalReplyCc: [],
      },
    },
  };
}

function input(): ReviewedThreadInput {
  return {
    organizationId,
    targetCaseId,
    priorJobId,
    deliveryIdempotencyKey: "exact-thread:crane:receipt-1",
    original: relayMessage("original_1", sha("a"), sha("b"), sha("c")),
    amendment: relayMessage("amendment_2", sha("d"), sha("e"), sha("f")),
  };
}

function createHarness(
  options: {
    prior?: "valid" | "wrong";
    failSecondSource?: boolean;
    targetExists?: boolean;
  } = {},
) {
  let state: State = {
    receipts: new Map(),
    cases: new Set(options.targetExists ? [targetCaseId] : []),
    messages: new Set(),
    supplierInserts: 0,
    caseInserts: 0,
    messageInserts: 0,
    attachmentInserts: 0,
    eventInserts: 0,
  };
  const query = async (
    active: State,
    strings: TemplateStringsArray,
    values: unknown[],
  ): Promise<SqlRow[]> => {
    const text = strings.raw.join(" ").toLowerCase();
    if (/set local role|set_config|pg_advisory_xact_lock/.test(text)) return [];
    if (
      /select request_hash, response_json from osp_private\.command_receipts/
        .test(text)
    ) {
      const prior = active.receipts.get(`${values[1]}:${values[2]}`);
      return prior ? [prior] : [];
    }
    if (
      /select id from osp_private\.customer_registration_cases where id/.test(
        text,
      )
    ) {
      return active.cases.has(String(values[0])) ? [{ id: values[0] }] : [];
    }
    if (
      /select id, opaque_payload, completed_at, last_error_code from osp_private\.background_jobs/
        .test(text)
    ) {
      if (/for update/.test(text)) {
        throw new Error("WORKFLOW_ROLE_CANNOT_LOCK_BACKGROUND_JOBS");
      }
      return options.prior === "wrong"
        ? [{
          id: priorJobId,
          opaque_payload: { gmailMessageId: "wrong" },
          completed_at: null,
          last_error_code: "INVALID_INPUT",
        }]
        : [{
          id: priorJobId,
          opaque_payload: { gmailMessageId: "original_1" },
          completed_at: "2026-09-09T00:00:00.000Z",
          last_error_code: "INVALID_INPUT",
        }];
    }
    if (
      /select id from osp_private\.gmail_messages where organization_id.*gmail_message_id in/
        .test(text)
    ) {
      return values.slice(1).filter((value) =>
        active.messages.has(String(value))
      ).map((id) => ({ id }));
    }
    if (/insert into osp_private\.supplier_counterparties/.test(text)) {
      active.supplierInserts += 1;
      return [{ id: "44444444-4444-4444-8444-444444444444" }];
    }
    if (/insert into osp_private\.customer_registration_cases/.test(text)) {
      active.caseInserts += 1;
      active.cases.add(String(values[0]));
      return [];
    }
    if (
      /select id, case_id, source_sha256, gmail_thread_id from osp_private\.gmail_messages/
        .test(text)
    ) {
      const gmailMessageId = String(values[1]);
      return active.messages.has(gmailMessageId)
        ? [{
          id: "existing",
          case_id: targetCaseId,
          source_sha256: "unknown",
          gmail_thread_id: "crane-thread",
        }]
        : [];
    }
    if (/insert into osp_private\.gmail_messages/.test(text)) {
      active.messageInserts += 1;
      if (options.failSecondSource && active.messageInserts === 2) {
        throw new Error("SECOND_SOURCE_FAILURE");
      }
      active.messages.add(String(values[2]));
      return [];
    }
    if (/insert into osp_private\.gmail_attachments/.test(text)) {
      active.attachmentInserts += 1;
      return [];
    }
    if (
      /select id, aggregate_version from osp_private\.customer_registration_cases/
        .test(text)
    ) {
      return active.cases.has(String(values[1]))
        ? [{ id: values[1], aggregate_version: 0 }]
        : [];
    }
    if (/select coalesce\(max\(sequence\)/.test(text)) return [{ sequence: 1 }];
    if (
      /update osp_private\.customer_registration_cases set aggregate_version = aggregate_version \+ 1/
        .test(text)
    ) return [{ aggregate_version: 1 }];
    if (/insert into osp_private\.case_events/.test(text)) {
      active.eventInserts += 1;
      return [];
    }
    if (/insert into osp_private\.command_receipts/.test(text)) {
      active.receipts.set(`${values[2]}:${values[3]}`, {
        request_hash: String(values[4]),
        response_json: String(values[5]),
      });
      return [];
    }
    throw new Error(`UNEXPECTED_QUERY:${text}`);
  };
  const portFor = (get: () => State): SqlPort => {
    const port = Object.assign(
      async (strings: TemplateStringsArray, ...values: unknown[]) =>
        await query(get(), strings, values),
      {},
    ) as SqlPort;
    port.begin = async <T>(operation: (tx: SqlPort) => Promise<T>) => {
      const staged = copy(state);
      const result = await operation(portFor(() => staged));
      state = staged;
      return result;
    };
    return port;
  };
  const persistence = createPostgresIntakePersistence({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => portFor(() => state),
  });
  return { persistence, state: () => state };
}

Deno.test("reviewed thread creates one received case with precisely two relay sources and replays without duplicates", async () => {
  const test = createHarness();
  const first = await test.persistence.createReviewedThread(input());
  const replay = await test.persistence.createReviewedThread(input());
  assertEquals(first.caseId, targetCaseId);
  assertEquals(first.replayed, false);
  assertEquals(replay, { ...first, replayed: true });
  assertEquals(test.state().caseInserts, 1);
  assertEquals(test.state().messageInserts, 2);
  assertEquals(test.state().attachmentInserts, 4);
  assertEquals(test.state().eventInserts, 1);
});

Deno.test("reviewed thread rejects a receipt key reused for changed content", async () => {
  const test = createHarness();
  await test.persistence.createReviewedThread(input());
  const changed = input();
  changed.amendment = {
    ...changed.amendment,
    source: { ...changed.amendment.source, rawMimeHash: sha("9") },
    parsed: {
      ...changed.amendment.parsed,
      provenance: {
        ...changed.amendment.parsed.provenance,
        parentEnvelope: {
          ...changed.amendment.parsed.provenance.parentEnvelope,
          sourceSha256: sha("9"),
        },
      },
    },
  };
  await assertRejects(
    () => test.persistence.createReviewedThread(changed),
    Error,
    "IDEMPOTENCY_CONFLICT",
  );
  assertEquals(test.state().messageInserts, 2);
});

Deno.test("reviewed thread rolls back the new case and first source when its second source fails", async () => {
  const test = createHarness({ failSecondSource: true });
  await assertRejects(
    () => test.persistence.createReviewedThread(input()),
    Error,
    "SECOND_SOURCE_FAILURE",
  );
  assertEquals(test.state().cases.has(targetCaseId), false);
  assertEquals(test.state().messages.size, 0);
  assertEquals(test.state().receipts.size, 0);
});

Deno.test("reviewed thread rejects an existing target and an incorrect historical predecessor", async () => {
  const target = createHarness({ targetExists: true });
  await assertRejects(
    () => target.persistence.createReviewedThread(input()),
    Error,
    "REVIEWED_THREAD_TARGET_CONFLICT",
  );
  assertEquals(target.state().messageInserts, 0);
  const prior = createHarness({ prior: "wrong" });
  await assertRejects(
    () => prior.persistence.createReviewedThread(input()),
    Error,
    "REVIEWED_THREAD_PRIOR_MISMATCH",
  );
  assertEquals(prior.state().caseInserts, 0);
});
