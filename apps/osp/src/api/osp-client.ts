import type { z } from 'zod';
import type { AuthPort } from '../auth/auth-port';
import type { RuntimeConfig } from '../config/runtime';
import {
  GmailStatusResponseSchema,
  OnboardingWorkspaceResponseSchema,
  type GmailStatusResponse,
  type OnboardingWorkspaceResponse,
} from './contracts';

type OnboardingQueue =
  | 'all'
  | 'draft'
  | 'evidence_collection'
  | 'blocked'
  | 'ready_for_approval'
  | 'closed'
  | 'overdue';

type OnboardingWorkspaceInput = {
  queue: OnboardingQueue;
  search?: string;
  limit: number;
  offset: number;
};

export interface OspClient {
  listOnboardingWorkspace(input: OnboardingWorkspaceInput): Promise<OnboardingWorkspaceResponse>;
  getGmailStatus(): Promise<GmailStatusResponse>;
}

export class OspApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly incidentId: string,
    readonly action: string,
    readonly stage: string,
  ) {
    super(message);
    this.name = 'OspApiError';
  }
}

type CreateOspClientOptions = {
  supabaseUrl: RuntimeConfig['VITE_SUPABASE_URL'];
  auth: Pick<AuthPort, 'getAccessToken'>;
  fetchImpl: typeof fetch;
};

type EdgeFunction = 'provider-onboarding-api' | 'provider-gmail-intake-api';

const SAFE_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const SAFE_INCIDENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function safeMetadata(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (/bearer|token|authorization/i.test(trimmed)) return '';
  return pattern.test(trimmed) ? trimmed : '';
}

function safeResponseMessage(status: number): string {
  if (status === 401) return 'Your OSP session expired. Please sign in again.';
  if (status === 403) return 'You do not have access to this OSP resource.';
  if (status === 404) return 'The requested OSP resource was not found.';
  if (status >= 500) return `The OSP service is temporarily unavailable (HTTP ${status}).`;
  return `The OSP request could not be completed (HTTP ${status}).`;
}

async function readErrorMetadata(response: Response): Promise<Record<string, unknown>> {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) return {};
  try {
    const body: unknown = await response.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function responseError(response: Response, action: string): Promise<OspApiError> {
  const metadata = await readErrorMetadata(response);
  const code = safeMetadata(metadata.code, SAFE_CODE) || `HTTP_${response.status}`;
  const incidentId = safeMetadata(metadata.incident_id, SAFE_INCIDENT_ID)
    || safeMetadata(response.headers.get('x-request-id'), SAFE_INCIDENT_ID);
  return new OspApiError(
    safeResponseMessage(response.status),
    response.status,
    code,
    incidentId,
    action,
    'response',
  );
}

export function createOspClient(options: CreateOspClientOptions): OspClient {
  const edgeBaseUrl = `${options.supabaseUrl.replace(/\/+$/, '')}/functions/v1`;

  async function accessToken(action: string, forceRefresh?: boolean): Promise<string> {
    try {
      const token = forceRefresh === undefined
        ? await options.auth.getAccessToken()
        : await options.auth.getAccessToken(forceRefresh);
      if (!token.trim()) throw new Error('Empty access token.');
      return token;
    } catch {
      throw new OspApiError(
        'Your OSP session could not be authorized. Please sign in again.',
        0,
        'AUTH_TOKEN_UNAVAILABLE',
        '',
        action,
        'auth',
      );
    }
  }

  async function request(
    edgeFunction: EdgeFunction,
    action: string,
    payload: Record<string, unknown>,
    token: string,
  ): Promise<Response> {
    try {
      return await options.fetchImpl(`${edgeBaseUrl}/${edgeFunction}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, ...payload }),
      });
    } catch {
      throw new OspApiError(
        'The OSP service could not be reached. Check your connection and try again.',
        0,
        'NETWORK_ERROR',
        '',
        action,
        'transport',
      );
    }
  }

  async function call<T>(
    edgeFunction: EdgeFunction,
    action: string,
    payload: Record<string, unknown>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    let token = await accessToken(action);
    let response = await request(edgeFunction, action, payload, token);

    if (response.status === 401) {
      token = await accessToken(action, true);
      response = await request(edgeFunction, action, payload, token);
    }

    if (!response.ok) throw await responseError(response, action);

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new OspApiError(
        'The OSP service returned an unreadable response.',
        response.status,
        'INVALID_JSON_RESPONSE',
        safeMetadata(response.headers.get('x-request-id'), SAFE_INCIDENT_ID),
        action,
        'decode',
      );
    }
    return schema.parse(body);
  }

  return {
    listOnboardingWorkspace: (input) => call(
      'provider-onboarding-api',
      'list_provider_onboarding_workspace',
      input,
      OnboardingWorkspaceResponseSchema,
    ),
    getGmailStatus: () => call(
      'provider-gmail-intake-api',
      'provider_gmail_status',
      {},
      GmailStatusResponseSchema,
    ),
  };
}

export type { GmailStatusResponse, OnboardingWorkspaceResponse } from './contracts';
