import { createKindeJwtVerifier } from "../osp-read-api/kinde-jwt.ts";
import {
  OSP_PRODUCTION_OPERATOR_ENTITLEMENTS,
  OSP_PRODUCTION_ORGANIZATION_BINDING,
} from "../osp-read-api/auth-policy.ts";
import { createCaseApiHandler } from "./handler.ts";
import { createPostgresClarificationStore } from "./postgres-store.ts";
import {
  createPostgresCaseApprovalActions,
  createPostgresCaseOutboundActions,
} from "./actions.ts";
import type { OutboundStorageClient } from "./outbound-draft.ts";
import { createPostgresWorkflowViewSource } from "./workflow-view.ts";

type PostgresFactory = (
  databaseUrl: string,
  options: Record<string, unknown>,
) => unknown;
export type CaseApiEnvironment = { get(name: string): string | undefined };

function required(env: CaseApiEnvironment, name: string): string {
  const value = env.get(name);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  return value.trim();
}

function issuer(value: string): string {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.search || parsed.hash ||
      (parsed.pathname !== "" && parsed.pathname !== "/")
    ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
    return parsed.origin;
  } catch {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
}

function databaseUrl(value: string): string {
  try {
    if (value.trim() !== value) {
      throw new Error("INVALID_RUNTIME_CONFIGURATION");
    }
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

export function createCaseApiRuntime(options: {
  env: CaseApiEnvironment;
  fetch: typeof globalThis.fetch;
  postgresFactory: PostgresFactory;
  storageClient: OutboundStorageClient;
  clock?: () => number;
}): (request: Request) => Promise<Response> {
  const kindeIssuer = issuer(required(options.env, "OSP_KINDE_ISSUER"));
  const clientId = required(options.env, "OSP_KINDE_CLIENT_ID");
  const databaseConnection = databaseUrl(
    options.env.get("OSP_CASE_DATABASE_URL")?.trim() ||
      required(options.env, "SUPABASE_DB_URL"),
  );
  const verifier = createKindeJwtVerifier({
    issuer: kindeIssuer,
    clientId,
    jwksFetch: options.fetch,
    clock: options.clock ?? Date.now,
    organizationBinding: OSP_PRODUCTION_ORGANIZATION_BINDING,
    operatorEntitlements: OSP_PRODUCTION_OPERATOR_ENTITLEMENTS,
  });
  let sharedDatabase: unknown;
  const sharedFactory: PostgresFactory = (url, config) =>
    sharedDatabase ??= options.postgresFactory(url, config);
  const clarificationStore = createPostgresClarificationStore({
    databaseUrl: databaseConnection,
    postgresFactory: sharedFactory,
  });
  const approvalActions = createPostgresCaseApprovalActions({
    databaseUrl: databaseConnection,
    // Approval commands run a preparation read inside the command transaction.
    // Keep their pools isolated so max:1 cannot self-deadlock while the outer
    // transaction owns the shared connection.
    postgresFactory: options.postgresFactory,
    now: () => new Date(options.clock?.() ?? Date.now()),
  });
  const outboundActions = createPostgresCaseOutboundActions({
    databaseUrl: databaseConnection,
    postgresFactory: sharedFactory,
    storageClient: options.storageClient,
    now: () => new Date(options.clock?.() ?? Date.now()),
  });
  const workflowStorage = "storage" in options.storageClient
    ? options.storageClient
    : null;
  const workflowView = createPostgresWorkflowViewSource({
    databaseUrl: databaseConnection,
    postgresFactory: sharedFactory,
    signSupplierPackage: workflowStorage
      ? async (objectId) => {
        const result = await workflowStorage.storage
          .from("osp-derived-documents")
          .createSignedUrl(objectId, 60, {
            download: "XBF-OSP-Supplier-Package.xlsx",
          });
        if (result.error || !result.data?.signedUrl) {
          throw new Error("WORKFLOW_VIEW_INVALID");
        }
        return result.data.signedUrl;
      }
      : undefined,
  });
  return createCaseApiHandler({
    verifyToken: (token, signal) => verifier.verifyWorkflow(token, signal),
    verifyApprovalToken: (accessToken, idToken, signal) =>
      verifier.verifyApproval(accessToken, idToken, signal),
    clarificationStore,
    approvalActions,
    outboundActions,
    workflowView,
  });
}
