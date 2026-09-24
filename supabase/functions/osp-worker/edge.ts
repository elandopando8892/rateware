import { createClient } from "supabase";

import {
  getProviderGmailAccessToken,
  providerGmailAllowedAccount,
  validateProviderGmailOutboundScopes,
  validateProviderGmailScopes,
} from "../_shared/provider-gmail.ts";
import { createOspWorkerHandler } from "./handler.ts";
import { createShadowWorkerRuntime } from "./shadow-runtime.ts";
import { resolveGovernedAutomation } from "./governed-automation-config.ts";
import { resolveXlsxShadow } from "./xlsx-shadow-config.ts";
import { resolveOspXlsxIntake } from "./osp-xlsx-intake-config.ts";
import { resolveSupplierPackageCanary } from "./supplier-package-canary-config.ts";
import { createPostgresSignatureVaultReader } from "./signature-runtime.ts";
import { resolveSignatureCanary } from "./signature-canary-config.ts";
import { resolveRequestManifestShadow } from "./request-manifest-shadow-config.ts";
import { resolveRequestManifestCanary } from "./request-manifest-canary-config.ts";
import { resolveAdaptiveManifest } from "./adaptive-manifest-config.ts";
import { resolveManualRequestCanary } from "./manual-request-canary-config.ts";

const WORKER_BUILD_REVISION = "20260919-exact-thread-preflight";

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error("INVALID_RUNTIME_CONFIGURATION");
  return value;
}

function origin(value: string): string {
  try {
    const parsed = new URL(value);
    const local = parsed.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(parsed.hostname);
    if (
      (!local && parsed.protocol !== "https:") || parsed.username ||
      parsed.password || parsed.search || parsed.hash ||
      (parsed.pathname !== "" && parsed.pathname !== "/")
    ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
    return parsed.origin;
  } catch {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
}

function databaseConnection(value: string): string {
  try {
    const parsed = new URL(value);
    const sslMode = parsed.searchParams.get("sslmode");
    const allowedSslQuery = parsed.searchParams.size === 1 &&
      ["require", "prefer"].includes(sslMode ?? "");
    if (
      !["postgres:", "postgresql:"].includes(parsed.protocol) ||
      !parsed.hostname || (parsed.search && !allowedSslQuery) || parsed.hash
    ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
    return value.replace(/\?sslmode=(?:require|prefer)$/, "");
  } catch {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
}

const supabaseUrl = origin(required("SUPABASE_URL"));
const serviceRoleKey = required("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
const databaseUrl = databaseConnection(required("SUPABASE_DB_URL"));
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

async function providerGmailConnection(): Promise<Record<string, unknown>> {
  const mailbox = providerGmailAllowedAccount();
  const result = await supabase.from("provider_gmail_connections")
    .select("*")
    .eq("mailbox_email", mailbox)
    .in("status", ["connected", "watching"])
    .limit(2);
  if (result.error || result.data?.length !== 1) {
    throw new Error("GMAIL_TEMPORARY");
  }
  return result.data[0] as Record<string, unknown>;
}

function classifyPreflightGmailError(error: unknown): Error {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (
    /invalid_grant|expired|revoked|reconnect|unsupported gmail token envelope|operation-specific/
      .test(
        message,
      )
  ) return new Error("GMAIL_RECONNECT_REQUIRED");
  if (/not configured/.test(message)) {
    return new Error("GMAIL_RUNTIME_CONFIGURATION");
  }
  return new Error("GMAIL_TEMPORARY");
}

const gmailAccessToken = async (): Promise<string> => {
  const connection = await providerGmailConnection();
  try {
    validateProviderGmailOutboundScopes(connection.scopes);
    return await getProviderGmailAccessToken(
      supabase,
      connection,
    );
  } catch {
    throw new Error("GMAIL_TEMPORARY");
  }
};

const gmailPreflightAccessToken = async (): Promise<string> => {
  const connection = await providerGmailConnection();
  try {
    validateProviderGmailScopes(connection.scopes);
    return await getProviderGmailAccessToken(supabase, connection, {
      persistRefreshedToken: false,
    });
  } catch (error) {
    throw classifyPreflightGmailError(error);
  }
};

const automation = resolveGovernedAutomation(Deno.env);
const xlsxShadow = resolveXlsxShadow(Deno.env);
const xlsxIntake = resolveOspXlsxIntake(Deno.env);
const supplierPackageCanary = resolveSupplierPackageCanary(Deno.env);
const signatureCanary = resolveSignatureCanary(Deno.env);
const requestManifestShadow = resolveRequestManifestShadow(Deno.env);
const requestManifestCanary = resolveRequestManifestCanary(Deno.env);
const adaptiveManifest = resolveAdaptiveManifest(Deno.env);
const manualRequestCanary = resolveManualRequestCanary(Deno.env);
const signatureVault = createPostgresSignatureVaultReader({ databaseUrl });
const runtime = createShadowWorkerRuntime({
  databaseUrl,
  gmailAccessToken,
  gmailPreflightAccessToken,
  storageClient: supabase,
  workerId: `osp-edge:${WORKER_BUILD_REVISION}:${crypto.randomUUID()}`,
  automation,
  xlsxShadow,
  xlsxIntake,
  supplierPackageCanary,
  signatureCanary,
  requestManifestShadow,
  requestManifestCanary,
  adaptiveManifest,
  manualRequestCanary,
  signatureVault,
});

Deno.serve(createOspWorkerHandler({
  expectedToken: serviceRoleKey,
  manualCanaryToken: manualRequestCanary?.token,
  enqueue: runtime.enqueue,
  run: runtime.run,
  runExactGmailIngest: runtime.runExactGmailIngest,
  runExactShadowAnalysis: runtime.runExactShadowAnalysis,
  preflightOpenAiModel: adaptiveManifest
    ? async () => {
      const response = await fetch(
        new URL(
          `/v1/models/${encodeURIComponent(adaptiveManifest.openAiModel)}`,
          "https://api.openai.com",
        ),
        {
          method: "GET",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
          headers: {
            Authorization: `Bearer ${adaptiveManifest.openAiApiKey}`,
          },
        },
      );
      return {
        configured: true as const,
        model: adaptiveManifest.openAiModel,
        httpStatus: response.status,
        reachable: response.ok,
      };
    }
    : undefined,
  runExactThreadAssociation: runtime.runExactThreadAssociation,
  preflightExactThreadAssociation: runtime.preflightExactThreadAssociation,
  runAuthorizedSendExact: runtime.runAuthorizedSendExact,
  runXlsxDocumentExtractCanary: runtime.runXlsxDocumentExtractCanary,
  runSupplierPackageCanary: runtime.runSupplierPackageCanary,
  runSignatureApplicationCanary: runtime.runSignatureApplicationCanary,
  runRequestManifestShadow: runtime.runRequestManifestShadow,
  runRequestManifestCanary: runtime.runRequestManifestCanary,
  runManualRequestCanary: runtime.runManualRequestCanary,
}));
