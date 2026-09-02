import { assertEquals } from "jsr:@std/assert@1.0.14";

import { createCaseApiHandler } from "./handler.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const draftId = "44444444-4444-4444-8444-444444444444";
const sourceHash = "a".repeat(64);
const identity = {
  identity: {
    organization: organizationId,
    issuer: "https://auth.example.test",
    subject: "ops-subject",
    email: "ops@example.test",
    emailVerified: true,
    audience: "https://osp.heymarksman.com/api",
    authorizedParty: "client",
    expiresAt: 1,
    notBefore: 1,
  },
  permissions: ["osp:read", "osp:operate"],
} as const;
const approvalIdentity = {
  ...identity,
  identity: { ...identity.identity, email: "jgonzalez@xbfreight.com" },
  permissions: ["osp:signature-approve"],
  authorizationSessionId: "session-signature",
  authorizationSessionIssuedAt: "2026-08-24T11:58:00.000Z",
} as const;
const salesIdentity = {
  ...identity,
  identity: { ...identity.identity, email: "sales@heymarksman.com" },
  permissions: ["osp:sales-authorize"],
  authorizationSessionId: "session-sales",
  authorizationSessionIssuedAt: "2026-08-24T11:58:00.000Z",
} as const;
const carriersIdentity = {
  ...identity,
  identity: { ...identity.identity, email: "carriers@xbfreight.com" },
  permissions: ["osp:send-authorized"],
  authorizationSessionId: "session-carriers",
  authorizationSessionIssuedAt: "2026-08-24T11:58:00.000Z",
} as const;

function request(query: string, init: RequestInit = {}) {
  return new Request(
    `https://project.example.test/functions/v1/osp-case-api?${query}`,
    {
      method: "POST",
      ...init,
      headers: {
        origin: "https://osp.heymarksman.com",
        authorization: "Bearer synthetic-token",
        "x-osp-approval-proof": "header.payload.signature",
        ...init.headers,
      },
    },
  );
}

const row = {
  id: draftId,
  caseId: "33333333-3333-4333-8333-333333333333",
  caseVersion: 4,
  version: 1,
  status: "operations_review_required" as const,
  questions: [{
    kind: "missing" as const,
    fieldId: "supplier.address",
    question: "Please confirm the registered address.",
    evidenceIds: ["ev-1"],
  }],
  evidenceIds: ["ev-1"],
  canonicalSha256: sourceHash,
  authorizationMailbox: "sales@heymarksman.com" as const,
};

Deno.test("case API lists tenant-safe clarification reviews and exposes no send action", async () => {
  const handler = createCaseApiHandler({
    verifyToken: async () => identity,
    clarificationStore: {
      listForReview: async () => [row],
      saveOperationsReview: async () => ({
        ...row,
        status: "operations_reviewed" as const,
      }),
    },
    incidentId: () => "incident-list",
  });
  const response = await handler(request("action=list_clarification_reviews"));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { data: { drafts: [row] } });
  const forbidden = await handler(request("action=send_clarification"));
  assertEquals(forbidden.status, 400);
});

Deno.test("case API accepts a gateway-normalized zero-byte stream and rejects any body bytes", async () => {
  const handler = createCaseApiHandler({
    verifyToken: async () => identity,
    clarificationStore: {
      listForReview: async () => [],
      saveOperationsReview: async () => row,
    },
    incidentId: () => "incident-empty-stream",
  });
  const stream = (payload?: Uint8Array) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        if (payload) controller.enqueue(payload);
        controller.close();
      },
    });
  assertEquals(
    (await handler(
      request("action=list_clarification_reviews", { body: stream() }),
    )).status,
    200,
  );
  assertEquals(
    (await handler(
      request("action=list_clarification_reviews", {
        body: stream(new Uint8Array([1])),
      }),
    )).status,
    400,
  );
});

