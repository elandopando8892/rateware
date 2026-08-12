import { resolveCanonicalTenant, IdentityContractError } from "./identity-contract.mjs";
import { resolveWorkspaceUser, workspaceUserContext, type WorkspaceUser } from "./workspace.ts";

type RuntimeIdentityClient = {
  from: (table: string) => any;
};

export type TenantEnforcementMode = "disabled" | "shadow" | "required";

export type RuntimeWorkspaceUser = WorkspaceUser & {
  canonical_tenant_id: string | null;
  identity_id: string | null;
  tenant_enforcement_mode: TenantEnforcementMode;
};

function enforcementMode(value = Deno.env.get("RATEWARE_TENANT_ENFORCEMENT")): TenantEnforcementMode {
  const normalized = String(value || "disabled").trim().toLowerCase();
  if (normalized === "required" || normalized === "shadow") return normalized;
  return "disabled";
}

function legacyWorkspaceUser(claims: Record<string, unknown>): RuntimeWorkspaceUser {
  return {
    ...workspaceUserContext(claims),
    canonical_tenant_id: null,
    identity_id: null,
    tenant_enforcement_mode: "disabled"
  };
}

export async function resolveRuntimeWorkspaceUser(
  client: RuntimeIdentityClient,
  verifiedClaims: Record<string, unknown>,
  options: { mode?: TenantEnforcementMode; persistLegacyIdentity?: boolean } = {}
): Promise<RuntimeWorkspaceUser> {
  const mode = options.mode || enforcementMode();
  const legacyUser = legacyWorkspaceUser(verifiedClaims);

  if (mode === "disabled") {
    const resolved = await resolveWorkspaceUser(client, legacyUser, {
      persistIdentity: options.persistLegacyIdentity ?? true
    });
    return { ...resolved, canonical_tenant_id: null, identity_id: null, tenant_enforcement_mode: mode };
  }

  try {
    const tenant = await resolveCanonicalTenant(client, verifiedClaims);
    return {
      owner_user_id: tenant.externalSubject,
      owner_email: tenant.canonicalOwnerKey || `org:${tenant.externalOrganizationId}`,
      // Existing Rateware rows remain keyed by the reconciled external organization id
      // until the bounded organization_id backfill/cutover sprint is approved.
      organization_id: tenant.externalOrganizationId,
      canonical_tenant_id: tenant.canonicalTenantId,
      identity_id: tenant.identityId,
      tenant_enforcement_mode: mode
    };
  } catch (error) {
    if (mode === "required") throw error;
    console.warn("TENANT_ENFORCEMENT_SHADOW_REJECT", {
      code: error instanceof IdentityContractError ? error.code : "TENANT_RESOLUTION_FAILED"
    });
    const resolved = await resolveWorkspaceUser(client, legacyUser, {
      persistIdentity: options.persistLegacyIdentity ?? true
    });
    return { ...resolved, canonical_tenant_id: null, identity_id: null, tenant_enforcement_mode: mode };
  }
}

export function runtimeIdentityStatus(error: unknown) {
  if (error instanceof IdentityContractError) return 403;
  return 500;
}
