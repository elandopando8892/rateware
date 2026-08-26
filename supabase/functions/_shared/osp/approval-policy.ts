import type { ApprovalActor, ApprovalCommandType } from "./approval-types.ts";

const SUBJECT = /^[A-Za-z0-9:_@.-]{1,256}$/;
const SESSION = /^[A-Za-z0-9:_-]{1,256}$/;
const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+$/;
const FRESH_SESSION_MS = 5 * 60 * 1000;
const CLOCK_SKEW_MS = 30 * 1000;
const CONSEQUENTIAL = new Set([
  "osp:operate",
  "osp:signature-approve",
  "osp:sales-authorize",
  "osp:send-authorized",
]);

const POLICY: Readonly<
  Record<
    ApprovalCommandType,
    { role: ApprovalActor["role"]; email?: string; permission: string }
  >
> = Object.freeze({
  complete_operations_review: {
    role: "operations_reviewer",
    permission: "osp:operate",
  },
  approve_signature: {
    role: "signature_approver",
    email: "jgonzalez@xbfreight.com",
    permission: "osp:signature-approve",
  },
  authorize_outbound: {
    role: "sales_authorizer",
    email: "sales@heymarksman.com",
    permission: "osp:sales-authorize",
  },
  request_authorized_send: {
    role: "carriers_sender",
    email: "carriers@xbfreight.com",
    permission: "osp:send-authorized",
  },
});

function fail(): never {
  throw new Error("APPROVAL_FORBIDDEN");
}

export function requireApprovalAuthority(
  actor: ApprovalActor,
  commandType: ApprovalCommandType,
  now = new Date(),
): ApprovalActor {
  const rule = POLICY[commandType];
  const actorKeys = actor && typeof actor === "object"
    ? Object.keys(actor).sort()
    : [];
  const expectedActorKeys = [
    "active",
    "authorizationSessionId",
    "authorizationSessionIssuedAt",
    "organizationId",
    "permissions",
    "role",
    "subject",
    "verifiedEmail",
  ];
  if (
    !actor || actor.active !== true || !rule ||
    actorKeys.length !== expectedActorKeys.length ||
    actorKeys.some((key, index) => key !== expectedActorKeys[index]) ||
    typeof actor.organizationId !== "string" || actor.organizationId === "" ||
    typeof actor.subject !== "string" || !SUBJECT.test(actor.subject) ||
    typeof actor.verifiedEmail !== "string" ||
    actor.verifiedEmail !== actor.verifiedEmail.toLowerCase() ||
    !EMAIL.test(actor.verifiedEmail) || actor.role !== rule.role ||
    typeof actor.authorizationSessionId !== "string" ||
    !SESSION.test(actor.authorizationSessionId) ||
    typeof actor.authorizationSessionIssuedAt !== "string" ||
    !Array.isArray(actor.permissions) || actor.permissions.length < 1 ||
    actor.permissions.some((permission) =>
      typeof permission !== "string" || permission.trim() !== permission ||
      permission.length < 1 || permission.length > 128
    ) || new Set(actor.permissions).size !== actor.permissions.length ||
    !actor.permissions.includes(rule.permission) ||
    (rule.email !== undefined && actor.verifiedEmail !== rule.email) ||
    !(now instanceof Date) || Number.isNaN(now.getTime())
  ) fail();

  const consequential = actor.permissions.filter((permission) =>
    CONSEQUENTIAL.has(permission)
  );
  if (consequential.length !== 1 || consequential[0] !== rule.permission) {
    fail();
  }

  const issuedAt = new Date(actor.authorizationSessionIssuedAt);
  const age = now.getTime() - issuedAt.getTime();
  if (
    Number.isNaN(issuedAt.getTime()) ||
    issuedAt.toISOString() !== actor.authorizationSessionIssuedAt ||
    age < -CLOCK_SKEW_MS || age > FRESH_SESSION_MS
  ) fail();
  return actor;
}
