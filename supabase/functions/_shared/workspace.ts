export type WorkspaceUser = {
  owner_user_id: string | null;
  owner_email: string | null;
  organization_id: string | null;
};

type WorkspaceSupabaseClient = {
  from: (table: string) => any;
};

function cleanClaim(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

const WORKSPACE_IDENTITY_CACHE_TTL_MS = 5 * 60 * 1000;

type CachedWorkspaceIdentity = {
  organization_id: string;
  canonical_owner_key: string;
  identity_keys: Set<string>;
  expires_at: number;
};

const workspaceIdentityCache = new Map<string, CachedWorkspaceIdentity>();

function workspaceIdentityKeys(user: WorkspaceUser) {
  return [...new Set([user.owner_user_id, user.owner_email]
    .map((value) => cleanClaim(value)?.toLowerCase())
    .filter((value): value is string => Boolean(value)))];
}

export function workspaceUserContext(payload: Record<string, unknown>): WorkspaceUser {
  const email = cleanClaim(payload.email || payload.preferred_email || payload["https://kinde.com/email"])?.toLowerCase();
  const id = cleanClaim(payload.sub || payload.id || email);
  const organization = payload.organization && typeof payload.organization === "object"
    ? payload.organization as Record<string, unknown>
    : payload.org && typeof payload.org === "object"
      ? payload.org as Record<string, unknown>
      : {};
  const organizationId = cleanClaim(
    payload.org_code
      || payload.organization_id
      || payload.org_id
      || organization.code
      || organization.id
  );

  if (!id && !email) throw new Error("Authenticated user is missing an id or email.");
  return {
    owner_user_id: id || email || null,
    owner_email: email || id || null,
    organization_id: organizationId || null
  };
}

export async function resolveWorkspaceUser(
  supabase: WorkspaceSupabaseClient,
  user: WorkspaceUser,
  options: { persistIdentity?: boolean } = {}
): Promise<WorkspaceUser> {
  const organizationId = cleanClaim(user.organization_id);

  if (organizationId) {
    const cacheKey = organizationId.toLowerCase();
    const canonicalOwnerKey = `org:${organizationId.toLowerCase()}`;
    if (options.persistIdentity === false) {
      return {
        ...user,
        owner_email: canonicalOwnerKey,
        organization_id: organizationId
      };
    }
    const identityKeys = workspaceIdentityKeys(user);
    const now = Date.now();
    const cachedWorkspace = workspaceIdentityCache.get(cacheKey);

    if (
      cachedWorkspace
      && cachedWorkspace.expires_at > now
      && identityKeys.every((identityKey) => cachedWorkspace.identity_keys.has(identityKey))
    ) {
      return {
        ...user,
        owner_email: cachedWorkspace.canonical_owner_key,
        organization_id: cachedWorkspace.organization_id
      };
    }

    let resolvedOrganizationId = cachedWorkspace?.organization_id || organizationId;
    let resolvedOwnerKey = cachedWorkspace?.canonical_owner_key || canonicalOwnerKey;
    const knownIdentityKeys = new Set(cachedWorkspace?.identity_keys || []);

    if (!cachedWorkspace || cachedWorkspace.expires_at <= now) {
      const registryLookup = await supabase
        .from("workspace_registry")
        .select("organization_id,canonical_owner_key")
        .eq("organization_id", organizationId)
        .limit(1);
      if (registryLookup.error) throw registryLookup.error;

      const registryRow = registryLookup.data?.[0];
      if (registryRow) {
        resolvedOrganizationId = cleanClaim(registryRow.organization_id) || organizationId;
        resolvedOwnerKey = cleanClaim(registryRow.canonical_owner_key) || canonicalOwnerKey;
      } else {
        const registryResult = await supabase
          .from("workspace_registry")
          .upsert({
            organization_id: organizationId,
            canonical_owner_key: canonicalOwnerKey,
            canonical_owner_user_id: user.owner_user_id,
            updated_at: new Date().toISOString()
          }, { onConflict: "organization_id" })
          .select("organization_id,canonical_owner_key")
          .single();
        if (registryResult.error) throw registryResult.error;
        resolvedOrganizationId = cleanClaim(registryResult.data?.organization_id) || organizationId;
        resolvedOwnerKey = cleanClaim(registryResult.data?.canonical_owner_key) || canonicalOwnerKey;
      }
    }

    const uncachedIdentityKeys = identityKeys.filter((identityKey) => !knownIdentityKeys.has(identityKey));
    if (uncachedIdentityKeys.length) {
      const aliasLookup = await supabase
        .from("workspace_identity_aliases")
        .select("identity_key")
        .eq("organization_id", resolvedOrganizationId)
        .in("identity_key", uncachedIdentityKeys);
      if (aliasLookup.error) throw aliasLookup.error;
      for (const row of aliasLookup.data || []) {
        const identityKey = cleanClaim(row.identity_key)?.toLowerCase();
        if (identityKey) knownIdentityKeys.add(identityKey);
      }

      const missingIdentityKeys = uncachedIdentityKeys.filter((identityKey) => !knownIdentityKeys.has(identityKey));
      if (missingIdentityKeys.length) {
        const aliasResult = await supabase.from("workspace_identity_aliases").upsert(
          missingIdentityKeys.map((identityKey) => ({
          organization_id: resolvedOrganizationId,
          identity_key: identityKey,
          identity_type: identityKey.includes("@") ? "email" : "kinde_subject"
          })),
          { onConflict: "organization_id,identity_key", ignoreDuplicates: true }
        );
        if (aliasResult.error) throw aliasResult.error;
        for (const identityKey of missingIdentityKeys) knownIdentityKeys.add(identityKey);
      }
    }

    workspaceIdentityCache.set(cacheKey, {
      organization_id: resolvedOrganizationId,
      canonical_owner_key: resolvedOwnerKey,
      identity_keys: knownIdentityKeys,
      expires_at: now + WORKSPACE_IDENTITY_CACHE_TTL_MS
    });

    return {
      ...user,
      owner_email: resolvedOwnerKey,
      organization_id: resolvedOrganizationId
    };
  }

  let ownerEmail = user.owner_email;
  if (!ownerEmail?.includes("@") && user.owner_user_id) {
    const profileResult = await supabase
      .from("user_profiles")
      .select("owner_user_id,owner_email")
      .eq("owner_user_id", user.owner_user_id)
      .limit(1);
    if (profileResult.error) throw profileResult.error;
    const profileEmail = cleanClaim(profileResult.data?.[0]?.owner_email)?.toLowerCase();
    if (profileEmail?.includes("@")) ownerEmail = profileEmail;
  }

  return { ...user, owner_email: ownerEmail };
}
