import { GmailReadModelSchema } from '../../api/contracts';

export type MailboxHealth = 'unknown' | 'disconnected' | 'connected' | 'watching' | 'degraded';

export function deriveMailboxHealth(
  evidence: unknown,
  clock: () => Date = () => new Date(),
): MailboxHealth {
  const parsed = GmailReadModelSchema.safeParse(evidence);
  if (!parsed.success) return 'unknown';
  const model = parsed.data;
  if (!model.connection_exists) return 'disconnected';

  const now = clock().getTime();
  if (!Number.isFinite(now)) return 'unknown';
  const tokenExpiration = model.token_expires_at === null
    ? null
    : new Date(model.token_expires_at).getTime();
  const watchExpiration = model.watch_expires_at === null
    ? null
    : new Date(model.watch_expires_at).getTime();

  if (
    model.error_present
    || tokenExpiration === null
    || (model.watch_configured && !model.pubsub_configured)
    || (model.watch_configured && (watchExpiration === null || watchExpiration <= now))
  ) return 'degraded';

  return model.watch_configured ? 'watching' : 'connected';
}
