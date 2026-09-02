import { requireApprovalAuthority } from "../_shared/osp/approval-policy.ts";
import type {
  ApprovalActor,
  ApprovalResult,
  ApprovalStore,
} from "../_shared/osp/approval-types.ts";
import type { OutboundKind } from "../_shared/osp/outbound-payload.ts";
import {
  assertRequestSemanticGate,
  type RequestSemanticGate,
} from "../_shared/osp/request-contract.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const OPAQUE = /^[A-Za-z0-9:_-]{1,256}$/;

export type CurrentOutboundAuthorizationPayload = {
  organizationId: string;
  caseId: string;
  payloadId: string;
  kind: OutboundKind;
  caseVersion: number;
  mimeSha256: string;
  attachmentSha256: readonly string[];
};

export interface CurrentOutboundAuthorizationSource {
  resolveCurrent(input: {
    organizationId: string;
    caseId: string;
    payloadId: string;
  }): Promise<CurrentOutboundAuthorizationPayload>;
}

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;

export type AuthorizeOutboundInput = {
  organizationId: string;
  caseId: string;
  payloadId: string;
  payloadSha256: string;
  attachmentSha256: readonly string[];
  expectedCaseVersion: number;
  idempotencyKey: string;
  actor: ApprovalActor;
};

function stale(): never {
  throw new Error("OUTBOUND_AUTHORIZATION_STALE");
}

export async function authorizeOutbound(
  input: AuthorizeOutboundInput,
  deps: {
    payloads: CurrentOutboundAuthorizationSource;
    approvals: ApprovalStore;
    semanticGate?: RequestSemanticGate;
    now?: () => Date;
  },
): Promise<ApprovalResult> {
  if (
    !input || !UUID.test(input.organizationId) || !UUID.test(input.caseId) ||
    !UUID.test(input.payloadId) || !SHA.test(input.payloadSha256) ||
    !Array.isArray(input.attachmentSha256) ||
    input.attachmentSha256.some((hash) =>
      typeof hash !== "string" || !SHA.test(hash)
    ) ||
    !Number.isSafeInteger(input.expectedCaseVersion) ||
    input.expectedCaseVersion < 0 ||
    input.expectedCaseVersion > 2_147_483_647 ||
    !OPAQUE.test(input.idempotencyKey) ||
    input.actor?.organizationId !== input.organizationId
  ) stale();
  requireApprovalAuthority(
    input.actor,
    "authorize_outbound",
    (deps.now ?? (() => new Date()))(),
  );
  return await deps.approvals.transact({
    type: "authorize_outbound",
    organizationId: input.organizationId,
    caseId: input.caseId,
    payloadId: input.payloadId,
    payloadSha256: input.payloadSha256,
    attachmentSha256: Object.freeze([...input.attachmentSha256]),
    expectedCaseVersion: input.expectedCaseVersion,
    idempotencyKey: input.idempotencyKey,
    actor: input.actor,
  }, async () => {
    const current = await deps.payloads.resolveCurrent({
      organizationId: input.organizationId,
      caseId: input.caseId,
      payloadId: input.payloadId,
    });
    if (
      current.organizationId !== input.organizationId ||
      current.caseId !== input.caseId ||
      current.payloadId !== input.payloadId ||
      current.caseVersion !== input.expectedCaseVersion ||
      current.mimeSha256 !== input.payloadSha256 ||
      current.attachmentSha256.length !== input.attachmentSha256.length ||
      current.attachmentSha256.some((hash, index) =>
        hash !== input.attachmentSha256[index]
      )
    ) stale();
    if (current.kind === "final_response" && deps.semanticGate) {
      await assertRequestSemanticGate(deps.semanticGate, {
        organizationId: input.organizationId,
        caseId: input.caseId,
        stage: "sales_authorization",
      });
    }
  });
}

export function createPostgresCurrentOutboundAuthorizationSource(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
}): CurrentOutboundAuthorizationSource {
  const created =
    (options.postgresFactory ?? postgres as unknown as PostgresFactory)(
      options.databaseUrl,
      {
        ssl: "verify-full",
        fetch_types: false,
        prepare: false,
        max: 1,
        connect_timeout: 5,
        connection: {
          application_name: "osp-outbound-authorization",
          statement_timeout: "3000",
        },
      },
    );
  if (typeof created !== "function") {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  const sql = created as SqlPort;
  const source: CurrentOutboundAuthorizationSource = {
    resolveCurrent: async (
      input: { organizationId: string; caseId: string; payloadId: string },
    ) =>
      await withOrganizationTransaction(
        sql,
        input.organizationId,
        async (tx) => {
          const rows =
            await tx`select payload.organization_id, payload.case_id, payload.id, payload.payload_kind, payload.case_version, payload.canonical_sha256, to_jsonb(payload.attachment_sha256s) as attachment_sha256s from osp_private.outbound_payloads payload join osp_private.outbound_drafts draft on draft.organization_id = payload.organization_id and draft.case_id = payload.case_id and draft.id = payload.draft_id and draft.payload_kind = payload.payload_kind join osp_private.customer_registration_cases case_record on case_record.organization_id = payload.organization_id and case_record.id = payload.case_id and case_record.aggregate_version = payload.case_version where payload.organization_id = ${input.organizationId} and payload.case_id = ${input.caseId} and payload.id = ${input.payloadId} and payload.status = 'frozen' and draft.version = (select max(latest.version) from osp_private.outbound_drafts latest where latest.organization_id = draft.organization_id and latest.case_id = draft.case_id and latest.payload_kind = draft.payload_kind)`;
          if (rows.length !== 1) {
            throw new Error("OUTBOUND_AUTHORIZATION_STALE");
          }
          const row = rows[0];
          const caseVersion = Number(row.case_version);
          if (
            row.organization_id !== input.organizationId ||
            row.case_id !== input.caseId ||
            row.id !== input.payloadId ||
            (row.payload_kind !== "clarification" &&
              row.payload_kind !== "final_response") ||
            !Number.isSafeInteger(caseVersion) || caseVersion < 0 ||
            typeof row.canonical_sha256 !== "string" ||
            !SHA.test(row.canonical_sha256) ||
            !Array.isArray(row.attachment_sha256s) ||
            row.attachment_sha256s.some((hash) =>
              typeof hash !== "string" || !SHA.test(hash)
            )
          ) throw new Error("OUTBOUND_AUTHORIZATION_STALE");
          return Object.freeze({
            organizationId: input.organizationId,
            caseId: input.caseId,
            payloadId: input.payloadId,
            kind: row.payload_kind,
            caseVersion,
            mimeSha256: row.canonical_sha256,
            attachmentSha256: Object.freeze([
              ...(row.attachment_sha256s as string[]),
            ]),
          });
        },
      ),
  };
  return Object.freeze(source);
}
import postgres from "postgres";

import {
  type SqlPort,
  withOrganizationTransaction,
} from "../_shared/osp/database-context.ts";
