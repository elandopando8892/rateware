import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert@1.0.14";

import {
  assertFrozenOutboundReceipt,
  createOutboundStoragePorts,
  createPostgresOutboundDraftStore,
  createTenantAttachmentObjectPort,
  freezeOutboundDraft,
  type OutboundDraftRecordStore,
  saveOutboundDraft,
} from "./outbound-draft.ts";
import type { OutboundDraft } from "../_shared/osp/outbound-payload.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const payloadId = "33333333-3333-4333-8333-333333333333";
const bytes = new TextEncoder().encode("synthetic attachment");
const replyMessageId = "<supplier-request@example.test>";
const capturedReplyRow = {
  gmail_thread_id: "gmail-thread-1",
  sender_email: "requester@xbfreight.com",
  internet_message_id: replyMessageId,
  subject: "Supplier registration request",
  to_addresses: ["supplier@example.test"],
  cc_addresses: ["carriers@xbfreight.com", "sales@heymarksman.com"],
};

async function sha256(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(value));
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function savedDraft(): Promise<OutboundDraft> {
  return {
    payloadId,
    organizationId,
    caseId,
    kind: "clarification",
    caseVersion: 7,
    sourceSnapshotSha256: "a".repeat(64),
    signedPackageSha256: null,
    from: "carriers@xbfreight.com",
    to: [{ email: "supplier@example.test", source: "captured_supplier" }],
    cc: [],
    subject: "Clarification required",
    inReplyTo: null,
    references: [],
    bodyText: "Please confirm the registered address.",
    attachments: [{
      bucketId: "osp-corporate-documents",
      objectId: "44444444-4444-4444-8444-444444444444",
      name: "questions.pdf",
      contentType: "application/pdf",
      sha256: await sha256(bytes),
    }],
  };
}

Deno.test("draft save validates current context and freezing persists one private immutable MIME object", async () => {
  const source = await savedDraft();
  const committed: unknown[] = [];
  const writes: unknown[] = [];
  const store: OutboundDraftRecordStore = {
    save: async () => source,
    load: async () => source,
    currentContext: async () => ({
      organizationId,
      caseId,
      state: "awaiting_clarification",
      caseVersion: 7,
      sourceSnapshotSha256: "a".repeat(64),
      signedPackageSha256: null,
    }),
    commitFrozen: async (input, prepare) => {
      const record = await prepare(source, {
        organizationId,
        caseId,
        state: "awaiting_clarification",
        caseVersion: 7,
        sourceSnapshotSha256: "a".repeat(64),
        signedPackageSha256: null,
      });
      committed.push({ input, record });
      return { ...record, replayed: false };
    },
  };
  const saved = await saveOutboundDraft({
    organizationId,
    caseId,
    expectedCaseVersion: 7,
    sourceSnapshotSha256: "a".repeat(64),
    signedPackageSha256: null,
    createdBySubject: "operations-subject",
    draft: source,
  }, { store });
  const frozen = await freezeOutboundDraft({
    organizationId,
    caseId,
    payloadId: saved.payloadId,
    expectedCaseVersion: 7,
    idempotencyKey: "freeze-1",
  }, {
    store,
    attachments: { read: async () => bytes.slice() },
    objects: {
      writeExclusive: async (input) => {
        writes.push(input);
      },
      read: async (_input) =>
        (writes[0] as { bytes: Uint8Array }).bytes.slice(),
    },
  });
  assertEquals(writes.length, 1);
  assertEquals(committed.length, 1);
  assertEquals(
    frozen.mimeSha256,
    await sha256((writes[0] as { bytes: Uint8Array }).bytes),
  );
  assertEquals("mimeBytes" in frozen, false);
});

