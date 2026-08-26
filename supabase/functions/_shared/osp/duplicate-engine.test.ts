import { assert, assertEquals } from 'jsr:@std/assert@1.0.14';

import { assessDuplicates, type DuplicateCandidate } from './duplicate-engine.ts';

const candidate = (id: string, changes: Partial<DuplicateCandidate> = {}): DuplicateCandidate => ({
  caseId: id,
  gmailMessageId: `message-${id}`,
  rawMimeHash: `a${id.padStart(63, '0')}`,
  attachmentHashes: [],
  gmailThreadId: `thread-${id}`,
  supplierDomain: 'supplier.example.test',
  applicationReference: null,
  receivedAt: '2026-08-22T00:00:00.000Z',
  requirementTokens: ['application', 'registration'],
  ...changes,
});

Deno.test('exact Gmail id and raw MIME hash attach idempotently, attachment reuse does not', () => {
  const incoming = candidate('new', { gmailMessageId: 'message-exact', rawMimeHash: 'b'.repeat(64), attachmentHashes: ['c'.repeat(64)] });
  assertEquals(assessDuplicates(incoming, [candidate('gmail', { gmailMessageId: 'message-exact' })]).outcome, 'exact');
  assertEquals(assessDuplicates(incoming, [candidate('mime', { rawMimeHash: 'b'.repeat(64) })]).outcome, 'exact');
  assertEquals(assessDuplicates(incoming, [candidate('attachment', { attachmentHashes: ['c'.repeat(64)], supplierDomain: 'other.example.test', gmailThreadId: 'other-thread', requirementTokens: ['unrelated'] })]).outcome, 'new');
});

Deno.test('probable signals retain candidates for human review and never merge', () => {
  const incoming = candidate('new', { gmailThreadId: 'thread-shared' });
  const assessment = assessDuplicates(incoming, [candidate('existing', { gmailThreadId: 'thread-shared' })]);
  assertEquals(assessment.outcome, 'probable');
  if (assessment.outcome === 'probable') assertEquals(assessment.candidateCaseIds, ['existing']);
  assert(assessment.evidence.some((signal) => signal.kind === 'thread_ancestry'));
});

Deno.test('reference/date and lexical requirements form probable evidence at the 0.82 threshold', () => {
  const incoming = candidate('new', { applicationReference: 'APP-42', requirementTokens: ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'] });
  const assessment = assessDuplicates(incoming, [candidate('existing', { applicationReference: 'APP-42', requirementTokens: ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'] })]);
  assertEquals(assessment.outcome, 'probable');
  assert(assessment.evidence.some((signal) => signal.kind === 'application_reference'));
  assert(assessment.evidence.some((signal) => signal.kind === 'requirement_similarity'));
});