Deno.test("case API saves only an exact Operations review under operate authority", async () => {
  const saved: unknown[] = [];
  const handler = createCaseApiHandler({
    verifyToken: async () => identity,
    clarificationStore: {
      listForReview: async () => [],
      saveOperationsReview: async (input) => {
        saved.push(input);
        return {
          ...row,
          version: 2,
          caseVersion: 5,
          status: "operations_reviewed" as const,
          canonicalSha256: "b".repeat(64),
        };
      },
    },
    incidentId: () => "incident-save",
  });
  const response = await handler(request(
    `action=save_clarification_review&draft_id=${draftId}&expected_case_version=4&expected_canonical_sha256=${sourceHash}`,
    {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        questions: [{
          kind: "missing",
          fieldId: "supplier.address",
          question: "Please provide the current registered address.",
          evidenceIds: ["ev-1"],
        }],
      }),
    },
  ));
  assertEquals(response.status, 200);
  assertEquals(saved, [{
    organizationId,
    subject: "ops-subject",
    draftId,
    expectedCaseVersion: 4,
    expectedCanonicalSha256: sourceHash,
    questions: [{
      kind: "missing",
      fieldId: "supplier.address",
      question: "Please provide the current registered address.",
      evidenceIds: ["ev-1"],
    }],
  }]);
});

Deno.test("case API saves one exact evidence-bound request manifest review without outbound effects", async () => {
  const caseId = "33333333-3333-4333-8333-333333333333";
  const manifestId = "55555555-5555-4555-8555-555555555555";
  const reviewId = "66666666-6666-4666-8666-666666666666";
  const saved: unknown[] = [];
  const handler = createCaseApiHandler({
    verifyToken: async () => identity,
    clarificationStore: {
      listForReview: async () => [],
      saveOperationsReview: async () => row,
      saveRequestManifestReview: async (input) => {
        saved.push(input);
        return {
          reviewId,
          caseId,
          caseVersion: 5,
          manifestId,
          manifestVersion: 1,
          manifestSha256: sourceHash,
          reviewVersion: 1,
          status: "resolved" as const,
          decisions: [{
            decisionId: "clarification:0",
            kind: "clarification" as const,
            fieldId: "targetXbfEntity",
            prompt: "Which XBF entity?",
            evidenceIds: ["email:body"],
            outcome: "answered" as const,
            resolution: "Use XBFUS.",
          }],
          canonicalSha256: "b".repeat(64),
          replayed: false,
        };
      },
    },
    incidentId: () => "incident-manifest-review",
  });
  const response = await handler(request(
    `action=save_request_manifest_review&case_id=${caseId}&expected_case_version=4&expected_manifest_sha256=${sourceHash}`,
    {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decisions: [{
          decisionId: "clarification:0",
          outcome: "answered",
          resolution: "Use XBFUS.",
        }],
      }),
    },
  ));
  assertEquals(response.status, 200);
  assertEquals(saved, [{
    organizationId,
    subject: "ops-subject",
    caseId,
    expectedCaseVersion: 4,
    expectedManifestSha256: sourceHash,
    decisions: [{
      decisionId: "clarification:0",
      outcome: "answered",
      resolution: "Use XBFUS.",
    }],
  }]);
});

