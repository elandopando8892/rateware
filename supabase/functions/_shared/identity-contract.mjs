const PROVIDER = "kinde";

export class IdentityContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IdentityContractError";
    this.code = code;
  }
}

function cleanClaim(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

function objectClaim(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeExternalOrganizationId(value) {
  return cleanClaim(value)?.toLowerCase() || null;
}

function organizationCandidates(payload) {
  const organization = objectClaim(payload.organization);
  const org = objectClaim(payload.org);
  return [
    payload.org_code,
    payload.organization_id,
    payload.org_id,
    organization.code,
    organization.id,
    org.code,
    org.id
  ]
    .map(normalizeExternalOrganizationId)
    .filter(Boolean);
}

export function normalizeVerifiedKindeIdentity(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new IdentityContractError("IDENTITY_CLAIMS_INVALID", "Verified Kinde claims are required.");
  }

  const externalSubject = cleanClaim(payload.sub);
  if (!externalSubject) {
    throw new IdentityContractError("IDENTITY_SUBJECT_REQUIRED", "Verified Kinde subject is required.");
  }

  const organizations = [...new Set(organizationCandidates(payload))];
  if (!organizations.length) {
    throw new IdentityContractError("IDENTITY_ORGANIZATION_REQUIRED", "Verified Kinde organization is required.");
  }
  if (organizations.length !== 1) {
    throw new IdentityContractError("IDENTITY_ORGANIZATION_AMBIGUOUS", "Conflicting Kinde organization claims are not allowed.");
  }

  const email = cleanClaim(payload.email || payload.preferred_email || payload["https://kinde.com/email"])?.toLowerCase() || null;
  return Object.freeze({
    provider: PROVIDER,
    externalSubject,
    externalOrganizationId: organizations[0],
    email
  });
}

function assertUuid(value, code, message) {
  const uuid = cleanClaim(value)?.toLowerCase() || null;
  if (!uuid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid)) {
    throw new IdentityContractError(code, message);
  }
  return uuid;
}

async function selectRows(client, table, columns, filters) {
  let query = client.from(table).select(columns);
  for (const [column, value] of filters) query = query.eq(column, value);
  const result = await query.limit(2);
  if (result.error) throw result.error;
  return result.data || [];
}

function requireOneActive(rows, missingCode, ambiguousCode, inactiveCode, label) {
  if (!rows.length) throw new IdentityContractError(missingCode, `${label} is not registered.`);
  if (rows.length !== 1) throw new IdentityContractError(ambiguousCode, `${label} is ambiguous.`);
  if (rows[0].status !== "active") throw new IdentityContractError(inactiveCode, `${label} is not active.`);
  return rows[0];
}

export async function resolveCanonicalTenant(client, verifiedClaims) {
  const identity = normalizeVerifiedKindeIdentity(verifiedClaims);

  const identityRows = await selectRows(
    client,
    "external_identities",
    "id,status",
    [["provider", identity.provider], ["external_subject", identity.externalSubject]]
  );
  const identityRow = requireOneActive(
    identityRows,
    "IDENTITY_NOT_REGISTERED",
    "IDENTITY_RECORD_AMBIGUOUS",
    "IDENTITY_NOT_ACTIVE",
    "External identity"
  );

  const linkRows = await selectRows(
    client,
    "external_organization_links",
    "organization_id,status",
    [["provider", identity.provider], ["external_organization_id", identity.externalOrganizationId]]
  );
  const linkRow = requireOneActive(
    linkRows,
    "TENANT_LINK_NOT_REGISTERED",
    "TENANT_LINK_AMBIGUOUS",
    "TENANT_LINK_NOT_ACTIVE",
    "External organization link"
  );
  const canonicalTenantId = assertUuid(
    linkRow.organization_id,
    "TENANT_LINK_INVALID",
    "External organization link has no canonical tenant UUID."
  );

  const registryRows = await selectRows(
    client,
    "workspace_registry",
    "organization_uuid,canonical_owner_key",
    [["organization_id", identity.externalOrganizationId]]
  );
  if (!registryRows.length) {
    throw new IdentityContractError("WORKSPACE_REGISTRY_NOT_FOUND", "Workspace registry is not reconciled.");
  }
  if (registryRows.length !== 1) {
    throw new IdentityContractError("WORKSPACE_REGISTRY_AMBIGUOUS", "Workspace registry is ambiguous.");
  }
  const registryTenantId = assertUuid(
    registryRows[0].organization_uuid,
    "WORKSPACE_REGISTRY_UNRECONCILED",
    "Workspace registry has not been linked to a canonical tenant UUID."
  );
  if (registryTenantId !== canonicalTenantId) {
    throw new IdentityContractError("TENANT_MAPPING_CONFLICT", "Canonical tenant mappings disagree.");
  }

  return Object.freeze({
    identityId: assertUuid(identityRow.id, "IDENTITY_RECORD_INVALID", "External identity record is invalid."),
    provider: identity.provider,
    externalSubject: identity.externalSubject,
    externalOrganizationId: identity.externalOrganizationId,
    canonicalTenantId,
    canonicalOwnerKey: cleanClaim(registryRows[0].canonical_owner_key),
    email: identity.email
  });
}
