import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import type { VerifiedWorkflowIdentity } from "../_shared/osp/workflow-authority.ts";
import {
  approvalCommunicationsWorkspace,
  createPostgresWorkflowViewSource,
  type WorkflowViewRecord,
} from "./workflow-view.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "33333333-3333-4333-8333-333333333333";
const payloadId = "44444444-4444-4444-8444-444444444444";
const signedPackageId = "77777777-7777-4777-8777-777777777777";
const sha = "a".repeat(64);
const baseIdentity: VerifiedWorkflowIdentity = {
  identity: {
    organization: organizationId,
    issuer: "https://auth.example.test",
    subject: "subject-a",
    email: "operator@example.test",
    emailVerified: true,
    authorizedParty: "client",
  },
  permissions: ["osp:read", "osp:operate"],
};
const record: WorkflowViewRecord = {
  organizationId,
  caseId,
  caseVersion: 7,
  caseState: "sales_authorization",
  inputSnapshot: {
    sha256: sha,
    documentCount: 4,
    extractionCount: 18,
    reviewDecisionCount: 3,
    formInstanceVersion: 2,
  },
  signature: {
    positionVersion: 3,
    approvalStatus: "approved",
    approvalId: "55555555-5555-4555-8555-555555555555",
    outputSha256: "b".repeat(64),
  },
  signedPackage: {
    packageId: signedPackageId,
    outputSha256: "b".repeat(64),
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  replyContext: {
    to: ["requester@xbfreight.com"],
    cc: ["supplier@example.test", "sales@heymarksman.com"],
    subject: "Re: Supplier registration request",
    inReplyTo: "<supplier-request@example.test>",
    references: ["<supplier-request@example.test>"],
  },
  outbound: {
    payloadId,
    kind: "final_response",
    status: "frozen",
    caseVersion: 7,
    from: "carriers@xbfreight.com",
    to: ["supplier@example.test"],
    cc: ["sales@heymarksman.com"],
    subject: "Supplier registration response",
    inReplyTo: "<supplier-request@example.test>",
    references: ["<original-thread@example.test>"],
    bodyText: "Ready for review.",
    attachmentSha256: ["c".repeat(64)],
    mimeSha256: "d".repeat(64),
    salesAuthorizationId: null,
    sendOutcome: null,
  },
};

Deno.test("workflow view derives mutually exclusive server capabilities and exposes no secret locators", () => {
  const operations = approvalCommunicationsWorkspace(record, baseIdentity);
  assertEquals(operations.capabilities, {
    saveOutboundDraft: false,
    completeOperationsReview: false,
    approveAndApplySignature: false,
    freezeOutboundPayload: false,
    authorizeOutboundPayload: false,
    requestAuthorizedSend: false,
  });
  const sales = approvalCommunicationsWorkspace(record, {
    ...baseIdentity,
    identity: { ...baseIdentity.identity, email: "sales@heymarksman.com" },
    permissions: ["osp:sales-authorize"],
  });
  assertEquals(sales.capabilities.authorizeOutboundPayload, true);
  assertEquals(JSON.stringify(sales).includes("vault"), false);
  assertEquals(JSON.stringify(sales).includes("objectId"), false);
  assertEquals(JSON.stringify(sales).includes("signatureBytes"), false);
  assertEquals(sales.signedPackage, {
    packageId: signedPackageId,
    outputSha256: "b".repeat(64),
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const mixed = approvalCommunicationsWorkspace(record, {
    ...baseIdentity,
    identity: { ...baseIdentity.identity, email: "sales@heymarksman.com" },
    permissions: ["osp:sales-authorize", "osp:send-authorized"],
  });
  assertEquals(Object.values(mixed.capabilities).some(Boolean), false);
  const operationsAndSales = approvalCommunicationsWorkspace(record, {
    ...baseIdentity,
    identity: { ...baseIdentity.identity, email: "sales@heymarksman.com" },
    permissions: ["osp:operate", "osp:sales-authorize"],
  });
  assertEquals(
    Object.values(operationsAndSales.capabilities).some(Boolean),
    false,
  );
});

Deno.test("the Sales superuser receives only the action for the current workflow stage", () => {
  const superuser: VerifiedWorkflowIdentity = {
    ...baseIdentity,
    identity: { ...baseIdentity.identity, email: "sales@heymarksman.com" },
    permissions: ["osp:read", "osp:superuser"],
  };
  const operations = approvalCommunicationsWorkspace({
    ...record,
    caseState: "operations_review",
    outbound: null,
    supplierPackage: {
      packageId: "88888888-8888-4888-8888-888888888888",
      version: 1,
      outputSha256: sha,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      downloadUrl: null,
      objectId: "private-object",
    },
  }, superuser);
  assertEquals(operations.capabilities.completeOperationsReview, true);

  const signature = approvalCommunicationsWorkspace({
    ...record,
    caseState: "signature_approval",
    outbound: null,
    signature: { positionVersion: 1, approvalStatus: "pending", approvalId: null, outputSha256: null },
  }, superuser);
  assertEquals(signature.capabilities.approveAndApplySignature, true);

  const sales = approvalCommunicationsWorkspace(record, superuser);
  assertEquals(sales.capabilities.authorizeOutboundPayload, true);

  const send = approvalCommunicationsWorkspace({
    ...record,
    caseState: "ready_to_send",
    caseVersion: 8,
    outbound: {
      ...record.outbound!,
      status: "authorized",
      salesAuthorizationId: "66666666-6666-4666-8666-666666666666",
    },
  }, superuser);
  assertEquals(send.capabilities.requestAuthorizedSend, true);
});

Deno.test("workflow view grants outbound draft creation only for current signed evidence and separated Operations authority", () => {
  const ready = {
    ...record,
    outbound: null,
  } satisfies WorkflowViewRecord;
  assertEquals(
    approvalCommunicationsWorkspace(ready, baseIdentity).capabilities
      .saveOutboundDraft,
    true,
  );
  assertEquals(
    approvalCommunicationsWorkspace({
      ...ready,
      outbound: { ...record.outbound!, status: "draft", mimeSha256: null },
    }, baseIdentity).capabilities.saveOutboundDraft,
    true,
  );
  for (
    const candidate of [
      { ...ready, caseState: "signature_approval" as const },
      { ...ready, inputSnapshot: null },
      { ...ready, signedPackage: null },
      { ...ready, replyContext: null },
      { ...ready, outbound: record.outbound },
      {
        ...ready,
        outbound: {
          ...record.outbound!,
          status: "draft" as const,
          caseVersion: ready.caseVersion - 1,
          mimeSha256: null,
        },
      },
    ]
  ) {
    assertEquals(
      approvalCommunicationsWorkspace(candidate, baseIdentity).capabilities
        .saveOutboundDraft,
      false,
    );
  }
  assertEquals(
    approvalCommunicationsWorkspace(ready, {
      ...baseIdentity,
      permissions: ["osp:operate", "osp:sales-authorize"],
    }).capabilities.saveOutboundDraft,
    false,
  );
});

Deno.test("workflow view never grants an action for a stale outbound payload", () => {
  for (
    const [identity, state, status] of [
      [baseIdentity, "sales_authorization", "draft"],
      [
        {
          ...baseIdentity,
          identity: {
            ...baseIdentity.identity,
            email: "sales@heymarksman.com",
          },
          permissions: ["osp:sales-authorize"],
        },
        "sales_authorization",
        "frozen",
      ],
      [
        {
          ...baseIdentity,
          identity: {
            ...baseIdentity.identity,
            email: "carriers@xbfreight.com",
          },
          permissions: ["osp:send-authorized"],
        },
        "ready_to_send",
        "authorized",
      ],
    ] as const
  ) {
    const projected = approvalCommunicationsWorkspace({
      ...record,
      caseVersion: 8,
      caseState: state,
      outbound: { ...record.outbound!, status, caseVersion: 7 },
    }, identity);
    assertEquals(Object.values(projected.capabilities).some(Boolean), false);
  }
  const historical = approvalCommunicationsWorkspace({
    ...record,
    outboundIsLatest: false,
    outbound: { ...record.outbound!, status: "draft", caseVersion: record.caseVersion },
  }, baseIdentity);
  assertEquals(Object.values(historical.capabilities).some(Boolean), false);
});

Deno.test("a current Sales authorization at N plus one grants Carriers the send capability", () => {
  const projected = approvalCommunicationsWorkspace({
    ...record,
    caseVersion: 8,
    caseState: "ready_to_send",
    outbound: {
      ...record.outbound!,
      status: "authorized",
      caseVersion: 7,
      salesAuthorizationId: "66666666-6666-4666-8666-666666666666",
    },
  }, {
    ...baseIdentity,
    identity: { ...baseIdentity.identity, email: "carriers@xbfreight.com" },
    permissions: ["osp:send-authorized"],
  });
  assertEquals(projected.capabilities.requestAuthorizedSend, true);
});

Deno.test("workflow view grants freeze only for the matching workflow state and kind", () => {
  for (
    const [caseState, kind] of [
      ["awaiting_clarification", "final_response"],
      ["sales_authorization", "clarification"],
      ["operations_review", "final_response"],
    ] as const
  ) {
    const projected = approvalCommunicationsWorkspace({
      ...record,
      caseState,
      outbound: { ...record.outbound!, kind, status: "draft" },
    }, baseIdentity);
    assertEquals(projected.capabilities.freezeOutboundPayload, false);
  }
  assertEquals(
    approvalCommunicationsWorkspace({
      ...record,
      caseState: "sales_authorization",
      outbound: { ...record.outbound!, status: "draft" },
    }, baseIdentity).capabilities.freezeOutboundPayload,
    true,
  );
});

Deno.test("workflow view exposes the active signature policy before the first approval", async () => {
  const sql = Object.assign(async (strings: TemplateStringsArray) => {
    const text = strings.join("?");
    if (text.includes("set local")) return [];
    return [{
      organization_id: organizationId,
      case_id: caseId,
      case_version: "8",
      case_state: "signature_approval",
      snapshot_sha256: sha,
      document_count: "4",
      extraction_count: "18",
      review_decision_count: "3",
      form_instance_version: "2",
      signature_policy_position_version: "3",
      signature_position_version: null,
      signature_status: null,
      signature_approval_id: null,
      signed_package_id: null,
      signature_output_sha256: null,
      signed_package_content_type: null,
      payload_id: null,
    }];
  }, {
    begin: async (operation: (tx: typeof sql) => Promise<unknown>) =>
      await operation(sql),
  });
  const source = createPostgresWorkflowViewSource({
    databaseUrl: "postgres://localhost:55322/osp",
    postgresFactory: () => sql,
  });
  const projected = approvalCommunicationsWorkspace(
    await source.load({ organizationId, caseId, payloadId: null }),
    {
      ...baseIdentity,
      identity: { ...baseIdentity.identity, email: "jgonzalez@xbfreight.com" },
      permissions: ["osp:signature-approve"],
    },
  );
  assertEquals(projected.signature, {
    positionVersion: 3,
    approvalStatus: "pending",
    approvalId: null,
    outputSha256: null,
  });
  assertEquals(projected.capabilities.approveAndApplySignature, true);
});

Deno.test("workflow view preserves manual reconciliation as a no-send state", () => {
  const reconciled = approvalCommunicationsWorkspace({
    ...record,
    caseState: "manual_reconciliation_required",
    outbound: {
      ...record.outbound!,
      status: "manual_reconciliation_required",
      sendOutcome: "manual_reconciliation_required",
    },
  }, {
    ...baseIdentity,
    identity: { ...baseIdentity.identity, email: "carriers@xbfreight.com" },
    permissions: ["osp:send-authorized"],
  });
  assertEquals(
    reconciled.outbound?.sendOutcome,
    "manual_reconciliation_required",
  );
  assertEquals(reconciled.capabilities.requestAuthorizedSend, false);
});

Deno.test("Postgres workflow view is tenant-scoped and rejects malformed rows", async () => {
  const calls: { text: string; values: unknown[] }[] = [];
  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      calls.push({ text, values });
      if (text.includes("set local statement_timeout")) return [];
      return [{
        organization_id: organizationId,
        case_id: caseId,
        case_version: "7",
        case_state: "sales_authorization",
        snapshot_sha256: sha,
        document_count: "4",
        extraction_count: "18",
        review_decision_count: "3",
        form_instance_version: "2",
        signature_position_version: "3",
        signature_status: "applied",
        signature_approval_id: "55555555-5555-4555-8555-555555555555",
        signed_package_id: signedPackageId,
        signature_output_sha256: "b".repeat(64),
        signed_package_content_type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        reply_gmail_thread_id: "gmail-thread-1",
        reply_sender_email: "requester@xbfreight.com",
        reply_internet_message_id: "<supplier-request@example.test>",
        reply_original_subject: "Re: Re: Supplier registration request",
        reply_original_to: [
          "supplier@example.test",
          "sales@heymarksman.com",
        ],
        reply_original_cc: [
          "supplier@example.test",
          "carriers@xbfreight.com",
          "sales@heymarksman.com",
        ],
        payload_id: payloadId,
        payload_kind: "final_response",
        payload_is_latest: true,
        payload_status: "frozen",
        payload_case_version: "7",
        from_email: "carriers@xbfreight.com",
        to_recipients: [{ email: "supplier@example.test" }],
        cc_recipients: [{ email: "sales@heymarksman.com" }],
        subject: "Supplier registration response",
        in_reply_to: "<supplier-request@example.test>",
        references_header: ["<original-thread@example.test>"],
        body_text: "Ready for review.",
        attachment_sha256s: ["c".repeat(64)],
        mime_sha256: "d".repeat(64),
        sales_authorization_id: null,
        send_outcome: null,
      }];
    },
    {
      begin: async (operation: (tx: typeof sql) => Promise<unknown>) =>
        await operation(sql),
    },
  );
  const source = createPostgresWorkflowViewSource({
    databaseUrl: "postgres://localhost:55322/osp",
    postgresFactory: () => sql,
  });
  const result = await source.load({ organizationId, caseId, payloadId });
  assertEquals(result.caseId, caseId);
  assertEquals(result.signedPackage, {
    packageId: signedPackageId,
    outputSha256: "b".repeat(64),
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  assertEquals(result.replyContext, {
    to: ["requester@xbfreight.com"],
    cc: ["supplier@example.test", "sales@heymarksman.com"],
    subject: "Re: Supplier registration request",
    inReplyTo: "<supplier-request@example.test>",
    references: ["<supplier-request@example.test>"],
  });
  assertEquals(result.outbound?.inReplyTo, "<supplier-request@example.test>");
  assertEquals(result.outbound?.references, ["<original-thread@example.test>"]);
  assertEquals(
    calls.some((call) =>
      call.values.includes(organizationId) && call.values.includes(caseId) &&
      call.values.includes(payloadId)
    ),
    true,
  );
  assertEquals(
    calls.some((call) =>
      call.text.includes("payload_kind = 'clarification'") &&
      call.text.includes("payload_kind = 'final_response'")
    ),
    true,
  );
  const query = calls.find((call) => call.text.includes("sales_authorizations"))
    ?.text ?? "";
  assertEquals(
    query.includes("signed_package.id as signed_package_id") &&
      query.includes(
        "signed_package.content_type as signed_package_content_type",
      ) &&
      query.includes("signed_package.input_snapshot_id = snapshot.id") &&
      query.includes(
        "signed_package.input_snapshot_sha256 = snapshot.canonical_sha256",
      ) &&
      query.includes("jsonb_array_elements(draft.attachments_json)") &&
      query.includes("draft_attachment.value ->> 'sha256'") &&
      query.includes(
        "to_jsonb(draft.references_header) as references_header",
      ) &&
      query.includes("to_jsonb(coalesce("),
    true,
  );
  assertEquals(
    query.includes("from osp_private.gmail_messages value") &&
      query.includes(
        "order by value.received_at asc, value.created_at asc, value.id asc",
      ),
    true,
  );
  assertEquals(
    query.includes("authorization_event.case_version = draft.case_version + 1"),
    true,
  );
  assertEquals(
    query.includes("request_event.event_type = 'request_authorized_send'") &&
      query.includes(
        "request_event.case_version = value.reserved_case_version",
      ),
    true,
  );
  assertEquals(
    query.includes(
      "authorization_event.case_version = case_record.aggregate_version",
    ),
    false,
  );
  const snapshotLateral = query.match(
    /from osp_private\.case_package_input_snapshots value[\s\S]*?limit 1/,
  )?.[0] ?? "";
  const authorizationLateral = query.match(
    /from osp_private\.sales_authorizations value[\s\S]*?limit 1/,
  )?.[0] ?? "";
  assertEquals(
    snapshotLateral.includes(
      "order by value.created_at desc, value.id desc limit 1",
    ),
    true,
  );
  assertEquals(snapshotLateral.includes("value.authorized_at"), false);
  assertEquals(
    authorizationLateral.includes(
      "order by value.authorized_at desc, value.id desc limit 1",
    ),
    true,
  );
  assertEquals(authorizationLateral.includes("value.created_at"), false);

  const invalidSql = Object.assign(async () => [{ case_id: caseId }], {
    begin: async (operation: (tx: typeof invalidSql) => Promise<unknown>) =>
      await operation(invalidSql),
  });
  const invalid = createPostgresWorkflowViewSource({
    databaseUrl: "postgres://localhost:55322/osp",
    postgresFactory: () => invalidSql,
  });
  await assertRejects(
    () => invalid.load({ organizationId, caseId, payloadId }),
    Error,
    "WORKFLOW_VIEW_INVALID",
  );

  const oversizedSql = Object.assign(async () => [{
    organization_id: organizationId,
    case_id: caseId,
    case_version: "7",
    case_state: "sales_authorization",
    snapshot_sha256: null,
    signature_position_version: null,
    signature_approval_id: null,
    payload_id: payloadId,
    payload_kind: "final_response",
    payload_is_latest: true,
    payload_case_version: "7",
    from_email: "carriers@xbfreight.com",
    to_recipients: [{ email: "supplier@example.test" }],
    cc_recipients: [],
    subject: "Supplier registration response",
    in_reply_to: null,
    references_header: [],
    body_text: "a".repeat(100_001),
    attachment_sha256s: [],
    mime_sha256: null,
    sales_authorization_id: null,
    send_outcome: null,
  }], {
    begin: async (operation: (tx: typeof oversizedSql) => Promise<unknown>) =>
      await operation(oversizedSql),
  });
  const oversized = createPostgresWorkflowViewSource({
    databaseUrl: "postgres://localhost:55322/osp",
    postgresFactory: () => oversizedSql,
  });
  await assertRejects(
    () => oversized.load({ organizationId, caseId, payloadId }),
    Error,
    "WORKFLOW_VIEW_INVALID",
  );
});

Deno.test("workflow view keeps reserved, sent and manual receipts visible after case-version advances", () => {
  for (
    const [caseState, caseVersion, outcome, status] of [
      ["ready_to_send", 9, "reserved", "send_pending"],
      ["sent", 10, "sent", "sent"],
      [
        "manual_reconciliation_required",
        10,
        "manual_reconciliation_required",
        "manual_reconciliation_required",
      ],
    ] as const
  ) {
    const projected = approvalCommunicationsWorkspace({
      ...record,
      caseState,
      caseVersion,
      outbound: {
        ...record.outbound!,
        caseVersion: 7,
        status,
        salesAuthorizationId: "66666666-6666-4666-8666-666666666666",
        sendOutcome: outcome,
      },
    }, {
      ...baseIdentity,
      identity: { ...baseIdentity.identity, email: "carriers@xbfreight.com" },
      permissions: ["osp:send-authorized"],
    });
    assertEquals(projected.outbound?.status, status);
    assertEquals(projected.outbound?.sendOutcome, outcome);
    assertEquals(projected.capabilities.requestAuthorizedSend, false);
  }
});

Deno.test("a known failed send exposes one deliberate Carriers retry", () => {
  const projected = approvalCommunicationsWorkspace({
    ...record,
    caseState: "ready_to_send",
    caseVersion: 9,
    outbound: {
      ...record.outbound!,
      caseVersion: 7,
      status: "failed",
      salesAuthorizationId: "66666666-6666-4666-8666-666666666666",
      sendOutcome: "failed",
    },
  }, {
    ...baseIdentity,
    identity: { ...baseIdentity.identity, email: "carriers@xbfreight.com" },
    permissions: ["osp:send-authorized"],
  });
  assertEquals(projected.capabilities.requestAuthorizedSend, true);
});