Deno.test("final response save rejects any envelope that diverges from the captured reply context", async () => {
  const signedPackageSha256 = await sha256(bytes);
  const draft: OutboundDraft = {
    payloadId,
    organizationId,
    caseId,
    kind: "final_response",
    caseVersion: 7,
    sourceSnapshotSha256: "a".repeat(64),
    signedPackageSha256,
    from: "carriers@xbfreight.com",
    to: [{ email: "requester@xbfreight.com", source: "reviewed_manual" }],
    cc: [
      { email: "supplier@example.test", source: "reviewed_manual" },
      { email: "sales@heymarksman.com", source: "reviewed_manual" },
    ],
    subject: "Changed subject",
    inReplyTo: replyMessageId,
    references: [replyMessageId],
    bodyText: "Only the body may be edited.",
    attachments: [{
      bucketId: "osp-derived-documents",
      objectId: "44444444-4444-4444-8444-444444444444",
      name: "signed-package.pdf",
      contentType: "application/pdf",
      sha256: signedPackageSha256,
    }],
  };
  let saves = 0;
  const store: OutboundDraftRecordStore = {
    save: async () => {
      saves += 1;
      return draft;
    },
    load: async () => draft,
    currentContext: async () => ({
      organizationId,
      caseId,
      state: "sales_authorization",
      caseVersion: 7,
      sourceSnapshotSha256: "a".repeat(64),
      signedPackageSha256,
      signedPackageId: "44444444-4444-4444-8444-444444444444",
      signedPackageContentType: "application/pdf",
      gmailThreadId: "gmail-thread-1",
      replyContext: {
        to: ["requester@xbfreight.com"],
        cc: ["supplier@example.test", "sales@heymarksman.com"],
        subject: "Re: Supplier registration request",
        inReplyTo: replyMessageId,
        references: [replyMessageId],
      },
    }),
    commitFrozen: async () => {
      throw new Error("unexpected freeze");
    },
  };
  await assertRejects(
    () => saveOutboundDraft({
      organizationId,
      caseId,
      expectedCaseVersion: 7,
      sourceSnapshotSha256: "a".repeat(64),
      signedPackageSha256,
      createdBySubject: "operations-subject",
      draft,
    }, { store }),
    Error,
    "OUTBOUND_CONTEXT_STALE",
  );
  assertEquals(saves, 0);
});

Deno.test("a frozen draft cannot race a later correction before Sales authorization", async () => {
  const packageId = "44444444-4444-4444-8444-444444444444";
  const signedPackageSha256 = "b".repeat(64);
  const queries: string[] = [];
  const query = Object.assign(async (strings: TemplateStringsArray) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim().toLowerCase();
    queries.push(text);
    if (
      text.startsWith("set local role") || text.startsWith("select set_config") ||
      text.startsWith("set local statement_timeout") ||
      text.includes("pg_advisory_xact_lock")
    ) return [];
    if (text.includes("select id, state, aggregate_version")) {
      return [{ id: caseId, state: "sales_authorization", aggregate_version: 7 }];
    }
    if (text.includes("from osp_private.generated_packages")) {
      return [{
        id: packageId,
        input_snapshot_sha256: "a".repeat(64),
        output_sha256: signedPackageSha256,
        content_type: "application/pdf",
      }];
    }
    if (text.includes("from osp_private.gmail_messages")) return [capturedReplyRow];
    if (text.includes("from osp_private.outbound_drafts")) return [];
    if (
      text.startsWith("select id from osp_private.outbound_payloads") &&
      text.includes("status = 'frozen'")
    ) return [{ id: payloadId }];
    throw new Error(`UNEXPECTED_QUERY:${text}`);
  }, {
    begin: async <T>(operation: (transaction: typeof query) => Promise<T>) =>
      await operation(query),
  });
  const store = createPostgresOutboundDraftStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => query,
  });
  await assertRejects(() => saveOutboundDraft({
    organizationId,
    caseId,
    expectedCaseVersion: 7,
    sourceSnapshotSha256: "a".repeat(64),
    signedPackageSha256,
    createdBySubject: "operations-subject",
    draft: {
      payloadId: "88888888-8888-4888-8888-888888888888",
      organizationId,
      caseId,
      kind: "final_response",
      caseVersion: 7,
      sourceSnapshotSha256: "a".repeat(64),
      signedPackageSha256,
      from: "carriers@xbfreight.com",
      to: [{ email: "requester@xbfreight.com", source: "reviewed_manual" }],
      cc: [
        { email: "supplier@example.test", source: "reviewed_manual" },
        { email: "sales@heymarksman.com", source: "reviewed_manual" },
      ],
      subject: "Re: Supplier registration request",
      inReplyTo: replyMessageId,
      references: [replyMessageId],
      bodyText: "A correction after freeze must fail closed.",
      attachments: [{
        bucketId: "osp-derived-documents",
        objectId: packageId,
        name: "signed-package.pdf",
        contentType: "application/pdf",
        sha256: signedPackageSha256,
      }],
    },
  }, { store }), Error, "OUTBOUND_DRAFT_LOCKED");
  assertEquals(queries.some((text) =>
    text.startsWith("select id from osp_private.outbound_payloads") &&
    text.includes("case_version = ?") && text.includes("status = 'frozen'")
  ), true);
  assertEquals(queries.some((text) => text.startsWith("insert into osp_private.outbound_drafts")), false);
});

