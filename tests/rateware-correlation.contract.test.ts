function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const originalServe = Deno.serve;
Object.defineProperty(Deno, "serve", {
  configurable: true,
  value: () => ({}),
});
const ratewareApi = await import("../supabase/functions/rateware-api/index.ts");
Object.defineProperty(Deno, "serve", {
  configurable: true,
  value: originalServe,
});
const { createRatewareApiHandler, ratewareOperationId, ratewareRequestId } = ratewareApi;

Deno.test("Rateware retains a safe caller request id and replaces an unsafe one", () => {
  const retained = ratewareRequestId(new Request("https://rateware.test", {
    headers: { "x-request-id": "release:44cca49.request-01" },
  }));
  assert(retained === "release:44cca49.request-01", "safe request id should be retained");

  const generated = ratewareRequestId(new Request("https://rateware.test", {
    headers: { "x-request-id": "unsafe request id" },
  }));
  assert(/^[0-9a-f-]{36}$/i.test(generated), "unsafe request id should be replaced with a UUID");
});

Deno.test("Rateware assigns operation ids only to governed high-risk actions", () => {
  const supplied = "99999999-9999-4999-8999-999999999999";
  const retained = ratewareOperationId(
    new Request("https://rateware.test", { headers: { "x-operation-id": supplied } }),
    { action: "send_bid_room_carrier_message" },
  );
  assert(retained === supplied, "safe operation id should be retained");

  const generated = ratewareOperationId(
    new Request("https://rateware.test"),
    { action: "closeout_awarded_rfx_to_rateware" },
  );
  assert(generated && /^[0-9a-f-]{36}$/i.test(generated), "high-risk action should receive a generated operation id");

  const readOnly = ratewareOperationId(
    new Request("https://rateware.test"),
    { action: "list_rfx_events" },
  );
  assert(readOnly === null, "read-only action should not receive an operation id");
});

Deno.test("Rateware preflight exposes and accepts correlation headers", async () => {
  const handler = createRatewareApiHandler();
  const response = await handler(new Request("https://rateware.test", {
    method: "OPTIONS",
    headers: {
      origin: "https://rateware.vercel.app",
      "x-request-id": "preflight.request-01",
    },
  }));
  assert(response.headers.get("x-request-id") === "preflight.request-01", "preflight should echo the safe request id");
  assert(response.headers.get("access-control-allow-headers")?.includes("x-operation-id"), "preflight should allow operation id headers");
  assert(response.headers.get("access-control-expose-headers")?.includes("X-Request-Id"), "browser should be able to read request ids");
});
