import { z } from 'zod';

export const RuntimeConfigSchema = z.object({
  VITE_KINDE_DOMAIN: z.url(),
  VITE_KINDE_CLIENT_ID: z.string().min(1),
  VITE_SUPABASE_URL: z.url(),
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export function parseRuntimeConfig(env: Record<string, unknown>): RuntimeConfig {
  return RuntimeConfigSchema.parse(env);
}

export function getRuntimeConfig(): RuntimeConfig {
  return parseRuntimeConfig(import.meta.env);
}

export function authRedirectUri(origin: string, production = import.meta.env.PROD): string {
  const normalized = new URL(origin).origin;
  if (production && normalized !== 'https://osp.heymarksman.com') {
    throw new Error('Unexpected OSP production origin.');
  }
  return `${normalized}/app`;
}
