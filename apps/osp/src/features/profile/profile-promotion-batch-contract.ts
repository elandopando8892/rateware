import { z } from 'zod';

export const ProfilePromotionBatchSchema = z.strictObject({
  reviewId: z.uuid(), reviewRevision: z.number().int().positive(),
  comparisonSha256: z.string().regex(/^[0-9a-f]{64}$/),
  ready: z.boolean(), totalFields: z.number().int().nonnegative(),
  rows: z.array(z.strictObject({
    fieldId: z.uuid(), fieldCode: z.string().regex(/^[a-z][a-z0-9_]{1,127}$/),
    decision: z.enum(['accepted', 'corrected', 'withheld', 'rejected', 'pending']),
    change: z.enum(['new', 'replace', 'unchanged', 'withheld', 'rejected', 'blocked']),
    currentFactId: z.uuid().nullable(), before: z.string().max(4000).nullable(), after: z.string().max(4000).nullable(),
  })).max(128), readOnly: z.literal(true), externalEffects: z.literal(false),
}).superRefine((batch, ctx) => {
  const fail = () => ctx.addIssue({ code: 'custom', message: 'Incomplete or inconsistent documentary batch' });
  if (batch.totalFields <= 128 && batch.totalFields !== batch.rows.length) fail();
  if (batch.totalFields > 128 && (batch.ready || batch.rows.length !== 0)) fail();
  if (new Set(batch.rows.map((row) => row.fieldId)).size !== batch.rows.length) fail();
  if (batch.ready && (batch.rows.length === 0 || new Set(batch.rows.map((row) => row.fieldCode)).size !== batch.rows.length ||
      batch.rows.some((row) => row.change === 'blocked') || !batch.rows.some((row) => ['new', 'replace', 'unchanged'].includes(row.change)))) fail();
  for (const row of batch.rows) {
    if (['withheld', 'rejected', 'blocked'].includes(row.change)) {
      if (row.before !== null || row.after !== null) fail();
    } else if (!['accepted', 'corrected'].includes(row.decision) || row.after === null ||
        (row.change === 'new' && (row.currentFactId !== null || row.before !== null)) ||
        (row.change !== 'new' && (row.currentFactId === null || row.before === null)) ||
        (row.change === 'unchanged' && row.before !== row.after) ||
        (row.change === 'replace' && row.before === row.after)) fail();
    if (row.change === 'withheld' && row.decision !== 'withheld' || row.change === 'rejected' && row.decision !== 'rejected') fail();
  }
});
export type ProfilePromotionBatch = z.infer<typeof ProfilePromotionBatchSchema>;
