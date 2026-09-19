import PostalMime from "postalMime";

import { isReplyMessageId } from "./reply-context.ts";
import { sha256Hex } from "./source-hash.ts";

const INTERNAL_DOMAINS = new Set(["xbfreight.com", "heymarksman.com"]);
const RELAY_SENDER = "sales@heymarksman.com";
const CAPTURE_MAILBOX = "carriers@xbfreight.com";
const MAX_RELAY_EML_BYTES = 7 * 1024 * 1024;
const MAX_RELAY_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_RELAY_ATTACHMENT_COUNT = 20;
const MAX_RELAY_ATTACHMENT_TOTAL_BYTES = 8 * 1024 * 1024;

const SUPPORTED_RELAY_ATTACHMENTS = new Map<
  string,
  Readonly<{
    contentType: string;
    extensions: readonly string[];
    processingDisposition?: "manual_conversion_required";
  }>
>([
  ["application/pdf", { contentType: "application/pdf", extensions: [".pdf"] }],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extensions: [".docx"],
    },
  ],
  [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    {
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extensions: [".xlsx"],
    },
  ],
  [
    "application/vnd.ms-excel.sheet.macroenabled.12",
    {
      contentType: "application/vnd.ms-excel.sheet.macroEnabled.12",
      extensions: [".xlsm"],
    },
  ],
  [
    "application/msword",
    {
      contentType: "application/msword",
      extensions: [".doc"],
      processingDisposition: "manual_conversion_required",
    },
  ],
]);

export type ParsedMessageEnvelope = Readonly<{
  senderEmail: string;
  senderDomain: string;
  internetMessageId: string | null;
  to: readonly string[];
  cc: readonly string[];
  subject: string;
  sourceSha256: string;
}>;

export type ParsedRequestProvenance = Readonly<{
  relationship: "direct_copy" | "internal_relay";
  parentEnvelope: ParsedMessageEnvelope;
  originalEnvelope: ParsedMessageEnvelope | null;
  externalReplyTo: readonly string[];
  externalReplyCc: readonly string[];
}>;

export type ParsedCopiedRequestAttachment = Readonly<{
  bytes: Uint8Array;
  contentType: string;
  filename: string | null;
  sha256: string;
  sourceRole: "direct_attachment" | "original_eml" | "original_attachment";
  parentSourceSha256: string | null;
  processingDisposition: "automatic_eligible" | "manual_conversion_required";
}>;

export type ParsedCopiedRequest = Readonly<{
  senderEmail: string;
  senderDomain: string;
  internetMessageId: string | null;
  supplierDomain: string;
  to: readonly string[];
  cc: readonly string[];
  subject: string;
  safeBody: string;
  attachments: readonly ParsedCopiedRequestAttachment[];
  requirementTokens: readonly string[];
  applicationReference: string | null;
  provenance: ParsedRequestProvenance;
}>;

export type ParseCopiedRequestOptions = Readonly<{
  allowInternalRelay?: boolean;
}>;

function header(raw: string, name: string): string | null {
  const prefix = `${name.toLowerCase()}:`;
  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].toLowerCase().startsWith(prefix)) continue;
    const values = [lines[index].slice(prefix.length).trim()];
    while (index + 1 < lines.length && /^[ \t]/.test(lines[index + 1])) {
      values.push(lines[++index].trim());
    }
    return values.join(" ").trim();
  }
  return null;
}

function textTokens(value: string): readonly string[] {
  return Object.freeze([
    ...new Set(value.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []),
  ].sort());
}

function attachmentBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array();
}

function mailboxAddresses(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(
    value.map((mailbox) =>
      typeof mailbox?.address === "string"
        ? mailbox.address.trim().toLowerCase()
        : ""
    ).filter(Boolean),
  );
}

function domain(address: string): string {
  return address.split("@")[1] ?? "";
}

