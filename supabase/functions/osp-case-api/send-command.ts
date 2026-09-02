import { requireApprovalAuthority } from "../_shared/osp/approval-policy.ts";
import type { ApprovalActor } from "../_shared/osp/approval-types.ts";
import type {
  OutboundSendStore,
  SendReservation,
} from "../osp-worker/outbound-receipt.ts";
import {
  assertRequestSemanticGate,
  type RequestSemanticGate,
} from "../_shared/osp/request-contract.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const OPAQUE = /^[A-Za-z0-9:_-]{1,256}$/;

export type RequestAuthorizedSendInput = Readonly<{
  organizationId: string;
  caseId: string;
  salesAuthorizationId: string;
  payloadSha256: string;
  expectedCaseVersion: number;
  idempotencyKey: string;
  actor: ApprovalActor;
}>;

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const fields = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
    .join(",");
  return `{${fields}}`;
}

export async function authorizedSendCommandHash(
  input: RequestAuthorizedSendInput,
): Promise<string> {
  const copy = {
    actor: input.actor,
    caseId: input.caseId,
    expectedCaseVersion: input.expectedCaseVersion,
    idempotencyKey: input.idempotencyKey,
    organizationId: input.organizationId,
    payloadSha256: input.payloadSha256,
    salesAuthorizationId: input.salesAuthorizationId,
  };
  const bytes = new TextEncoder().encode(canonical(copy));
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  return [...new Uint8Array(digest)].map((value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}

export async function requestAuthorizedSend(
  input: RequestAuthorizedSendInput,
  deps: {
    store: Pick<OutboundSendStore, "reserve">;
    semanticGate?: RequestSemanticGate;
    now?: () => Date;
  },
): Promise<SendReservation> {
  if (
    !input || !UUID.test(input.organizationId) || !UUID.test(input.caseId) ||
    !UUID.test(input.salesAuthorizationId) || !SHA.test(input.payloadSha256) ||
    !Number.isSafeInteger(input.expectedCaseVersion) ||
    input.expectedCaseVersion < 0 ||
    input.expectedCaseVersion > 2_147_483_647 ||
    !OPAQUE.test(input.idempotencyKey) ||
    input.actor?.organizationId !== input.organizationId
  ) throw new Error("OUTBOUND_SEND_INVALID");
  requireApprovalAuthority(
    input.actor,
    "request_authorized_send",
    (deps.now ?? (() => new Date()))(),
  );
  if (deps.semanticGate) {
    await assertRequestSemanticGate(deps.semanticGate, {
      organizationId: input.organizationId,
      caseId: input.caseId,
      stage: "send",
    });
  }
  const commandSha256 = await authorizedSendCommandHash(input);
  return await deps.store.reserve({
    organizationId: input.organizationId,
    caseId: input.caseId,
    salesAuthorizationId: input.salesAuthorizationId,
    payloadSha256: input.payloadSha256,
    expectedCaseVersion: input.expectedCaseVersion,
    idempotencyKey: input.idempotencyKey,
    actorSubject: input.actor.subject,
    actorEmail: input.actor.verifiedEmail,
    actorPermissions: input.actor.permissions,
    actorRole: "carriers_sender",
    authorizationSessionId: input.actor.authorizationSessionId,
    authorizationSessionIssuedAt: input.actor.authorizationSessionIssuedAt,
    commandSha256,
  });
}
