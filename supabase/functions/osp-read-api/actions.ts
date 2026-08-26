import { OspApiError } from './http.ts';

export const OSP_READ_ACTIONS = [
  'list_provider_onboarding_workspace',
  'provider_gmail_status',
] as const;

export type OspReadAction = typeof OSP_READ_ACTIONS[number];

export type OspReadRequest = {
  version: 1;
  action: OspReadAction;
};

export function parseOspReadRequest(value: unknown): OspReadRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OspApiError('INVALID_REQUEST');
  }
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  if (keys.length !== 2 || keys[0] !== 'action' || keys[1] !== 'version') {
    throw new OspApiError('INVALID_REQUEST');
  }
  if (candidate.version !== 1 || typeof candidate.action !== 'string' ||
      !OSP_READ_ACTIONS.includes(candidate.action as OspReadAction)) {
    throw new OspApiError('INVALID_REQUEST');
  }
  return { version: 1, action: candidate.action as OspReadAction };
}
