import {
  createKindeJwtVerifier,
  type KindeJwtVerifier,
} from './kinde-jwt.ts';
import {
  createSupabaseJwtVerifier,
} from './supabase-jwt.ts';
import type {
  OspOperatorEntitlement,
  OspOrganizationBinding,
  OspSignatureEntitlement,
} from './auth-policy.ts';

const RATEWARE_SUPABASE_URL = 'https://alqjqzqagdmcywpjtnnr.supabase.co';

type Environment = { get(name: string): string | undefined };

export type OspRuntimeVerifierOptions = {
  env: Environment;
  fetch: typeof globalThis.fetch;
  clock?: () => number;
  organizationBinding?: OspOrganizationBinding;
  operatorEntitlements?: readonly OspOperatorEntitlement[];
  signatureEntitlements?: readonly OspSignatureEntitlement[];
};

function required(env: Environment, name: string): string {
  const value = env.get(name)?.trim();
  if (!value) throw new Error('INVALID_RUNTIME_CONFIGURATION');
  return value;
}

function exactIssuer(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash ||
        (parsed.pathname !== '' && parsed.pathname !== '/')) {
      throw new Error('INVALID_RUNTIME_CONFIGURATION');
    }
    return parsed.origin;
  } catch {
    throw new Error('INVALID_RUNTIME_CONFIGURATION');
  }
}

export function createOspRuntimeJwtVerifier(
  options: OspRuntimeVerifierOptions,
): KindeJwtVerifier {
  const provider = options.env.get('OSP_AUTH_PROVIDER')?.trim() || 'kinde';
  if (provider === 'kinde') {
    return createKindeJwtVerifier({
      issuer: exactIssuer(required(options.env, 'OSP_KINDE_ISSUER')),
      clientId: required(options.env, 'OSP_KINDE_CLIENT_ID'),
      jwksFetch: options.fetch,
      clock: options.clock ?? Date.now,
      organizationBinding: options.organizationBinding,
      operatorEntitlements: options.operatorEntitlements,
      signatureEntitlements: options.signatureEntitlements,
    });
  }
  if (provider !== 'supabase') throw new Error('INVALID_RUNTIME_CONFIGURATION');
  const supabaseUrl = exactIssuer(required(options.env, 'SUPABASE_URL'));
  if (supabaseUrl !== RATEWARE_SUPABASE_URL) throw new Error('INVALID_RUNTIME_CONFIGURATION');
  return createSupabaseJwtVerifier({
    issuer: `${supabaseUrl}/auth/v1`,
    clock: options.clock ?? Date.now,
  });
}
