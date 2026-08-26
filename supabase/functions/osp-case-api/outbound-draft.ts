import {
  assertOutboundDraft,
  freezeOutboundPayload,
  type FrozenOutboundPayload,
  type OutboundDraft,
} from "../_shared/osp/outbound-payload.ts";
import {
  type OutboundCaseContext,
  requireCurrentOutboundPolicy,
} from "../_shared/osp/outbound-policy.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const SUBJECT = /^[A-Za-z0-9:_@.-]{1,256}$/;

export type SavedOutboundDraftInput = {
  organizationId: string;
  caseId: string;
  expectedCaseVersion: number;
  sourceSnapshotSha256: string;
  signedPackageSha256: string | null;
  createdBySubject: string;
  draft: OutboundDraft;
};

export type FrozenOutboundRecord = Omit<FrozenOutboundPayload, "mimeBytes"> & {
  replayed: boolean;
};

export type FreezeOutboundCommand = {
  organizationId: string;
  caseId: string;
  payloadId: string;
  expectedCaseVersion: number;
  idempotencyKey: string;
};

export interface OutboundDraftRecordStore {
  save(input: SavedOutboundDraftInput): Promise<OutboundDraft>;
  load(input: {
    organizationId: string;
    caseId: string;
    payloadId: string;
  }): Promise<OutboundDraft>;
  currentContext(input: {
    organizationId: string;
    caseId: string;
  }): Promise<OutboundCaseContext>;
  commitFrozen(
    input: FreezeOutboundCommand & {
      requestHash: string;
    },
    prepare: (
      draft: OutboundDraft,
      context: OutboundCaseContext,
    ) => Promise<Omit<FrozenOutboundPayload, "mimeBytes">>,
  ): Promise<FrozenOutboundRecord>;
}

export type OutboundAttachmentObjectPort = {
  read(input: {
    organizationId: string;
    caseId: string;
    bucketId: "osp-corporate-documents" | "osp-derived-documents";
    objectId: string;
  }): Promise<Uint8Array | null>;
};

