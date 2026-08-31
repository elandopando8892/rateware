import {
  createClient,
  type AuthChangeEvent,
  type Session,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import { decodeJwt } from 'jose';

import { authRedirectUri, type RuntimeConfig } from '../config/runtime';
import type { BoundSession, ManagedAuthPort, OspAuthorizationIdentity } from './auth-port';

const PRODUCTION_RATEWARE_ORGANIZATION = 'ca0a8f30-1382-4316-9bd5-cb76d9ab4920';
const PRODUCTION_EMAILS = new Set([
  'carriers@xbfreight.com',
  'jgonzalez@xbfreight.com',
  'ops@xbfreight.com',
  'sales@heymarksman.com',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SupabaseAuthBoundary = Pick<SupabaseClient['auth'],
  'getSession' | 'getUser' | 'onAuthStateChange' | 'refreshSession' | 'signInWithOAuth' | 'signOut'
>;

type SupabaseAuthPortDependencies = {
  origin?: string;
  createClient?: (url: string, publishableKey: string) => { auth: SupabaseAuthBoundary };
  replaceUrl?: (returnTo: string) => void;
};

function safeReturnTo(returnTo: unknown, origin: string): string {
  if (typeof returnTo !== 'string') throw new Error('Invalid returnTo');
  const parsed = new URL(returnTo, origin);
  if (parsed.origin !== origin || (parsed.pathname !== '/app' && !parsed.pathname.startsWith('/app/'))) {
    throw new Error('returnTo must be a same-origin /app path');
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function normalizedEmail(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Verified email is missing');
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Verified email is invalid');
  return email;
}

function audienceContains(value: unknown, expected: string): boolean {
  return typeof value === 'string'
    ? value === expected
    : Array.isArray(value) && value.every((entry) => typeof entry === 'string') && value.includes(expected);
}

function approvalSessionIssuedAt(claims: Record<string, unknown>): string | undefined {
  if (!Array.isArray(claims.amr) || claims.amr.length === 0) return undefined;
  const timestamps = claims.amr.map((entry) => {
    if (!entry || typeof entry !== 'object' || !Number.isSafeInteger((entry as { timestamp?: unknown }).timestamp)) {
      throw new Error('Supabase authentication method is invalid');
    }
    return (entry as { timestamp: number }).timestamp;
  });
  const authenticatedAt = new Date(Math.min(...timestamps) * 1_000);
  if (Number.isNaN(authenticatedAt.getTime())) throw new Error('Supabase authentication time is invalid');
  return authenticatedAt.toISOString();
}

function sameIdentity(left: OspAuthorizationIdentity, right: OspAuthorizationIdentity): boolean {
  return left.issuer === right.issuer
    && left.authorizedParty === right.authorizedParty
    && left.subject === right.subject
    && left.organization === right.organization
    && left.email === right.email;
}

function sameSession(left: BoundSession, right: BoundSession): boolean {
  return left.generation === right.generation
    && left.approvalSessionIssuedAt === right.approvalSessionIssuedAt
    && sameIdentity(left.identity, right.identity);
}

function bindSession(
  session: Session,
  user: User,
  config: RuntimeConfig,
): BoundSession {
  const claims = decodeJwt(session.access_token) as Record<string, unknown>;
  const issuer = `${config.VITE_SUPABASE_URL.replace(/\/+$/, '')}/auth/v1`;
  const email = normalizedEmail(user.email);
  const claimEmail = normalizedEmail(claims.email);
  const sessionId = claims.session_id;
  if (
    claims.iss !== issuer
    || !audienceContains(claims.aud, 'authenticated')
    || claims.role !== 'authenticated'
    || claims.sub !== user.id
    || claimEmail !== email
    || typeof sessionId !== 'string'
    || !UUID.test(sessionId)
    || (!user.email_confirmed_at && !user.confirmed_at)
  ) {
    throw new Error('Supabase session identity is invalid');
  }
  if (config.VITE_OSP_BUILD_PROFILE === 'production-readonly' && !PRODUCTION_EMAILS.has(email)) {
    throw new Error('Email is not approved for OSP');
  }
  return {
    identity: {
      issuer,
      authorizedParty: 'authenticated',
      subject: user.id,
      organization: PRODUCTION_RATEWARE_ORGANIZATION,
      email,
      emailVerified: true,
    },
    generation: sessionId,
    approvalSessionIssuedAt: approvalSessionIssuedAt(claims),
  };
}

export function createSupabaseAuthPort(
  config: RuntimeConfig,
  dependencies: SupabaseAuthPortDependencies = {},
): ManagedAuthPort & { getApprovalProof(expected: BoundSession): Promise<string> } {
  if (config.VITE_OSP_AUTH_PROVIDER !== 'supabase' || !config.VITE_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Supabase Auth is not configured');
  }
  const origin = dependencies.origin ?? window.location.origin;
  const callbackUri = authRedirectUri(origin, config.VITE_OSP_BUILD_PROFILE);
  const replaceUrl = dependencies.replaceUrl
    ?? ((returnTo: string) => window.history.replaceState(window.history.state, '', returnTo));
  const client = (dependencies.createClient ?? ((url, publishableKey) => createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      persistSession: true,
      storageKey: 'osp-rateware-auth',
    },
  })))(config.VITE_SUPABASE_URL, config.VITE_SUPABASE_PUBLISHABLE_KEY);

  let currentSession: BoundSession | null = null;
  let currentAccessToken: string | null = null;
  let active = false;
  let operationEpoch = 0;
  let unsubscribeAuth: (() => void) | undefined;
  let callbackReturnTo: string | undefined;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  const clear = () => {
    const changed = currentSession !== null;
    currentSession = null;
    currentAccessToken = null;
    if (changed) notify();
  };
  const assertCurrent = (expected: BoundSession) => {
    if (!active || !currentSession || !sameSession(currentSession, expected)) {
      throw new Error('Requested session is not current');
    }
  };

  const validate = async (forceRefresh = false): Promise<BoundSession | null> => {
    if (!active) throw new Error('Auth port is inactive');
    const operation = ++operationEpoch;
    try {
      const sessionResult = forceRefresh
        ? await client.auth.refreshSession()
        : await client.auth.getSession();
      if (operation !== operationEpoch || !active) return currentSession;
      if (sessionResult.error) throw sessionResult.error;
      const session = sessionResult.data.session;
      if (!session) {
        clear();
        return null;
      }
      const userResult = await client.auth.getUser(session.access_token);
      if (operation !== operationEpoch || !active) return currentSession;
      if (userResult.error || !userResult.data.user) throw userResult.error ?? new Error('Supabase user is missing');
      const next = bindSession(session, userResult.data.user, config);
      const changed = !currentSession || !sameSession(currentSession, next);
      currentSession = next;
      currentAccessToken = session.access_token;
      if (callbackReturnTo) {
        const consumedReturnTo = callbackReturnTo;
        callbackReturnTo = undefined;
        replaceUrl(consumedReturnTo);
      }
      if (changed) notify();
      return currentSession;
    } catch (error) {
      if (operation === operationEpoch && active) clear();
      throw error;
    }
  };

  const onAuthChange = (_event: AuthChangeEvent, session: Session | null) => {
    if (!active) return;
    if (!session) {
      operationEpoch += 1;
      clear();
      return;
    }
    // Supabase advises against awaiting another auth method inside this callback.
    globalThis.setTimeout(() => {
      if (active) void validate(false).catch(() => clear());
    }, 0);
  };

  const port: ManagedAuthPort & { getApprovalProof(expected: BoundSession): Promise<string> } = {
    initialize: () => validate(false),
    revalidate: () => validate(false),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getCurrentSession: () => currentSession,
    async login(returnTo, candidateEmail) {
      if (!active) throw new Error('Auth port is inactive');
      const email = candidateEmail === undefined ? undefined : normalizedEmail(candidateEmail);
      if (config.VITE_OSP_BUILD_PROFILE === 'production-readonly' && email && !PRODUCTION_EMAILS.has(email)) {
        throw new Error('Email is not approved for OSP');
      }
      const approvedReturnTo = safeReturnTo(returnTo, origin);
      const redirect = new URL(callbackUri);
      redirect.searchParams.set('returnTo', approvedReturnTo);
      const result = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirect.toString(),
          queryParams: {
            prompt: 'select_account',
            ...(email ? { login_hint: email } : {}),
          },
        },
      });
      if (result.error) throw result.error;
    },
    async logout() {
      if (!active) throw new Error('Auth port is inactive');
      operationEpoch += 1;
      const result = await client.auth.signOut({ scope: 'local' });
      if (result.error) throw result.error;
      clear();
    },
    async getAccessToken(expected, forceRefresh = false) {
      assertCurrent(expected);
      if (forceRefresh) await validate(true);
      assertCurrent(expected);
      if (!currentAccessToken) throw new Error('Supabase access token is missing');
      return currentAccessToken;
    },
    async getApprovalProof(expected) {
      assertCurrent(expected);
      if (!currentAccessToken || !expected.approvalSessionIssuedAt) {
        throw new Error('Fresh Supabase authentication proof is missing');
      }
      return currentAccessToken;
    },
    activate() {
      if (active) return;
      active = true;
      const subscription = client.auth.onAuthStateChange(onAuthChange);
      unsubscribeAuth = () => subscription.data.subscription.unsubscribe();
      const query = new URLSearchParams(window.location.search);
      const returnTo = query.get('returnTo');
      if (returnTo) {
        try {
          callbackReturnTo = safeReturnTo(returnTo, origin);
        } catch {
          callbackReturnTo = '/app';
        }
      }
    },
    deactivate() {
      if (!active) return;
      active = false;
      operationEpoch += 1;
      unsubscribeAuth?.();
      unsubscribeAuth = undefined;
      listeners.clear();
      currentSession = null;
      currentAccessToken = null;
      callbackReturnTo = undefined;
    },
  };

  port.activate();
  return port;
}
