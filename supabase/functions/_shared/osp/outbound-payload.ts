export type OutboundKind = "clarification" | "final_response";
export type OutboundRecipientSource = "captured_supplier" | "reviewed_manual";

export type OutboundRecipient = {
  email: string;
  source: OutboundRecipientSource;
};

export type OutboundAttachment = {
  bucketId: "osp-corporate-documents" | "osp-derived-documents";
  objectId: string;
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

export type OutboundDraft = {
  payloadId: string;
  organizationId: string;
  caseId: string;
  kind: OutboundKind;
  caseVersion: number;
  sourceSnapshotSha256: string;
  signedPackageSha256: string | null;
  from: "carriers@xbfreight.com";
  to: readonly OutboundRecipient[];
  cc: readonly OutboundRecipient[];
  subject: string;
  inReplyTo: string | null;
  references: readonly string[];
  bodyText: string;
  attachments: readonly OutboundAttachment[];
};

export type FrozenOutboundPayload = {
  payloadId: string;
  organizationId: string;
  caseId: string;
  kind: OutboundKind;
  caseVersion: number;
  sourceSnapshotSha256: string;
  signedPackageSha256: string | null;
  mimeObjectId: string;
  mimeSha256: string;
  attachmentSha256: readonly string[];
  mimeBytes: Uint8Array;
};

export type OutboundAttachmentResolver = (
  input: Pick<OutboundAttachment, "bucketId" | "objectId">,
) => Promise<Uint8Array | null>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const EMAIL =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;
const MESSAGE_ID = /^<[\x21-\x3d\x3f-\x7e]+@[A-Za-z0-9.-]+>$/;
const ATTACHMENT_NAME = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/;
const CONTENT_TYPES = new Set<OutboundAttachment["contentType"]>([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/tiff",
]);
const DRAFT_KEYS = [
  "attachments",
  "bodyText",
  "caseId",
  "caseVersion",
  "cc",
  "from",
  "inReplyTo",
  "kind",
  "organizationId",
  "payloadId",
  "references",
  "signedPackageSha256",
  "sourceSnapshotSha256",
  "subject",
  "to",
];

function invalid(): never {
  throw new Error("OUTBOUND_PAYLOAD_INVALID");
}

function exactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length &&
    actual.every((key, index) => key === keys[index]);
}

function safeHeader(value: string, min: number, max: number): string {
  if (
    typeof value !== "string" || value.length < min || value.length > max ||
    value !== value.normalize("NFC") || /[\u0000-\u001f\u007f]/.test(value) ||
    value.trim() !== value
  ) invalid();
  return value;
}

function safeRecipients(
  value: readonly OutboundRecipient[],
  required: boolean,
): readonly OutboundRecipient[] {
  if (
    !Array.isArray(value) || (required && value.length < 1) ||
    value.length > 50
  ) invalid();
  return Object.freeze(value.map((recipient) => {
    if (
      !recipient || typeof recipient !== "object" ||
      !exactKeys(recipient, ["email", "source"]) ||
      typeof recipient.email !== "string" ||
      recipient.email !== recipient.email.toLowerCase() ||
      !EMAIL.test(recipient.email) ||
      (recipient.source !== "captured_supplier" &&
        recipient.source !== "reviewed_manual")
    ) invalid();
    return Object.freeze({ email: recipient.email, source: recipient.source });
  }));
}

function safeBody(value: string): string {
  if (
    typeof value !== "string" || value.length < 1 || value.length > 100_000 ||
    value !== value.normalize("NFC") || /[\u0000\u000b\u000c\u007f]/.test(value)
  ) invalid();
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(
    /\n/g,
    "\r\n",
  );
}

function safeAttachments(
  value: readonly OutboundAttachment[],
): readonly OutboundAttachment[] {
  if (!Array.isArray(value) || value.length > 100) invalid();
  const objects = new Set<string>();
  const names = new Set<string>();
  return Object.freeze(value.map((attachment) => {
    if (
      !attachment || typeof attachment !== "object" ||
      !exactKeys(attachment, [
        "bucketId",
        "contentType",
        "name",
        "objectId",
        "sha256",
      ]) ||
      (attachment.bucketId !== "osp-corporate-documents" &&
        attachment.bucketId !== "osp-derived-documents") ||
      typeof attachment.objectId !== "string" ||
      !UUID.test(attachment.objectId) ||
      typeof attachment.name !== "string" ||
      attachment.name !== attachment.name.normalize("NFC") ||
      !ATTACHMENT_NAME.test(attachment.name) ||
      !CONTENT_TYPES.has(attachment.contentType) ||
      typeof attachment.sha256 !== "string" || !SHA.test(attachment.sha256) ||
      objects.has(attachment.objectId) ||
      names.has(attachment.name.toLowerCase())
    ) invalid();
    objects.add(attachment.objectId);
    names.add(attachment.name.toLowerCase());
    return Object.freeze({ ...attachment });
  }));
}

