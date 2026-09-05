import { z } from 'zod';

export const AnswerMemoryCandidateSchema = z.strictObject({
  id: z.uuid(), label: z.string(), value: z.string(), canonicalFieldId: z.string(),
  answerSha256: z.string().regex(/^[0-9a-f]{64}$/), sourceInstanceId: z.uuid(), sourceVersion: z.number().int().positive(),
  legalEntityId: z.uuid().nullable(), stale: z.boolean(),
  decision: z.enum(['pending_review', 'accepted', 'rejected']), reason: z.string().nullable(),
});
export const AnswerMemoryReviewInputSchema = z.strictObject({
  caseId: z.uuid(), candidateId: z.uuid(), answerSha256: z.string().regex(/^[0-9a-f]{64}$/),
  decision: z.enum(['accepted', 'rejected']), reason: z.string().trim().min(10).max(1000),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9:_-]{1,256}$/),
});
export const AnswerMemoryReviewResponseSchema = z.strictObject({ version: z.literal(1), data: z.strictObject({
  reviewId: z.uuid(), decision: z.enum(['accepted', 'rejected']), replayed: z.boolean(), approvedForReuse: z.literal(false),
}) });
export type AnswerMemoryCandidate = z.infer<typeof AnswerMemoryCandidateSchema>;
export type AnswerMemoryReviewInput = z.infer<typeof AnswerMemoryReviewInputSchema>;
export type AnswerMemoryReviewReceipt = z.infer<typeof AnswerMemoryReviewResponseSchema>['data'];