Deno.test("a post-authorization body edit supersedes Sales authority and returns the case to authorization", async () => {
  const editedPayloadId = "88888888-8888-4888-8888-888888888888";
  const authorizationId = "99999999-9999-4999-8999-999999999999";
  const sourceSnapshotSha256 = "a".repeat(64);
  const signedPackageSha256 = "b".repeat(64);
  const queries: string[] = [];
  const query = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim().toLowerCase();
      queries.push(text);
      if (
        text.startsWith("set local role") ||
        text.startsWith("select set_config") ||
        text.startsWith("set local statement_timeout") ||
        text.includes("pg_advisory_xact_lock")
      ) return [];
      if (
        text.includes("from osp_private.customer_registration_cases") &&
        text.includes("select id, state, aggregate_version")
      ) {
        return [{ id: caseId, state: "ready_to_send", aggregate_version: 8 }];
      }
      if (
        text.includes("from osp_private.sales_authorizations") &&
        text.includes("join osp_private.outbound_payloads")
      ) {
        return [{
          authorization_id: authorizationId,
          payload_kind: "final_response",
          source_snapshot_sha256: sourceSnapshotSha256,
          signed_package_sha256: signedPackageSha256,
          signed_package_id: "77777777-7777-4777-8777-777777777777",
          signed_package_content_type: "application/pdf",
        }];
      }
      if (text.includes("from osp_private.gmail_messages")) {
        return [capturedReplyRow];
      }
      if (
        text.startsWith("select id, organization_id, case_id, version") &&
        text.includes("from osp_private.outbound_drafts")
      ) return [];
      if (text.includes("select coalesce(max(version), 0)")) {
        return [{ latest_version: 1 }];
      }
      if (text.startsWith("update osp_private.sales_authorizations")) {
        return [{ id: authorizationId }];
      }
      if (text.includes("from osp_private.outbound_send_attempts")) return [];
      if (text.startsWith("update osp_private.customer_registration_cases")) {
        return [{ aggregate_version: 9 }];
      }
      if (
        text.startsWith("insert into osp_private.approval_events") ||
        text.startsWith("insert into osp_private.case_events")
      ) return [];
      if (text.startsWith("insert into osp_private.outbound_drafts")) {
        return [{
          id: editedPayloadId,
          organization_id: organizationId,
          case_id: caseId,
          version: 2,
          payload_kind: "final_response",
          case_version: 9,
          source_snapshot_sha256: sourceSnapshotSha256,
          signed_package_sha256: signedPackageSha256,
          from_email: "carriers@xbfreight.com",
          to_recipients: JSON.stringify([{
            email: "requester@xbfreight.com",
            source: "captured_supplier",
          }]),
          cc_recipients: JSON.stringify([
            { email: "supplier@example.test", source: "reviewed_manual" },
            { email: "sales@heymarksman.com", source: "reviewed_manual" },
          ]),
          subject: "Re: Supplier registration request",
          in_reply_to: replyMessageId,
          references_header: [replyMessageId],
          body_text: "Edited after authorization.",
          attachments_json: JSON.stringify([{
            bucketId: "osp-derived-documents",
            objectId: "77777777-7777-4777-8777-777777777777",
            name: "signed-package.pdf",
            contentType: "application/pdf",
            sha256: signedPackageSha256,
          }]),
        }];
      }
      throw new Error(`UNEXPECTED_QUERY:${text}:${JSON.stringify(values)}`);
    },
    {
      begin: async <T>(operation: (transaction: typeof query) => Promise<T>) =>
        await operation(query),
    },
  );
  const store = createPostgresOutboundDraftStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => query,
  });
  const saved = await saveOutboundDraft({
    organizationId,
    caseId,
    expectedCaseVersion: 8,
    sourceSnapshotSha256,
    signedPackageSha256,
    createdBySubject: "operations-subject",
    draft: {
      payloadId: editedPayloadId,
      organizationId,
      caseId,
      kind: "final_response",
      caseVersion: 8,
      sourceSnapshotSha256,
      signedPackageSha256,
      from: "carriers@xbfreight.com",
      to: [{ email: "requester@xbfreight.com", source: "captured_supplier" }],
      cc: [
        { email: "supplier@example.test", source: "reviewed_manual" },
        { email: "sales@heymarksman.com", source: "reviewed_manual" },
      ],
      subject: "Re: Supplier registration request",
      inReplyTo: replyMessageId,
      references: [replyMessageId],
      bodyText: "Edited after authorization.",
      attachments: [{
        bucketId: "osp-derived-documents",
        objectId: "77777777-7777-4777-8777-777777777777",
        name: "signed-package.pdf",
        contentType: "application/pdf",
        sha256: signedPackageSha256,
      }],
    },
  }, { store });
  assertEquals(saved.caseVersion, 9);
  assertEquals(
    queries.some((text) =>
      text.startsWith("update osp_private.sales_authorizations") &&
      text.includes("status = 'superseded'")
    ),
    true,
  );
  assertEquals(
    queries.some((text) =>
      text.startsWith("update osp_private.customer_registration_cases") &&
      text.includes("set state = ?")
    ),
    true,
  );
  assertEquals(
    queries.some((text) =>
      text.startsWith("insert into osp_private.approval_events") &&
      text.includes("'approval_invalidated'")
    ),
    true,
  );
  assertEquals(
    queries.some((text) =>
      text.startsWith("insert into osp_private.outbound_drafts") &&
      text.includes("to_jsonb(references_header) as references_header") &&
      text.includes(
        "array(select jsonb_array_elements_text(?::jsonb))",
      )
    ),
    true,
  );
});

