import postgres from "postgres";

import {
  type SqlPort,
  type SqlRow,
  withOrganizationTransaction,
} from "../_shared/osp/database-context.ts";
import {
  deriveReplyContext,
  isReplyMessageId,
  type ReplyContext,
} from "../_shared/osp/reply-context.ts";
import type { VerifiedWorkflowIdentity } from "../_shared/osp/workflow-authority.ts";
import type {
  RequestFulfillmentMatrix,
  RequestSemanticGate,
} from "../_shared/osp/request-contract.ts";

const GMAIL_ID = /^[A-Za-z0-9_-]{1,256}$/;

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;
type CaseState =
  | "received"
  | "analyzing_requirements"
  | "awaiting_clarification"
  | "awaiting_xbf_information"
  | "preparing"
  | "operations_review"
  | "signature_approval"
  | "sales_authorization"
  | "ready_to_send"
  | "sent"
  | "manual_reconciliation_required"
  | "accepted"
  | "rejected"
  | "closed";
type InputSnapshot = {
  sha256: string;
  documentCount: number;
  extractionCount: number;
  reviewDecisionCount: number;
  formInstanceVersion: number;
};
type SignatureView = {
  positionVersion: number;
  approvalStatus: "pending" | "approved";
  approvalId: string | null;
  outputSha256: string | null;
};
type SupplierPackageView = {
  packageId: string;
  version: number;
  outputSha256: string;
  contentType:
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  downloadUrl: string | null;
  objectId: string;
};
type SignedPackageView = {
  packageId: string;
  outputSha256: string;
  contentType:
    | "application/pdf"
    | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
};
type ReplyContextView = ReplyContext;
type OutboundAttachmentView = {
  name: string;
  contentType:
    | "application/pdf"
    | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    | "application/vnd.ms-excel.sheet.macroEnabled.12"
    | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    | "image/jpeg"
    | "image/png"
    | "image/tiff";
  sha256: string;
};
type OutboundView = {
  payloadId: string;
  kind: "clarification" | "final_response";
  status:
    | "draft"
    | "frozen"
    | "authorized"
    | "send_pending"
    | "sent"
    | "failed"
    | "manual_reconciliation_required";
  caseVersion: number;
  from: "carriers@xbfreight.com";
  to: readonly string[];
  cc: readonly string[];
  subject: string;
  inReplyTo: string | null;
  references: readonly string[];
  bodyText: string;
  attachments: readonly OutboundAttachmentView[];
  attachmentSha256: readonly string[];
  mimeSha256: string | null;
  salesAuthorizationId: string | null;
  sendOutcome:
    | "reserved"
    | "sent"
    | "failed"
    | "manual_reconciliation_required"
    | null;
};

export type WorkflowViewRecord = {
  organizationId: string;
  caseId: string;
  caseVersion: number;
  caseState: CaseState;
  inputSnapshot: InputSnapshot | null;
  supplierPackage?: SupplierPackageView | null;
  signedPackage?: SignedPackageView | null;
  replyContext: ReplyContextView | null;
  signature: SignatureView | null;
  outbound: OutboundView | null;
  outboundIsLatest?: boolean;
  fulfillment?: RequestFulfillmentMatrix;
};

