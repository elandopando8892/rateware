import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import {
  triggerOspGmailWorker,
  triggerOspSupplierPackageCanary,
} from "./worker-trigger.ts";

Deno.test("Rateware invokes the exact authenticated OSP worker endpoint", async () => {
  let seen: Request | undefined;
  const result = await triggerOspGmailWorker({
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "k".repeat(64),
    limit: 7,
    fetch: async (input, init) => {
      seen = new Request(input, init);
      return new Response(JSON.stringify({ enqueued: 1, processed: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  assertEquals(result, { enqueued: 1, processed: 1 });
  assertEquals(
    seen?.url,
    "https://project.supabase.co/functions/v1/osp-worker",
  );
  assertEquals(seen?.headers.get("authorization"), `Bearer ${"k".repeat(64)}`);
  assertEquals(await seen?.json(), {
    action: "drain_rateware_gmail",
    limit: 7,
  });
});

Deno.test("Rateware treats worker failures as retryable sync failures", async () => {
  await assertRejects(
    () =>
      triggerOspGmailWorker({
        supabaseUrl: "https://project.supabase.co",
        serviceRoleKey: "k".repeat(64),
        fetch: async () => new Response(null, { status: 503 }),
      }),
    Error,
    "OSP_WORKER_UNAVAILABLE",
  );
});

Deno.test("internal OSP gateway forwards one exact supplier package snapshot", async () => {
  let seen: Request | undefined;
  const result = await triggerOspSupplierPackageCanary({
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "k".repeat(64),
    organizationId: "11111111-1111-4111-8111-111111111111",
    caseId: "22222222-2222-4222-8222-222222222222",
    snapshotId: "33333333-3333-4333-8333-333333333333",
    snapshotSha256: "a".repeat(64),
    fetch: async (input, init) => {
      seen = new Request(input, init);
      return new Response(JSON.stringify({ processed: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  assertEquals(result, { processed: 1 });
  assertEquals(await seen?.json(), {
    action: "run_supplier_package_canary",
    organizationId: "11111111-1111-4111-8111-111111111111",
    caseId: "22222222-2222-4222-8222-222222222222",
    snapshotId: "33333333-3333-4333-8333-333333333333",
    snapshotSha256: "a".repeat(64),
  });
});
