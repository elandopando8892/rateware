export type RequestManifestCanaryConfiguration = Readonly<{
  organizationId: string;
  caseId: string;
  openAiApiKey: string;
  openAiModel: string;
}>;

export interface RequestManifestCanaryEnvironment {
  get(name: string): string | undefined;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function resolveRequestManifestCanary(
  env: RequestManifestCanaryEnvironment,
): RequestManifestCanaryConfiguration | undefined {
  const enabled = env.get("OSP_REQUEST_MANIFEST_DRAFT_ENABLED")?.trim() ?? "";
  if (enabled === "") return undefined;
  if (enabled !== "true") throw new Error("INVALID_RUNTIME_CONFIGURATION");
  const organizationId =
    env.get("OSP_REQUEST_MANIFEST_DRAFT_ORGANIZATION_ID")?.trim() ?? "";
  const caseId = env.get("OSP_REQUEST_MANIFEST_DRAFT_CASE_ID")?.trim() ?? "";
  const openAiApiKey = env.get("OPENAI_API_KEY")?.trim() ?? "";
  const openAiModel = env.get("OPENAI_MODEL")?.trim() ?? "";
  if (
    !UUID.test(organizationId) || !UUID.test(caseId) ||
    openAiApiKey.length < 1 || openAiApiKey.length > 512 ||
    !/^[A-Za-z0-9._-]{1,128}$/.test(openAiModel)
  ) {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  return Object.freeze({ organizationId, caseId, openAiApiKey, openAiModel });
}