Deno.test("a reserved, sending, or manual attempt makes a post-authorization edit fail closed", async () => {
  const authorizationId = "99999999-9999-4999-8999-999999999999";
  const sourceSnapshotSha256 = "a".repeat(64);
  const signedPackageSha256 = "b".repeat(64);
  for (
    const outcome of ["reserved", "sending", "manual_reconciliation_required"]
  ) {
    const observedQueries: string[] = [];
    const query = Object.assign(
      async (strings: TemplateStringsArray) => {
        const text = strings.join("?").replace(/\s+/g, " ").trim()
          .toLowerCase();
        observedQueries.push(text);
        if (
          text.startsWith("set local role") ||
          text.startsWith("select set_config") ||
          text.startsWith("set local statement_timeout") ||
          text.includes("pg_advisory_xact_lock")
        ) return [];
        if (text.includes("select id, state, aggregate_version")) {
          return [{ id: caseId, state: "ready_to_send", aggregate_version: 8 }];
        }
        if (text.includes("join osp_private.outbound_payloads")) {
          return [{
            authorization_id: authorizationId,
            payload_kind: "final_response",
            source_snapshot_sha256: sourceSnapshotSha256,
            signed_package_sha256: signedPackageSha256,
            signed_package_id: "77777777-7777-4777-8777-777777777777",
            signed_package_content_type: "application/pdf",
          }];
        }
        if (text.includes("from osp_private.gmail_messages")) {
          return [capturedReplyRow];
        }
        if (text.includes("from osp_private.outbound_drafts")) return [];
        if (text.includes("from osp_private.outbound_send_attempts")) {
          return [{ id: "66666666-6666-4666-8666-666666666666", outcome }];
        }
        throw new Error(`UNEXPECTED_QUERY:${text}`);
      },
      {
        begin: async <T>(
          operation: (transaction: typeof query) => Promise<T>,
        ) => await operation(query),
      },
    );
    const store = createPostgresOutboundDraftStore({
      databaseUrl: "postgresql://synthetic.example.test/db",
      postgresFactory: () => query,
    });
    await assertRejects(
      () =>
        saveOutboundDraft({
          organizationId,
          caseId,
          expectedCaseVersion: 8,
          sourceSnapshotSha256,
          signedPackageSha256,
          createdBySubject: "operations-subject",
          draft: {
            payloadId: "88888888-8888-4888-8888-888888888888",
            organizationId,
            caseId,
            kind: "final_response",
            caseVersion: 8,
            sourceSnapshotSha256,
            signedPackageSha256,
            from: "carriers@xbfreight.com",
            to: [{
              email: "requester@xbfreight.com",
              source: "captured_supplier",
            }],
            cc: [
              { email: "supplier@example.test", source: "reviewed_manual" },
              { email: "sales@heymarksman.com", source: "reviewed_manual" },
            ],
            subject: "Re: Supplier registration request",
            inReplyTo: replyMessageId,
            references: [replyMessageId],
            bodyText: "Edit must not race a claimed send.",
            attachments: [{
              bucketId: "osp-derived-documents",
              objectId: "77777777-7777-4777-8777-777777777777",
              name: "signed-package.pdf",
              contentType: "application/pdf",
              sha256: signedPackageSha256,
            }],
          },
        }, { store }),
      Error,
      "OUTBOUND_SEND_ALREADY_RESERVED",
    );
    assertEquals(
      observedQueries.some((text) =>
        text.includes(
          "attempt.outcome in ('reserved', 'sending', 'manual_reconciliation_required')",
        )
      ),
      true,
    );
  }
});

