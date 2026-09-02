export type ReplyContext = {
  to: readonly string[];
  cc: readonly string[];
  subject: string;
  inReplyTo: string;
  references: readonly string[];
};

export type CapturedReplySource = {
  senderEmail: unknown;
  internetMessageId: unknown;
  subject: unknown;
  to: unknown;
  cc: unknown;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MESSAGE_ID = /^<[^<>\s@]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?>$/;

export function isReplyMessageId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 5 &&
    value.length <= 998 && MESSAGE_ID.test(value);
}

function addresses(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > 50) return null;
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const email = item.trim().toLowerCase();
    if (
      email.length < 3 || email.length > 254 || !EMAIL.test(email) ||
      email.includes("\r") || email.includes("\n")
    ) return null;
    if (!result.includes(email)) result.push(email);
  }
  return Object.freeze(result);
}

export function deriveReplyContext(
  source: CapturedReplySource,
): ReplyContext | null {
  const senderIsXbf = typeof source.senderEmail === "string" &&
    source.senderEmail.endsWith("@xbfreight.com");
  const senderIsSales = source.senderEmail === "sales@heymarksman.com";
  if (
    typeof source.senderEmail !== "string" ||
    source.senderEmail !== source.senderEmail.trim().toLowerCase() ||
    source.senderEmail.length > 254 || !EMAIL.test(source.senderEmail) ||
    (!senderIsXbf && !senderIsSales) ||
    source.senderEmail === "carriers@xbfreight.com" ||
    !isReplyMessageId(source.internetMessageId) ||
    typeof source.subject !== "string"
  ) return null;
  const originalTo = addresses(source.to);
  const originalCc = addresses(source.cc);
  const originalSubject = source.subject.trim();
  const carriersCaptured = originalTo?.includes("carriers@xbfreight.com") ||
    originalCc?.includes("carriers@xbfreight.com");
  if (
    originalTo === null || originalTo.length === 0 || originalCc === null ||
    !carriersCaptured ||
    originalSubject.length === 0 || originalSubject.includes("\r") ||
    originalSubject.includes("\n")
  ) return null;
  const subjectBase = originalSubject.replace(/^(?:re\s*:\s*)+/i, "").trim();
  if (subjectBase.length === 0) return null;
  const subject = `Re: ${subjectBase}`;
  if (subject.length > 998) return null;
  if (senderIsSales) {
    const internal = (email: string) =>
      email.endsWith("@xbfreight.com") || email.endsWith("@heymarksman.com");
    const to = [...new Set(originalTo)].filter((email) => !internal(email));
    const cc = [
      source.senderEmail,
      ...new Set(
        originalCc.filter((email) => !internal(email) && !to.includes(email)),
      ),
    ];
    if (to.length === 0 || to.length > 50 || cc.length > 50) return null;
    return Object.freeze({
      to: Object.freeze(to),
      cc: Object.freeze(cc),
      subject,
      inReplyTo: source.internetMessageId,
      references: Object.freeze([source.internetMessageId]),
    });
  }
  const cc = [...new Set([...originalTo, ...originalCc])].filter((email) =>
    email !== source.senderEmail && email !== "carriers@xbfreight.com"
  );
  if (cc.length > 50) return null;
  return Object.freeze({
    to: Object.freeze([source.senderEmail]),
    cc: Object.freeze(cc),
    subject,
    inReplyTo: source.internetMessageId,
    references: Object.freeze([source.internetMessageId]),
  });
}
