import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import { createRatewareGmailBridge } from "./rateware-gmail-bridge.ts";

Deno.test("Rateware Gmail bridge executes only through the worker role", async () => {
  const calls: string[] = [];
  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push(strings.join("?") + JSON.stringify(values));
      if (/enqueue_rateware_gmail_messages/.test(strings.join("?"))) {
        return [{ inserted_count: 2 }];
      }
      return [];
    },
    {
      begin: async <T>(operation: (transaction: typeof sql) => Promise<T>) =>
        await operation(sql),
    },
  );
  const bridge = createRatewareGmailBridge({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => sql,
  });
  assertEquals(await bridge.enqueue(10), 2);
  assertEquals(
    calls.some((call) => /set local role osp_worker/.test(call)),
    true,
  );
  assertEquals(
    calls.some((call) => /enqueue_rateware_gmail_messages/.test(call)),
    true,
  );
  await assertRejects(() => bridge.enqueue(0), Error, "INVALID_BRIDGE_LIMIT");
});
