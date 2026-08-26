import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1.0.14';

import { assessQuarterlyDocuments, createQuarterlyDocumentService } from './quarterly-document-check.ts';

const current = [
  'proof_of_address', 'sat_compliance_opinion', 'tax_status_certificate', 'bank_statement',
].map((documentType, index) => ({
  id: `version-${index}`,
  documentType,
  version: 2,
  status: 'approved',
  validFrom: '2026-08-01',
  expiresAt: '2026-11-01',
}));

Deno.test('quarterly document gate requires exactly the latest current approved four-document set', () => {
  const result = assessQuarterlyDocuments({ referenceDate: '2026-08-24', versions: current });
  assertEquals(result.blocked, false);
  assertEquals(result.currentVersionIds, ['version-0', 'version-1', 'version-2', 'version-3']);
  assertEquals(result.missingTypes, []);
  assertEquals(result.expiringTypes, []);

  const blocked = assessQuarterlyDocuments({
    referenceDate: '2026-08-24',
    versions: [
      ...current.filter((version) => version.documentType !== 'bank_statement'),
      { ...current[3], status: 'review_required' },
      { ...current[0], id: 'future-proof', version: 3, validFrom: '2026-09-01', expiresAt: '2026-12-01' },
    ],
  });
  assertEquals(blocked.blocked, true);
  assertEquals(blocked.missingTypes, ['bank_statement']);
  assertEquals(blocked.currentVersionIds.includes('future-proof'), false);
});

Deno.test('quarterly document gate emits stable pre-expiry notices without sending them', async () => {
  const assessments: unknown[] = [];
  const service = createQuarterlyDocumentService({
    loadVersions: async () => current.map((version) => ({ ...version, expiresAt: '2026-09-01' })),
    persistAssessment: async (assessment) => { assessments.push(assessment); },
  });
  const result = await service.check({ organizationId: 'org-1', referenceDate: new Date('2026-08-24T12:00:00.000Z'), correlationId: 'job-1' });
  assertEquals(result.expiringTypes, ['bank_statement', 'proof_of_address', 'sat_compliance_opinion', 'tax_status_certificate']);
  assertEquals(result.noticeKeys, [
    'quarterly:bank_statement:version-3:14',
    'quarterly:bank_statement:version-3:30',
    'quarterly:proof_of_address:version-0:14',
    'quarterly:proof_of_address:version-0:30',
    'quarterly:sat_compliance_opinion:version-1:14',
    'quarterly:sat_compliance_opinion:version-1:30',
    'quarterly:tax_status_certificate:version-2:14',
    'quarterly:tax_status_certificate:version-2:30',
  ]);
  assertEquals(result.notices.map((notice) => notice.boundaryDays), [14, 30, 14, 30, 14, 30, 14, 30]);
  assertEquals(assessments.length, 1);
  assertEquals('send' in service, false);
});

Deno.test('quarterly document gate rejects ambiguous versions and noncanonical dates', async () => {
  assertThrows(() => assessQuarterlyDocuments({ referenceDate: '2026-08-24', versions: [...current, { ...current[0], id: 'ambiguous' }] }), Error, 'QUARTERLY_DOCUMENT_AMBIGUOUS');
  assertThrows(() => assessQuarterlyDocuments({ referenceDate: '2026-8-24', versions: current }), Error, 'QUARTERLY_DOCUMENT_INVALID');
  await assertRejects(() => createQuarterlyDocumentService({ loadVersions: async () => { throw new Error('DATABASE_TEMPORARY'); }, persistAssessment: async () => undefined }).check({ organizationId: 'org-1', referenceDate: new Date('2026-08-24T00:00:00.000Z'), correlationId: 'job-1' }), Error, 'DATABASE_TEMPORARY');
});