Deno.test("service-role attachment downloads resolve a tenant-owned entity before storage access", async () => {
  const versionId = "44444444-4444-4444-8444-444444444444";
  const calls: { text: string; values: unknown[] }[] = [];
  const downloads: string[] = [];
  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      calls.push({ text, values });
      if (text.includes("document_versions")) {
        return [{
          object_key:
            "11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444",
        }];
      }
      return [];
    },
    {
      begin: async (operation: (tx: typeof sql) => Promise<unknown>) =>
        await operation(sql),
    },
  );
  const port = createTenantAttachmentObjectPort({
    databaseUrl: "postgres://localhost:55322/osp",
    postgresFactory: () => sql,
    storageClient: {
      upload: async () => undefined,
      download: async (_bucket, key) => {
        downloads.push(key);
        return bytes;
      },
    },
  });
  assertEquals(
    await port.read({
      organizationId,
      caseId,
      bucketId: "osp-corporate-documents",
      objectId: versionId,
    }),
    bytes,
  );
  assertEquals(downloads, [
    "11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444",
  ]);
  assertEquals(
    calls.some((call) =>
      call.values.includes(organizationId) && call.values.includes(caseId) &&
      call.values.includes(versionId)
    ),
    true,
  );
});

Deno.test("outbound MIME reads require the exact tenant object prefix", async () => {
  const downloads: string[] = [];
  const ports = createOutboundStoragePorts({
    upload: async () => undefined,
    download: async (_bucketId, key) => {
      downloads.push(key);
      return bytes;
    },
  });
  await assertRejects(
    () =>
      ports.objects.read({
        organizationId,
        objectId:
          "outbound_99999999-9999-4999-8999-999999999999_33333333-3333-4333-8333-333333333333",
      }),
    Error,
    "OUTBOUND_STORAGE_INTEGRITY",
  );
  assertEquals(downloads, []);
  const expected =
    `outbound_${organizationId}_33333333-3333-4333-8333-333333333333`;
  assertEquals(
    await ports.objects.read({ organizationId, objectId: expected }),
    bytes,
  );
  assertEquals(downloads, [expected]);
});

