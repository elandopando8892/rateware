import postgres from "postgres";

import { createPostgresApprovalStore } from "../_shared/osp/approval-store.ts";
import type {
  ApprovalActor,
  ApprovalResult,
} from "../_shared/osp/approval-types.ts";
import {
  type SqlPort,
  withOrganizationTransaction,
} from "../_shared/osp/database-context.ts";
import type {
  VerifiedApprovalIdentity,
  VerifiedWorkflowIdentity,
} from "../_shared/osp/workflow-authority.ts";
import {
  completeOperationsReview,
  type CurrentPackageSnapshotSource,
} from "./operations-review.ts";
import {
  approveAndApplySignature,
  type SignatureVaultPolicySource,
} from "./signature-approval.ts";
import {
  createOutboundStoragePorts,
  createPostgresOutboundDraftStore,
  createTenantAttachmentObjectPort,
  type FreezeOutboundCommand,
  freezeOutboundDraft,
  type FrozenOutboundRecord,
  type OutboundStorageClient,
  type SavedOutboundDraftInput,
  saveOutboundDraft,
} from "./outbound-draft.ts";
import {
  authorizeOutbound,
  type AuthorizeOutboundInput,
  createPostgresCurrentOutboundAuthorizationSource,
  type CurrentOutboundAuthorizationSource,
} from "./sales-authorization.ts";
import type { OutboundDraftRecordStore } from "./outbound-draft.ts";
import type {
  OutboundAttachmentObjectPort,
  OutboundMimeObjectPort,
} from "./outbound-draft.ts";
import type { ApprovalStore } from "../_shared/osp/approval-types.ts";
import {
  requestAuthorizedSend,
  type RequestAuthorizedSendInput,
} from "./send-command.ts";
import {
  createPostgresOutboundSendStore,
  type OutboundSendStore,
  type SendReservation,
} from "../osp-worker/outbound-receipt.ts";
import type { RequestSemanticGate } from "../_shared/osp/request-contract.ts";
import { createPostgresRequestSemanticGate } from "./request-semantic-gate.ts";

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;

export type OperationsReviewActionInput = {
  caseId: string;
  expectedCaseVersion: number;
  inputSnapshotSha256: string;
  idempotencyKey: string;
};
export type SignatureApprovalActionInput = OperationsReviewActionInput & {
  signaturePositionVersion: number;
};

export interface CaseApprovalActions {
  completeOperations(
    input: OperationsReviewActionInput,
    identity: VerifiedApprovalIdentity,
  ): Promise<ApprovalResult>;
  approveSignature(
    input: SignatureApprovalActionInput,
    identity: VerifiedApprovalIdentity,
  ): Promise<ApprovalResult>;
}

export interface CaseOutboundActions {
  saveDraft(
    input: Omit<SavedOutboundDraftInput, "createdBySubject">,
    identity: VerifiedWorkflowIdentity,
  ): Promise<
    {
      payloadId: string;
      kind: "clarification" | "final_response";
      caseVersion: number;
    }
  >;
  freezePayload(
    input: FreezeOutboundCommand,
    identity: VerifiedWorkflowIdentity,
  ): Promise<FrozenOutboundRecord>;
  authorizePayload(
    input: Omit<AuthorizeOutboundInput, "actor">,
    identity: VerifiedApprovalIdentity,
  ): Promise<ApprovalResult>;
  requestSend(
    input: Omit<RequestAuthorizedSendInput, "actor">,
    identity: VerifiedApprovalIdentity,
  ): Promise<SendReservation>;
}

function actor(
  identity: VerifiedApprovalIdentity,
  role: ApprovalActor["role"],
): ApprovalActor {
  return Object.freeze({
    organizationId: identity.identity.organization,
    subject: identity.identity.subject,
    verifiedEmail: identity.identity.email,
    permissions: identity.permissions,
    role,
    authorizationSessionId: identity.authorizationSessionId,
    authorizationSessionIssuedAt: identity.authorizationSessionIssuedAt,
    active: identity.identity.emailVerified,
  });
}