Deno.test("case API reads and promotes only an exact reviewed knowledge selection", async () => {
  const caseId = "33333333-3333-4333-8333-333333333333";
  const manifestId = "55555555-5555-4555-8555-555555555555";
  const reviewId = "66666666-6666-4666-8666-666666666666";
  const promotionId = "77777777-7777-4777-8777-777777777777";
  const selectedKeys = ["field:business.trade.references", "document:w.9"];
  const promoted: unknown[] = [];
  const handler = createCaseApiHandler({
    verifyToken: async () => identity,
    clarificationStore: {
      listForReview: async () => [],
      saveOperationsReview: async () => row,
      getRequestKnowledgeWorkspace: async () => ({
        caseId,
        manifestId,
        reviewId,
        reviewVersion: 1,
        candidateSha256: sourceHash,
        candidates: [{
          kind: "field",
          canonicalKey: "business.trade.references",
          displayLabel: "Trade references",
          aliases: ["Trade references"],
          valueType: "table",
          required: true,
          evidenceCount: 2,
          catalogState: "new",
        }],
        catalogEntryCount: 0,
        priorPromotionCount: 0,
        externalEffects: false,
      }),
      promoteRequestKnowledge: async (input) => {
        promoted.push(input);
        return {
          promotionId,
          promotionStatus: "applied",
          promotedCount: 2,
          unchangedCount: 0,
          replayed: false,
          externalEffects: false,
        };
      },
    },
    incidentId: () => "incident-request-knowledge",
  });
  const readResponse = await handler(
    request(`action=get_request_knowledge_workspace&case_id=${caseId}`, {
      headers: { "x-osp-approval-proof": "" },
    }),
  );
  assertEquals(readResponse.status, 200);
  assertEquals((await readResponse.json()).data.candidateSha256, sourceHash);

  const promotionResponse = await handler(request(
    `action=promote_request_knowledge&case_id=${caseId}&review_id=${reviewId}&expected_candidate_sha256=${sourceHash}&idempotency_key=knowledge:test-1`,
    {
      headers: {
        "content-type": "application/json",
        "x-osp-approval-proof": "",
      },
      body: JSON.stringify({
        selectedKeys,
        confirmation: "PROMOTE_REVIEWED_REQUEST_KNOWLEDGE",
      }),
    },
  ));
  assertEquals(promotionResponse.status, 200);
  assertEquals(await promotionResponse.json(), {
    data: {
      promotionId,
      promotionStatus: "applied",
      promotedCount: 2,
      unchangedCount: 0,
      replayed: false,
      externalEffects: false,
    },
  });
  assertEquals(promoted, [{
    organizationId,
    subject: "ops-subject",
    permission: "osp:operate",
    caseId,
    reviewId,
    expectedCandidateSha256: sourceHash,
    selectedKeys,
    idempotencyKey: "knowledge:test-1",
  }]);
});

Deno.test("request knowledge promotion rejects unreviewed or ambiguous payload shapes before persistence", async () => {
  let calls = 0;
  const handler = createCaseApiHandler({
    verifyToken: async () => identity,
    clarificationStore: {
      listForReview: async () => [],
      saveOperationsReview: async () => row,
      promoteRequestKnowledge: async () => {
        calls += 1;
        throw new Error("unexpected");
      },
    },
    incidentId: () => "incident-request-knowledge-invalid",
  });
  const response = await handler(request(
    `action=promote_request_knowledge&case_id=33333333-3333-4333-8333-333333333333&review_id=66666666-6666-4666-8666-666666666666&expected_candidate_sha256=${sourceHash}&idempotency_key=knowledge:test-2`,
    {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        selectedKeys: ["field:business.trade.references"],
        confirmation: "AUTO_PROMOTE",
      }),
    },
  ));
  assertEquals(response.status, 400);
  assertEquals(calls, 0);
});

Deno.test("clarification review rejects mixed Operations and Sales authority before persistence", async () => {
  let saves = 0;
  const handler = createCaseApiHandler({
    verifyToken: async () => ({
      ...salesIdentity,
      permissions: ["osp:operate", "osp:sales-authorize"],
    }),
    clarificationStore: {
      listForReview: async () => [],
      saveOperationsReview: async () => {
        saves += 1;
        return row;
      },
    },
    incidentId: () => "incident-mixed-clarification",
  });
  const response = await handler(request(
    `action=save_clarification_review&draft_id=${draftId}&expected_case_version=4&expected_canonical_sha256=${sourceHash}`,
    {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        questions: [{
          kind: "missing",
          fieldId: "supplier.address",
          question: "Please provide the current registered address.",
          evidenceIds: ["ev-1"],
        }],
      }),
    },
  ));
  assertEquals(response.status, 403);
  assertEquals(saves, 0);
});

