import createKindeClient from '@kinde-oss/kinde-auth-pkce-js';
import type {
  KindeClientOptions,
  RedirectOptions,
} from '@kinde-oss/kinde-auth-pkce-js';

import {
  authRedirectUri,
  type RuntimeConfig,
} from '../config/runtime';
import type {
  BoundSession,
  ManagedAuthPort,
  OspAuthorizationIdentity,
} from './auth-port';
import { createSessionChannel, type SessionChannel } from './session-channel';
import {
  assertVerifiedAccessTokenMatchesSession,
  bindVerifiedTokenPair,
  createKindeTokenVerifier,
  type KindeTokenVerifier,
} from './token-binding';

type KindeClientBoundary = {
  isAuthenticated(): Promise<boolean>;
  getAccessToken(): Promise<string | undefined>;
  getIdToken(): Promise<string | undefined>;
  getToken(options?: { isForceRefresh?: boolean }): Promise<string | undefined>;
  login(options?: RedirectOptions): Promise<void>;
  logout(options?: string | { allSessions?: boolean; redirectUrl?: string }): Promise<void>;
};

const PRODUCTION_KINDE_ORGANIZATION = 'org_dbc2fd12c76';

type KindeAuthPortDependencies = {
  origin?: string;
  createClient?: (options: KindeClientOptions) => Promise<KindeClientBoundary>;
  createGeneration?: () => string;
  createSessionChannel?: () => SessionChannel | PromiseLike<SessionChannel>;
  sessionChannel?: SessionChannel;
  replaceUrl?: (returnTo: string) => void;
  tokenVerifier?: KindeTokenVerifier;
};

type ActivationAttempt = {
  epoch: number;
  source?: unknown;
  sourceSettled: boolean;
  sourceOwnership?: FactorySourceOwnership;
  factorySource?: FactorySourceOwnership;
  reconcileSharedFactoryWaiters?: () => void;
  channel?: SessionChannel;
  leasedChannel?: SessionChannel;
  unsubscribe?: () => void;
  cleanedChannel?: SessionChannel;
  cleanedUnsubscribe?: () => void;
  invalidateFromSharedChannel?: () => void;
};

type DeferredInvalidation = {
  generation: string;
  publication?: {
    owner: ActivationAttempt;
    settled: Promise<void>;
    settle(): void;
  };
};

type ChannelOwnership = {
  owners: Set<ActivationAttempt>;
  closing: boolean;
  retired: boolean;
};

type FactorySourceOwnership = {
  waiters: Set<ActivationAttempt>;
  guards: Set<ActivationAttempt>;
};

type DeferredUnclaimedCandidate = {
  source?: FactorySourceOwnership;
  attempts: Set<ActivationAttempt>;
};

// A SessionChannel has no reopen operation. Its ownership must therefore be
// process-wide: one port cannot close a transport that another port is still
// using (or is in the middle of subscribing to).
const sessionChannelOwnership = new WeakMap<SessionChannel, ChannelOwnership>();
const factorySourceOwnership = new WeakMap<object, FactorySourceOwnership>();
// Distinct factory promises may still converge on the same transport. Keep
// unclaimed results reversible until every currently interested factory has
// either settled or been canceled, regardless of which port/source created it.
const pendingFactoryWaiters = new Set<ActivationAttempt>();
// A non-native PromiseLike is permitted to resolve differently for each
// waiter. Keep a canceled waiter's valid result associated with the shared
// source, rather than with the individual attempt: a remaining waiter may
// still claim that channel, and the final source outcome must reclaim it if
// nobody does.
const deferredUnclaimedChannels = new Map<
  SessionChannel,
  Set<DeferredUnclaimedCandidate>
>();

function isSessionChannel(value: unknown): value is SessionChannel {
  if (!((typeof value === 'object' && value !== null) || typeof value === 'function')) {
    return false;
  }
  try {
    const candidate = value as Partial<SessionChannel>;
    return typeof candidate.publish === 'function'
      && typeof candidate.subscribe === 'function'
      && typeof candidate.close === 'function';
  } catch {
    return false;
  }
}

function channelOwnership(channel: SessionChannel): ChannelOwnership {
  let ownership = sessionChannelOwnership.get(channel);
  if (!ownership) {
    ownership = { owners: new Set(), closing: false, retired: false };
    sessionChannelOwnership.set(channel, ownership);
  }
  return ownership;
}

function closeUnclaimedChannel(channel: SessionChannel): void {
  const ownership = channelOwnership(channel);
  if (ownership.retired || ownership.closing || ownership.owners.size > 0) return;
  ownership.retired = true;
  ownership.closing = true;
  try {
    containReturnedThenable(channel.close());
  } catch {
    // A stale raw resource is best-effort cleanup only.
  }
  ownership.closing = false;
}

