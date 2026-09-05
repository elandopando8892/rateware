import { assertEquals } from "jsr:@std/assert@1.0.14";
import { createFormApiHandler } from "./handler.ts";
import { createInMemoryFormStore } from "./store.ts";

const id = "11111111-1111-4111-8111-111111111111";
const org = "22222222-2222-4222-8222-222222222222";
Deno.test("evidence link requires operator authority, exact confirmation and server identity", async () => {
  let permission = "osp:read";
  const calls: unknown[] = [];
  const handler = createFormApiHandler({
    canonicalFieldIds: [],
    store: {
      ...createInMemoryFormStore(),
      linkAnswerMemoryEvidence: (input) => {
        calls.push(input);
        return Promise.resolve({
          receiptId: id,
          factId: id,
          action: input.action,
          replayed: false,
          externalEffects: false,
        });
      },
    },
    verifyToken: () =>
      Promise.resolve({
        identity: {
          issuer: "https://auth.example.test",
          authorizedParty: "client",
          subject: "verified-operator",
          organization: org,
          email: "operator@example.test",
          emailVerified: true,
        },
        permissions: [permission],
      }),
  });
  const input = {
    caseId: id,
    candidateId: id,
    reviewFieldId: id,
    factId: id,
    answerSha256: "a".repeat(64),
    expectationSha256: "b".repeat(64),
    action: "renew",
    reason: "Verified exact evidence.",
    idempotencyKey: "evidence:one",
    confirmed: true,
  };
  const send = (body: unknown) =>
    handler(
      new Request("https://example.test/functions/v1/osp-form-api", {
        method: "POST",
        headers: {
          origin: "http://localhost:8791",
          "content-type": "application/json",
          authorization: "Bearer token",
        },
        body: JSON.stringify(body),
      }),
    );
  const payload = { version: 1, action: "link_answer_memory_evidence", input };
  assertEquals((await send(payload)).status, 403);
  permission = "osp:operate";
  for (
    const extra of [
      { subject: "injected" },
      { organizationId: org },
      { confirmed: false },
      { expectationSha256: "bad" },
      { reason: "short" },
    ]
  ) {
    assertEquals(
      (await send({ ...payload, input: { ...input, ...extra } })).status,
      400,
    );
  }
  assertEquals(calls, []);
  assertEquals((await send(payload)).status, 200);
  assertEquals(calls, [{
    ...input,
    subject: "verified-operator",
    organizationId: org,
    permission: "osp:operate",
  }]);
});
Deno.test("answer evidence preflight permits scoped reads but rejects client identity and unknown fields", async () => {
  const calls: string[][] = [];
  const handler = createFormApiHandler({
    canonicalFieldIds: [],
    store: {
      ...createInMemoryFormStore(),
      getAnswerMemoryEvidence: (organizationId, caseId, candidateId) => {
        calls.push([organizationId, caseId, candidateId]);
        return Promise.resolve({
          options: [],
          readOnly: true,
          externalEffects: false,
        });
      },
    },
    verifyToken: () =>
      Promise.resolve({
        identity: {
          issuer: "https://auth.example.test",
          authorizedParty: "client",
          subject: "verified-reader",
          organization: org,
          email: "reader@example.test",
          emailVerified: true,
        },
        permissions: ["osp:read"],
      }),
  });
  const request = (body: unknown, authorized = true) =>
    new Request("https://example.test/functions/v1/osp-form-api", {
      method: "POST",
      headers: {
        origin: "http://localhost:8791",
        "content-type": "application/json",
        ...(authorized ? { authorization: "Bearer test-token" } : {}),
      },
      body: JSON.stringify(body),
    });
  const payload = {
    version: 1,
    action: "get_answer_memory_evidence",
    case_id: id,
    candidate_id: id,
  };
  assertEquals(
    (await handler(request({ ...payload, organization_id: org }))).status,
    400,
  );
  assertEquals(
    (await handler(request({ ...payload, candidate_id: "bad" }))).status,
    400,
  );
  assertEquals((await handler(request(payload, false))).status, 401);
  assertEquals(calls, []);
  const response = await handler(request(payload));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    version: 1,
    data: { options: [], readOnly: true, externalEffects: false },
  });
  assertEquals(calls, [[org, id, id]]);
});
