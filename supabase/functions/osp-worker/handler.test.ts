import { assertEquals } from "jsr:@std/assert@1.0.14";

import { createOspWorkerHandler } from "./handler.ts";

const token = "s".repeat(64);
const request = (body: unknown, authorization = `Bearer ${token}`) =>
  new Request("https://example.test/functions/v1/osp-worker", {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

Deno.test("OSP worker rejects unauthorized and ambiguous requests", async () => {
  const handler = createOspWorkerHandler({
    expectedToken: token,
    enqueue: async () => 0,
    run: async () => 0,
  });
  assertEquals((await handler(request({}, "Bearer invalid"))).status, 401);
  assertEquals(
    (await handler(request({ action: "drain_rateware_gmail", extra: true })))
      .status,
    400,
  );
  assertEquals(
    (await handler(request({ action: "drain_rateware_gmail", limit: 26 })))
      .status,
    400,
  );
});

Deno.test("OSP worker enqueues once and drains bounded batches", async () => {
  const limits: number[] = [];
  const batches = [10, 10, 3];
  const handler = createOspWorkerHandler({
    expectedToken: token,
    enqueue: async (limit) => {
      limits.push(limit);
      return 7;
    },
    run: async (limit) => {
      limits.push(limit);
      return batches.shift() ?? 0;
    },
  });
  const response = await handler(
    request({ action: "drain_rateware_gmail", limit: 10 }),
  );
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    enqueued: 7,
    processed: 23,
    batches: 3,
  });
  assertEquals(limits, [10, 10, 10, 10]);
});

Deno.test("OSP worker fails closed when the bridge is unavailable", async () => {
  const handler = createOspWorkerHandler({
    expectedToken: token,
    enqueue: async () => {
      throw new Error("DATABASE_TEMPORARY");
    },
    run: async () => 0,
  });
  const response = await handler(request({ action: "drain_rateware_gmail" }));
  assertEquals(response.status, 503);
  assertEquals(await response.json(), { error: "WORKER_UNAVAILABLE" });
});