Deno.test("storage timeout or read-back mismatch commits no payload and creates no authorization or send job", async () => {
  const source = await savedDraft();
  let commits = 0;
  const store: OutboundDraftRecordStore = {
    save: async () => source,
    load: async () => source,
    currentContext: async () => ({
      organizationId,
      caseId,
      state: "awaiting_clarification",
      caseVersion: 7,
      sourceSnapshotSha256: "a".repeat(64),
      signedPackageSha256: null,
    }),
    commitFrozen: async (_input, prepare) => {
      const record = await prepare(source, {
        organizationId,
        caseId,
        state: "awaiting_clarification",
        caseVersion: 7,
        sourceSnapshotSha256: "a".repeat(64),
        signedPackageSha256: null,
      });
      commits += 1;
      return { ...record, replayed: false };
    },
  };
  for (
    const objects of [
      {
        writeExclusive: () => Promise.reject(new Error("timeout")),
        read: () => Promise.resolve(null),
      },
      {
        writeExclusive: () => Promise.resolve(),
        read: () =>
          Promise.resolve(new TextEncoder().encode("substituted MIME")),
      },
    ]
  ) {
    await assertRejects(
      () =>
        freezeOutboundDraft({
          organizationId,
          caseId,
          payloadId,
          expectedCaseVersion: 7,
          idempotencyKey: "freeze-1",
        }, {
          store,
          attachments: { read: async () => bytes.slice() },
          objects,
        }),
      Error,
      "OUTBOUND_STORAGE",
    );
  }
  assertEquals(commits, 0);
  assertEquals("authorize" in store, false);
  assertEquals("enqueueSend" in store, false);
});

Deno.test("persisted freeze replays reject forged or extra receipt fields", () => {
  const receipt = {
    payloadId,
    organizationId,
    caseId,
    kind: "clarification",
    caseVersion: 7,
    sourceSnapshotSha256: "a".repeat(64),
    signedPackageSha256: null,
    mimeObjectId: "opaque-mime-object",
    mimeSha256: "b".repeat(64),
    attachmentSha256: ["c".repeat(64)],
    replayed: false,
  } as const;
  assertEquals(assertFrozenOutboundReceipt(receipt), {
    ...receipt,
    replayed: true,
  });
  assertThrows(
    () =>
      assertFrozenOutboundReceipt({
        ...receipt,
        privateObjectKey: "must-not-replay",
      }),
    Error,
    "OUTBOUND_PERSISTENCE_FAILED",
  );
});