Deno.test("case API preflight is exact per clarification action", async () => {
  const handler = createCaseApiHandler({
    verifyToken: async () => identity,
    clarificationStore: {
      listForReview: async () => [],
      saveOperationsReview: async () => row,
    },
    incidentId: () => "incident-preflight",
  });
  const preflight = (query: string, headers: string) =>
    new Request(
      `https://project.example.test/functions/v1/osp-case-api?${query}`,
      {
        method: "OPTIONS",
        headers: {
          origin: "https://osp.heymarksman.com",
          "access-control-request-method": "POST",
          "access-control-request-headers": headers,
        },
      },
    );
  assertEquals(
    (await handler(
      preflight("action=list_clarification_reviews", "authorization"),
    )).status,
    204,
  );
  assertEquals(
    (await handler(
      preflight(
        `action=save_clarification_review&draft_id=${draftId}&expected_case_version=4&expected_canonical_sha256=${sourceHash}`,
        "content-type, authorization",
      ),
    )).status,
    204,
  );
  assertEquals(
    (await handler(
      preflight(
        "action=list_clarification_reviews",
        "authorization, content-type",
      ),
    )).status,
    400,
  );
  assertEquals(
    (await handler(preflight(
      `action=complete_operations_review&case_id=${row.caseId}&expected_case_version=4&input_snapshot_sha256=${sourceHash}&idempotency_key=operations-1`,
      "authorization, x-osp-approval-proof",
    ))).status,
    204,
  );
});

Deno.test("case API exposes exact Operations and Jose approval actions without vault data", async () => {
  const calls: string[] = [];
  const handler = createCaseApiHandler({
    verifyToken: async () => identity,
    verifyApprovalToken: async () => approvalIdentity,
    clarificationStore: {
      listForReview: async () => [],
      saveOperationsReview: async () => row,
    },
    approvalActions: {
      completeOperations: async (input) => {
        calls.push(`operations:${input.caseId}`);
        return {
          caseId: input.caseId,
          state: "signature_approval",
          caseVersion: 11,
          replayed: false,
        };
      },
      approveSignature: async (input) => {
        calls.push(`signature:${input.signaturePositionVersion}`);
        return {
          caseId: input.caseId,
          state: "signature_approval",
          caseVersion: 12,
          replayed: false,
          approvalId: "55555555-5555-4555-8555-555555555555",
        };
      },
    },
    incidentId: () => "incident-approval",
  });
  const common =
    `case_id=${row.caseId}&input_snapshot_sha256=${sourceHash}&idempotency_key=approval-1`;
  const operations = await handler(
    request(
      `action=complete_operations_review&${common}&expected_case_version=10`,
    ),
  );
  assertEquals(operations.status, 200);
  const signature = await handler(
    request(
      `action=approve_and_apply_signature&${common}&signature_position_version=3&expected_case_version=11`,
    ),
  );
  assertEquals(signature.status, 202);
  const payload = JSON.stringify(await signature.json());
  assertEquals(payload.includes("vault"), false);
  assertEquals(payload.includes("signatureBytes"), false);
  assertEquals(calls, [`operations:${row.caseId}`, "signature:3"]);
});

Deno.test("case API saves, freezes, and authorizes exact outbound payloads without exposing MIME or a send action", async () => {
  const calls: unknown[] = [];
  const handler = createCaseApiHandler({
    verifyToken: async () => identity,
    verifyApprovalToken: async () => salesIdentity,
    clarificationStore: {
      listForReview: async () => [],
      saveOperationsReview: async () => row,
    },
    outboundActions: {
      saveDraft: async (input) => {
        calls.push({ action: "save", input });
        return {
          payloadId: draftId,
          kind: "clarification" as const,
          caseVersion: 7,
        };
      },
      freezePayload: async (input) => {
        calls.push({ action: "freeze", input });
        return {
          payloadId: draftId,
          organizationId,
          caseId: row.caseId,
          kind: "clarification" as const,
          caseVersion: 7,
          sourceSnapshotSha256: sourceHash,
          signedPackageSha256: null,
          mimeObjectId: `outbound_${organizationId}_${draftId}`,
          mimeSha256: "b".repeat(64),
          attachmentSha256: ["c".repeat(64)],
          replayed: false,
        };
      },
      authorizePayload: async (input) => {
        calls.push({ action: "authorize", input });
        return {
          caseId: row.caseId,
          state: "ready_to_send" as const,
          caseVersion: 8,
          replayed: false,
          authorizationId: "55555555-5555-4555-8555-555555555555",
        };
      },
      requestSend: async () => {
        throw new Error("unexpected send reservation");
      },
    },
    incidentId: () => "incident-outbound",
  });
  const body = {
    payloadId: draftId,
    kind: "clarification",
    from: "carriers@xbfreight.com",
    to: [{ email: "supplier@example.test", source: "reviewed_manual" }],
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
      sha256: "c".repeat(64),
    }],
  };
  const saved = await handler(request(
    `action=save_outbound_draft&case_id=${row.caseId}&expected_case_version=7&source_snapshot_sha256=${sourceHash}&signed_package_sha256=none`,
    {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  ));
  assertEquals(saved.status, 201);
  assertEquals(JSON.stringify(await saved.json()).includes("bodyText"), false);
  const frozen = await handler(
    request(
      `action=freeze_outbound_payload&case_id=${row.caseId}&payload_id=${draftId}&expected_case_version=7&idempotency_key=freeze-1`,
    ),
  );
  assertEquals(frozen.status, 201);
  assertEquals(
    JSON.stringify(await frozen.json()).includes("mimeBytes"),
    false,
  );
  const authorized = await handler(
    request(
      `action=authorize_outbound_payload&case_id=${row.caseId}&payload_id=${draftId}&payload_sha256=${
        "b".repeat(64)
      }&attachment_sha256s=${
        "c".repeat(64)
      }&expected_case_version=7&idempotency_key=sales-clarification-1`,
    ),
  );
  assertEquals(authorized.status, 202);
  assertEquals(calls.length, 3);
  const send = await handler(
    request(`action=request_authorized_send&case_id=${row.caseId}`),
  );
  assertEquals(send.status, 400);
});

