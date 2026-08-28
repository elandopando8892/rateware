import { createClient } from "supabase";

import {
  getProviderGmailAccessToken,
  providerGmailAllowedAccount,
} from "../_shared/provider-gmail.ts";
import { createOspWorkerHandler } from "./handler.ts";
import { createShadowWorkerRuntime } from "./shadow-runtime.ts";
import { resolveGovernedAutomation } from "./governed-automation-config.ts";
import { resolveXlsxShadow } from "./xlsx-shadow-config.ts";
import { resolveRatewareXlsxRouting } from "./rateware-xlsx-routing-config.ts";

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

const gmailAccessToken = async (): Promise<string> => {
  const mailbox = providerGmailAllowedAccount();
  const result = await supabase.from("provider_gmail_connections")
    .select("*")
    .eq("mailbox_email", mailbox)
    .in("status", ["connected", "watching"])
    .limit(2);
  if (result.error || result.data?.length !== 1) {
    throw new Error("GMAIL_TEMPORARY");
  }
  try {
    return await getProviderGmailAccessToken(
      supabase,
      result.data[0] as Record<string, unknown>,
    );
  } catch {
    throw new Error("GMAIL_TEMPORARY");
  }
};

const automation = resolveGovernedAutomation(Deno.env);
const xlsxShadow = resolveXlsxShadow(Deno.env);
const ratewareXlsxRouting = resolveRatewareXlsxRouting(Deno.env);
const runtime = createShadowWorkerRuntime({
  databaseUrl,
  gmailAccessToken,
  storageClient: supabase,
  workerId: `osp-edge:${crypto.randomUUID()}`,
  automation,
  xlsxShadow,
  ratewareXlsxRouting,
});

Deno.serve(createOspWorkerHandler({
  expectedToken: serviceRoleKey,
  enqueue: runtime.enqueue,
  run: runtime.run,
  runXlsxDocumentExtractCanary: runtime.runXlsxDocumentExtractCanary,
  stageXlsxRatewareCanary: runtime.stageXlsxRatewareCanary,
}));
