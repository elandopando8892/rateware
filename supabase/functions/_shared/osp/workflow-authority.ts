import type { OspAuthorizationIdentity } from '../../osp-read-api/auth-policy.ts';

export type OspAuthorityContext = {
  organizationId: string;
  issuer: string;
  subject: string;
  email: string;
  permissions: readonly string[];
  correlationId: string;
};

export type VerifiedWorkflowIdentity = {
  identity: OspAuthorizationIdentity;
  permissions: readonly string[];
};

export type VerifiedApprovalIdentity = VerifiedWorkflowIdentity & {
  authorizationSessionId: string;
  authorizationSessionIssuedAt: string;
};

const SPRINT_ONE_PERMISSIONS = new Set([
  'osp:read',
  'osp:operate',
  'osp:signature-approve',
  'osp:sales-authorize',
  'osp:send-authorized',
  'osp:superuser',
]);

export function hasWorkflowPermission(
  permissions: readonly string[],
  permission: string,
): boolean {
  return permissions.includes(permission) || permissions.includes('osp:superuser');
}

function fail(): never {
  throw new Error('FORBIDDEN');
}

export function createOspAuthorityContext(
  verified: VerifiedWorkflowIdentity,
  correlationId: string,
): OspAuthorityContext {
  if (typeof correlationId !== 'string' || correlationId.trim() === '') fail();
  return Object.freeze({
    organizationId: verified.identity.organization,
    issuer: verified.identity.issuer,
    subject: verified.identity.subject,
    email: verified.identity.email,
    permissions: verified.permissions,
    correlationId,
  });
}

export function assertWorkflowPermission(
  authority: OspAuthorityContext,
  permission: 'osp:read' | 'osp:operate' | string,
): void {
  if (!SPRINT_ONE_PERMISSIONS.has(permission) || !hasWorkflowPermission(authority.permissions, permission)) fail();
}

export function assertServerDerivedOrganization(
  authority: OspAuthorityContext,
  browserSuppliedOrganizationId: unknown,
): string {
  if (browserSuppliedOrganizationId !== undefined || authority.organizationId.trim() === '') fail();
  return authority.organizationId;
}