export type WorkflowViewSource = {
  load(
    input: { organizationId: string; caseId: string; payloadId: string | null },
  ): Promise<WorkflowViewRecord>;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ATTACHMENT_NAME = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/;
const ATTACHMENT_CONTENT_TYPES = new Set<OutboundAttachmentView["contentType"]>([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/tiff",
]);
const STATES = new Set<CaseState>([
  "received",
  "analyzing_requirements",
  "awaiting_clarification",
  "awaiting_xbf_information",
  "preparing",
  "operations_review",
  "signature_approval",
  "sales_authorization",
  "ready_to_send",
  "sent",
  "manual_reconciliation_required",
  "accepted",
  "rejected",
  "closed",
]);
const AUTHORITY_PERMISSIONS = new Set([
  "osp:operate",
  "osp:signature-approve",
  "osp:sales-authorize",
  "osp:send-authorized",
  "osp:superuser",
]);

function fail(): never {
  throw new Error("WORKFLOW_VIEW_INVALID");
}
function integer(value: unknown, minimum = 0): number {
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) || parsed < minimum || parsed > 2_147_483_647
  ) fail();
  return parsed;
}
function optionalUuid(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !UUID.test(value)) fail();
  return value;
}
function optionalSha(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !SHA.test(value)) fail();
  return value;
}
function optionalHttpsUrl(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") fail();
  try {
    const url = new URL(value);
    const local = url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname);
    if ((!local && url.protocol !== "https:") || url.username || url.password) {
      fail();
    }
    return url.toString();
  } catch {
    fail();
  }
}
function recipients(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 50) fail();
  const values = value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) fail();
    const row = item as Record<string, unknown>;
    if (typeof row.email !== "string" || !EMAIL.test(row.email)) fail();
    return row.email.toLowerCase();
  });
  if (new Set(values).size !== values.length) fail();
  return Object.freeze(values);
}
function hashes(value: unknown): readonly string[] {
  if (
    !Array.isArray(value) || value.length > 100 ||
    value.some((hash) => typeof hash !== "string" || !SHA.test(hash))
  ) fail();
  return Object.freeze([...value] as string[]);
}
function attachmentDetails(
  value: unknown,
  expectedHashes: readonly string[],
): readonly OutboundAttachmentView[] {
  if (!Array.isArray(value) || value.length !== expectedHashes.length || value.length > 100) {
    fail();
  }
  const names = new Set<string>();
  return Object.freeze(value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) fail();
    const row = item as Record<string, unknown>;
    if (
      typeof row.name !== "string" || row.name !== row.name.normalize("NFC") ||
      !ATTACHMENT_NAME.test(row.name) || names.has(row.name.toLowerCase()) ||
      typeof row.contentType !== "string" ||
      !ATTACHMENT_CONTENT_TYPES.has(row.contentType as OutboundAttachmentView["contentType"]) ||
      typeof row.sha256 !== "string" || row.sha256 !== expectedHashes[index]
    ) fail();
    names.add(row.name.toLowerCase());
    return Object.freeze({
      name: row.name,
      contentType: row.contentType as OutboundAttachmentView["contentType"],
      sha256: row.sha256,
    });
  }));
}
function messageIds(value: unknown): readonly string[] {
  if (
    !Array.isArray(value) || value.length > 50 ||
    value.some((messageId) => !isReplyMessageId(messageId)) ||
    new Set(value).size !== value.length
  ) fail();
  return Object.freeze([...value] as string[]);
}

function replyContext(row: SqlRow): ReplyContextView | null {
  if (
    typeof row.reply_gmail_thread_id !== "string" ||
    !GMAIL_ID.test(row.reply_gmail_thread_id)
  ) return null;
  return deriveReplyContext({
    senderEmail: row.reply_sender_email,
    internetMessageId: row.reply_internet_message_id,
    subject: row.reply_original_subject,
    to: row.reply_original_to,
    cc: row.reply_original_cc,
  });
}