function safeText(value: unknown): string {
  return (typeof value === "string" ? value : "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeFilename(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const filename = value.trim();
  if (
    filename.length < 1 || filename.length > 255 ||
    /[\u0000-\u001f\u007f/\\]/.test(filename) || filename === "." ||
    filename === ".."
  ) return null;
  return filename;
}

function hasExpectedSignature(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === "application/pdf") {
    return bytes.byteLength >= 5 &&
      new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  }
  if (contentType === "application/msword") {
    const oleHeader = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    return bytes.byteLength >= oleHeader.length &&
      oleHeader.every((byte, index) => bytes[index] === byte);
  }
  return bytes.byteLength >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08));
}

async function envelope(
  parsed: Awaited<ReturnType<PostalMime["parse"]>>,
  bytes: Uint8Array,
): Promise<ParsedMessageEnvelope> {
  const senderEmail = parsed.from?.address?.trim().toLowerCase() ?? "";
  return Object.freeze({
    senderEmail,
    senderDomain: domain(senderEmail),
    internetMessageId: isReplyMessageId(parsed.messageId?.trim())
      ? parsed.messageId!.trim()
      : null,
    to: mailboxAddresses(parsed.to),
    cc: mailboxAddresses(parsed.cc),
    subject: typeof parsed.subject === "string" ? parsed.subject.trim() : "",
    sourceSha256: await sha256Hex(bytes),
  });
}

function relayReplyRecipients(
  parsed: Awaited<ReturnType<PostalMime["parse"]>>,
  original: ParsedMessageEnvelope,
): { to: readonly string[]; cc: readonly string[] } {
  const replyTo = mailboxAddresses(parsed.replyTo);
  if (replyTo.length > 1) throw new Error("GMAIL_RELAY_AMBIGUOUS_RECIPIENTS");
  const primary = replyTo[0] ?? original.senderEmail;
  if (
    !primary || INTERNAL_DOMAINS.has(domain(primary)) ||
    domain(primary) !== original.senderDomain
  ) throw new Error("GMAIL_RELAY_AMBIGUOUS_RECIPIENTS");
  const originalExternal = [...original.to, ...original.cc]
    .filter((address) =>
      !INTERNAL_DOMAINS.has(domain(address)) && address !== primary
    );
  if (
    originalExternal.some((address) =>
      domain(address) !== original.senderDomain
    )
  ) {
    throw new Error("GMAIL_RELAY_AMBIGUOUS_RECIPIENTS");
  }
  return {
    to: Object.freeze([primary]),
    cc: Object.freeze([...new Set(originalExternal)]),
  };
}

