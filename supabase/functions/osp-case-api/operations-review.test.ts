import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import { completeOperationsReview } from "./operations-review.ts";
import { createInMemoryApprovalStore } from "../_shared/osp/approval-store.ts";
import type {
  ApprovalActor,
  ApprovalCommand,
} from "../_shared/osp/approval-types.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const snapshotSha256 = "a".repeat(64);
const actor: ApprovalActor = {
  organizationId,
  subject: "operations-subject",
  verifiedEmail: "operations@example.test",
  permissions: ["osp:operate"],
  role: "operations_reviewer",
  authorizationSessionId: "session-operations",
  authorizationSessionIssuedAt: "2026-08-24T11:58:00.000Z",
  active: true,
};

Deno.test("Operations completion uses only the server-rebuilt current snapshot", async () => {
  const commands: ApprovalCommand[] = [];
  const result = await completeOperationsReview({
    organizationId,
    caseId,
    expectedCaseVersion: 10,
    expectedSnapshotSha256: snapshotSha256,
    idempotencyKey: "operations-review-1",
    actor,
  }, {
    snapshots: {
      rebuildCurrent: async (scope) => {
        assertEquals(scope, {
          organizationId,
          caseId,
          expectedCaseVersion: 10,
        });
        return { canonicalSha256: snapshotSha256 };
      },
    },
    approvals: {
      transact: async (command, prepare) => {
        await prepare?.();
        commands.push(command);
        return {
          caseId,
          state: "signature_approval",
          caseVersion: 11,
          replayed: false,
        };
      },
      events: async () => [],
    },
  });
  assertEquals(result.state, "signature_approval");
  assertEquals(commands.length, 1);
  assertEquals(commands[0].type, "complete_operations_review");
});

Deno.test("Operations completion rejects browser hash drift before transition", async () => {
  await assertRejects(
    () =>
      completeOperationsReview({
        organizationId,
        caseId,
        expectedCaseVersion: 10,
        expectedSnapshotSha256: snapshotSha256,
        idempotencyKey: "operations-review-1",
        actor,
      }, {
        snapshots: {
          rebuildCurrent: async () => ({ canonicalSha256: "b".repeat(64) }),
        },
        approvals: {
          transact: async (_command, prepare) => {
            await prepare?.();
            throw new Error("unexpected transition");
          },
          events: async () => [],
        },
      }),
    Error,
    "SNAPSHOT_HASH_MISMATCH",
  );
});

Deno.test("Operations completion replays its receipt before rebuilding stale package state", async () => {
  const approvals = createInMemoryApprovalStore({
    cases: [{
      organizationId,
      caseId,
      state: "operations_review",
      version: 10,
      currentSnapshotSha256: snapshotSha256,
    }],
    payloads: [],
    now: () => new Date("2026-08-24T12:00:00.000Z"),
  });
  let rebuilds = 0;
  const input = {
    organizationId,
    caseId,
    expectedCaseVersion: 10,
    expectedSnapshotSha256: snapshotSha256,
    idempotencyKey: "operations-replay",
    actor,
  };
  const first = await completeOperationsReview(input, {
    snapshots: {
      rebuildCurrent: () => {
        rebuilds += 1;
        return Promise.resolve({ canonicalSha256: snapshotSha256 });
      },
    },
    approvals,
  });
  const replay = await completeOperationsReview(input, {
    snapshots: {
      rebuildCurrent: () => {
        rebuilds += 1;
        throw new Error("unexpected stale-state read before receipt");
      },
    },
    approvals,
  });
  assertEquals(first.replayed, false);
  assertEquals(replay.replayed, true);
  assertEquals(rebuilds, 1);
});
