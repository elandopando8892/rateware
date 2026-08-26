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
  outbound: {
    payloadId,
    kind: "final_response",
    status: "frozen",
    caseVersion: 7,
    from: "carriers@xbfreight.com",
    to: ["supplier@example.test"],
    cc: ["sales@heymarksman.com"],
    subject: "Supplier registration response",
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
      signature_output_sha256: null,
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
        signature_output_sha256: "b".repeat(64),
        payload_id: payloadId,
        payload_kind: "final_response",
        payload_status: "frozen",
        payload_case_version: "7",
        from_email: "carriers@xbfreight.com",
        to_recipients: [{ email: "supplier@example.test" }],
        cc_recipients: [{ email: "sales@heymarksman.com" }],
        subject: "Supplier registration response",
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
    payload_case_version: "7",
    from_email: "carriers@xbfreight.com",
    to_recipients: [{ email: "supplier@example.test" }],
    cc_recipients: [],
    subject: "Supplier registration response",
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