function parseRow(
  row: SqlRow,
  organizationId: string,
  caseId: string,
): WorkflowViewRecord {
  if (
    row.organization_id !== organizationId || row.case_id !== caseId ||
    typeof row.case_state !== "string" ||
    !STATES.has(row.case_state as CaseState)
  ) fail();
  const snapshot =
    row.snapshot_sha256 === null || row.snapshot_sha256 === undefined ? null : {
      sha256: optionalSha(row.snapshot_sha256) ?? fail(),
      documentCount: integer(row.document_count),
      extractionCount: integer(row.extraction_count),
      reviewDecisionCount: integer(row.review_decision_count),
      formInstanceVersion: integer(row.form_instance_version, 1),
    };
  const approvalId = optionalUuid(row.signature_approval_id);
  const packageId = optionalUuid(row.supplier_package_id);
  const supplierPackage = packageId === null ? null : {
    packageId,
    version: integer(row.supplier_package_version, 1),
    outputSha256: optionalSha(row.supplier_package_sha256) ?? fail(),
    contentType: row.supplier_package_content_type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const
      : fail(),
    downloadUrl: optionalHttpsUrl(row.supplier_package_download_url),
    objectId: typeof row.supplier_package_object_id === "string"
      ? row.supplier_package_object_id
      : fail(),
  };
  const signedPackageId = optionalUuid(row.signed_package_id);
  const signedPackage = signedPackageId === null ? null : {
    packageId: signedPackageId,
    outputSha256: optionalSha(row.signature_output_sha256) ?? fail(),
    contentType: row.signed_package_content_type === "application/pdf"
      ? "application/pdf" as const
      : row.signed_package_content_type ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const
      : fail(),
  };
  const parsedReplyContext = replyContext(row);
  const signaturePositionVersion = row.signature_position_version ??
    row.signature_policy_position_version;
  const signature =
    signaturePositionVersion === null || signaturePositionVersion === undefined
      ? null
      : {
        positionVersion: integer(signaturePositionVersion, 1),
        approvalStatus: approvalId === null
          ? "pending" as const
          : row.signature_status === "applied"
          ? "approved" as const
          : row.signature_status === "pending"
          ? "pending" as const
          : fail(),
        approvalId,
        outputSha256: optionalSha(row.signature_output_sha256),
      };
  const parsedPayloadId = optionalUuid(row.payload_id);
  let outbound: OutboundView | null = null;
  if (parsedPayloadId !== null) {
    if (
      (row.payload_kind !== "clarification" &&
        row.payload_kind !== "final_response") ||
      row.from_email !== "carriers@xbfreight.com" ||
      typeof row.subject !== "string" || row.subject.length < 1 ||
      (row.in_reply_to !== null && row.in_reply_to !== undefined &&
        (typeof row.in_reply_to !== "string" ||
          !isReplyMessageId(row.in_reply_to))) ||
      typeof row.body_text !== "string" || row.body_text.length < 1 ||
      row.body_text.length > 100_000
    ) fail();
    if (typeof row.payload_is_latest !== "boolean") fail();
    const rawOutcome = row.send_outcome;
    const sendOutcome = rawOutcome === null || rawOutcome === undefined
      ? null
      : rawOutcome === "sent"
      ? "sent" as const
      : rawOutcome === "reserved" || rawOutcome === "sending"
      ? "reserved" as const
      : rawOutcome === "failed"
      ? "failed" as const
      : rawOutcome === "manual_reconciliation_required"
      ? "manual_reconciliation_required" as const
      : fail();
    const authorizationId = optionalUuid(row.sales_authorization_id);
    const mimeSha256 = optionalSha(row.mime_sha256);
    const status = sendOutcome === "sent"
      ? "sent" as const
      : sendOutcome === "manual_reconciliation_required"
      ? "manual_reconciliation_required" as const
      : sendOutcome === "failed"
      ? "failed" as const
      : sendOutcome === "reserved"
      ? "send_pending" as const
      : authorizationId
      ? "authorized" as const
      : mimeSha256
      ? "frozen" as const
      : "draft" as const;
    const attachmentSha256 = hashes(row.attachment_sha256s ?? []);
    outbound = {
      payloadId: parsedPayloadId,
      kind: row.payload_kind,
      status,
      caseVersion: integer(row.payload_case_version),
      from: "carriers@xbfreight.com",
      to: recipients(row.to_recipients),
      cc: recipients(row.cc_recipients),
      subject: row.subject,
      inReplyTo: typeof row.in_reply_to === "string" ? row.in_reply_to : null,
      references: messageIds(row.references_header ?? []),
      bodyText: row.body_text,
      attachments: attachmentDetails(row.attachment_details ?? [], attachmentSha256),
      attachmentSha256,
      mimeSha256,
      salesAuthorizationId: authorizationId,
      sendOutcome,
    };
  }
  return Object.freeze({
    organizationId,
    caseId,
    caseVersion: integer(row.case_version),
    caseState: row.case_state as CaseState,
    inputSnapshot: snapshot ? Object.freeze(snapshot) : null,
    supplierPackage: supplierPackage ? Object.freeze(supplierPackage) : null,
    signedPackage: signedPackage ? Object.freeze(signedPackage) : null,
    replyContext: parsedReplyContext,
    signature: signature ? Object.freeze(signature) : null,
    outbound: outbound ? Object.freeze(outbound) : null,
    outboundIsLatest: outbound ? row.payload_is_latest as boolean : true,
  });
}