Deno.test("freeze checks an exact persisted receipt before stale state or private object work", async () => {
  const source = await savedDraft();
  let receiptLookups = 0;
  let loads = 0;
  let objectReads = 0;
  const replay = {
    payloadId,
    organizationId,
    caseId,
    kind: "clarification" as const,
    caseVersion: 7,
    sourceSnapshotSha256: "a".repeat(64),
    signedPackageSha256: null,
    mimeObjectId: "mime:existing",
    mimeSha256: "b".repeat(64),
    attachmentSha256: ["c".repeat(64)],
    replayed: true,
  };
  const store: OutboundDraftRecordStore = {
    save: async () => source,
    load: async () => {
      loads += 1;
      return source;
    },
    currentContext: async () => {
      throw new Error("OUTBOUND_VERSION_CONFLICT");
    },
    commitFrozen: async () => {
      receiptLookups += 1;
      return replay;
    },
  };
  const result = await freezeOutboundDraft({
    organizationId,
    caseId,
    payloadId,
    expectedCaseVersion: 7,
    idempotencyKey: "freeze-replay",
  }, {
    store,
    attachments: {
      read: async () => {
        objectReads += 1;
        return bytes;
      },
    },
    objects: {
      writeExclusive: async () => {
        objectReads += 1;
      },
      read: async () => {
        objectReads += 1;
        return null;
      },
    },
  });
  assertEquals(result, replay);
  assertEquals(receiptLookups, 1);
  assertEquals(loads, 0);
  assertEquals(objectReads, 0);
});

Deno.test("conflicting freeze idempotency is rejected before attachment or MIME access", async () => {
  const source = await savedDraft();
  let objectReads = 0;
  const store: OutboundDraftRecordStore = {
    save: async () => source,
    load: async () => source,
    currentContext: async () => ({
      organizationId,
      caseId,
      state: "awaiting_clarification",
      caseVersion: 7,
      sourceSnapshotSha256: "a".repeat(64),
      signedPackageSha256: null,
    }),
    commitFrozen: async () => {
      throw new Error("IDEMPOTENCY_CONFLICT");
    },
  };
  await assertRejects(
    () =>
      freezeOutboundDraft({
        organizationId,
        caseId,
        payloadId,
        expectedCaseVersion: 7,
        idempotencyKey: "freeze-conflict",
      }, {
        store,
        attachments: {
          read: async () => {
            objectReads += 1;
            return bytes;
          },
        },
        objects: {
          writeExclusive: async () => {
            objectReads += 1;
          },
          read: async () => {
            objectReads += 1;
            return null;
          },
        },
      }),
    Error,
    "IDEMPOTENCY_CONFLICT",
  );
  assertEquals(objectReads, 0);
});

Deno.test("Postgres freeze selects only the latest append-only draft version", async () => {
  const queries: string[] = [];
  const query = Object.assign(async (strings: TemplateStringsArray) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim().toLowerCase();
    queries.push(text);
    if (
      text.startsWith("set local role") || text.startsWith("select set_config") ||
      text.startsWith("set local statement_timeout") || text.includes("pg_advisory_xact_lock")
    ) return [];
    if (text.includes("from osp_private.command_receipts")) return [];
    if (text.includes("from osp_private.customer_registration_cases")) {
      return [{ id: caseId, state: "awaiting_clarification", aggregate_version: 7 }];
    }
    if (text.includes("from osp_private.case_package_input_snapshots")) {
      return [{ canonical_sha256: "a".repeat(64) }];
    }
    if (text.includes("from osp_private.outbound_drafts draft")) return [];
    throw new Error(`UNEXPECTED_QUERY:${text}`);
  }, {
    begin: async <T>(operation: (transaction: typeof query) => Promise<T>) =>
      await operation(query),
  });
  const store = createPostgresOutboundDraftStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => query,
  });
  await assertRejects(
    () => freezeOutboundDraft({
      organizationId,
      caseId,
      payloadId,
      expectedCaseVersion: 7,
      idempotencyKey: "freeze-historical",
    }, {
      store,
      attachments: { read: async () => bytes },
      objects: { writeExclusive: async () => undefined, read: async () => null },
    }),
    Error,
    "OUTBOUND_DRAFT_NOT_FOUND",
  );
  assertEquals(queries.some((text) =>
    text.includes("version = (select max(latest.version)") &&
    text.includes("latest.payload_kind = draft.payload_kind") &&
    text.includes("to_jsonb(references_header) as references_header")
  ), true);
});
