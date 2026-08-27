export type GovernedAutomationConfiguration = Readonly<{
  malwareScannerOrigin: string;
  malwareScannerToken: string;
  azureDocumentEndpoint: string;
  azureDocumentApiKey: string;
  openAiApiKey: string;
  openAiModel: string;
}>;

export interface AutomationEnvironment {
  get(name: string): string | undefined;
}

export function resolveGovernedAutomation(
  env: AutomationEnvironment,
): GovernedAutomationConfiguration | undefined {
  const enabled = env.get("OSP_GOVERNED_AUTOMATION_ENABLED")?.trim() ?? "";
  if (enabled === "") return undefined;
  if (enabled !== "true") throw new Error("INVALID_RUNTIME_CONFIGURATION");
  const names = [
    "OSP_MALWARE_SCANNER_ORIGIN",
    "OSP_MALWARE_SCANNER_TOKEN",
    "OSP_AZURE_DOCUMENT_ENDPOINT",
    "OSP_AZURE_DOCUMENT_API_KEY",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
  ] as const;
  const values = names.map((name) => env.get(name)?.trim() ?? "");
  if (values.some((value) => value === "")) {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  return Object.freeze({
    malwareScannerOrigin: values[0],
    malwareScannerToken: values[1],
    azureDocumentEndpoint: values[2],
    azureDocumentApiKey: values[3],
    openAiApiKey: values[4],
    openAiModel: values[5],
  });
}
