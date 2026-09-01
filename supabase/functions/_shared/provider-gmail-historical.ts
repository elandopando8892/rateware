import { gmailJson } from "./provider-gmail-sync.ts";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const GMAIL_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_RESULTS = 25;
const MAX_WINDOW_DAYS = 31;

export type ProviderGmailHistoricalCriteria = Readonly<{
  subjectPhrase: string;
  afterDate: string;
  beforeDate: string;
}>;

export type ProviderGmailHistoricalCandidate = Readonly<{
  gmailMessageId: string;
  gmailThreadId: string;
  subject: string;
  senderDomain: string;
  receivedAt: string;
  attachmentCount: number;
}>;

type GmailRequest = (
  accessToken: string,
  path: string,
  init?: RequestInit,
) => Promise<Record<string, any>>;

function exactDate(value: string): Date {
  if (!DATE_ONLY.test(value)) throw new Error("INVALID_HISTORICAL_SEARCH");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("INVALID_HISTORICAL_SEARCH");
  }
  return parsed;
}

export function normalizeProviderGmailHistoricalCriteria(
  input: ProviderGmailHistoricalCriteria,
): ProviderGmailHistoricalCriteria {
  const subjectPhrase = input.subjectPhrase.trim();
  if (
    subjectPhrase !== input.subjectPhrase || subjectPhrase.length < 3 ||
    subjectPhrase.length > 200 || /[\u0000-\u001f\u007f"\\]/.test(subjectPhrase)
  ) throw new Error("INVALID_HISTORICAL_SEARCH");
  const after = exactDate(input.afterDate);
  const before = exactDate(input.beforeDate);
  const windowDays = (before.getTime() - after.getTime()) / 86_400_000;
  if (windowDays < 1 || windowDays > MAX_WINDOW_DAYS) {
    throw new Error("INVALID_HISTORICAL_SEARCH");
  }
  return Object.freeze({
    subjectPhrase,
    afterDate: input.afterDate,
    beforeDate: input.beforeDate,
  });
}

export function buildProviderGmailHistoricalQuery(
  input: ProviderGmailHistoricalCriteria,
): string {
  const criteria = normalizeProviderGmailHistoricalCriteria(input);
  return [
    `subject:"${criteria.subjectPhrase}"`,
    `after:${criteria.afterDate.replaceAll("-", "/")}`,
    `before:${criteria.beforeDate.replaceAll("-", "/")}`,
  ].join(" ");
}

function header(payload: Record<string, any>, name: string): string {
  const target = name.toLowerCase();
  const headers = Array.isArray(payload?.headers) ? payload.headers : [];
  const value = headers.find((item: any) =>
    String(item?.name || "").toLowerCase() === target
  )?.value;
  return typeof value === "string" ? value.trim().slice(0, 998) : "";
}

function senderDomain(value: string): string {
  const match = value.toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})/);
  return match?.[1]?.slice(0, 253) || "unknown.invalid";
}

function attachmentCount(payload: Record<string, any>): number {
  const queue = [payload];
  let count = 0;
  while (queue.length > 0 && count <= 100) {
    const part = queue.shift();
    if (!part || typeof part !== "object") continue;
    if (
      typeof part.filename === "string" && part.filename.trim() &&
      typeof part?.body?.attachmentId === "string" && part.body.attachmentId
    ) count += 1;
    if (Array.isArray(part.parts)) queue.push(...part.parts);
  }
  return Math.min(count, 100);
}

export async function searchProviderGmailHistoricalInbox(
  accessToken: string,
  input: ProviderGmailHistoricalCriteria,
  requestGmailJson: GmailRequest = gmailJson,
): Promise<
  Readonly<
    { query: string; candidates: readonly ProviderGmailHistoricalCandidate[] }
  >
> {
  const criteria = normalizeProviderGmailHistoricalCriteria(input);
  const query = buildProviderGmailHistoricalQuery(criteria);
  const params = new URLSearchParams({
    maxResults: String(MAX_RESULTS),
    q: query,
  });
  const listed = await requestGmailJson(
    accessToken,
    `/messages?${params.toString()}`,
  );
  const ids = [
    ...new Set(
      (Array.isArray(listed.messages) ? listed.messages : [])
        .map((item: any) => String(item?.id || ""))
        .filter((id: string) => GMAIL_ID.test(id)),
    ),
  ].slice(0, MAX_RESULTS);
  const candidates: ProviderGmailHistoricalCandidate[] = [];
  for (const id of ids) {
    const raw = await requestGmailJson(
      accessToken,
      `/messages/${encodeURIComponent(id)}?format=FULL`,
    );
    const subject = header(raw.payload || {}, "Subject");
    if (!subject.toLowerCase().includes(criteria.subjectPhrase.toLowerCase())) {
      continue;
    }
    const threadId = String(raw.threadId || "");
    const internalDate = Number(raw.internalDate);
    if (!GMAIL_ID.test(threadId) || !Number.isFinite(internalDate)) continue;
    candidates.push(Object.freeze({
      gmailMessageId: id,
      gmailThreadId: threadId,
      subject,
      senderDomain: senderDomain(header(raw.payload || {}, "From")),
      receivedAt: new Date(internalDate).toISOString(),
      attachmentCount: attachmentCount(raw.payload || {}),
    }));
  }
  return Object.freeze({ query, candidates: Object.freeze(candidates) });
}
