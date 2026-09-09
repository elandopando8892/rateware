export type GmailDependencyStage = "connection" | "access_token" | "historical_search";

/** Log only a fixed stage label. Provider errors may contain credentials or PII. */
export async function withGmailDependencyStage<T>(
  stage: GmailDependencyStage,
  operation: () => Promise<T>,
  report: (event: string) => void = console.error,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    try { report(JSON.stringify({ event: "OSP_GMAIL_DEPENDENCY_FAILED", stage })); } catch { /* Preserve original failure. */ }
    throw error;
  }
}