async function parseRelayAttachments(
  parsedOriginal: Awaited<ReturnType<PostalMime["parse"]>>,
  originalBytes: Uint8Array,
  parentSha256: string,
): Promise<readonly ParsedCopiedRequestAttachment[]> {
  if (
    originalBytes.byteLength < 1 ||
    originalBytes.byteLength > MAX_RELAY_EML_BYTES
  ) throw new Error("GMAIL_RELAY_TOO_LARGE");
  const originalSha256 = await sha256Hex(originalBytes);
  const result: ParsedCopiedRequestAttachment[] = [Object.freeze({
    bytes: originalBytes,
    contentType: "message/rfc822",
    filename: "original.eml",
    sha256: originalSha256,
    sourceRole: "original_eml",
    parentSourceSha256: parentSha256,
    processingDisposition: "automatic_eligible",
  })];
  const attachments = Array.isArray(parsedOriginal.attachments)
    ? parsedOriginal.attachments
    : [];
  if (
    attachments.length < 1 ||
    attachments.length > MAX_RELAY_ATTACHMENT_COUNT
  ) throw new Error("GMAIL_RELAY_ATTACHMENT_CARDINALITY");
  const hashes = new Set<string>();
  const filenames = new Map<string, string>();
  let totalBytes = 0;
  for (const attachment of attachments) {
    const contentType = typeof attachment.mimeType === "string"
      ? attachment.mimeType.trim().toLowerCase()
      : "";
    const supported = SUPPORTED_RELAY_ATTACHMENTS.get(contentType);
    const filename = safeFilename(attachment.filename);
    const bytes = attachmentBytes(attachment.content);
    if (
      attachment.disposition !== "attachment" || !supported || !filename ||
      !supported.extensions.some((extension) =>
        filename.toLowerCase().endsWith(extension)
      ) || bytes.byteLength < 1 ||
      bytes.byteLength > MAX_RELAY_ATTACHMENT_BYTES ||
      !hasExpectedSignature(bytes, contentType)
    ) throw new Error("GMAIL_RELAY_UNSAFE_ATTACHMENT");
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_RELAY_ATTACHMENT_TOTAL_BYTES) {
      throw new Error("GMAIL_RELAY_TOO_LARGE");
    }
    const hash = await sha256Hex(bytes);
    const priorHash = filenames.get(filename.toLowerCase());
    if (priorHash && priorHash !== hash) {
      throw new Error("GMAIL_RELAY_AMBIGUOUS_ATTACHMENT");
    }
    filenames.set(filename.toLowerCase(), hash);
    if (hashes.has(hash)) continue;
    hashes.add(hash);
    result.push(Object.freeze({
      bytes,
      contentType: supported.contentType,
      filename,
      sha256: hash,
      sourceRole: "original_attachment",
      parentSourceSha256: originalSha256,
      processingDisposition: supported.processingDisposition ??
        "automatic_eligible",
    }));
  }
  return Object.freeze(result);
}