function reconcileDeferredUnclaimedChannels(): void {
  for (const [channel, candidates] of [...deferredUnclaimedChannels]) {
    const ownership = channelOwnership(channel);
    if (ownership.owners.size > 0 || ownership.retired || ownership.closing) {
      deferredUnclaimedChannels.delete(channel);
      continue;
    }
    const hasPotentialClaim = pendingFactoryWaiters.size > 0
      || [...candidates].some((candidate) => (
      (candidate.source?.waiters.size ?? 0) > 0
      || [...candidate.attempts].some((attempt) => attempt.sourceOwnership !== undefined)
      ));
    if (hasPotentialClaim) continue;
    deferredUnclaimedChannels.delete(channel);
    closeUnclaimedChannel(channel);
  }
}

function deferUnclaimedChannel(
  channel: SessionChannel,
  source: FactorySourceOwnership | undefined,
  attempts: Set<ActivationAttempt>,
): void {
  let candidates = deferredUnclaimedChannels.get(channel);
  if (!candidates) {
    candidates = new Set();
    deferredUnclaimedChannels.set(channel, candidates);
  }
  candidates.add({ source, attempts });
  reconcileDeferredUnclaimedChannels();
}

function sameIdentity(left: OspAuthorizationIdentity, right: OspAuthorizationIdentity): boolean {
  return left.issuer === right.issuer
    && left.authorizedParty === right.authorizedParty
    && left.subject === right.subject
    && left.organization === right.organization
    && left.email === right.email;
}

function sameSession(left: BoundSession, right: BoundSession): boolean {
  return left.generation === right.generation && sameIdentity(left.identity, right.identity);
}

