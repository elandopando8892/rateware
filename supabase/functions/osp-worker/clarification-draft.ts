export type ClarificationInput = {
  fieldId: string;
  question: string;
  evidenceIds: readonly string[];
};

export type ClarificationDraft = {
  caseId: string;
  status: 'operations_review_required';
  questions: readonly (ClarificationInput & { kind: 'missing' | 'contradiction' })[];
  evidenceIds: readonly string[];
  authorizationMailbox: 'sales@heymarksman.com';
  canonicalSha256: string;
};

export type ReviewedClarificationDraft = {
  caseId: string;
  status: 'operations_reviewed';
  questions: ClarificationDraft['questions'];
  evidenceIds: readonly string[];
  authorizationMailbox: 'sales@heymarksman.com';
  sourceCanonicalSha256: string;
  canonicalSha256: string;
};

const OPAQUE = /^[A-Za-z0-9:_-]{1,256}$/;
const FIELD = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;

function safeText(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 3 || value.length > 500 || /[<>]|(?:javascript|data):|https?:\/\//i.test(value)) throw new Error('CLARIFICATION_INPUT_INVALID');
  return value;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildClarificationDraft(input: {
  caseId: string;
  evidenceIds: readonly string[];
  missing: readonly ClarificationInput[];
  contradictions: readonly ClarificationInput[];
}): Promise<ClarificationDraft> {
  if (!OPAQUE.test(input.caseId) || !Array.isArray(input.evidenceIds) || !Array.isArray(input.missing) || !Array.isArray(input.contradictions)) throw new Error('CLARIFICATION_INPUT_INVALID');
  const allowedEvidence = new Set(input.evidenceIds);
  if (allowedEvidence.size !== input.evidenceIds.length || allowedEvidence.size < 1 || [...allowedEvidence].some((id) => !OPAQUE.test(id))) throw new Error('CLARIFICATION_EVIDENCE_INVALID');
  const raw = [
    ...input.missing.map((question) => ({ ...question, kind: 'missing' as const })),
    ...input.contradictions.map((question) => ({ ...question, kind: 'contradiction' as const })),
  ];
  if (raw.length < 1 || raw.length > 50) throw new Error('CLARIFICATION_INPUT_INVALID');
  const fields = new Set<string>();
  const questions = raw.map((question) => {
    if (!FIELD.test(question.fieldId) || fields.has(question.fieldId) || !Array.isArray(question.evidenceIds) || question.evidenceIds.length > 20) throw new Error('CLARIFICATION_INPUT_INVALID');
    fields.add(question.fieldId);
    const evidenceIds = [...question.evidenceIds].sort();
    if (evidenceIds.length < 1 || new Set(evidenceIds).size !== evidenceIds.length || evidenceIds.some((id) => !allowedEvidence.has(id))) throw new Error('CLARIFICATION_EVIDENCE_INVALID');
    return Object.freeze({ kind: question.kind, fieldId: question.fieldId, question: safeText(question.question), evidenceIds: Object.freeze(evidenceIds) });
  }).sort((left, right) => left.fieldId.localeCompare(right.fieldId));
  const canonical = { caseId: input.caseId, questions, evidenceIds: [...allowedEvidence].sort() };
  return Object.freeze({
    ...canonical,
    status: 'operations_review_required',
    authorizationMailbox: 'sales@heymarksman.com',
    canonicalSha256: await sha256(stable(canonical)),
  });
}

export async function reviewClarificationDraft(input: {
  source: ClarificationDraft;
  expectedCanonicalSha256: string;
  questions: ClarificationDraft['questions'];
}): Promise<ReviewedClarificationDraft> {
  const source = input.source;
  if (!source || source.status !== 'operations_review_required' || source.authorizationMailbox !== 'sales@heymarksman.com' ||
      !/^[0-9a-f]{64}$/.test(input.expectedCanonicalSha256) || input.expectedCanonicalSha256 !== source.canonicalSha256 ||
      !Array.isArray(input.questions) || input.questions.length !== source.questions.length) {
    throw new Error('CLARIFICATION_REVIEW_CONFLICT');
  }
  const sourceCanonical = { caseId: source.caseId, questions: source.questions, evidenceIds: source.evidenceIds };
  if (await sha256(stable(sourceCanonical)) !== source.canonicalSha256) throw new Error('CLARIFICATION_REVIEW_CONFLICT');
  const sourceByField = new Map(source.questions.map((question) => [question.fieldId, question]));
  const questions = input.questions.map((question) => {
    const expected = sourceByField.get(question.fieldId);
    const evidenceIds = Array.isArray(question.evidenceIds) ? [...question.evidenceIds].sort() : [];
    if (!expected || question.kind !== expected.kind || evidenceIds.join('\u0000') !== [...expected.evidenceIds].sort().join('\u0000')) {
      throw new Error('CLARIFICATION_REVIEW_SCOPE_MISMATCH');
    }
    return Object.freeze({ kind: expected.kind, fieldId: expected.fieldId, question: safeText(question.question), evidenceIds: Object.freeze(evidenceIds) });
  }).sort((left, right) => left.fieldId.localeCompare(right.fieldId));
  if (new Set(questions.map((question) => question.fieldId)).size !== source.questions.length) throw new Error('CLARIFICATION_REVIEW_SCOPE_MISMATCH');
  const canonical = { caseId: source.caseId, sourceCanonicalSha256: source.canonicalSha256, questions, evidenceIds: [...source.evidenceIds] };
  return Object.freeze({
    ...canonical,
    status: 'operations_reviewed',
    authorizationMailbox: 'sales@heymarksman.com',
    canonicalSha256: await sha256(stable(canonical)),
  });
}
