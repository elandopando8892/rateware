import { OspApiError } from './http.ts';

export const OSP_READ_ACTIONS = [
  'list_provider_onboarding_workspace',
  'provider_gmail_status',
  'list_customer_registration_cases',
  'get_customer_registration_case',
  'get_corporate_profile',
] as const;

export type OspReadAction = typeof OSP_READ_ACTIONS[number];

type OspReadRequestWithoutCase = {
  version: 1;
  action: Exclude<OspReadAction, 'get_customer_registration_case'>;
};

type OspCaseReadRequest = {
  version: 1;
  action: 'get_customer_registration_case';
  case_id: string;
};

export type OspReadRequest = OspReadRequestWithoutCase | OspCaseReadRequest;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function parseOspReadRequest(value: unknown): OspReadRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OspApiError('INVALID_REQUEST');
  }
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  if (candidate.version !== 1 || typeof candidate.action !== 'string' ||
      !OSP_READ_ACTIONS.includes(candidate.action as OspReadAction)) {
    throw new OspApiError('INVALID_REQUEST');
  }
  if (candidate.action === 'get_customer_registration_case') {
    if (keys.length !== 3 || keys[0] !== 'action' || keys[1] !== 'case_id' || keys[2] !== 'version' ||
        typeof candidate.case_id !== 'string' || !UUID_PATTERN.test(candidate.case_id)) {
      throw new OspApiError('INVALID_REQUEST');
    }
    return { version: 1, action: candidate.action, case_id: candidate.case_id };
  }
  if (keys.length !== 2 || keys[0] !== 'action' || keys[1] !== 'version') {
    throw new OspApiError('INVALID_REQUEST');
  }
  return { version: 1, action: candidate.action as OspReadRequestWithoutCase['action'] };
}