export function createCaseApprovalActions(deps: {
  snapshots: CurrentPackageSnapshotSource;
  signaturePolicies: SignatureVaultPolicySource;
  approvals: ReturnType<typeof createPostgresApprovalStore>;
  semanticGate?: RequestSemanticGate;
  now?: () => Date;
}): CaseApprovalActions {
  return Object.freeze({
    completeOperations: async (
      input: OperationsReviewActionInput,
      identity: VerifiedApprovalIdentity,
    ) =>
      await completeOperationsReview({
        organizationId: identity.identity.organization,
        caseId: input.caseId,
        expectedCaseVersion: input.expectedCaseVersion,
        expectedSnapshotSha256: input.inputSnapshotSha256,
        idempotencyKey: input.idempotencyKey,
        actor: actor(identity, "operations_reviewer"),
      }, {
        snapshots: deps.snapshots,
        approvals: deps.approvals,
        semanticGate: deps.semanticGate,
      }),
    approveSignature: async (
      input: SignatureApprovalActionInput,
      identity: VerifiedApprovalIdentity,
    ) =>
      await approveAndApplySignature({
        organizationId: identity.identity.organization,
        caseId: input.caseId,
        inputSnapshotSha256: input.inputSnapshotSha256,
        signaturePositionVersion: input.signaturePositionVersion,
        expectedCaseVersion: input.expectedCaseVersion,
        idempotencyKey: input.idempotencyKey,
        actor: actor(identity, "signature_approver"),
      }, {
        policy: deps.signaturePolicies,
        approvals: deps.approvals,
        semanticGate: deps.semanticGate,
        now: deps.now,
      }),
  });
}

function requireOperate(identity: VerifiedWorkflowIdentity): void {
  const separatedPermissions = new Set([
    "osp:operate",
    "osp:signature-approve",
    "osp:sales-authorize",
    "osp:send-authorized",
    "osp:superuser",
  ]);
  const authority = identity.permissions.filter((permission) =>
    separatedPermissions.has(permission)
  );
  if (
    !identity.identity.emailVerified ||
    authority.length !== 1 ||
    (authority[0] !== "osp:operate" && authority[0] !== "osp:superuser")
  ) throw new Error("APPROVAL_FORBIDDEN");
}

export function createCaseOutboundActions(deps: {
  store: OutboundDraftRecordStore;
  attachments: OutboundAttachmentObjectPort;
  objects: OutboundMimeObjectPort;
  payloads: CurrentOutboundAuthorizationSource;
  approvals: ApprovalStore;
  sendStore: Pick<OutboundSendStore, "reserve">;
  semanticGate?: RequestSemanticGate;
  now?: () => Date;
}): CaseOutboundActions {
  const actions: CaseOutboundActions = {
    saveDraft: async (
      input: Omit<SavedOutboundDraftInput, "createdBySubject">,
      identity: VerifiedWorkflowIdentity,
    ) => {
      requireOperate(identity);
      if (input.organizationId !== identity.identity.organization) {
        throw new Error("APPROVAL_FORBIDDEN");
      }
      const saved = await saveOutboundDraft({
        ...input,
        createdBySubject: identity.identity.subject,
      }, { store: deps.store, semanticGate: deps.semanticGate });
      return Object.freeze({
        payloadId: saved.payloadId,
        kind: saved.kind,
        caseVersion: saved.caseVersion,
      });
    },
    freezePayload: async (
      input: FreezeOutboundCommand,
      identity: VerifiedWorkflowIdentity,
    ) => {
      requireOperate(identity);
      if (input.organizationId !== identity.identity.organization) {
        throw new Error("APPROVAL_FORBIDDEN");
      }
      return await freezeOutboundDraft(input, {
        store: deps.store,
        attachments: deps.attachments,
        objects: deps.objects,
        semanticGate: deps.semanticGate,
      });
    },
    authorizePayload: async (
      input: Omit<AuthorizeOutboundInput, "actor">,
      identity: VerifiedApprovalIdentity,
    ) =>
      await authorizeOutbound({
        ...input,
        actor: actor(identity, "sales_authorizer"),
      }, {
        payloads: deps.payloads,
        approvals: deps.approvals,
        semanticGate: deps.semanticGate,
        now: deps.now,
      }),
    requestSend: async (
      input: Omit<RequestAuthorizedSendInput, "actor">,
      identity: VerifiedApprovalIdentity,
    ) =>
      await requestAuthorizedSend({
        ...input,
        actor: actor(identity, "carriers_sender"),
      }, {
        store: deps.sendStore,
        semanticGate: deps.semanticGate,
        now: deps.now,
      }),
  };
  return Object.freeze(actions);
}