function safeReturnTo(returnTo: unknown, origin: string): string {
  if (typeof returnTo !== 'string') throw new Error('Invalid returnTo');
  let parsed: URL;
  try {
    parsed = new URL(returnTo, origin);
  } catch (error) {
    throw new Error('Invalid returnTo', { cause: error });
  }
  if (
    parsed.origin !== origin
    || (parsed.pathname !== '/app' && !parsed.pathname.startsWith('/app/'))
  ) {
    throw new Error('returnTo must be a same-origin /app path');
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  try {
    return (
      (typeof value === 'object' && value !== null)
      || typeof value === 'function'
    ) && typeof (value as { then?: unknown }).then === 'function';
  } catch {
    return false;
  }
}

function authoritativePublication(value: unknown): Promise<void> | undefined {
  if (
    !((typeof value === 'object' && value !== null) || typeof value === 'function')
  ) return undefined;
  const then = (value as { then?: unknown }).then;
  if (typeof then !== 'function') return undefined;
  return new Promise<void>((resolve, reject) => {
    try {
      (then as (onFulfilled: () => void, onRejected: (reason: unknown) => void) => void).call(
        value,
        resolve,
        reject,
      );
    } catch (error) {
      reject(error);
    }
  });
}

function containReturnedThenable(value: unknown): void {
  try {
    if (isThenable(value)) void Promise.resolve(value).catch(() => undefined);
  } catch {
    // Cleanup and listener-return inspection never expose sensitive details.
  }
}

type InspectedFactoryThenable = {
  source: object | ((...args: never[]) => unknown);
  then: (onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) => unknown;
  assimilatedPromise?: Promise<unknown>;
};

function inspectFactoryThenable(source: unknown): InspectedFactoryThenable | undefined {
  if (!((typeof source === 'object' && source !== null) || typeof source === 'function')) {
    return undefined;
  }
  const then = (source as { then?: unknown }).then;
  if (typeof then !== 'function') return undefined;
  const usesIntrinsicPromiseThen = source instanceof Promise && then === Promise.prototype.then;
  return {
    source: source as object | ((...args: never[]) => unknown),
    then: then as InspectedFactoryThenable['then'],
    assimilatedPromise: usesIntrinsicPromiseThen
      ? Promise.resolve(source)
      : undefined,
  };
}

function assimilateFactoryThenable(inspection: InspectedFactoryThenable): Promise<unknown> {
  if (inspection.assimilatedPromise) return inspection.assimilatedPromise;
  return Promise.resolve({
    then(onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) {
      return inspection.then.call(inspection.source, onFulfilled, onRejected);
    },
  });
}

function registerFactoryWaiter(
  attempt: ActivationAttempt,
  inspection: InspectedFactoryThenable,
  ownsActivation: () => boolean,
): void {
  // Reading `then` above is user code. Recheck after that accessor boundary and
  // immediately before mutating global ownership state.
  if (!ownsActivation()) return;
  const source = inspection.source;
  let ownership = factorySourceOwnership.get(source);
  if (!ownership) {
    ownership = { waiters: new Set(), guards: new Set() };
    factorySourceOwnership.set(source, ownership);
  }
  ownership.waiters.add(attempt);
  ownership.guards.add(attempt);
  pendingFactoryWaiters.add(attempt);
  attempt.sourceOwnership = ownership;
  attempt.factorySource = ownership;
}

function hasOtherFactoryWaiters(attempt: ActivationAttempt): boolean {
  const source = attempt.source;
  const ownership = ((typeof source === 'object' && source !== null)
    || typeof source === 'function')
    ? factorySourceOwnership.get(source)
    : undefined;
  if (!ownership) return false;
  return [...ownership.waiters].some((waiter) => waiter !== attempt);
}

function releaseFactoryWaiter(attempt: ActivationAttempt): void {
  const ownership = attempt.sourceOwnership;
  if (!ownership) return;
  ownership.waiters.delete(attempt);
  pendingFactoryWaiters.delete(attempt);
  // A factory source is globally shared.  A losing waiter can release a
  // channel while another port is still between source resolution and
  // subscription, so every outstanding lease must reconsider only after the
  // global waiter set changes.
  for (const guard of [...ownership.guards]) {
    try {
      guard.reconcileSharedFactoryWaiters?.();
    } catch {
      // Reconciliation is best-effort; authority always remains fail-closed.
    }
  }
  reconcileDeferredUnclaimedChannels();
}

function releaseFactoryOwnership(attempt: ActivationAttempt): void {
  const ownership = attempt.sourceOwnership;
  if (!ownership) return;
  ownership.waiters.delete(attempt);
  pendingFactoryWaiters.delete(attempt);
  ownership.guards.delete(attempt);
  attempt.sourceOwnership = undefined;
  attempt.reconcileSharedFactoryWaiters = undefined;
  reconcileDeferredUnclaimedChannels();
}

function invalidateSharedChannelOwners(
  channel: SessionChannel,
  origin: ActivationAttempt | undefined,
): void {
  const ownership = channelOwnership(channel);
  for (const attempt of [...ownership.owners]) {
    if (attempt === origin) continue;
    try {
      attempt.invalidateFromSharedChannel?.();
    } catch {
      // One port cannot prevent another shared owner from failing closed.
    }
  }
}

function attemptCleanup(action: (() => void) | undefined): void {
  if (!action) return;
  try {
    containReturnedThenable(action());
  } catch {
    // Cleanup attempts are independent and never retain resource ownership.
  }
}

export function createKindeAuthPort(
  config: RuntimeConfig,
  dependencies: KindeAuthPortDependencies = {},
): ManagedAuthPort {
  const origin = dependencies.origin ?? window.location.origin;
  const redirectUri = authRedirectUri(origin, config.VITE_OSP_BUILD_PROFILE);
  const createClient = dependencies.createClient
    ?? ((options: KindeClientOptions) => createKindeClient(options));
  const createGeneration = dependencies.createGeneration
    ?? (() => globalThis.crypto.randomUUID());
  const createPortSessionChannel = dependencies.createSessionChannel
    ?? (() => dependencies.sessionChannel ?? createSessionChannel());
  const replaceUrl = dependencies.replaceUrl
    ?? ((returnTo: string) => window.history.replaceState(window.history.state, '', returnTo));
  const tokenVerifier = dependencies.tokenVerifier ?? createKindeTokenVerifier(config);

  let clientPromise: Promise<KindeClientBoundary> | undefined;
  let currentSession: BoundSession | null = null;
  let active = false;
  let activationEpoch = 0;
  let activationAttempt: ActivationAttempt | undefined;
  let committedActivation: ActivationAttempt | undefined;
  let activationPromise: Promise<void> | undefined;
  let operationEpoch = 0;
  let logoutBarrier = false;
  let logoutPromise: Promise<void> | undefined;
  let deferredInvalidation: DeferredInvalidation | undefined;
  let callbackCompleted = false;
  let callbackReturnTo: string | undefined;
  let callbackError: Error | undefined;
  let sessionChannel: SessionChannel | undefined;
  let channelUnsubscribe: () => void = () => undefined;
  const activationAttempts = new Set<ActivationAttempt>();
  const channelLeases = new Map<SessionChannel, ActivationAttempt>();
  const closingChannelLeases = new Set<SessionChannel>();
  const listeners = new Set<() => void>();

  const retireAttempt = (attempt: ActivationAttempt) => {
    if (
      attempt !== activationAttempt
      && attempt !== committedActivation
      && !attempt.leasedChannel
    ) {
      activationAttempts.delete(attempt);
    }
  };

  const releaseChannelLease = (attempt: ActivationAttempt) => {
    const channel = attempt.leasedChannel;
    if (!channel) {
      retireAttempt(attempt);
      return;
    }
    if (channelLeases.get(channel) !== attempt) {
      attempt.leasedChannel = undefined;
      attempt.invalidateFromSharedChannel = undefined;
      retireAttempt(attempt);
      return;
    }
    if (attempt === activationAttempt || closingChannelLeases.has(channel)) return;
    const hasNewerPendingFactory = [...activationAttempts].some((other) => (
      other !== attempt
      && other.epoch > attempt.epoch
      && !other.sourceSettled
      && other.sourceOwnership !== undefined
    ));
    const hasOtherPendingFactoryWaiter = hasOtherFactoryWaiters(attempt);
    const ownership = channelOwnership(channel);
    // A reentrant activation can keep this port's old handle alive only while
    // it is the final global owner. Another committed port already protects the
    // transport, so a never-settling factory cannot strand this lease forever.
    if (
      (hasNewerPendingFactory || hasOtherPendingFactoryWaiter)
      && ownership.owners.size <= 1
    ) return;
    if (active && committedActivation === attempt && sessionChannel === channel) return;
    ownership.owners.delete(attempt);
    attempt.invalidateFromSharedChannel = undefined;
    if (ownership.owners.size > 0) {
      channelLeases.delete(channel);
      attempt.leasedChannel = undefined;
      releaseFactoryOwnership(attempt);
      retireAttempt(attempt);
      return;
    }
    // Once the final owner begins close this resource can never carry authority
    // again. The global retirement fence outlives an asynchronous close.
    ownership.retired = true;
    ownership.closing = true;
    closingChannelLeases.add(channel);
    const completeRelease = () => {
      if (channelLeases.get(channel) === attempt) channelLeases.delete(channel);
      if (attempt.leasedChannel === channel) attempt.leasedChannel = undefined;
      closingChannelLeases.delete(channel);
      ownership.closing = false;
      releaseFactoryOwnership(attempt);
      retireAttempt(attempt);
    };
    if (attempt.cleanedChannel === channel) {
      completeRelease();
      return;
    }
    attempt.cleanedChannel = channel;
    try {
      const closeResult = channel.close() as unknown;
      if (isThenable(closeResult)) {
        void Promise.resolve(closeResult).catch(() => undefined).then(completeRelease);
        return;
      }
    } catch {
      // Closing a stale resource is independent from its ownership release.
    }
    completeRelease();
  };

  const reconcileChannelLeases = () => {
    for (const attempt of [...activationAttempts]) releaseChannelLease(attempt);
  };

  const claimChannelLease = (attempt: ActivationAttempt, channel: SessionChannel): boolean => {
    const ownership = channelOwnership(channel);
    if (ownership.retired || ownership.closing || closingChannelLeases.has(channel)) return false;
    const previousOwner = channelLeases.get(channel);
    if (previousOwner && previousOwner !== attempt) {
      if (
        previousOwner === activationAttempt
        ||
        active
        && committedActivation === previousOwner
        && sessionChannel === channel
      ) {
        return false;
      }
      previousOwner.leasedChannel = undefined;
      previousOwner.invalidateFromSharedChannel = undefined;
      ownership.owners.delete(previousOwner);
      releaseFactoryOwnership(previousOwner);
      retireAttempt(previousOwner);
    }
    channelLeases.set(channel, attempt);
    deferredUnclaimedChannels.delete(channel);
    attempt.leasedChannel = channel;
    ownership.owners.add(attempt);
    return true;
  };

  const notify = () => {
    if (!active) return;
    for (const listener of [...listeners]) {
      try {
        containReturnedThenable(listener() as unknown);
      } catch {
        // Subscriber failures cannot participate in session authority control flow.
      }
    }
  };

  const isCurrentOperation = (operation: number) => active && operation === operationEpoch;

  const publishAuthoritativeInvalidation = (
    channel: SessionChannel | undefined,
    generation: string,
    originAttempt: ActivationAttempt | undefined = committedActivation,
  ): Promise<void> | undefined => {
    if (!channel) return undefined;
    // Sharing an in-memory handle bypasses BroadcastChannel's delivery to the
    // originating process. Invalidate every other owner before publishing so
    // all authority changes fail closed even when the transport is shared.
    invalidateSharedChannelOwners(channel, originAttempt);
    return authoritativePublication(channel.publish(generation));
  };

  const clearSession = (publish: boolean): void => {
    const changed = currentSession !== null;
    currentSession = null;
    callbackCompleted = false;
    callbackReturnTo = undefined;
    if (changed) notify();
    if (publish && changed && active) {
      try {
        containReturnedThenable(
          publishAuthoritativeInvalidation(sessionChannel, createGeneration()),
        );
      } catch {
        // Clearing local authority remains fail-closed if notification cannot start.
      }
    }
  };

  const getClient = () => {
    if (!clientPromise) {
      const createdClient = createClient({
        audience: config.VITE_KINDE_AUDIENCE,
        client_id: config.VITE_KINDE_CLIENT_ID,
        domain: config.VITE_KINDE_DOMAIN,
        redirect_uri: redirectUri,
        logout_uri: redirectUri,
        is_dangerously_use_local_storage: false,
        on_error_callback: (error) => {
          if (active) callbackError = new Error(error.errorDescription || error.error);
        },
        on_redirect_callback: (_user, appState) => {
          if (!active) return;
          callbackCompleted = true;
          if (Object.hasOwn(appState ?? {}, 'returnTo')) {
            try {
              callbackReturnTo = safeReturnTo(appState?.returnTo, origin);
            } catch (error) {
              callbackError = error instanceof Error ? error : new Error(String(error));
            }
          }
        },
      });
      clientPromise = createdClient;
      void createdClient.catch(() => {
        if (clientPromise === createdClient) clientPromise = undefined;
      });
    }
    return clientPromise;
  };

  const validateCurrent = async (
    reason: 'initialize' | 'focus' | 'visible' | 'cross-tab' | 'refresh',
  ): Promise<BoundSession | null> => {
    if (logoutBarrier) return null;
    const pendingActivation = activationPromise;
    if (pendingActivation) await pendingActivation;
    if (!active) throw new Error('Auth port is inactive');
    const operation = ++operationEpoch;
    let unpropagatedSession: BoundSession | undefined;
    try {
      const client = await getClient();
      if (!isCurrentOperation(operation)) return currentSession;
      if (callbackError) {
        const error = callbackError;
        callbackError = undefined;
        throw error;
      }

      const authenticated = await client.isAuthenticated();
      if (!isCurrentOperation(operation)) return currentSession;
      if (!authenticated) {
        clearSession(reason !== 'cross-tab');
        return null;
      }

      const [accessToken, idToken] = await Promise.all([
        reason === 'refresh'
          ? client.getToken({ isForceRefresh: true })
          : client.getAccessToken(),
        client.getIdToken(),
      ]);
      if (!isCurrentOperation(operation)) return currentSession;
      if (!accessToken || !idToken) throw new Error('Kinde token pair missing');

      const [accessClaims, idClaims] = await Promise.all([
        tokenVerifier.verifyAccessToken(accessToken),
        tokenVerifier.verifyIdToken(idToken),
      ]);
      if (!isCurrentOperation(operation)) return currentSession;

      const bound = bindVerifiedTokenPair({ accessClaims, idClaims, config });
      const previousSession = currentSession;
      const completedCallback = callbackCompleted;
      const identityUnchanged = previousSession
        ? sameIdentity(previousSession.identity, bound.identity)
        : false;
      const reuseGeneration = identityUnchanged
        && !completedCallback
        && (reason === 'focus' || reason === 'visible');
      const nextSession: BoundSession = {
        identity: bound.identity,
        generation: reuseGeneration
          ? previousSession!.generation
          : createGeneration(),
      };
      const changed = !previousSession || !sameSession(previousSession, nextSession);
      currentSession = nextSession;

      if (completedCallback) {
        callbackCompleted = false;
        if (callbackReturnTo) {
          const consumedReturnTo = callbackReturnTo;
          callbackReturnTo = undefined;
          replaceUrl(consumedReturnTo);
        }
      }
      if (changed) notify();
      if (
        reason !== 'cross-tab'
        && (completedCallback || (previousSession !== null && changed))
      ) {
        unpropagatedSession = nextSession;
        const publication = publishAuthoritativeInvalidation(
          sessionChannel,
          nextSession.generation,
        );
        if (publication) await publication;
        unpropagatedSession = undefined;
      }
      return currentSession;
    } catch (error) {
      if (
        typeof unpropagatedSession !== 'undefined'
        && currentSession
        && sameSession(currentSession, unpropagatedSession)
      ) {
        operationEpoch += 1;
        clearSession(reason !== 'cross-tab');
        throw error;
      }
      if (!isCurrentOperation(operation)) return currentSession;
      clearSession(reason !== 'cross-tab');
      throw error;
    }
  };

  const port: ManagedAuthPort = {
    initialize: () => validateCurrent('initialize'),
    revalidate: (reason) => validateCurrent(reason),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getCurrentSession: () => currentSession,
    async login(returnTo) {
      if (!active) throw new Error('Auth port is inactive');
      if (logoutBarrier) throw new Error('Auth port logout must complete successfully');
      const operation = operationEpoch;
      const approvedReturnTo = safeReturnTo(returnTo, origin);
      const client = await getClient();
      if (!isCurrentOperation(operation)) {
        throw new Error('Login operation is not current');
      }
      if (logoutBarrier) throw new Error('Auth port logout must complete successfully');
      await client.login({
        app_state: { returnTo: approvedReturnTo },
        ...(config.VITE_OSP_BUILD_PROFILE === 'production-readonly'
          ? { org_code: PRODUCTION_KINDE_ORGANIZATION }
          : {}),
      });
    },
    logout() {
      if (logoutPromise) return logoutPromise;
      if (!active) return Promise.reject(new Error('Auth port is inactive'));
      operationEpoch += 1;
      logoutBarrier = true;
      let resolveLogout!: () => void;
      let rejectLogout!: (reason: unknown) => void;
      const completion = new Promise<void>((resolve, reject) => {
        resolveLogout = resolve;
        rejectLogout = reject;
      });
      logoutPromise = completion;
      const hadSession = currentSession !== null;
      currentSession = null;
      callbackCompleted = false;
      callbackReturnTo = undefined;
      if (hadSession) notify();

      void (async () => {
        const client = await getClient();
        await client.logout({ redirectUrl: redirectUri });
        const invalidationGeneration = createGeneration();
        if (active) {
          const publication = publishAuthoritativeInvalidation(
            sessionChannel,
            invalidationGeneration,
          );
          if (publication) await publication;
        } else {
          deferredInvalidation = { generation: invalidationGeneration };
        }
        logoutBarrier = false;
      })().then(() => {
        if (logoutPromise === completion) {
          logoutPromise = undefined;
        }
        resolveLogout();
      }, (error: unknown) => {
        if (logoutPromise === completion) {
          logoutPromise = undefined;
        }
        rejectLogout(error);
      });
      return completion;
    },
    async getAccessToken(expected, forceRefresh = false) {
      if (logoutBarrier) throw new Error('Requested session is not current');
      const operation = operationEpoch;
      const assertStillCurrent = () => {
        if (
          !isCurrentOperation(operation)
          || !currentSession
          || !sameSession(currentSession, expected)
        ) {
          throw new Error('Requested session is not current');
        }
      };

      assertStillCurrent();
      try {
        const client = await getClient();
        assertStillCurrent();
        const token = forceRefresh
          ? await client.getToken({ isForceRefresh: true })
          : await client.getAccessToken();
        assertStillCurrent();
        if (!token) throw new Error('Kinde access token missing');
        const accessClaims = await tokenVerifier.verifyAccessToken(token);
        assertStillCurrent();
        const verified = assertVerifiedAccessTokenMatchesSession(
          token,
          accessClaims,
          expected.identity,
          config,
        );
        assertStillCurrent();
        return verified;
      } catch (error) {
        if (
          isCurrentOperation(operation)
          && currentSession
          && sameSession(currentSession, expected)
        ) {
          operationEpoch += 1;
          clearSession(true);
        }
        throw error;
      }
    },
    activate() {
      if (active) return;
      if (activationAttempt) return activationPromise;
      const attempt: ActivationAttempt = {
        epoch: ++activationEpoch,
        sourceSettled: false,
      };
      attempt.reconcileSharedFactoryWaiters = () => releaseChannelLease(attempt);
      activationAttempt = attempt;
      activationAttempts.add(attempt);
      let resolvePendingActivation!: () => void;
      let rejectPendingActivation!: (reason: unknown) => void;
      const pendingActivation = new Promise<void>((resolve, reject) => {
        resolvePendingActivation = resolve;
        rejectPendingActivation = reject;
      });
      // The Promise is observable to reentrant activation before any dependency runs.
      activationPromise = pendingActivation;
      void pendingActivation.catch(() => undefined);

      const ownsActivation = () => (
        activationAttempt === attempt
        && activationEpoch === attempt.epoch
        && !active
      );
      const ownsChannelAuthority = (channel: SessionChannel) => {
        const ownership = channelOwnership(channel);
        return ownsActivation()
          && attempt.leasedChannel === channel
          && ownership.owners.has(attempt)
          && !ownership.retired
          && !ownership.closing;
      };

      const cleanup = (
        channel = attempt.channel,
        unsubscribe = attempt.unsubscribe,
      ) => {
        if (attempt.channel === channel) attempt.channel = undefined;
        if (attempt.unsubscribe === unsubscribe) attempt.unsubscribe = undefined;
        if (unsubscribe && attempt.cleanedUnsubscribe !== unsubscribe) {
          attempt.cleanedUnsubscribe = unsubscribe;
          attemptCleanup(unsubscribe);
        }
        releaseChannelLease(attempt);
        if (!attempt.leasedChannel) releaseFactoryOwnership(attempt);
        reconcileChannelLeases();
      };

      const cancelOwnedAttempt = () => {
        if (activationAttempt === attempt) {
          activationAttempt = undefined;
          activationEpoch += 1;
        }
        releaseFactoryWaiter(attempt);
        if (!attempt.leasedChannel) releaseFactoryOwnership(attempt);
        retireAttempt(attempt);
      };

      const fail = (
        error: unknown,
        channel = attempt.channel,
        unsubscribe = attempt.unsubscribe,
      ): never => {
        cancelOwnedAttempt();
        cleanup(channel, unsubscribe);
        throw error;
      };

      const commit = (
        channel: SessionChannel,
        unsubscribe: () => void,
      ) => {
        // A deferred publication can yield. Recheck the global lease at the
        // authority-commit boundary so a retired resource cannot regain use.
        if (!ownsChannelAuthority(channel)) {
          cleanup(channel, unsubscribe);
          return;
        }
        sessionChannel = channel;
        channelUnsubscribe = unsubscribe;
        committedActivation = attempt;
        attempt.invalidateFromSharedChannel = () => {
          if (
            !active
            || committedActivation !== attempt
            || sessionChannel !== channel
          ) return;
          operationEpoch += 1;
          clearSession(false);
        };
        attempt.channel = undefined;
        attempt.unsubscribe = undefined;
        activationAttempt = undefined;
        active = true;
        releaseFactoryOwnership(attempt);
        reconcileChannelLeases();
      };

      const publishDeferredAndCommit = (
        channel: SessionChannel,
        unsubscribe: () => void,
      ): void | Promise<void> => {
        if (!ownsChannelAuthority(channel)) {
          cleanup(channel, unsubscribe);
          return;
        }

        const pendingInvalidation = deferredInvalidation;
        if (!pendingInvalidation) {
          commit(channel, unsubscribe);
          return;
        }

        if (pendingInvalidation.publication) {
          return pendingInvalidation.publication.settled.then(() => (
            publishDeferredAndCommit(channel, unsubscribe)
          ));
        }

        let settlePublication!: () => void;
        const publication = {
          owner: attempt,
          settled: new Promise<void>((resolve) => {
            settlePublication = resolve;
          }),
          settle: () => settlePublication(),
        };
        pendingInvalidation.publication = publication;

        const publicationSucceeded = () => {
          if (
            deferredInvalidation === pendingInvalidation
            && pendingInvalidation.publication === publication
          ) {
            deferredInvalidation = undefined;
          }
          publication.settle();
          commit(channel, unsubscribe);
        };

        const publicationFailed = (error: unknown): never => {
          if (
            deferredInvalidation === pendingInvalidation
            && pendingInvalidation.publication === publication
          ) {
            pendingInvalidation.publication = undefined;
          }
          publication.settle();
          return fail(error, channel, unsubscribe);
        };

        try {
          if (!ownsChannelAuthority(channel)) {
            pendingInvalidation.publication = undefined;
            publication.settle();
            cleanup(channel, unsubscribe);
            return;
          }
          const publicationResult = publishAuthoritativeInvalidation(
            channel,
            pendingInvalidation.generation,
            attempt,
          );
          if (publicationResult) {
            return publicationResult.then(
              publicationSucceeded,
              publicationFailed,
            );
          }
        } catch (error) {
          return publicationFailed(error);
        }
        publicationSucceeded();
      };

      const finishSubscription = (
        channel: SessionChannel,
        value: unknown,
      ): void | Promise<void> => {
        if (typeof value !== 'function') {
          return fail(new Error('Session channel subscription failed'), channel);
        }
        const unsubscribe = value as () => void;
        if (!ownsChannelAuthority(channel)) {
          cleanup(channel, unsubscribe);
          return;
        }
        attempt.unsubscribe = unsubscribe;
        return publishDeferredAndCommit(channel, unsubscribe);
      };

      const finishChannel = (value: unknown): void | Promise<void> => {
        attempt.sourceSettled = true;
        if (!isSessionChannel(value)) {
          releaseFactoryWaiter(attempt);
          return fail(new Error('Session channel factory returned an invalid channel'));
        }
        const channel = value;
        if (!ownsActivation()) {
          const sourceOwnership = attempt.factorySource;
          // PromiseLike implementations can deliver different outcomes to
          // different waiters. Register every canceled valid outcome before
          // releasing this waiter; a later valid claim removes it, while the
          // final shared source outcome closes it if no claim occurs.
          if (channelOwnership(channel).owners.size === 0) {
            deferUnclaimedChannel(channel, sourceOwnership, activationAttempts);
          }
          releaseFactoryWaiter(attempt);
          retireAttempt(attempt);
          return;
        }
        const claimedChannelLease = claimChannelLease(attempt, channel);
        releaseFactoryWaiter(attempt);
        if (!claimedChannelLease) {
          if (channelOwnership(channel).retired) {
            return fail(new Error('Session channel has been retired'));
          }
          cancelOwnedAttempt();
          return;
        }
        if (!ownsChannelAuthority(channel)) {
          cleanup(channel);
          return;
        }
        attempt.channel = channel;
        let subscription: unknown;
        try {
          if (!ownsChannelAuthority(channel)) {
            cleanup(channel);
            return;
          }
          subscription = channel.subscribe(() => {
            if (
              !active
              || committedActivation !== attempt
              || activationEpoch !== attempt.epoch
            ) return;
            void port.revalidate('cross-tab').catch(() => undefined);
          }) as unknown;
          if (isThenable(subscription)) {
            return Promise.resolve(subscription).then(
              (resolved) => finishSubscription(channel, resolved),
              (error: unknown) => fail(error, channel),
            );
          }
        } catch (error) {
          return fail(error, channel);
        }
        return finishSubscription(channel, subscription);
      };

      let activation: void | Promise<void>;
      try {
        const createdChannel = createPortSessionChannel() as unknown;
        attempt.source = createdChannel;
        const factoryThenable = inspectFactoryThenable(createdChannel);
        if (factoryThenable) registerFactoryWaiter(attempt, factoryThenable, ownsActivation);
        activation = factoryThenable
          ? assimilateFactoryThenable(factoryThenable).then(
            finishChannel,
            (error: unknown) => {
              attempt.sourceSettled = true;
              return fail(error);
            },
          )
          : finishChannel(createdChannel);
      } catch (error) {
        attempt.sourceSettled = true;
        if (activationPromise === pendingActivation) activationPromise = undefined;
        rejectPendingActivation(error);
        return fail(error);
      }

      if (activation) {
        void activation.then(
          () => {
            if (activationPromise === pendingActivation) activationPromise = undefined;
            resolvePendingActivation();
          },
          (error: unknown) => {
            if (activationPromise === pendingActivation) activationPromise = undefined;
            rejectPendingActivation(error);
          },
        );
        return pendingActivation;
      }
      if (activationPromise === pendingActivation) activationPromise = undefined;
      resolvePendingActivation();
    },
    deactivate() {
      if (
        !active
        && !activationAttempt
        && !sessionChannel
        && listeners.size === 0
        && currentSession === null
      ) return;
      active = false;
      activationEpoch += 1;
      operationEpoch += 1;
      const previousAttempt = activationAttempt;
      const previousCommittedActivation = committedActivation;
      const previousActivation = activationPromise;
      const previousChannelUnsubscribe = channelUnsubscribe;
      const previousSessionChannel = sessionChannel;
      activationAttempt = undefined;
      committedActivation = undefined;
      activationPromise = undefined;
      sessionChannel = undefined;
      channelUnsubscribe = () => undefined;
      listeners.clear();
      currentSession = null;
      if (previousActivation) void previousActivation.catch(() => undefined);
      if (previousAttempt) {
        const previousAttemptChannel = previousAttempt.channel;
        const previousAttemptUnsubscribe = previousAttempt.unsubscribe;
        previousAttempt.channel = undefined;
        previousAttempt.unsubscribe = undefined;
        // Unsubscribe may synchronously start a same-channel replacement.
        // Let that activation claim the still-live lease before releasing the
        // factory waiter, whose guards are allowed to retire a final lease.
        if (
          previousAttemptUnsubscribe
          && previousAttempt.cleanedUnsubscribe !== previousAttemptUnsubscribe
        ) {
          previousAttempt.cleanedUnsubscribe = previousAttemptUnsubscribe;
          attemptCleanup(previousAttemptUnsubscribe);
        }
        releaseFactoryWaiter(previousAttempt);
        if (previousAttemptChannel) releaseChannelLease(previousAttempt);
        if (!previousAttempt.leasedChannel) releaseFactoryOwnership(previousAttempt);
      }
      if (previousCommittedActivation) {
        previousCommittedActivation.invalidateFromSharedChannel = undefined;
        if (
          previousChannelUnsubscribe
          && previousCommittedActivation.cleanedUnsubscribe !== previousChannelUnsubscribe
        ) {
          previousCommittedActivation.cleanedUnsubscribe = previousChannelUnsubscribe;
          attemptCleanup(previousChannelUnsubscribe);
        }
        if (previousSessionChannel) releaseChannelLease(previousCommittedActivation);
      }
      reconcileChannelLeases();
    },
  };

  try {
    const initialActivation = port.activate();
    if (initialActivation) void initialActivation.catch(() => undefined);
  } catch {
    // Construction returns an inactive port so a later explicit activation can retry.
  }

  return port;
}