export function approvalCommunicationsWorkspace(
  record: WorkflowViewRecord,
  identity: VerifiedWorkflowIdentity,
) {
  if (
    record.organizationId !== identity.identity.organization ||
    !identity.identity.emailVerified
  ) fail();
  const authorityPermissions = identity.permissions.filter((permission) =>
    AUTHORITY_PERMISSIONS.has(permission)
  );
  const superuser = authorityPermissions.length === 1 &&
    authorityPermissions[0] === "osp:superuser" &&
    identity.identity.email === "sales@heymarksman.com";
  const operations = superuser || authorityPermissions.length === 1 &&
      authorityPermissions[0] === "osp:operate";
  const jose = superuser || authorityPermissions.length === 1 &&
      authorityPermissions[0] === "osp:signature-approve" &&
      identity.identity.email === "jgonzalez@xbfreight.com";
  const sales = superuser || authorityPermissions.length === 1 &&
      authorityPermissions[0] === "osp:sales-authorize" &&
      identity.identity.email === "sales@heymarksman.com";
  const carriers = superuser || authorityPermissions.length === 1 &&
      authorityPermissions[0] === "osp:send-authorized" &&
      identity.identity.email === "carriers@xbfreight.com";
  const outboundWritableCurrent = record.outbound !== null &&
    record.outbound.caseVersion === record.caseVersion &&
    record.outboundIsLatest !== false;
  const authorizedSendCurrent = record.outbound !== null && (
    record.outbound.caseVersion + 1 === record.caseVersion ||
    (record.outbound.status === "failed" &&
      record.outbound.sendOutcome === "failed")
  );
  // Undefined is retained only for isolated legacy fixtures. The production
  // source always loads a matrix and fails closed if it cannot be evaluated.
  const semanticReady = record.fulfillment === undefined
    ? true
    : record.fulfillment.blockingCount === 0;
  const exactFinalPackage = record.outbound === null ||
    record.outbound.kind !== "final_response" ||
    record.outbound.attachments.length > 0;
  return Object.freeze({
    caseId: record.caseId,
    caseVersion: record.caseVersion,
    caseState: record.caseState,
    inputSnapshot: record.inputSnapshot,
    supplierPackage: record.supplierPackage
      ? Object.freeze({
        packageId: record.supplierPackage.packageId,
        version: record.supplierPackage.version,
        outputSha256: record.supplierPackage.outputSha256,
        contentType: record.supplierPackage.contentType,
        downloadUrl: record.supplierPackage.downloadUrl,
      })
      : null,
    signedPackage: record.signedPackage
      ? Object.freeze({
        packageId: record.signedPackage.packageId,
        outputSha256: record.signedPackage.outputSha256,
        contentType: record.signedPackage.contentType,
      })
      : null,
    replyContext: record.replyContext,
    signature: record.signature,
    outbound: record.outbound,
    fulfillment: record.fulfillment ?? null,
    capabilities: Object.freeze({
      saveOutboundDraft: operations &&
        record.fulfillment?.gates.outboundDraft !== false &&
        record.caseState === "sales_authorization" &&
        record.inputSnapshot !== null && record.signedPackage !== null &&
        record.signedPackage !== undefined && record.replyContext !== null &&
        (record.outbound === null ||
          (outboundWritableCurrent &&
            record.outbound.kind === "final_response" &&
            record.outbound.status === "draft")),
      completeOperationsReview: operations &&
        record.fulfillment?.gates.operationsReview !== false &&
        record.caseState === "operations_review" &&
        record.inputSnapshot !== null && record.supplierPackage !== null &&
        record.supplierPackage !== undefined,
      approveAndApplySignature: jose &&
        record.fulfillment?.gates.signatureApproval !== false &&
        record.caseState === "signature_approval" &&
        record.inputSnapshot !== null && record.signature !== null &&
        record.signature.approvalId === null,
      freezeOutboundPayload: operations && outboundWritableCurrent &&
        semanticReady && exactFinalPackage &&
        record.fulfillment?.gates.outboundFreeze !== false &&
        record.outbound?.status === "draft" &&
        (
          (record.outbound.kind === "clarification" &&
            record.caseState === "awaiting_clarification") ||
          (record.outbound.kind === "final_response" &&
            record.caseState === "sales_authorization")
        ),
      authorizeOutboundPayload: sales && outboundWritableCurrent &&
        semanticReady && exactFinalPackage &&
        record.fulfillment?.gates.salesAuthorization !== false &&
        record.outbound?.status === "frozen" &&
        (
          (record.outbound.kind === "clarification" &&
            record.caseState === "awaiting_clarification") ||
          (record.outbound.kind === "final_response" &&
            record.caseState === "sales_authorization")
        ),
      requestAuthorizedSend: carriers && authorizedSendCurrent &&
        semanticReady && exactFinalPackage &&
        record.fulfillment?.gates.send !== false &&
        record.caseState === "ready_to_send" &&
        (record.outbound?.status === "authorized" ||
          record.outbound?.status === "failed") &&
        record.outbound.salesAuthorizationId !== null,
    }),
  });
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
        application_name: "osp-case-workflow-view",
        statement_timeout: "3000",
      },
    },
  );
  if (typeof created !== "function") {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  return created as SqlPort;
}