Deno.test("case API reserves an exact authorized send without accepting message content", async () => {
  const calls: unknown[] = [];
  const handler = createCaseApiHandler({
    verifyToken: async () => identity,
    verifyApprovalToken: async () => carriersIdentity,
    clarificationStore: {
      listForReview: async () => [],
      saveOperationsReview: async () => row,
    },
    outboundActions: {
      saveDraft: async () => ({
        payloadId: draftId,
        kind: "clarification",
        caseVersion: 7,
      }),
      freezePayload: async () => {
        throw new Error("unexpected freeze");
      },
      authorizePayload: async () => {
        throw new Error("unexpected authorization");
      },
      requestSend: async (input) => {
        calls.push(input);
        return {
          attemptId: "66666666-6666-4666-8666-666666666666",
          jobId: "77777777-7777-4777-8777-777777777777",
          outcome: "reserved" as const,
          replayed: false,
        };
      },
    },
    incidentId: () => "incident-send",
  });
  const response = await handler(request(
    `action=request_authorized_send&case_id=${row.caseId}&sales_authorization_id=55555555-5555-4555-8555-555555555555&payload_sha256=${
      "b".repeat(64)
    }&expected_case_version=8&idempotency_key=send-1`,
  ));
  assertEquals(response.status, 202);
  assertEquals(await response.json(), {
    data: {
      attemptId: "66666666-6666-4666-8666-666666666666",
      jobId: "77777777-7777-4777-8777-777777777777",
      outcome: "reserved",
      replayed: false,
    },
  });
  assertEquals(calls.length, 1);
  assertEquals(JSON.stringify(calls).includes("bodyText"), false);
});

Deno.test("case API transports the canonical one hundred thousand character outbound body", async () => {
  let savedBodyLength = 0;
  const handler = createCaseApiHandler({
    verifyToken: async () => identity,
    verifyApprovalToken: async () => approvalIdentity,
    clarificationStore: {
      listForReview: async () => [],
      saveOperationsReview: async () => row,
    },
    outboundActions: {
      saveDraft: async (input) => {
        savedBodyLength = input.draft.bodyText.length;
        return { payloadId: draftId, kind: "clarification", caseVersion: 7 };
      },
      freezePayload: async () => {
        throw new Error("unexpected freeze");
      },
      authorizePayload: async () => {
        throw new Error("unexpected authorize");
      },
      requestSend: async () => {
        throw new Error("unexpected send");
      },
    },
    incidentId: () => "incident-body-boundary",
  });
  const response = await handler(request(
    `action=save_outbound_draft&case_id=${row.caseId}&expected_case_version=7&source_snapshot_sha256=${sourceHash}&signed_package_sha256=none`,
    {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payloadId: draftId,
        kind: "clarification",
        from: "carriers@xbfreight.com",
        to: [{ email: "supplier@example.test", source: "reviewed_manual" }],
        cc: [],
        subject: "Clarification required",
        inReplyTo: null,
        references: [],
        bodyText: "x".repeat(100_000),
        attachments: [],
      }),
    },
  ));
  assertEquals(response.status, 201);
  assertEquals(savedBodyLength, 100_000);
});