export type OutboundMimeObjectPort = {
  writeExclusive(input: {
    organizationId: string;
    objectId: string;
    bytes: Uint8Array;
    contentType: "message/rfc822";
  }): Promise<void>;
  read(input: {
    organizationId: string;
    objectId: string;
  }): Promise<Uint8Array | null>;
};

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;
type SimpleStorageClient = {
  upload(
    bucketId: string,
    key: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void>;
  download(bucketId: string, key: string): Promise<Uint8Array | null>;
};
export type OutboundStorageClient =
  | Pick<SupabaseClient, "storage">
  | SimpleStorageClient;

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function validSave(input: SavedOutboundDraftInput): void {
  if (
    !input || !UUID.test(input.organizationId) || !UUID.test(input.caseId) ||
    !Number.isSafeInteger(input.expectedCaseVersion) ||
    input.expectedCaseVersion < 0 ||
    input.expectedCaseVersion > 2_147_483_647 ||
    !SHA.test(input.sourceSnapshotSha256) ||
    (input.signedPackageSha256 !== null &&
      !SHA.test(input.signedPackageSha256)) ||
    !SUBJECT.test(input.createdBySubject) ||
    input.draft.organizationId !== input.organizationId ||
    input.draft.caseId !== input.caseId ||
    input.draft.caseVersion !== input.expectedCaseVersion ||
    input.draft.sourceSnapshotSha256 !== input.sourceSnapshotSha256 ||
    input.draft.signedPackageSha256 !== input.signedPackageSha256
  ) throw new Error("OUTBOUND_DRAFT_INVALID");
}

export async function saveOutboundDraft(
  input: SavedOutboundDraftInput,
  deps: { store: OutboundDraftRecordStore },
): Promise<OutboundDraft> {
  validSave(input);
  const draft = assertOutboundDraft(input.draft);
  requireCurrentOutboundPolicy(
    draft,
    await deps.store.currentContext({
      organizationId: input.organizationId,
      caseId: input.caseId,
    }),
    true,
  );
  const saved = await deps.store.save({ ...input, draft });
  return assertOutboundDraft(saved);
}

export async function freezeOutboundDraft(
  input: FreezeOutboundCommand,
  deps: {
    store: OutboundDraftRecordStore;
    attachments: OutboundAttachmentObjectPort;
    objects: OutboundMimeObjectPort;
  },
): Promise<FrozenOutboundRecord> {
  if (
    !input || !UUID.test(input.organizationId) || !UUID.test(input.caseId) ||
    !UUID.test(input.payloadId) ||
    !Number.isSafeInteger(input.expectedCaseVersion) ||
    input.expectedCaseVersion < 0 ||
    input.expectedCaseVersion > 2_147_483_647 ||
    !/^[A-Za-z0-9:_-]{1,256}$/.test(input.idempotencyKey)
  ) throw new Error("OUTBOUND_DRAFT_INVALID");
  const requestHash = await sha256(new TextEncoder().encode(JSON.stringify({
    action: "freeze_outbound_payload",
    organizationId: input.organizationId,
    caseId: input.caseId,
    payloadId: input.payloadId,
    expectedCaseVersion: input.expectedCaseVersion,
  })));
  return await deps.store.commitFrozen(
    { ...input, requestHash },
    async (source, context) => {
      const draft = assertOutboundDraft(source);
      if (
        draft.organizationId !== input.organizationId ||
        draft.caseId !== input.caseId || draft.payloadId !== input.payloadId ||
        context.caseVersion !== input.expectedCaseVersion
      ) {
        throw new Error("OUTBOUND_VERSION_CONFLICT");
      }
      requireCurrentOutboundPolicy(draft, context);
      const frozen = await freezeOutboundPayload(
        draft,
        ({ bucketId, objectId }) =>
          deps.attachments.read({
            organizationId: input.organizationId,
            caseId: input.caseId,
            bucketId,
            objectId,
          }),
      );
      try {
        await deps.objects.writeExclusive({
          organizationId: input.organizationId,
          objectId: frozen.mimeObjectId,
          bytes: frozen.mimeBytes.slice(),
          contentType: "message/rfc822",
        });
      } catch {
        // An exclusive concurrent writer may have completed the same immutable object.
      }
      let persisted: Uint8Array | null;
      try {
        persisted = await deps.objects.read({
          organizationId: input.organizationId,
          objectId: frozen.mimeObjectId,
        });
      } catch {
        throw new Error("OUTBOUND_STORAGE_UNAVAILABLE");
      }
      if (
        !(persisted instanceof Uint8Array) ||
        await sha256(persisted) !== frozen.mimeSha256
      ) throw new Error("OUTBOUND_STORAGE_INTEGRITY");
      const { mimeBytes: _privateBytes, ...record } = frozen;
      return record;
    },
  );
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("OUTBOUND_PERSISTENCE_FAILED");
  }
}

function jsonParameter(client: SqlPort, value: unknown): unknown {
  const helper =
    (client as SqlPort & { json?: (input: unknown) => unknown }).json;
  return typeof helper === "function" ? helper(value) : JSON.stringify(value);
}

function draftFromRow(row: SqlRow, organizationId: string): OutboundDraft {
  const version = Number(row.case_version);
  const draft = {
    payloadId: row.id,
    organizationId: row.organization_id,
    caseId: row.case_id,
    kind: row.payload_kind,
    caseVersion: version,
    sourceSnapshotSha256: row.source_snapshot_sha256,
    signedPackageSha256: row.signed_package_sha256,
    from: row.from_email,
    to: parseJson(row.to_recipients),
    cc: parseJson(row.cc_recipients),
    subject: row.subject,
    inReplyTo: row.in_reply_to,
    references: row.references_header,
    bodyText: row.body_text,
    attachments: parseJson(row.attachments_json),
  } as OutboundDraft;
  if (draft.organizationId !== organizationId) {
    throw new Error("OUTBOUND_PERSISTENCE_FAILED");
  }
  return assertOutboundDraft(draft);
}