export function assertOutboundDraft(value: OutboundDraft): OutboundDraft {
  if (
    !value || typeof value !== "object" || !exactKeys(value, DRAFT_KEYS) ||
    !UUID.test(value.payloadId) || !UUID.test(value.organizationId) ||
    !UUID.test(value.caseId) ||
    (value.kind !== "clarification" && value.kind !== "final_response") ||
    !Number.isSafeInteger(value.caseVersion) || value.caseVersion < 0 ||
    value.caseVersion > 2_147_483_647 ||
    !SHA.test(value.sourceSnapshotSha256) ||
    value.from !== "carriers@xbfreight.com" ||
    (value.kind === "clarification"
      ? value.signedPackageSha256 !== null
      : typeof value.signedPackageSha256 !== "string" ||
        !SHA.test(value.signedPackageSha256))
  ) invalid();
  const to = safeRecipients(value.to, true);
  const cc = safeRecipients(value.cc, false);
  const recipientEmails = [...to, ...cc].map((recipient) => recipient.email);
  if (new Set(recipientEmails).size !== recipientEmails.length) invalid();
  const subject = safeHeader(value.subject, 1, 998);
  if (
    value.inReplyTo !== null &&
    (typeof value.inReplyTo !== "string" || !MESSAGE_ID.test(value.inReplyTo))
  ) invalid();
  if (
    !Array.isArray(value.references) || value.references.length > 50 ||
    value.references.some((reference) =>
      typeof reference !== "string" || !MESSAGE_ID.test(reference)
    ) || new Set(value.references).size !== value.references.length
  ) invalid();
  const attachments = safeAttachments(value.attachments);
  if (
    value.kind === "final_response" &&
    (attachments.length < 1 ||
      attachments.filter((attachment) =>
          attachment.bucketId === "osp-derived-documents" &&
          attachment.sha256 === value.signedPackageSha256
        ).length !== 1)
  ) invalid();
  return Object.freeze({
    ...value,
    to,
    cc,
    subject,
    references: Object.freeze([...value.references]),
    bodyText: safeBody(value.bodyText),
    attachments,
  });
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function base64(bytes: Uint8Array): string {
  let value = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    value += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  const encoded = btoa(value);
  return encoded.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function encodedSubject(subject: string): string {
  if (/^[\x20-\x7e]+$/.test(subject)) return subject;
  return `=?UTF-8?B?${
    base64(new TextEncoder().encode(subject)).replace(/\r\n/g, "")
  }?=`;
}

export async function freezeOutboundPayload(
  draft: OutboundDraft,
  attachmentResolver: OutboundAttachmentResolver,
): Promise<FrozenOutboundPayload> {
  const safe = assertOutboundDraft(draft);
  if (typeof attachmentResolver !== "function") invalid();
  const resolved: Uint8Array[] = [];
  for (const attachment of safe.attachments) {
    let bytes: Uint8Array | null;
    try {
      bytes = await attachmentResolver({
        bucketId: attachment.bucketId,
        objectId: attachment.objectId,
      });
    } catch {
      throw new Error("OUTBOUND_ATTACHMENT_UNAVAILABLE");
    }
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1) {
      throw new Error("OUTBOUND_ATTACHMENT_UNAVAILABLE");
    }
    const copy = bytes.slice();
    if (await sha256(copy) !== attachment.sha256) {
      throw new Error("OUTBOUND_ATTACHMENT_MISMATCH");
    }
    resolved.push(copy);
  }
  const boundary = `osp_${safe.payloadId.replaceAll("-", "")}`;
  const headers = [
    `From: ${safe.from}`,
    `To: ${safe.to.map((recipient) => recipient.email).join(", ")}`,
    ...(safe.cc.length > 0
      ? [`Cc: ${safe.cc.map((recipient) => recipient.email).join(", ")}`]
      : []),
    `Subject: ${encodedSubject(safe.subject)}`,
    `Message-ID: <osp-${safe.payloadId}@${["xbfreight", "com"].join(".")}>`,
    ...(safe.inReplyTo ? [`In-Reply-To: ${safe.inReplyTo}`] : []),
    ...(safe.references.length > 0
      ? [`References: ${safe.references.join(" ")}`]
      : []),
    "MIME-Version: 1.0",
    `X-OSP-Payload-ID: ${safe.payloadId}`,
    `X-OSP-Case-Version: ${safe.caseVersion}`,
    `X-OSP-Source-Snapshot-SHA256: ${safe.sourceSnapshotSha256}`,
    ...(safe.signedPackageSha256
      ? [`X-OSP-Signed-Package-SHA256: ${safe.signedPackageSha256}`]
      : []),
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];
  const parts = [
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${safe.bodyText}\r\n`,
    ...safe.attachments.map((attachment, index) =>
      `--${boundary}\r\nContent-Type: ${attachment.contentType}; name="${attachment.name}"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="${attachment.name}"\r\nX-OSP-Attachment-Bucket-ID: ${attachment.bucketId}\r\nX-OSP-Attachment-Object-ID: ${attachment.objectId}\r\nX-OSP-Attachment-SHA256: ${attachment.sha256}\r\n\r\n${
        base64(resolved[index])
      }\r\n`
    ),
    `--${boundary}--\r\n`,
  ];
  const mimeBytes = new TextEncoder().encode(
    `${headers.join("\r\n")}\r\n\r\n${parts.join("")}`,
  );
  if (mimeBytes.byteLength > 26_214_400) invalid();
  return Object.freeze({
    payloadId: safe.payloadId,
    organizationId: safe.organizationId,
    caseId: safe.caseId,
    kind: safe.kind,
    caseVersion: safe.caseVersion,
    sourceSnapshotSha256: safe.sourceSnapshotSha256,
    signedPackageSha256: safe.signedPackageSha256,
    mimeObjectId: `outbound_${safe.organizationId}_${safe.payloadId}`,
    mimeSha256: await sha256(mimeBytes),
    attachmentSha256: Object.freeze(
      safe.attachments.map((attachment) => attachment.sha256),
    ),
    mimeBytes,
  });
}
