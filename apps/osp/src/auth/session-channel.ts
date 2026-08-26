export interface SessionChannel {
  publish(generation: string): void;
  subscribe(listener: (generation: string) => void): () => void;
  close(): void;
}

type BroadcastChannelLike = {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  close(): void;
};

function isInvalidationMessage(
  value: unknown,
): value is { type: 'session-invalidated'; generation: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length === 2
    && entries.some(([key, entry]) => key === 'type' && entry === 'session-invalidated')
    && entries.some(([key, entry]) => key === 'generation'
      && typeof entry === 'string'
      && entry.length > 0);
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' && value !== null)
    || typeof value === 'function'
  ) && typeof (value as { then?: unknown }).then === 'function';
}

function containListenerResult(value: unknown): void {
  try {
    if (isThenable(value)) void Promise.resolve(value).catch(() => undefined);
  } catch {
    // Listener-return inspection never exposes sensitive error details.
  }
}

export function createSessionChannel(
  createBroadcastChannel: ((name: string) => BroadcastChannelLike) | undefined =
    typeof BroadcastChannel === 'undefined'
      ? undefined
      : (name) => new BroadcastChannel(name),
): SessionChannel {
  if (!createBroadcastChannel) {
    return {
      publish: () => undefined,
      subscribe: () => () => undefined,
      close: () => undefined,
    };
  }

  const channel = createBroadcastChannel('osp-session-v1');
  const listeners = new Set<(generation: string) => void>();
  let closed = false;
  const onMessage = (event: MessageEvent<unknown>) => {
    if (!isInvalidationMessage(event.data)) return;
    for (const listener of [...listeners]) {
      try {
        containListenerResult(listener(event.data.generation) as unknown);
      } catch {
        // A consumer cannot interrupt delivery to the channel's other listeners.
      }
    }
  };
  try {
    channel.addEventListener('message', onMessage);
  } catch (error) {
    try {
      channel.close();
    } catch {
      // Preserve the listener-installation failure after attempting raw cleanup.
    }
    throw error;
  }

  return {
    publish(generation) {
      channel.postMessage({ type: 'session-invalidated', generation });
    },
    subscribe(listener) {
      if (closed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      if (closed) return;
      closed = true;
      listeners.clear();
      try {
        channel.removeEventListener('message', onMessage);
      } catch {
        // Closing the underlying channel remains independent of listener cleanup.
      }
      channel.close();
    },
  };
}