async function contextFromTransaction(
  tx: SqlPort,
  input: { organizationId: string; caseId: string },
  lock: boolean,
): Promise<OutboundCaseContext> {
  const cases = lock
    ? await tx`select id, state, aggregate_version from osp_private.customer_registration_cases where organization_id = ${input.organizationId} and id = ${input.caseId} for update`
    : await tx`select id, state, aggregate_version from osp_private.customer_registration_cases where organization_id = ${input.organizationId} and id = ${input.caseId}`;
  if (cases.length !== 1 || typeof cases[0].state !== "string") {
    throw new Error("OUTBOUND_CONTEXT_STALE");
  }
  const caseVersion = Number(cases[0].aggregate_version);
  if (
    !Number.isSafeInteger(caseVersion) || caseVersion < 0 ||
    caseVersion > 2_147_483_647
  ) throw new Error("OUTBOUND_CONTEXT_STALE");
  if (cases[0].state === "sales_authorization") {
    const packages =
      await tx`select input_snapshot_sha256, output_sha256 from osp_private.generated_packages where organization_id = ${input.organizationId} and case_id = ${input.caseId} and package_kind = 'signed' and status = 'current' order by version desc limit 2`;
    if (
      packages.length !== 1 ||
      typeof packages[0].input_snapshot_sha256 !== "string" ||
      typeof packages[0].output_sha256 !== "string"
    ) throw new Error("OUTBOUND_CONTEXT_STALE");
    return Object.freeze({
      organizationId: input.organizationId,
      caseId: input.caseId,
      state: cases[0].state,
      caseVersion,
      sourceSnapshotSha256: packages[0].input_snapshot_sha256,
      signedPackageSha256: packages[0].output_sha256,
    });
  }
  if (cases[0].state === "ready_to_send") {
    const authorizations =
      await tx`select authorized_record.id as authorization_id, payload.payload_kind, payload.source_snapshot_sha256, payload.signed_package_sha256 from osp_private.sales_authorizations authorized_record join osp_private.outbound_payloads payload on payload.organization_id = authorized_record.organization_id and payload.case_id = authorized_record.case_id and payload.id = authorized_record.payload_id where authorized_record.organization_id = ${input.organizationId} and authorized_record.case_id = ${input.caseId} and authorized_record.status = 'authorized' order by authorized_record.authorized_at desc, authorized_record.id desc limit 2`;
    if (
      authorizations.length !== 1 ||
      (authorizations[0].payload_kind !== "clarification" &&
        authorizations[0].payload_kind !== "final_response") ||
      typeof authorizations[0].source_snapshot_sha256 !== "string" ||
      (authorizations[0].payload_kind === "final_response" &&
        typeof authorizations[0].signed_package_sha256 !== "string") ||
      (authorizations[0].payload_kind === "clarification" &&
        authorizations[0].signed_package_sha256 !== null)
    ) throw new Error("OUTBOUND_CONTEXT_STALE");
    return Object.freeze({
      organizationId: input.organizationId,
      caseId: input.caseId,
      state: cases[0].state,
      caseVersion,
      sourceSnapshotSha256: authorizations[0].source_snapshot_sha256,
      signedPackageSha256: authorizations[0].signed_package_sha256 as
        | string
        | null,
    });
  }
  if (cases[0].state !== "awaiting_clarification") {
    throw new Error("OUTBOUND_CONTEXT_STALE");
  }
  const snapshots =
    await tx`select canonical_sha256 from osp_private.case_package_input_snapshots where organization_id = ${input.organizationId} and case_id = ${input.caseId} order by created_at desc, id desc limit 2`;
  if (
    snapshots.length < 1 || typeof snapshots[0].canonical_sha256 !== "string"
  ) throw new Error("OUTBOUND_CONTEXT_STALE");
  return Object.freeze({
    organizationId: input.organizationId,
    caseId: input.caseId,
    state: cases[0].state,
    caseVersion,
    sourceSnapshotSha256: snapshots[0].canonical_sha256,
    signedPackageSha256: null,
  });
}

