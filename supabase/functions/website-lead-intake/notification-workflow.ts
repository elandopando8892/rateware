export type NotificationDelivery = { messageId: string; threadId: string };
export type NotificationClaim = "claimed" | "sent" | "uncertain" | "sending";
export type NotificationOutcome = "accepted" | "duplicate" | "review_required" | "in_progress" | "unavailable";

/** A non-2xx response from Gmail proves that it did not accept this message. */
export class NotificationRejected extends Error {}

export type NotificationWorkflow = {
  claim: () => Promise<NotificationClaim>;
  send: () => Promise<NotificationDelivery>;
  markSent: (delivery: NotificationDelivery) => Promise<void>;
  markFailed: (message: string) => Promise<void>;
  markUncertain: (message: string) => Promise<void>;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : "Notification failed.";
}

/**
 * A claim is acquired in Postgres before this function is called.  Anything
 * ambiguous after that claim is preserved as `uncertain`; it must be reconciled
 * by a commercial operator and is never retried by a duplicate web request.
 */
export async function deliverClaimedNotification(workflow: NotificationWorkflow): Promise<NotificationOutcome> {
  const claim = await workflow.claim();
  if (claim === "sent") return "duplicate";
  if (claim === "uncertain") return "review_required";
  if (claim === "sending") return "in_progress";

  try {
    const delivery = await workflow.send();
    try {
      await workflow.markSent(delivery);
      return "accepted";
    } catch (error) {
      await workflow.markUncertain(`Gmail accepted the notification but its delivery receipt could not be persisted: ${errorMessage(error)}`);
      return "unavailable";
    }
  } catch (error) {
    const message = errorMessage(error);
    if (error instanceof NotificationRejected) {
      await workflow.markFailed(message);
    } else {
      await workflow.markUncertain(`Notification delivery may have been accepted and requires reconciliation: ${message}`);
    }
    return "unavailable";
  }
}