Deno.test("case API returns a tenant-safe approval workspace and a typed version conflict", async () => {
  const handler = createCaseApiHandler({
    verifyToken: async () => ({
      ...salesIdentity,
      permissions: ["osp:read", "osp:sales-authorize"],
    }),
    verifyApprovalToken: async () => salesIdentity,
    clarificationStore: {
      listForReview: async () => [],
      saveOperationsReview: async () => row,
    },
    workflowView: {
      load: async () => ({
        organizationId,
        caseId: row.caseId,
        caseVersion: 7,
        caseState: "sales_authorization",
        inputSnapshot: {
          sha256: sourceHash,
          documentCount: 4,
          extractionCount: 18,
          reviewDecisionCount: 3,
          formInstanceVersion: 2,
        },
        replyContext: null,
        signature: null,
        outbound: {
          payloadId: draftId,
          kind: "final_response",
          status: "frozen",
          caseVersion: 7,
          from: "carriers@xbfreight.com",
          to: ["supplier@example.test"],
          cc: [],
          subject: "Supplier registration response",
          inReplyTo: "<supplier-request@example.test>",
          references: ["<original-thread@example.test>"],
          bodyText: "Ready for review.",
          attachmentSha256: ["c".repeat(64)],
          mimeSha256: "d".repeat(64),
          salesAuthorizationId: null,
          sendOutcome: null,
        },
      }),
    },
    approvalActions: {
      completeOperations: async () => {
        throw new Error("VERSION_CONFLICT");
      },
      approveSignature: async () => {
        throw new Error("VERSION_CONFLICT");
      },
    },
    incidentId: () => "incident-version",
  });
  const view = await handler(
    request(
      `action=get_approval_communications_workspace&case_id=${row.caseId}&payload_id=none`,
    ),
  );
  assertEquals(view.status, 200);
  const body = await view.json();
  assertEquals(body.data.capabilities.authorizeOutboundPayload, true);
  assertEquals(JSON.stringify(body).includes("vault"), false);

  const conflict = await handler(
    request(
      `action=complete_operations_review&case_id=${row.caseId}&expected_case_version=6&input_snapshot_sha256=${sourceHash}&idempotency_key=conflict-1`,
    ),
  );
  assertEquals(conflict.status, 409);
  assertEquals(await conflict.json(), {
    error: { code: "VERSION_CONFLICT", incident_id: "incident-version" },
  });
});

Deno.test("case API normalizes every stale outbound command to a typed version conflict", async () => {
  const handler = createCaseApiHandler({
    verifyToken: async () => salesIdentity,
    verifyApprovalToken: async () => salesIdentity,
    clarificationStore: {
      listForReview: async () => [],
      saveOperationsReview: async () => row,
    },
    outboundActions: {
      saveDraft: async () => {
        throw new Error("OUTBOUND_SEND_STALE");
      },
      freezePayload: async () => {
        throw new Error("OUTBOUND_SEND_STALE");
      },
      authorizePayload: async () => {
        throw new Error("OUTBOUND_SEND_STALE");
      },
      requestSend: async () => {
        throw new Error("OUTBOUND_SEND_STALE");
      },
    },
    incidentId: () => "incident-stale-send",
  });
  const response = await handler(
    request(
      `action=request_authorized_send&case_id=${row.caseId}&expected_case_version=7&idempotency_key=stale-send&payload_sha256=${sourceHash}&sales_authorization_id=55555555-5555-4555-8555-555555555555`,
    ),
  );
  assertEquals(response.status, 409);
  assertEquals(await response.json(), {
    error: { code: "VERSION_CONFLICT", incident_id: "incident-stale-send" },
  });
});