function frozenFromRow(row: SqlRow, replayed: boolean): FrozenOutboundRecord {
  const caseVersion = Number(row.case_version);
  if (
    typeof row.id !== "string" || !UUID.test(row.id) ||
    typeof row.organization_id !== "string" ||
    !UUID.test(row.organization_id) ||
    typeof row.case_id !== "string" || !UUID.test(row.case_id) ||
    (row.payload_kind !== "clarification" &&
      row.payload_kind !== "final_response") ||
    !Number.isSafeInteger(caseVersion) || caseVersion < 0 ||
    typeof row.source_snapshot_sha256 !== "string" ||
    !SHA.test(row.source_snapshot_sha256) ||
    (row.signed_package_sha256 !== null &&
      (typeof row.signed_package_sha256 !== "string" ||
        !SHA.test(row.signed_package_sha256))) ||
    typeof row.object_id !== "string" ||
    !/^[A-Za-z0-9:_-]{1,256}$/.test(row.object_id) ||
    typeof row.canonical_sha256 !== "string" ||
    !SHA.test(row.canonical_sha256) ||
    !Array.isArray(row.attachment_sha256s) ||
    row.attachment_sha256s.some((hash) =>
      typeof hash !== "string" || !SHA.test(hash)
    )
  ) throw new Error("OUTBOUND_PERSISTENCE_FAILED");
  return Object.freeze({
    payloadId: row.id,
    organizationId: row.organization_id,
    caseId: row.case_id,
    kind: row.payload_kind,
    caseVersion,
    sourceSnapshotSha256: row.source_snapshot_sha256,
    signedPackageSha256: row.signed_package_sha256 as string | null,
    mimeObjectId: row.object_id,
    mimeSha256: row.canonical_sha256,
    attachmentSha256: Object.freeze([...(row.attachment_sha256s as string[])]),
    replayed,
  });
}

export function assertFrozenOutboundReceipt(
  value: unknown,
): FrozenOutboundRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("OUTBOUND_PERSISTENCE_FAILED");
  }
  const row = value as Record<string, unknown>;
  const expectedKeys = [
    "attachmentSha256",
    "caseId",
    "caseVersion",
    "kind",
    "mimeObjectId",
    "mimeSha256",
    "organizationId",
    "payloadId",
    "replayed",
    "signedPackageSha256",
    "sourceSnapshotSha256",
  ];
  const caseVersion = Number(row.caseVersion);
  if (
    Object.keys(row).sort().join(",") !== expectedKeys.join(",") ||
    typeof row.payloadId !== "string" || !UUID.test(row.payloadId) ||
    typeof row.organizationId !== "string" || !UUID.test(row.organizationId) ||
    typeof row.caseId !== "string" || !UUID.test(row.caseId) ||
    (row.kind !== "clarification" && row.kind !== "final_response") ||
    !Number.isSafeInteger(caseVersion) || caseVersion < 0 ||
    caseVersion > 2_147_483_647 ||
    typeof row.sourceSnapshotSha256 !== "string" ||
    !SHA.test(row.sourceSnapshotSha256) ||
    (row.signedPackageSha256 !== null &&
      (typeof row.signedPackageSha256 !== "string" ||
        !SHA.test(row.signedPackageSha256))) ||
    typeof row.mimeObjectId !== "string" ||
    !/^[A-Za-z0-9:_-]{1,256}$/.test(row.mimeObjectId) ||
    typeof row.mimeSha256 !== "string" || !SHA.test(row.mimeSha256) ||
    !Array.isArray(row.attachmentSha256) ||
    row.attachmentSha256.some((hash) =>
      typeof hash !== "string" || !SHA.test(hash)
    ) ||
    row.replayed !== false
  ) {
    throw new Error("OUTBOUND_PERSISTENCE_FAILED");
  }
  return Object.freeze({
    payloadId: row.payloadId,
    organizationId: row.organizationId,
    caseId: row.caseId,
    kind: row.kind,
    caseVersion,
    sourceSnapshotSha256: row.sourceSnapshotSha256,
    signedPackageSha256: row.signedPackageSha256 as string | null,
    mimeObjectId: row.mimeObjectId,
    mimeSha256: row.mimeSha256,
    attachmentSha256: Object.freeze([...(row.attachmentSha256 as string[])]),
    replayed: true,
  });
}

function postgresClient(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
}): SqlPort {
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
          application_name: "osp-outbound-drafts",
          statement_timeout: "3000",
        },
      },
    );
  if (typeof created !== "function") {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  return created as SqlPort;
}

