import { z } from 'zod';

export const AnswerMemoryEvidenceOptionSchema = z.strictObject({
  reviewId: z.uuid(), reviewFieldId: z.uuid(), reviewRevision: z.number().int().positive(),
  documentAssetId: z.uuid(), fieldCode: z.string().min(1).max(128),
  reviewedValue: z.string().max(2000), currentFactId: z.uuid().nullable(), currentValue: z.string().max(2000).nullable(),
  evidenceExpiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  state: z.enum(['already_reusable', 'renewal_required', 'document_promotion_required', 'fact_conflict', 'blocked']),
  documentFieldCount: z.number().int().nonnegative(),
  expectationSha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});
export const AnswerMemoryEvidenceResponseSchema = z.strictObject({ version: z.literal(1), data: z.strictObject({
  options: z.array(AnswerMemoryEvidenceOptionSchema).max(20),
  readOnly: z.literal(true), externalEffects: z.literal(false),
}) });
export type AnswerMemoryEvidenceOption = z.infer<typeof AnswerMemoryEvidenceOptionSchema>;
export type AnswerMemoryEvidence = z.infer<typeof AnswerMemoryEvidenceResponseSchema>['data'];

export const AnswerMemoryEvidenceLinkInputSchema = z.strictObject({
  caseId: z.uuid(), candidateId: z.uuid(), reviewFieldId: z.uuid(), factId: z.uuid(),
  answerSha256: z.string().regex(/^[0-9a-f]{64}$/), expectationSha256: z.string().regex(/^[0-9a-f]{64}$/),
  action: z.enum(['link', 'renew']), reason: z.string().trim().min(10).max(1000),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9:_-]{1,256}$/), confirmed: z.literal(true),
});
export const AnswerMemoryEvidenceLinkResponseSchema = z.strictObject({ version: z.literal(1), data: z.strictObject({
  receiptId: z.uuid(), factId: z.uuid(), action: z.enum(['link', 'renew']), replayed: z.boolean(), externalEffects: z.literal(false),
}) });
export type AnswerMemoryEvidenceLinkInput = z.infer<typeof AnswerMemoryEvidenceLinkInputSchema>;
export type AnswerMemoryEvidenceLinkReceipt = z.infer<typeof AnswerMemoryEvidenceLinkResponseSchema>['data'];
