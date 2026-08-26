import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import type { VerifiedWorkflowIdentity } from "../_shared/osp/workflow-authority.ts";
import { createCaseOutboundActions } from "./actions.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const payloadId = "33333333-3333-4333-8333-333333333333";

Deno.test("real outbound action boundary rejects every mixed Operations and consequential identity", async () => {
  let storeTouches = 0;
  const actions = createCaseOutboundActions({
    store: {
      save: async (input) => {
        storeTouches += 1;
        return input.draft;
      },
      load: async () => {
        throw new Error("unexpected");
      },
      currentContext: async () => {
        throw new Error("unexpected");
      },
      commitFrozen: async () => {
        throw new Error("unexpected");
      },
    },
    attachments: { read: async () => null },
    objects: { writeExclusive: async () => undefined, read: async () => null },
    payloads: {
      resolveCurrent: async () => {
        throw new Error("unexpected");
      },
    },
    approvals: {
      transact: async () => {
        throw new Error("unexpected");
      },
      events: async () => [],
    },
    sendStore: {
      reserve: async () => {
        throw new Error("unexpected");
      },
    },
  });
  const draft = {
    payloadId,
    organizationId,
    caseId,
    kind: "clarification" as const,
    caseVersion: 7,
    sourceSnapshotSha256: "a".repeat(64),
    signedPackageSha256: null,
    from: "carriers@xbfreight.com" as const,
    to: [{
      email: "supplier@example.test",
      source: "captured_supplier" as const,
    }],
    cc: [],
    subject: "Clarification required",
    inReplyTo: null,
    references: [],
    bodyText: "Please clarify the reviewed requirement.",
    attachments: [],
  };
  for (
    const permission of [
      "osp:signature-approve",
      "osp:sales-authorize",
      "osp:send-authorized",
    ]
  ) {
    const identity: VerifiedWorkflowIdentity = {
      identity: {
        organization: organizationId,
        issuer: "https://auth.example.test",
        subject: `mixed-${permission}`,
        email: permission === "osp:sales-authorize"
          ? "sales@heymarksman.com"
          : "operator@example.test",
        emailVerified: true,
        authorizedParty: "osp-client",
      },
      permissions: ["osp:read", "osp:operate", permission],
    };
    await assertRejects(
      () =>
        actions.saveDraft({
          organizationId,
          caseId,
          expectedCaseVersion: 7,
          sourceSnapshotSha256: "a".repeat(64),
          signedPackageSha256: null,
          draft,
        }, identity),
      Error,
      "APPROVAL_FORBIDDEN",
    );
  }
  assertEquals(storeTouches, 0);
});
