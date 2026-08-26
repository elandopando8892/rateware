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

export type CaseSummarySeamRow = {
  case_id: unknown;
  supplier_name: unknown;
  state: unknown;
  aggregate_version: unknown;
  blocked_by_duplicate_review: unknown;
  created_at: unknown;
  updated_at: unknown;
  message_count: unknown;
  attachment_count: unknown;
  document_count: unknown;
};

export type CaseDetailSeamRow = CaseSummarySeamRow & {
  latest_subject: unknown;
  latest_sender_domain: unknown;
  latest_received_at: unknown;
  recent_events: unknown;
};

export interface OspReadStore {
  resolveWorkspace(identity: OspAuthorizationIdentity, signal?: AbortSignal): Promise<string>;
  readPipeline(organizationId: string, signal?: AbortSignal): Promise<PipelineSeamRow>;
  readGmail(organizationId: string, signal?: AbortSignal): Promise<GmailSeamRow>;
  readCases(organizationId: string, signal?: AbortSignal): Promise<readonly CaseSummarySeamRow[]>;
  readCase(organizationId: string, caseId: string, signal?: AbortSignal): Promise<CaseDetailSeamRow>;
}
