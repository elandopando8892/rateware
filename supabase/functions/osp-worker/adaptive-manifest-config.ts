export type AdaptiveManifestConfiguration = Readonly<{
  enabled: true;
  openAiApiKey: string;
  openAiModel: string;
}>;

export interface AdaptiveManifestEnvironment {
  get(name: string): string | undefined;
}

export function resolveAdaptiveManifest(
  env: AdaptiveManifestEnvironment,
): AdaptiveManifestConfiguration | undefined {
  const enabled = env.get("OSP_ADAPTIVE_MANIFEST_ENABLED")?.trim() ?? "";
  if (enabled === "") return undefined;
  if (enabled !== "true") throw new Error("INVALID_RUNTIME_CONFIGURATION");
  const openAiApiKey = env.get("OPENAI_API_KEY")?.trim() ?? "";
  const openAiModel = env.get("OPENAI_MODEL")?.trim() ?? "";
  if (!openAiApiKey || !openAiModel) {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  return Object.freeze({ enabled: true, openAiApiKey, openAiModel });
}
