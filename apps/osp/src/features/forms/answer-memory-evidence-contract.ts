import { z } from 'zod';

export const AnswerMemoryEvidenceOptionSchema = z.strictObject({
  reviewId: z.uuid(), reviewFieldId: z.uuid(), reviewRevision: z.number().int().positive(),
  documentAssetId: z.uuid(), fieldCode: z.string().min(1).max(128),
  reviewedValue: z.string().max(2000), currentFactId: z.uuid().nullable(), currentValue: z.string().max(2000).nullable(),
  evidenceExpiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  state: z.enum(['already_reusable', 'renewal_required', 'document_promotion_required', 'fact_conflict', 'blocked']),
  documentFieldCount: z.number().int().nonnegative(),
});
export const AnswerMemoryEvidenceResponseSchema = z.strictObject({ version: z.literal(1), data: z.strictObject({
  options: z.array(AnswerMemoryEvidenceOptionSchema).max(20),
  readOnly: z.literal(true), externalEffects: z.literal(false),
}) });
export type AnswerMemoryEvidenceOption = z.infer<typeof AnswerMemoryEvidenceOptionSchema>;
export type AnswerMemoryEvidence = z.infer<typeof AnswerMemoryEvidenceResponseSchema>['data'];