function sqlClient(
  databaseUrl: string,
  postgresFactory?: PostgresFactory,
): SqlPort {
  const created = (postgresFactory ?? postgres as unknown as PostgresFactory)(
    databaseUrl,
    {
      ssl: "verify-full",
      fetch_types: false,
      prepare: false,
      max: 1,
      connect_timeout: 5,
      connection: {
        application_name: "osp-case-approval-actions",
        statement_timeout: "3000",
      },
    },
  );
  if (typeof created !== "function") {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  return created as SqlPort;
}

export function createPostgresOperationsSnapshotSource(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
}): CurrentPackageSnapshotSource {
  const sql = sqlClient(options.databaseUrl, options.postgresFactory);
  return Object.freeze({
    rebuildCurrent: async (
      input: {
        organizationId: string;
        caseId: string;
        expectedCaseVersion: number;
      },
    ) =>
      await withOrganizationTransaction(
        sql,
        input.organizationId,
        async (tx) => {
          await tx`set local statement_timeout = '3000ms'`;
          const rows =
            await tx`select canonical_sha256 from osp_private.assert_current_package_snapshot(${input.organizationId}, ${input.caseId}, ${input.expectedCaseVersion})`;
          if (
            rows.length !== 1 || typeof rows[0].canonical_sha256 !== "string"
          ) throw new Error("SNAPSHOT_REBUILD_FAILED");
          return Object.freeze({ canonicalSha256: rows[0].canonical_sha256 });
        },
      ),
  });
}

export function createPostgresSignatureVaultPolicySource(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
}): SignatureVaultPolicySource {
  const sql = sqlClient(options.databaseUrl, options.postgresFactory);
  return Object.freeze({
    resolveActive: async (input: { organizationId: string; caseId: string }) =>
      await withOrganizationTransaction(
        sql,
        input.organizationId,
        async (tx) => {
          await tx`set local statement_timeout = '3000ms'`;
          const rows = await tx`
            select policy.vault_ref,
                   coalesce(pdf_position.version, xlsx_position.version) as position_version
            from osp_private.signature_vault_policies policy
            left join osp_private.signature_positions pdf_position
              on pdf_position.organization_id = policy.organization_id
             and pdf_position.id = policy.signature_position_id
             and pdf_position.active = true
            left join osp_private.signature_xlsx_positions xlsx_position
              on xlsx_position.organization_id = policy.organization_id
             and xlsx_position.id = policy.signature_xlsx_position_id
             and xlsx_position.active = true
            where policy.organization_id = ${input.organizationId}
              and policy.active = true
              and (pdf_position.id is not null)::integer +
                  (xlsx_position.id is not null)::integer = 1
            limit 2`;
          if (
            rows.length !== 1 || typeof rows[0].vault_ref !== "string" ||
            !Number.isSafeInteger(Number(rows[0].position_version))
          ) throw new Error("SIGNATURE_POLICY_INVALID");
          return Object.freeze({
            vaultRef: rows[0].vault_ref,
            positionVersion: Number(rows[0].position_version),
          });
        },
      ),
  });
}

export function createPostgresCaseApprovalActions(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
  now?: () => Date;
}): CaseApprovalActions {
  const factory = options.postgresFactory ??
    postgres as unknown as PostgresFactory;
  let supportDatabase: unknown;
  const supportFactory: PostgresFactory = (url, config) =>
    supportDatabase ??= factory(url, config);
  return createCaseApprovalActions({
    snapshots: createPostgresOperationsSnapshotSource({
      ...options,
      postgresFactory: supportFactory,
    }),
    signaturePolicies: createPostgresSignatureVaultPolicySource({
      ...options,
      postgresFactory: supportFactory,
    }),
    approvals: createPostgresApprovalStore({
      ...options,
      postgresFactory: factory,
    }),
    semanticGate: createPostgresRequestSemanticGate({
      ...options,
      postgresFactory: supportFactory,
    }),
    now: options.now,
  });
}

export function createPostgresCaseOutboundActions(options: {
  databaseUrl: string;
  storageClient: OutboundStorageClient;
  postgresFactory?: PostgresFactory;
  attachmentPostgresFactory?: PostgresFactory;
  authorizationPostgresFactory?: PostgresFactory;
  now?: () => Date;
}): CaseOutboundActions {
  const store = createPostgresOutboundDraftStore(options);
  const storage = createOutboundStoragePorts(options.storageClient);
  return createCaseOutboundActions({
    store,
    attachments: createTenantAttachmentObjectPort({
      ...options,
      postgresFactory: options.attachmentPostgresFactory ??
        options.postgresFactory,
    }),
    objects: storage.objects,
    payloads: createPostgresCurrentOutboundAuthorizationSource({
      ...options,
      postgresFactory: options.authorizationPostgresFactory ??
        options.postgresFactory,
    }),
    approvals: createPostgresApprovalStore(options),
    sendStore: createPostgresOutboundSendStore(options),
    semanticGate: createPostgresRequestSemanticGate({
      ...options,
      postgresFactory: options.authorizationPostgresFactory ??
        options.postgresFactory,
    }),
    now: options.now,
  });
}
