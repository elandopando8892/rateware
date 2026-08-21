export type MailboxHealth = 'watching' | 'idle' | 'disconnected' | 'unknown';

export function deriveMailboxHealth(
  connections: ReadonlyArray<{ status: string }> | undefined,
): MailboxHealth {
  if (!connections) return 'unknown';
  if (connections.some((connection) => connection.status === 'watching')) return 'watching';
  if (connections.some((connection) => connection.status === 'connected')) return 'idle';
  return 'disconnected';
}
