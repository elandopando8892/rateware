import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";

import { requireApprovalAuthority } from "./approval-policy.ts";
import type { ApprovalActor, ApprovalCommandType } from "./approval-types.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-08-24T12:00:00.000Z");

function actor(overrides: Partial<ApprovalActor> = {}): ApprovalActor {
  return {
    organizationId,
    subject: "synthetic-subject",
    verifiedEmail: "operations@example.test",
    permissions: ["osp:read", "osp:operate"],
    role: "operations_reviewer",
    authorizationSessionId: "session-operations-1",
    authorizationSessionIssuedAt: "2026-08-24T11:58:00.000Z",
    active: true,
    ...overrides,
  };
}

Deno.test("approval authority enforces the four exact separated roles", () => {
  const cases: readonly [ApprovalCommandType, ApprovalActor][] = [
    ["complete_operations_review", actor()],
    [
      "approve_signature",
      actor({
        verifiedEmail: "jgonzalez@xbfreight.com",
        permissions: ["osp:read", "osp:signature-approve"],
        role: "signature_approver",
        authorizationSessionId: "session-signature-1",
      }),
    ],
    [
      "authorize_outbound",
      actor({
        verifiedEmail: "sales@heymarksman.com",
        permissions: ["osp:read", "osp:sales-authorize"],
        role: "sales_authorizer",
        authorizationSessionId: "session-sales-1",
      }),
    ],
    [
      "request_authorized_send",
      actor({
        verifiedEmail: "carriers@xbfreight.com",
        permissions: ["osp:send-authorized"],
        role: "carriers_sender",
        authorizationSessionId: "session-carriers-1",
      }),
    ],
  ];
  for (const [commandType, candidate] of cases) {
    assertEquals(
      requireApprovalAuthority(candidate, commandType, NOW),
      candidate,
    );
  }
});

Deno.test("approval authority rejects substitution, stale sessions, and mixed consequential permissions", () => {
  const rejected: readonly [ApprovalCommandType, ApprovalActor][] = [
    [
      "approve_signature",
      actor({
        verifiedEmail: "other@example.test",
        permissions: ["osp:read", "osp:signature-approve"],
        role: "signature_approver",
      }),
    ],
    [
      "authorize_outbound",
      actor({
        verifiedEmail: "sales@heymarksman.com",
        permissions: [
          "osp:read",
          "osp:sales-authorize",
          "osp:signature-approve",
        ],
        role: "sales_authorizer",
      }),
    ],
    [
      "approve_signature",
      actor({
        verifiedEmail: "jgonzalez@xbfreight.com",
        permissions: ["osp:read", "osp:signature-approve"],
        role: "signature_approver",
        authorizationSessionIssuedAt: "2026-08-24T11:54:59.000Z",
      }),
    ],
    ["complete_operations_review", actor({ active: false })],
    [
      "authorize_outbound",
      actor({
        verifiedEmail: "sales@heymarksman.com",
        permissions: ["osp:read", "osp:operate", "osp:sales-authorize"],
        role: "sales_authorizer",
      }),
    ],
    [
      "complete_operations_review",
      actor({
        authorizationSessionIssuedAt: undefined as unknown as string,
      }),
    ],
    [
      "request_authorized_send",
      actor({
        verifiedEmail: "carriers@xbfreight.com",
        permissions: ["osp:send-authorized"],
        role: "sales_authorizer",
      }),
    ],
  ];
  for (const [commandType, candidate] of rejected) {
    assertThrows(
      () => requireApprovalAuthority(candidate, commandType, NOW),
      Error,
      "APPROVAL_FORBIDDEN",
    );
  }
});