export function createPostgresWorkflowViewSource(
  options: {
    databaseUrl: string;
    postgresFactory?: PostgresFactory;
    signSupplierPackage?: (objectId: string) => Promise<string>;
    semanticGate?: RequestSemanticGate;
  },
): WorkflowViewSource {
  const sql = sqlClient(options.databaseUrl, options.postgresFactory);
  return Object.freeze({
    load: async ({ organizationId, caseId, payloadId }) => {
      const record = await withOrganizationTransaction(
        sql,
        organizationId,
        async (tx) => {
          await tx`set local statement_timeout = '3000ms'`;
          const rows = await tx`
        select case_record.organization_id, case_record.id as case_id,
               case_record.aggregate_version as case_version, case_record.state as case_state,
               snapshot.canonical_sha256 as snapshot_sha256,
               cardinality(snapshot.document_version_ids) as document_count,
               cardinality(snapshot.extraction_ids) as extraction_count,
               cardinality(snapshot.review_decision_ids) as review_decision_count,
               snapshot.form_instance_version,
               supplier_package.id as supplier_package_id,
               supplier_package.version as supplier_package_version,
               supplier_package.output_sha256 as supplier_package_sha256,
               supplier_package.content_type as supplier_package_content_type,
               supplier_package.object_id as supplier_package_object_id,
               null::text as supplier_package_download_url,
               signature_policy.position_version as signature_policy_position_version,
               signature.signature_position_version, signature.status as signature_status,
               signature.id as signature_approval_id,
               signed_package.id as signed_package_id,
               signed_package.output_sha256 as signature_output_sha256,
               signed_package.content_type as signed_package_content_type,
               source_message.gmail_thread_id as reply_gmail_thread_id,
               source_message.sender_email as reply_sender_email,
               source_message.internet_message_id as reply_internet_message_id,
               source_message.subject as reply_original_subject,
               to_jsonb(source_message.to_addresses) as reply_original_to,
               to_jsonb(source_message.cc_addresses) as reply_original_cc,
               draft.id as payload_id, draft.payload_kind, draft.case_version as payload_case_version,
               draft.version = (
                 select max(latest_draft.version)
                 from osp_private.outbound_drafts latest_draft
                 where latest_draft.organization_id = draft.organization_id
                   and latest_draft.case_id = draft.case_id
                   and latest_draft.payload_kind = draft.payload_kind
               ) as payload_is_latest,
               draft.from_email, draft.to_recipients, draft.cc_recipients, draft.subject,
               draft.in_reply_to, to_jsonb(draft.references_header) as references_header, draft.body_text,
               frozen.status as payload_status, frozen.canonical_sha256 as mime_sha256,
               to_jsonb(coalesce(draft.attachments_json, '[]'::jsonb)) as attachment_details,
               to_jsonb(coalesce(
                 frozen.attachment_sha256s,
                 (
                   select coalesce(
                     array_agg(draft_attachment.value ->> 'sha256' order by draft_attachment.ordinality),
                     array[]::text[]
                   )
                   from jsonb_array_elements(draft.attachments_json) with ordinality
                     as draft_attachment(value, ordinality)
                 ),
                 array[]::text[]
               )) as attachment_sha256s,
               authorized_record.id as sales_authorization_id, attempt.outcome as send_outcome
        from osp_private.customer_registration_cases case_record
        left join lateral (
          select * from osp_private.case_package_input_snapshots value
          where value.organization_id = case_record.organization_id and value.case_id = case_record.id
          order by value.created_at desc, value.id desc limit 1
        ) snapshot on true
        left join lateral (
          select value.* from osp_private.generated_packages value
          where value.organization_id = case_record.organization_id
            and value.case_id = case_record.id
            and value.package_kind = 'supplier_completed'
            and value.status = 'current'
            and value.input_snapshot_id = snapshot.id
          order by value.version desc, value.id desc limit 1
        ) supplier_package on true
        left join lateral (
          select coalesce(pdf_position.version, xlsx_position.version) as position_version
          from osp_private.signature_vault_policies policy
          left join osp_private.signature_positions pdf_position
            on pdf_position.organization_id = policy.organization_id
           and pdf_position.id = policy.signature_position_id
           and pdf_position.active = true
          left join osp_private.signature_xlsx_positions xlsx_position
            on xlsx_position.organization_id = policy.organization_id
           and xlsx_position.id = policy.signature_xlsx_position_id
           and xlsx_position.active = true
          where policy.organization_id = case_record.organization_id
            and policy.active = true
            and (pdf_position.id is not null)::integer +
                (xlsx_position.id is not null)::integer = 1
          limit 2
        ) signature_policy on true
        left join lateral (
          select * from osp_private.signature_approvals value
          where value.organization_id = case_record.organization_id and value.case_id = case_record.id
            and value.status in ('pending', 'applied')
          order by value.approved_at desc, value.id desc limit 1
        ) signature on true
        left join osp_private.generated_packages signed_package
          on signed_package.organization_id = signature.organization_id and signed_package.signature_approval_id = signature.id
          and signed_package.package_kind = 'signed' and signed_package.status = 'current'
          and signed_package.input_snapshot_id = snapshot.id
          and signed_package.input_snapshot_sha256 = snapshot.canonical_sha256
        left join lateral (
          select value.gmail_thread_id, value.sender_email, value.internet_message_id, value.subject,
                 value.to_addresses, value.cc_addresses
          from osp_private.gmail_messages value
          where value.organization_id = case_record.organization_id
            and value.case_id = case_record.id
          order by value.received_at asc, value.created_at asc, value.id asc
          limit 1
        ) source_message on true
        left join lateral (
          select * from osp_private.outbound_drafts value
          where value.organization_id = case_record.organization_id and value.case_id = case_record.id
            and (
              (${payloadId}::uuid is not null and value.id = ${payloadId}::uuid)
              or (${payloadId}::uuid is null and (
                (case_record.state = 'awaiting_clarification' and value.payload_kind = 'clarification')
                or (case_record.state in ('sales_authorization', 'ready_to_send', 'sent', 'manual_reconciliation_required') and value.payload_kind = 'final_response')
              ))
            )
          order by value.version desc, value.id desc limit 1
        ) draft on true
        left join osp_private.outbound_payloads frozen
          on frozen.organization_id = draft.organization_id and frozen.draft_id = draft.id
        left join lateral (
          select value.* from osp_private.sales_authorizations value
          where value.organization_id = frozen.organization_id
            and value.payload_id = frozen.id and value.status = 'authorized'
            and exists (
              select 1 from osp_private.approval_events authorization_event
              where authorization_event.organization_id = value.organization_id
                and authorization_event.case_id = value.case_id
                and authorization_event.case_version = draft.case_version + 1
                and authorization_event.event_type = 'authorize_outbound'
                and authorization_event.evidence_refs @> jsonb_build_array(
                  jsonb_build_object('authorizationId', value.id)
                )
            )
            and (
              osp_private.package_snapshot_hash_is_current(
                value.organization_id, value.case_id, frozen.source_snapshot_sha256
              ) or exists (
                select 1 from osp_private.outbound_send_attempts terminal_attempt
                where terminal_attempt.organization_id = value.organization_id
                  and terminal_attempt.sales_authorization_id = value.id
                  and terminal_attempt.outcome in ('sent', 'manual_reconciliation_required', 'failed')
              )
            )
          order by value.authorized_at desc, value.id desc limit 1
        ) authorized_record on true
        left join lateral (
          select value.outcome from osp_private.outbound_send_attempts value
          where value.organization_id = authorized_record.organization_id and value.sales_authorization_id = authorized_record.id
            and exists (
              select 1 from osp_private.approval_events request_event
              where request_event.organization_id = value.organization_id
                and request_event.case_id = value.case_id
                and request_event.case_version = value.reserved_case_version
                and request_event.event_type = 'request_authorized_send'
                and request_event.command_sha256 = value.command_sha256
                and request_event.evidence_refs @> jsonb_build_array(
                  jsonb_build_object('attemptId', value.id, 'authorizationId', value.sales_authorization_id)
                )
            )
          order by value.created_at desc, value.id desc limit 1
        ) attempt on true
        where case_record.organization_id = ${organizationId} and case_record.id = ${caseId}
        limit 2`;
          if (rows.length !== 1) throw new Error("WORKFLOW_VIEW_INVALID");
          return parseRow(rows[0], organizationId, caseId);
        },
      );
      const fulfillment = options.semanticGate
        ? await options.semanticGate.load({ organizationId, caseId })
        : undefined;
      if (!record.supplierPackage || !options.signSupplierPackage) {
        return Object.freeze({
          ...record,
          ...(fulfillment ? { fulfillment } : {}),
        });
      }
      const downloadUrl = optionalHttpsUrl(
        await options.signSupplierPackage(record.supplierPackage.objectId),
      );
      return Object.freeze({
        ...record,
        ...(fulfillment ? { fulfillment } : {}),
        supplierPackage: Object.freeze({
          ...record.supplierPackage,
          downloadUrl,
        }),
      });
    },
  });
}