export async function parseCopiedRequest(
  rawMime: Uint8Array,
  options: ParseCopiedRequestOptions = {},
): Promise<ParsedCopiedRequest> {
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(rawMime);
  const from = header(raw, "from");
  const toHeader = header(raw, "to");
  if (!from || !/\r?\n\r?\n/.test(raw)) throw new Error("MALFORMED_MIME");
  const parsed = await new PostalMime().parse(rawMime);
  const parentEnvelope = await envelope(parsed, rawMime);
  const recipients = [...parentEnvelope.to, ...parentEnvelope.cc];
  const supplierAddress = recipients.find((address) =>
    !INTERNAL_DOMAINS.has(domain(address))
  );
  const approvedSender = parentEnvelope.senderDomain === "xbfreight.com" ||
    parentEnvelope.senderEmail === RELAY_SENDER;

  let senderEmail = parentEnvelope.senderEmail;
  let senderDomain = parentEnvelope.senderDomain;
  let internetMessageId = parentEnvelope.internetMessageId;
  let supplierDomain = supplierAddress ? domain(supplierAddress) : "";
  let to = parentEnvelope.to;
  let cc = parentEnvelope.cc;
  let subject = parentEnvelope.subject;
  let body = safeText(parsed.text);
  let originalEnvelope: ParsedMessageEnvelope | null = null;
  let externalReplyTo = Object.freeze(
    parentEnvelope.to.filter((address) =>
      !INTERNAL_DOMAINS.has(domain(address))
    ),
  );
  let externalReplyCc = Object.freeze(
    parentEnvelope.cc.filter((address) =>
      !INTERNAL_DOMAINS.has(domain(address))
    ),
  );
  let relationship: ParsedRequestProvenance["relationship"] = "direct_copy";
  let attachments: readonly ParsedCopiedRequestAttachment[];

  const isRelayCandidate = !supplierDomain &&
    parentEnvelope.senderEmail === RELAY_SENDER &&
    /^fwd\s*:/i.test(parentEnvelope.subject) && recipients.length === 1 &&
    recipients[0] === CAPTURE_MAILBOX;
  if (isRelayCandidate && options.allowInternalRelay) {
    const outerAttachments = Array.isArray(parsed.attachments)
      ? parsed.attachments
      : [];
    const originals = outerAttachments.filter((attachment) =>
      typeof attachment.mimeType === "string" &&
      attachment.mimeType.trim().toLowerCase() === "message/rfc822" &&
      attachment.disposition === "attachment" &&
      safeFilename(attachment.filename)?.toLowerCase().endsWith(".eml")
    );
    if (outerAttachments.length !== 1 || originals.length !== 1) {
      throw new Error("GMAIL_RELAY_PARENT_CARDINALITY");
    }
    const originalBytes = attachmentBytes(originals[0].content);
    const parsedOriginal = await new PostalMime().parse(originalBytes);
    originalEnvelope = await envelope(parsedOriginal, originalBytes);
    const originalRecipients = [...originalEnvelope.to, ...originalEnvelope.cc];
    if (
      !originalEnvelope.senderEmail || !originalEnvelope.senderDomain ||
      INTERNAL_DOMAINS.has(originalEnvelope.senderDomain) ||
      !parentEnvelope.internetMessageId ||
      !originalEnvelope.internetMessageId || !originalEnvelope.subject ||
      !originalRecipients.some((address) =>
        address === RELAY_SENDER || address.endsWith("@xbfreight.com")
      ) || !safeText(parsedOriginal.text)
    ) throw new Error("UNQUALIFIED_GMAIL_MESSAGE");
    const reply = relayReplyRecipients(parsedOriginal, originalEnvelope);
    attachments = await parseRelayAttachments(
      parsedOriginal,
      originalBytes,
      parentEnvelope.sourceSha256,
    );
    relationship = "internal_relay";
    supplierDomain = originalEnvelope.senderDomain;
    internetMessageId = originalEnvelope.internetMessageId;
    subject = originalEnvelope.subject;
    body = [body, safeText(parsedOriginal.text)].filter(Boolean).join(" ");
    externalReplyTo = reply.to;
    externalReplyCc = reply.cc;
    // Compatibility projection for the existing reply-context reader. Full
    // original and parent envelopes are persisted separately.
    to = Object.freeze([...reply.to, CAPTURE_MAILBOX]);
    cc = reply.cc;
  } else {
    attachments = Object.freeze(
      await Promise.all(
        (Array.isArray(parsed.attachments) ? parsed.attachments : []).map(
          async (attachment): Promise<ParsedCopiedRequestAttachment> => {
            const bytes = attachmentBytes(attachment.content);
            return Object.freeze({
              bytes,
              contentType: typeof attachment.mimeType === "string"
                ? attachment.mimeType
                : "application/octet-stream",
              filename: safeFilename(attachment.filename),
              sha256: await sha256Hex(bytes),
              sourceRole: "direct_attachment",
              parentSourceSha256: parentEnvelope.sourceSha256,
              processingDisposition:
                typeof attachment.mimeType === "string" &&
                  attachment.mimeType.trim().toLowerCase() ===
                    "application/msword" &&
                  safeFilename(attachment.filename)?.toLowerCase().endsWith(
                    ".doc",
                  )
                  ? "manual_conversion_required"
                  : "automatic_eligible",
            });
          },
        ),
      ),
    );
  }

  if (
    !senderEmail || !toHeader || !approvedSender || !supplierDomain ||
    !recipients.includes(CAPTURE_MAILBOX)
  ) throw new Error("UNQUALIFIED_GMAIL_MESSAGE");
  const safeBody = body.slice(0, 20000);
  const applicationReference = `${subject} ${safeBody}`.match(
    /\b(?:application|account)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9-]{3,})\b/i,
  )?.[1] ?? null;
  const provenance: ParsedRequestProvenance = Object.freeze({
    relationship,
    parentEnvelope,
    originalEnvelope,
    externalReplyTo,
    externalReplyCc,
  });
  return Object.freeze({
    senderEmail,
    senderDomain,
    internetMessageId,
    supplierDomain,
    to,
    cc,
    subject,
    safeBody,
    attachments,
    requirementTokens: textTokens(`${subject} ${safeBody}`),
    applicationReference,
    provenance,
  });
}
