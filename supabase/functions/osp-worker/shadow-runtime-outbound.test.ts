import { assertMatch } from "jsr:@std/assert@1.0.14";

Deno.test("production shadow runtime wires authorized outbound jobs to the governed Gmail executor", async () => {
  const source = await Deno.readTextFile(
    new URL("./shadow-runtime.ts", import.meta.url),
  );

  assertMatch(source, /createGmailSendAdapter/);
  assertMatch(source, /createPostgresOutboundSendStore/);
  assertMatch(source, /runOutboundSendJob/);
  assertMatch(
    source,
    /run:\s*\(limit: number\)[\s\S]*?runWorker\(\{[\s\S]*?outboundSends,[\s\S]*?limit,/,
  );
});
