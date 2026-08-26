import type { OspAuthorizationIdentity } from './auth-policy.ts';

export type PipelineSeamRow = {
  requests_total: unknown;
  documents_pending: unknown;
  under_review: unknown;
  ready_for_approval: unknown;
};

export type GmailSeamRow = {
  connection_exists: unknown;
  pubsub_configured: unknown;
  watch_configured: unknown;
  token_expires_at: unknown;
  watch_expires_at: unknown;
  error_present: unknown;
  error_code: unknown;
};

export interface OspReadStore {
  resolveWorkspace(identity: OspAuthorizationIdentity, signal?: AbortSignal): Promise<string>;
  readPipeline(organizationId: string, signal?: AbortSignal): Promise<PipelineSeamRow>;
  readGmail(organizationId: string, signal?: AbortSignal): Promise<GmailSeamRow>;
}
