import { IdentityContractError } from "./identity-contract.mjs";
import { resolveRuntimeWorkspaceUser } from "./runtime-identity.ts";

// Only claims constructed from the authenticated /auth/v1/user response enter here.
// Generic organization metadata and user-editable metadata are NOT entitlements.
export function sourceFileClaims(claims: Record<string, unknown>) {
  const org = typeof claims.rateware_organization_id === "string"
    ? claims.rateware_organization_id.trim().toLowerCase() : "";
  if (claims.auth_provider !== "supabase" || claims.email_confirmed !== true || !org) {
    throw new IdentityContractError("SOURCE_FILE_ACCESS_DENIED", "Reviewed Rateware file access is required.");
  }
  if (typeof claims.organization_id === "string" && claims.organization_id.trim().toLowerCase() !== org) {
    throw new IdentityContractError("SOURCE_FILE_ACCESS_DENIED", "Conflicting Rateware organization.");
  }
  return { sub: claims.sub, email: claims.email, auth_provider: "supabase", organization_id: org };
}

export async function resolveSourceFileUser(client: Parameters<typeof resolveRuntimeWorkspaceUser>[0], claims: Record<string, unknown>) {
  const user = await resolveRuntimeWorkspaceUser(client, sourceFileClaims(claims), {
    mode: "required", persistLegacyIdentity: false
  });
  if (!user.owner_email || !user.organization_id || !user.canonical_tenant_id) {
    throw new IdentityContractError("SOURCE_FILE_ACCESS_DENIED", "Reconciled Rateware workspace is required.");
  }
  return user;
}

export const SOURCE_FILE_ACTIONS = new Set([
  "list_uploads", "list_upload_staged_rows", "bulk_import_upload_template",
  "archive_upload", "get_upload_source_url", "remove_upload"
]);
