import { deliverClaimedNotification, NotificationRejected, type NotificationClaim, type NotificationDelivery } from "./notification-workflow.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}

class SimulatedReceiptStore {
  status: NotificationClaim | "received" | "failed" = "received";
  sent = 0;
  uncertain = 0;
  failed = 0;
  failMarkSent = false;

  async claim(): Promise<NotificationClaim> {
    if (this.status === "received" || this.status === "failed") {
      this.status = "sending";
      return "claimed";
    }
    return this.status;
  }
  async markSent(_delivery: NotificationDelivery) { if (this.failMarkSent) throw new Error("receipt write failed"); this.status = "sent"; this.sent += 1; }
  async markFailed(_message: string) { this.status = "failed"; this.failed += 1; }
  async markUncertain(_message: string) { this.status = "uncertain"; this.uncertain += 1; }
}

Deno.test("only one concurrent duplicate can send a notification", async () => {
  const store = new SimulatedReceiptStore();
  let providerCalls = 0;
  const workflow = () => ({
    claim: () => store.claim(),
    send: async () => { providerCalls += 1; await new Promise((resolve) => setTimeout(resolve, 15)); return { messageId: "gmail-1", threadId: "thread-1" }; },
    markSent: (delivery: NotificationDelivery) => store.markSent(delivery), markFailed: (message: string) => store.markFailed(message), markUncertain: (message: string) => store.markUncertain(message)
  });
  assertEquals(await Promise.all([deliverClaimedNotification(workflow()), deliverClaimedNotification(workflow())]), ["accepted", "in_progress"]);
  assertEquals(providerCalls, 1);
  assertEquals(store.status, "sent");
});

Deno.test("a delivery accepted before receipt persistence failure becomes uncertain and is not resent", async () => {
  const store = new SimulatedReceiptStore();
  store.failMarkSent = true;
  let providerCalls = 0;
  const workflow = () => ({
    claim: () => store.claim(), send: async () => { providerCalls += 1; return { messageId: "gmail-2", threadId: "thread-2" }; },
    markSent: (delivery: NotificationDelivery) => store.markSent(delivery), markFailed: (message: string) => store.markFailed(message), markUncertain: (message: string) => store.markUncertain(message)
  });
  assertEquals(await deliverClaimedNotification(workflow()), "unavailable");
  assertEquals(store.status, "uncertain");
  assertEquals(await deliverClaimedNotification(workflow()), "review_required");
  assertEquals(providerCalls, 1);
});

Deno.test("a confirmed provider rejection is marked failed and can be retried", async () => {
  const store = new SimulatedReceiptStore();
  const workflow = {
    claim: () => store.claim(), send: async () => { throw new NotificationRejected("Gmail rejected the message"); },
    markSent: (delivery: NotificationDelivery) => store.markSent(delivery), markFailed: (message: string) => store.markFailed(message), markUncertain: (message: string) => store.markUncertain(message)
  };
  assertEquals(await deliverClaimedNotification(workflow), "unavailable");
  assertEquals(store.status, "failed");
  assertEquals(store.failed, 1);
});
