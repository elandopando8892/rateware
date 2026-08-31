import { z } from 'zod';

const runtimeConfigSchema = z.object({
  VITE_OSP_AUTH_PROVIDER: z.enum(['kinde', 'supabase']),
  VITE_KINDE_DOMAIN: z.literal('https://auth.heymarksman.com'),
  VITE_KINDE_CLIENT_ID: z.string().min(1),
  VITE_KINDE_AUDIENCE: z.literal('https://osp.heymarksman.com/api'),
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20).optional(),
  VITE_OSP_BUILD_PROFILE: z.enum(['local-e2e', 'preview-synthetic', 'production-readonly']),
}).strict().superRefine((value, context) => {
  const synthetic = value.VITE_OSP_BUILD_PROFILE !== 'production-readonly';
  if (synthetic && value.VITE_KINDE_CLIENT_ID !== 'synthetic-public-client') {
    context.addIssue({ code: 'custom', path: ['VITE_KINDE_CLIENT_ID'], message: 'Synthetic profiles require the synthetic public client.' });
  }
  if (synthetic && value.VITE_SUPABASE_URL !== 'https://project.example.test') {
    context.addIssue({ code: 'custom', path: ['VITE_SUPABASE_URL'], message: 'Synthetic profiles require the synthetic Supabase origin.' });
  }
  if (!synthetic && value.VITE_SUPABASE_URL !== 'https://alqjqzqagdmcywpjtnnr.supabase.co') {
    context.addIssue({ code: 'custom', path: ['VITE_SUPABASE_URL'], message: 'Production must use the shared Rateware Supabase project.' });
  }
  if (value.VITE_OSP_AUTH_PROVIDER === 'supabase' && !value.VITE_SUPABASE_PUBLISHABLE_KEY) {
    context.addIssue({ code: 'custom', path: ['VITE_SUPABASE_PUBLISHABLE_KEY'], message: 'Supabase Auth requires its public browser key.' });
  }
});

export type OspBuildProfile = 'local-e2e' | 'preview-synthetic' | 'production-readonly';
export type OspAuthProvider = 'kinde' | 'supabase';

const previewDeploymentOrigin = /^https:\/\/osp-customer-setup(?:-[a-z0-9-]+)?-elandopando8892s-projects\.vercel\.app$/;

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

export function loadRuntimeConfig(env: Record<string, unknown>): RuntimeConfig {
  // Vercel injects additional VITE_* metadata during its production build.
  // Select only the application's contract keys so provider metadata cannot
  // make the strict runtime schema reject an otherwise valid deployment.
  const runtimeEntries = {
    VITE_OSP_AUTH_PROVIDER: env.VITE_OSP_AUTH_PROVIDER ?? 'kinde',
    VITE_KINDE_DOMAIN: env.VITE_KINDE_DOMAIN,
    VITE_KINDE_CLIENT_ID: env.VITE_KINDE_CLIENT_ID,
    VITE_KINDE_AUDIENCE: env.VITE_KINDE_AUDIENCE,
    VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: env.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_OSP_BUILD_PROFILE: env.VITE_OSP_BUILD_PROFILE,
  };

  return runtimeConfigSchema.parse(runtimeEntries);
}

export function assertAllowedAppOrigin(origin: string, profile: OspBuildProfile): void {
  const allowed = profile === 'local-e2e'
    ? origin === 'http://localhost:8791'
    : profile === 'preview-synthetic'
      ? origin === 'http://localhost:8791' || previewDeploymentOrigin.test(origin)
      : origin === 'https://osp.heymarksman.com';
  if (!allowed) {
    throw new Error('Unapproved OSP application origin');
  }
}

export function authRedirectUri(origin: string, profile: OspBuildProfile): string {
  assertAllowedAppOrigin(origin, profile);
  return `${origin}/app`;
}
