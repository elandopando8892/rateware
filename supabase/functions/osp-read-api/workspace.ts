import type { OspAuthorizationIdentity } from './auth-policy.ts';
import type { OspReadStore } from './store.ts';

export async function resolveWorkspace(
  store: OspReadStore,
  identity: OspAuthorizationIdentity,
  signal?: AbortSignal,
): Promise<string> {
  return await store.resolveWorkspace(identity, signal);
}
