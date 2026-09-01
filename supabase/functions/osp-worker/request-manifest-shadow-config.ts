export type RequestManifestShadowConfiguration = Readonly<{
  organizationId: string;
  caseId: string;
  gmailMessageId: string;
  gmailSourceSha256: string;
  documentVersionId: string;
  documentSourceSha256: string;
  openAiApiKey: string;
  openAiModel: string;
}>;

export interface RequestManifestShadowEnvironment {
  get(name: string): string | undefined;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function resolveRequestManifestShadow(
  env: RequestManifestShadowEnvironment,
): RequestManifestShadowConfiguration | undefined {
  const enabled = env.get("OSP_REQUEST_MANIFEST_SHADOW_ENABLED")?.trim() ?? "";
  if (enabled === "") return undefined;
  if (enabled !== "true") throw new Error("INVALID_RUNTIME_CONFIGURATION");
  const values = [
    "OSP_REQUEST_MANIFEST_SHADOW_ORGANIZATION_ID",
    "OSP_REQUEST_MANIFEST_SHADOW_CASE_ID",
    "OSP_REQUEST_MANIFEST_SHADOW_GMAIL_MESSAGE_ID",
    "OSP_REQUEST_MANIFEST_SHADOW_GMAIL_SOURCE_SHA256",
    "OSP_REQUEST_MANIFEST_SHADOW_DOCUMENT_VERSION_ID",
    "OSP_REQUEST_MANIFEST_SHADOW_DOCUMENT_SOURCE_SHA256",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
  ].map((name) => env.get(name)?.trim() ?? "");
  if (
    !UUID.test(values[0]) || !UUID.test(values[1]) || !UUID.test(values[2]) ||
    !SHA256.test(values[3]) || !UUID.test(values[4]) ||
    !SHA256.test(values[5]) ||
    values[6].length < 1 || values[6].length > 512 ||
    !/^[A-Za-z0-9._-]{1,128}$/.test(values[7])
  ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
  return Object.freeze({
    organizationId: values[0],
    caseId: values[1],
    gmailMessageId: values[2],
    gmailSourceSha256: values[3],
    documentVersionId: values[4],
    documentSourceSha256: values[5],
    openAiApiKey: values[6],
    openAiModel: values[7],
  });
}
