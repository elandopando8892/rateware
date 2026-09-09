export type GmailDependencyStage =
  | "connection"
  | "access_token"
  | "historical_search"
  | "historical_import"
  | "historical_claim";

export function safeTokenFailureReason(error: unknown): string {
  if (!(error instanceof Error)) return "unclassified";
  if (error.name === "OperationError") return "cryptographic_operation_failed";
  const reasons: Record<string, string> = {
    "GMAIL_TOKEN_ENCRYPTION_KEY is not configured.": "encryption_configuration_missing",
    "Google OAuth client is not configured.": "oauth_configuration_missing",
    "Unsupported Gmail token envelope.": "token_envelope_invalid",
    "Provider Gmail refresh token is unavailable. Reconnect the mailbox.": "refresh_token_missing",
    "Token has been expired or revoked.": "google_grant_expired_or_revoked",
    "invalid_grant": "google_invalid_grant",
    "invalid_client": "google_invalid_client",
    "Google token refresh did not return an access token.": "refresh_response_missing_token",
  };
  return Object.hasOwn(reasons, error.message) ? reasons[error.message] : "unclassified";
}

/** Log only a fixed stage label. Provider errors may contain credentials or PII. */
export async function withGmailDependencyStage<T>(
  stage: GmailDependencyStage,
  operation: () => Promise<T>,
  report: (event: string) => void = console.error,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    try { report(JSON.stringify({ event: "OSP_GMAIL_DEPENDENCY_FAILED", stage,
      ...(stage === "access_token" ? { reason: safeTokenFailureReason(error) } : {}),
    })); } catch { /* Preserve original failure. */ }
    throw error;
  }
}
