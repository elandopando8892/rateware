import { z } from 'zod';

export const OnboardingMetricsSchema = z.object({
  total: z.coerce.number().nonnegative(),
  blocked: z.coerce.number().nonnegative(),
  approval: z.coerce.number().nonnegative(),
  overdue: z.coerce.number().nonnegative(),
});

export const OnboardingWorkspaceRowSchema = z.object({
  id: z.uuid(),
  program_code: z.string(),
  jurisdiction_code: z.string().nullable(),
  legal_entity_kind: z.string().nullable(),
  case_status: z.string(),
  revision: z.coerce.number().int().nonnegative(),
  blocking_task_count: z.coerce.number().int().nonnegative(),
  overdue_task_count: z.coerce.number().int().nonnegative(),
  updated_at: z.string(),
});

export const OnboardingWorkspaceResponseSchema = z.object({
  data: z.object({
    rows: z.array(OnboardingWorkspaceRowSchema),
    total: z.coerce.number().int().nonnegative(),
    limit: z.coerce.number().int().positive(),
    offset: z.coerce.number().int().nonnegative(),
    queue: z.string(),
    metrics: OnboardingMetricsSchema,
  }),
});

export const GmailStatusSchema = z.object({
  mailbox_email: z.email(),
  required_scope: z.string(),
  legal_entities: z.array(z.record(z.string(), z.unknown())),
  connections: z.array(z.object({
    status: z.string(),
    mailbox_email: z.email(),
    watch_expiration_at: z.string().nullable().optional(),
    last_error: z.string().nullable().optional(),
  }).passthrough()),
  outbound_enabled: z.literal(false),
  pubsub_configured: z.boolean(),
});

export const GmailStatusResponseSchema = z.object({ data: GmailStatusSchema });

export type OnboardingWorkspaceResponse = z.infer<typeof OnboardingWorkspaceResponseSchema>;
export type GmailStatusResponse = z.infer<typeof GmailStatusResponseSchema>;
