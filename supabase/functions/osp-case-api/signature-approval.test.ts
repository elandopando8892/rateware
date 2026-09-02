import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import { approveAndApplySignature } from "./signature-approval.ts";
import type {
  ApprovalActor,
  ApprovalCommand,
} from "../_shared/osp/approval-types.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const actor: ApprovalActor = {
  organizationId,
  subject: "jose-subject",
  verifiedEmail: "jgonzalez@xbfreight.com",
  permissions: ["osp:signature-approve"],
  role: "signature_approver",
  authorizationSessionId: "session-signature",
  authorizationSessionIssuedAt: "2026-08-24T11:58:00.000Z",
  active: true,
};

Deno.test("only Jose approval resolves the private vault reference server-side", async () => {
  const commands: ApprovalCommand[] = [];
  const result = await approveAndApplySignature({
    organizationId,
    caseId,
    inputSnapshotSha256: "a".repeat(64),
    signaturePositionVersion: 3,
    expectedCaseVersion: 11,
    idempotencyKey: "signature-1",
    actor,
  }, {
    policy: {
      resolveActive: async () => ({
        vaultRef: "private-vault-ref",
        positionVersion: 3,
      }),
    },
    approvals: {
      transact: async (command, prepare) => {
        await prepare?.();
        commands.push(command);
        return {
          caseId,
          state: "signature_approval",
          caseVersion: 12,
          replayed: false,
          approvalId: "33333333-3333-4333-8333-333333333333",
        };
      },
      events: async () => [],
    },
    now: () => new Date("2026-08-24T12:00:00.000Z"),
  });
  assertEquals(result.approvalId, "33333333-3333-4333-8333-333333333333");
  assertEquals(commands[0].type, "approve_signature");
  assertEquals(
    (commands[0] as { signatureVaultRef?: string }).signatureVaultRef,
    "private-vault-ref",
  );
  assertEquals(JSON.stringify(result).includes("vault"), false);
});

Deno.test("signature semantic stop runs before private policy resolution", async () => {
  let policyReads = 0;
  await assertRejects(
    () =>
      approveAndApplySignature({
        organizationId,
        caseId,
        inputSnapshotSha256: "a".repeat(64),
        signaturePositionVersion: 3,
        expectedCaseVersion: 11,
        idempotencyKey: "signature-semantic-stop",
        actor,
      }, {
        policy: {
          resolveActive: () => {
            policyReads += 1;
            return Promise.resolve({
              vaultRef: "private-vault-ref",
              positionVersion: 3,
            });
          },
        },
        approvals: {
          transact: async (_command, prepare) => {
            await prepare?.();
            throw new Error("unexpected transition");
          },
          events: async () => [],
        },
        semanticGate: {
          load: () =>
            Promise.resolve({
              schemaVersion: 1,
              manifestSha256: "b".repeat(64),
              assessedAt: "2026-09-02T12:00:00.000Z",
              totalRequired: 1,
              satisfiedRequired: 0,
              blockingCount: 1,
              items: [],
              gates: {
                operationsReview: true,
                signatureApproval: false,
                outboundDraft: false,
                outboundFreeze: false,
                salesAuthorization: false,
                send: false,
              },
            }),
        },
        now: () => new Date("2026-08-24T12:00:00.000Z"),
      }),
    Error,
    "REQUEST_FULFILLMENT_BLOCKED",
  );
  assertEquals(policyReads, 0);
});

Deno.test("signature approval rejects policy version drift and non-Jose actor", async () => {
  const deps = {
    policy: {
      resolveActive: async () => ({
        vaultRef: "private-vault-ref",
        positionVersion: 2,
      }),
    },
    approvals: {
      transact: async (
        _command: ApprovalCommand,
        prepare?: () => Promise<void>,
      ) => {
        await prepare?.();
        throw new Error("unexpected transition");
      },
      events: async () => [],
    },
    now: () => new Date("2026-08-24T12:00:00.000Z"),
  };
  await assertRejects(
    () =>
      approveAndApplySignature({
        organizationId,
        caseId,
        inputSnapshotSha256: "a".repeat(64),
        signaturePositionVersion: 3,
        expectedCaseVersion: 11,
        idempotencyKey: "signature-1",
        actor,
      }, deps),
    Error,
    "SIGNATURE_POLICY_STALE",
  );
  await assertRejects(
    () =>
      approveAndApplySignature({
        organizationId,
        caseId,
        inputSnapshotSha256: "a".repeat(64),
        signaturePositionVersion: 2,
        expectedCaseVersion: 11,
        idempotencyKey: "signature-2",
        actor: { ...actor, verifiedEmail: "other@example.test" },
      }, deps),
    Error,
    "APPROVAL_FORBIDDEN",
  );
});

Deno.test("an exact signature replay returns its receipt before reading the mutable vault policy", async () => {
  let policyCalls = 0;
  let receipt: Awaited<ReturnType<typeof approveAndApplySignature>> | null =
    null;
  const approvals = {
    transact: async (
      _command: ApprovalCommand,
      prepare?: () => Promise<void>,
    ) => {
      if (receipt) return { ...receipt, replayed: true };
      await prepare?.();
      receipt = {
        caseId,
        state: "signature_approval" as const,
        caseVersion: 12,
        replayed: false,
        approvalId: "33333333-3333-4333-8333-333333333333",
      };
      return receipt;
    },
    events: async () => [],
  };
  const input = {
    organizationId,
    caseId,
    inputSnapshotSha256: "a".repeat(64),
    signaturePositionVersion: 3,
    expectedCaseVersion: 11,
    idempotencyKey: "signature-receipt-first",
    actor,
  };
  const deps = {
    approvals,
    policy: {
      resolveActive: async () => {
        policyCalls += 1;
        if (policyCalls > 1) throw new Error("POLICY_DOWN");
        return { vaultRef: "private-vault-ref", positionVersion: 3 };
      },
    },
    now: () => new Date("2026-08-24T12:00:00.000Z"),
  };
  const first = await approveAndApplySignature(input, deps);
  const replay = await approveAndApplySignature(input, deps);
  assertEquals(first.replayed, false);
  assertEquals(replay, { ...first, replayed: true });
  assertEquals(policyCalls, 1);
});