export function createPostgresOutboundDraftStore(options: {
  databaseUrl: string;
  postgresFactory?: PostgresFactory;
}): OutboundDraftRecordStore {
  const sql = postgresClient(options);
  const store: OutboundDraftRecordStore = {
    save: async (input: SavedOutboundDraftInput): Promise<OutboundDraft> => {
      const changeSha256 = await sha256(
        new TextEncoder().encode(JSON.stringify(input.draft)),
      );
      return await withOrganizationTransaction(
        sql,
        input.organizationId,
        async (tx) => {
          await tx`set local statement_timeout = '3000ms'`;
          const lockKey = JSON.stringify([
            input.organizationId,
            input.caseId,
            input.draft.kind,
            "outbound-draft",
          ]);
          await tx`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
          const existing =
            await tx`select id, organization_id, case_id, version, payload_kind, case_version, source_snapshot_sha256, signed_package_sha256, from_email, to_recipients, cc_recipients, subject, in_reply_to, references_header, body_text, attachments_json from osp_private.outbound_drafts where organization_id = ${input.organizationId} and case_id = ${input.caseId} and id = ${input.draft.payloadId}`;
          if (existing.length === 1) {
            const prior = draftFromRow(existing[0], input.organizationId);
            if (JSON.stringify(prior) !== JSON.stringify(input.draft)) {
              throw new Error("OUTBOUND_DRAFT_CONFLICT");
            }
            return prior;
          }
          const current = await contextFromTransaction(tx, {
            organizationId: input.organizationId,
            caseId: input.caseId,
          }, true);
          requireCurrentOutboundPolicy(input.draft, current, true);
          let persistedDraft = input.draft;
          if (current.state === "ready_to_send") {
            const activeAttempts =
              await tx`select attempt.id, attempt.outcome from osp_private.outbound_send_attempts attempt join osp_private.sales_authorizations authorized_record on authorized_record.organization_id = attempt.organization_id and authorized_record.case_id = attempt.case_id and authorized_record.id = attempt.sales_authorization_id where authorized_record.organization_id = ${input.organizationId} and authorized_record.case_id = ${input.caseId} and authorized_record.status = 'authorized' and attempt.outcome in ('reserved', 'sending', 'manual_reconciliation_required') for update of attempt`;
            if (activeAttempts.length > 0) {
              throw new Error("OUTBOUND_SEND_ALREADY_RESERVED");
            }
            const nextState = input.draft.kind === "clarification"
              ? "awaiting_clarification"
              : "sales_authorization";
            const superseded =
              await tx`update osp_private.sales_authorizations set status = 'superseded' where organization_id = ${input.organizationId} and case_id = ${input.caseId} and status = 'authorized' returning id`;
            if (superseded.length !== 1) {
              throw new Error("OUTBOUND_CONTEXT_STALE");
            }
            const advanced =
              await tx`update osp_private.customer_registration_cases set state = ${nextState}, aggregate_version = aggregate_version + 1, updated_at = statement_timestamp() where organization_id = ${input.organizationId} and id = ${input.caseId} and state = 'ready_to_send' and aggregate_version = ${input.expectedCaseVersion} returning aggregate_version`;
            if (
              advanced.length !== 1 ||
              Number(advanced[0].aggregate_version) !==
                input.expectedCaseVersion + 1
            ) throw new Error("OUTBOUND_VERSION_CONFLICT");
            const evidence = [{
              payloadId: input.draft.payloadId,
              reason: "outbound_draft_edited",
            }];
            await tx`insert into osp_private.approval_events (id, organization_id, case_id, case_version, event_type, actor_subject, actor_role, authorization_session_id, command_sha256, evidence_refs) values (${crypto.randomUUID()}, ${input.organizationId}, ${input.caseId}, ${
              input.expectedCaseVersion + 1
            }, 'approval_invalidated', ${input.createdBySubject}, 'operations_reviewer', null, ${changeSha256}, ${
              jsonParameter(tx, evidence)
            })`;
            await tx`insert into osp_private.case_events (id, organization_id, case_id, sequence, state, actor_subject, authority_role, source_version, occurred_at, reason_code, correlation_id, evidence_json) values (${crypto.randomUUID()}, ${input.organizationId}, ${input.caseId}, ${
              input.expectedCaseVersion + 1
            }, ${nextState}, ${input.createdBySubject}, 'operations', ${input.expectedCaseVersion}, statement_timestamp(), 'approval_invalidated', ${crypto.randomUUID()}, ${
              JSON.stringify(evidence)
            })`;
            persistedDraft = Object.freeze({
              ...input.draft,
              caseVersion: input.expectedCaseVersion + 1,
            });
          }
          const versions =
            await tx`select coalesce(max(version), 0) as latest_version from osp_private.outbound_drafts where organization_id = ${input.organizationId} and case_id = ${input.caseId} and payload_kind = ${persistedDraft.kind}`;
          const latestVersion = versions.length === 1
            ? Number(versions[0].latest_version)
            : Number.NaN;
          if (
            !Number.isSafeInteger(latestVersion) || latestVersion < 0 ||
            latestVersion >= 2_147_483_647
          ) {
            throw new Error("OUTBOUND_PERSISTENCE_FAILED");
          }
          const inserted =
            await tx`insert into osp_private.outbound_drafts (id, organization_id, case_id, version, payload_kind, case_version, source_snapshot_sha256, signed_package_sha256, from_email, to_recipients, cc_recipients, subject, in_reply_to, references_header, body_text, attachments_json, created_by_subject) values (${persistedDraft.payloadId}, ${input.organizationId}, ${input.caseId}, ${
              latestVersion + 1
            }, ${persistedDraft.kind}, ${persistedDraft.caseVersion}, ${input.sourceSnapshotSha256}, ${input.signedPackageSha256}, ${persistedDraft.from}, ${
              jsonParameter(tx, persistedDraft.to)
            }, ${
              jsonParameter(tx, persistedDraft.cc)
            }, ${persistedDraft.subject}, ${persistedDraft.inReplyTo}, ${persistedDraft.references}, ${persistedDraft.bodyText}, ${
              jsonParameter(tx, persistedDraft.attachments)
            }, ${input.createdBySubject}) returning id, organization_id, case_id, version, payload_kind, case_version, source_snapshot_sha256, signed_package_sha256, from_email, to_recipients, cc_recipients, subject, in_reply_to, references_header, body_text, attachments_json`;
          if (inserted.length !== 1) {
            throw new Error("OUTBOUND_PERSISTENCE_FAILED");
          }
          return draftFromRow(inserted[0], input.organizationId);
        },
      );
    },
    load: async (
      input: { organizationId: string; caseId: string; payloadId: string },
    ): Promise<OutboundDraft> =>
      await withOrganizationTransaction(
        sql,
        input.organizationId,
        async (tx) => {
          const rows =
            await tx`select id, organization_id, case_id, version, payload_kind, case_version, source_snapshot_sha256, signed_package_sha256, from_email, to_recipients, cc_recipients, subject, in_reply_to, references_header, body_text, attachments_json from osp_private.outbound_drafts where organization_id = ${input.organizationId} and case_id = ${input.caseId} and id = ${input.payloadId}`;
          if (rows.length !== 1) throw new Error("OUTBOUND_DRAFT_NOT_FOUND");
          return draftFromRow(rows[0], input.organizationId);
        },
      ),
    currentContext: async (
      input: { organizationId: string; caseId: string },
    ): Promise<OutboundCaseContext> =>
      await withOrganizationTransaction(
        sql,
        input.organizationId,
        async (tx) => await contextFromTransaction(tx, input, false),
      ),
    commitFrozen: async (
      input: FreezeOutboundCommand & { requestHash: string },
      prepare: (
        draft: OutboundDraft,
        context: OutboundCaseContext,
      ) => Promise<Omit<FrozenOutboundPayload, "mimeBytes">>,
    ): Promise<FrozenOutboundRecord> =>
      await withOrganizationTransaction(
        sql,
        input.organizationId,
        async (tx) => {
          await tx`set local statement_timeout = '3000ms'`;
          const operation = "outbound:freeze";
          const lockKey = JSON.stringify([
            input.organizationId,
            operation,
            input.idempotencyKey,
          ]);
          await tx`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
          const receipts =
            await tx`select request_hash, response_json from osp_private.command_receipts where organization_id = ${input.organizationId} and operation = ${operation} and idempotency_key = ${input.idempotencyKey}`;
          if (receipts.length === 1) {
            if (
              receipts[0].request_hash !== input.requestHash
            ) throw new Error("IDEMPOTENCY_CONFLICT");
            const value = typeof receipts[0].response_json === "string"
              ? JSON.parse(receipts[0].response_json)
              : receipts[0].response_json;
            return assertFrozenOutboundReceipt(value);
          }
          const context = await contextFromTransaction(tx, input, true);
          if (
            context.caseVersion !== input.expectedCaseVersion
          ) throw new Error("OUTBOUND_VERSION_CONFLICT");
          const draftRows =
            await tx`select id, organization_id, case_id, version, payload_kind, case_version, source_snapshot_sha256, signed_package_sha256, from_email, to_recipients, cc_recipients, subject, in_reply_to, references_header, body_text, attachments_json from osp_private.outbound_drafts where organization_id = ${input.organizationId} and case_id = ${input.caseId} and id = ${input.payloadId}`;
          if (draftRows.length !== 1) {
            throw new Error("OUTBOUND_DRAFT_NOT_FOUND");
          }
          const record = await prepare(
            draftFromRow(draftRows[0], input.organizationId),
            context,
          );
          if (
            record.organizationId !== input.organizationId ||
            record.caseId !== input.caseId ||
            record.payloadId !== input.payloadId ||
            record.caseVersion !== input.expectedCaseVersion
          ) throw new Error("OUTBOUND_PERSISTENCE_FAILED");
          const existing =
            await tx`select id, organization_id, case_id, payload_kind, case_version, source_snapshot_sha256, signed_package_sha256, object_id, canonical_sha256, attachment_sha256s from osp_private.outbound_payloads where organization_id = ${input.organizationId} and case_id = ${input.caseId} and id = ${input.payloadId}`;
          if (existing.length === 1) {
            const prior = frozenFromRow(existing[0], true);
            if (
              prior.mimeSha256 !== record.mimeSha256 ||
              prior.mimeObjectId !== record.mimeObjectId ||
              JSON.stringify(prior.attachmentSha256) !==
                JSON.stringify(record.attachmentSha256)
            ) throw new Error("OUTBOUND_PAYLOAD_CONFLICT");
            await tx`insert into osp_private.command_receipts (id, organization_id, operation, idempotency_key, request_hash, response_json) values (${crypto.randomUUID()}, ${input.organizationId}, ${operation}, ${input.idempotencyKey}, ${input.requestHash}, ${
              JSON.stringify({ ...prior, replayed: false })
            })`;
            return prior;
          }
          const drafts =
            await tx`select version from osp_private.outbound_drafts where organization_id = ${input.organizationId} and case_id = ${input.caseId} and id = ${input.payloadId}`;
          if (
            drafts.length !== 1 ||
            !Number.isSafeInteger(Number(drafts[0].version))
          ) {
            throw new Error("OUTBOUND_DRAFT_NOT_FOUND");
          }
          const inserted =
            await tx`insert into osp_private.outbound_payloads (id, organization_id, case_id, version, payload_kind, object_id, canonical_sha256, attachment_sha256s, status, draft_id, case_version, source_snapshot_sha256, signed_package_sha256) values (${input.payloadId}, ${input.organizationId}, ${input.caseId}, ${
              Number(drafts[0].version)
            }, ${record.kind}, ${record.mimeObjectId}, ${record.mimeSha256}, ${record.attachmentSha256}, 'frozen', ${input.payloadId}, ${record.caseVersion}, ${record.sourceSnapshotSha256}, ${record.signedPackageSha256}) returning id, organization_id, case_id, payload_kind, case_version, source_snapshot_sha256, signed_package_sha256, object_id, canonical_sha256, attachment_sha256s`;
          if (inserted.length !== 1) {
            throw new Error("OUTBOUND_PERSISTENCE_FAILED");
          }
          const result = frozenFromRow(inserted[0], false);
          await tx`insert into osp_private.command_receipts (id, organization_id, operation, idempotency_key, request_hash, response_json) values (${crypto.randomUUID()}, ${input.organizationId}, ${operation}, ${input.idempotencyKey}, ${input.requestHash}, ${
            JSON.stringify(result)
          })`;
          return result;
        },
      ),
  };
  return Object.freeze(store);
}

function isSimple(
  client: OutboundStorageClient,
): client is SimpleStorageClient {
  return "upload" in client && "download" in client;
}

export function createOutboundStoragePorts(
  client: OutboundStorageClient,
): {
  objects: OutboundMimeObjectPort;
} {
  const download = async (bucketId: string, objectId: string) => {
    if (isSimple(client)) return await client.download(bucketId, objectId);
    const result = await client.storage.from(bucketId).download(objectId);
    if (result.error || !result.data) return null;
    return new Uint8Array(await result.data.arrayBuffer());
  };
  const objects: OutboundMimeObjectPort = {
    writeExclusive: async (input: {
      organizationId: string;
      objectId: string;
      bytes: Uint8Array;
      contentType: "message/rfc822";
    }) => {
      if (isSimple(client)) {
        await client.upload(
          "osp-outbound-payloads",
          input.objectId,
          input.bytes.slice(),
          input.contentType,
        );
        return;
      }
      const result = await client.storage.from("osp-outbound-payloads").upload(
        input.objectId,
        input.bytes.slice(),
        { contentType: input.contentType, upsert: false },
      );
      if (result.error) throw new Error("OUTBOUND_STORAGE_OUTCOME_UNKNOWN");
    },
    read: async (input: { organizationId: string; objectId: string }) => {
      if (!input.objectId.startsWith(`outbound_${input.organizationId}_`)) {
        throw new Error("OUTBOUND_STORAGE_INTEGRITY");
      }
      return await download("osp-outbound-payloads", input.objectId);
    },
  };
  return Object.freeze({
    objects: Object.freeze(objects),
  });
}

export function createTenantAttachmentObjectPort(options: {
  databaseUrl: string;
  storageClient: OutboundStorageClient;
  postgresFactory?: PostgresFactory;
}): OutboundAttachmentObjectPort {
  const sql = postgresClient(options);
  const download = async (
    bucketId: "osp-corporate-documents" | "osp-derived-documents",
    key: string,
  ) => {
    if (isSimple(options.storageClient)) {
      return await options.storageClient.download(bucketId, key);
    }
    const result = await options.storageClient.storage.from(bucketId).download(
      key,
    );
    if (result.error || !result.data) return null;
    return new Uint8Array(await result.data.arrayBuffer());
  };
  return Object.freeze({
    read: async (
      input: {
        organizationId: string;
        caseId: string;
        bucketId: "osp-corporate-documents" | "osp-derived-documents";
        objectId: string;
      },
    ) => {
      if (
        !UUID.test(input.organizationId) || !UUID.test(input.caseId) ||
        !UUID.test(input.objectId)
      ) {
        throw new Error("OUTBOUND_ATTACHMENT_UNAVAILABLE");
      }
      const key = await withOrganizationTransaction(
        sql,
        input.organizationId,
        async (tx) => {
          const rows = input.bucketId === "osp-corporate-documents"
            ? await tx`select version.opaque_object_key as object_key from osp_private.document_versions version join osp_private.documents document on document.organization_id = version.organization_id and document.id = version.document_id where version.organization_id = ${input.organizationId} and version.id = ${input.objectId} and (document.case_id is null or document.case_id = ${input.caseId}) and version.bucket_id = 'osp-corporate-documents' and version.status = 'approved' and version.retention_disposition <> 'disposed'`
            : await tx`select object_id as object_key from osp_private.generated_packages where organization_id = ${input.organizationId} and case_id = ${input.caseId} and id = ${input.objectId} and status = 'current'`;
          if (
            rows.length !== 1 || typeof rows[0].object_key !== "string"
          ) throw new Error("OUTBOUND_ATTACHMENT_UNAVAILABLE");
          return rows[0].object_key;
        },
      );
      return await download(input.bucketId, key);
    },
  });
}
import postgres from "postgres";
import type { SupabaseClient } from "supabase";

import {
  type SqlPort,
  type SqlRow,
  withOrganizationTransaction,
} from "../_shared/osp/database-context.ts";
