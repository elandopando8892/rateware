import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.14';

import { buildClarificationDraft } from './clarification-draft.ts';
import * as clarificationModule from './clarification-draft.ts';

Deno.test('clarification draft contains only cited missing and contradictory questions', async () => {
  const draft = await buildClarificationDraft({
    caseId: 'case-1',
    evidenceIds: ['ev-1', 'ev-2'],
    missing: [{ fieldId: 'supplier.address', question: 'Please confirm the registered address.', evidenceIds: ['ev-1'] }],
    contradictions: [{ fieldId: 'banking.accountNumber', question: 'Which bank account is current?', evidenceIds: ['ev-1', 'ev-2'] }],
  });
  assertEquals(draft.status, 'operations_review_required');
  assertEquals(draft.questions.map((question) => question.fieldId), ['banking.accountNumber', 'supplier.address']);
  assertEquals(draft.evidenceIds, ['ev-1', 'ev-2']);
  assertEquals(draft.authorizationMailbox, 'sales@heymarksman.com');
  assertEquals('send' in draft, false);
  assertEquals(draft.canonicalSha256.length, 64);
});

Deno.test('clarification drafting fails closed on unknown evidence and uncited text', async () => {
  const base = { caseId: 'case-1', evidenceIds: ['ev-1'], contradictions: [] as never[] };
  await assertRejects(() => buildClarificationDraft({ ...base, missing: [{ fieldId: 'supplier.address', question: 'Address?', evidenceIds: ['ev-2'] }] }), Error, 'CLARIFICATION_EVIDENCE_INVALID');
  await assertRejects(() => buildClarificationDraft({ ...base, missing: [{ fieldId: 'supplier.address', question: 'Address?', evidenceIds: [] }] }), Error, 'CLARIFICATION_EVIDENCE_INVALID');
});

Deno.test('clarification drafting consolidates exact duplicates but retains distinct constraints', async () => {
  const draft = await buildClarificationDraft({
    caseId: 'case-1',
    evidenceIds: ['ev-1', 'ev-2'],
    missing: [
      { fieldId: 'supplier.address', question: 'Please provide the registered address.', evidenceIds: ['ev-1'] },
      { fieldId: 'supplier.address', question: 'Please provide the registered address.', evidenceIds: ['ev-2'] },
      { fieldId: 'supplier.address', question: 'Confirm the address effective date.', evidenceIds: ['ev-1'] },
    ],
    contradictions: [],
  });
  assertEquals(draft.questions.length, 2);
  assertEquals(draft.questions.map((question) => question.question), ['Confirm the address effective date.', 'Please provide the registered address.']);
  assertEquals(draft.questions[1]?.evidenceIds, ['ev-1', 'ev-2']);
});

Deno.test('Operations review may edit question text but cannot substitute cited scope', async () => {
  const source = await buildClarificationDraft({
    caseId: 'case-1',
    evidenceIds: ['ev-1'],
    missing: [{ fieldId: 'supplier.address', question: 'Please confirm the registered address.', evidenceIds: ['ev-1'] }],
    contradictions: [],
  });
  const exported = clarificationModule as unknown as Record<string, unknown>;
  assertEquals(typeof exported.reviewClarificationDraft, 'function');
  const review = exported.reviewClarificationDraft as (input: unknown) => Promise<Record<string, unknown>>;
  const reviewed = await review({
    source,
    expectedCanonicalSha256: source.canonicalSha256,
    questions: [{ kind: 'missing', fieldId: 'supplier.address', question: 'Please provide the current registered address.', evidenceIds: ['ev-1'] }],
  });
  assertEquals(reviewed.status, 'operations_reviewed');
  assertEquals(reviewed.sourceCanonicalSha256, source.canonicalSha256);
  assertEquals(reviewed.canonicalSha256 === source.canonicalSha256, false);
  await assertRejects(() => review({
    source,
    expectedCanonicalSha256: source.canonicalSha256,
    questions: [{ kind: 'missing', fieldId: 'supplier.address', question: 'Please provide the current registered address.', evidenceIds: ['ev-2'] }],
  }), Error, 'CLARIFICATION_REVIEW_SCOPE_MISMATCH');
});

Deno.test('Operations review preserves distinct questions that share a field', async () => {
  const exported = clarificationModule as unknown as Record<string, unknown>;
  const review = exported.reviewClarificationDraft as (input: unknown) => Promise<Record<string, unknown>>;
  const source = await buildClarificationDraft({
    caseId: 'case-1', evidenceIds: ['ev-1', 'ev-2'],
    missing: [
      { fieldId: 'supplier.address', question: 'Please provide the registered address.', evidenceIds: ['ev-1'] },
      { fieldId: 'supplier.address', question: 'Confirm the address effective date.', evidenceIds: ['ev-2'] },
    ], contradictions: [],
  });
  const reviewed = await review({
    source,
    expectedCanonicalSha256: source.canonicalSha256,
    questions: source.questions.map((question) => ({ ...question, question: `${question.question} Reviewed.` })),
  });
  assertEquals((reviewed.questions as readonly unknown[]).length, 2);
  await assertRejects(() => review({
    source,
    expectedCanonicalSha256: source.canonicalSha256,
    questions: [{ ...source.questions[0], question: 'Only one question.' }],
  }), Error, 'CLARIFICATION_REVIEW_CONFLICT');
});
