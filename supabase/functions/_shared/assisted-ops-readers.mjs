import { createHash } from 'node:crypto';

// Candidate only. Ports are injected by the trusted server; this module has no
// network, SDK, environment access, writer, identity cache or retry path.
const MAX_BYTES = 25 * 1024 * 1024;
const SCOPE = ['actorId', 'organizationId', 'ownerScope', 'vendorId', 'invitationId', 'requestId'];
const STAFF = ['actorId', 'organizationId', 'ownerScope', 'tenantVerified', 'provider', 'emailVerified', 'role'];
const REF = ['rawUploadId', 'objectId', 'objectVersion', 'sha256', 'sizeBytes'];
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const exact = (v, keys) => record(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const text = (v, max = 256) => typeof v === 'string' && v.length > 0 && v.length <= max && v.trim() === v && !/[\x00-\x1f\x7f]/.test(v);
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const opaque = (v, max = 160) => typeof v === 'string' && new RegExp(`^[A-Za-z0-9_-]{16,${max}}$`).test(v);
const canonical = v => Array.isArray(v) ? v.map(canonical) : record(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const freeze = v => { if (v && typeof v === 'object' && !ArrayBuffer.isView(v)) { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const copy = v => freeze(structuredClone(v));
const deny = () => { throw new Error('OPS_READ_UNAVAILABLE'); };
const require = condition => { if (!condition) deny(); };
// Never expose injected errors (which may include tokens, SQL or storage paths).
const guarded = fn => async (...args) => { try { return await fn(...args); } catch { deny(); } };
const staffValid = s => exact(s, STAFF) && uuid(s.actorId) && text(s.organizationId) && text(s.ownerScope)
  && s.tenantVerified === true && s.provider === 'google' && s.emailVerified === true && ['admin', 'operator'].includes(s.role);
const scopeValid = s => exact(s, SCOPE) && uuid(s.actorId) && uuid(s.vendorId) && uuid(s.invitationId)
  && text(s.organizationId) && text(s.ownerScope) && opaque(s.requestId, 80);
const scopeOf = v => Object.fromEntries(SCOPE.map(k => [k, v[k]]));
const referenceValid = r => exact(r, REF) && uuid(r.rawUploadId) && uuid(r.objectId)
  && typeof r.sha256 === 'string' && /^[a-f0-9]{64}$/.test(r.sha256)
  && typeof r.objectVersion === 'string' && /^[A-Za-z0-9._:-]{1,160}$/.test(r.objectVersion)
  && Number.isSafeInteger(r.sizeBytes) && r.sizeBytes > 0 && r.sizeBytes <= MAX_BYTES;

/** Returns readStaff(Request), not a found/value envelope. resolveSourceFileUser
 * must be the canonical source-file-access.ts export, which calls sourceFileClaims
 * and requires tenant resolution with persistLegacyIdentity:false. */
export function createOperationsIdentityReader({ getUser, verifyGoogleSession, resolveSourceFileUser, teamRoleFromClaims, workspaceClient } = {}) {
  require([getUser, resolveSourceFileUser, teamRoleFromClaims].every(f => typeof f === 'function') && workspaceClient);
  return guarded(async request => {
    require(request instanceof Request);
    const authorization = request.headers.get('authorization');
    require(typeof authorization === 'string' && authorization.length <= 8192);
    const match = /^Bearer ([A-Za-z0-9._~+\/-]+=*)$/i.exec(authorization);
    require(match && match[1].length > 0);
    const response = await getUser(match[1]);
    require(record(response) && response.error === null && record(response.data) && record(response.data.user));
    const user = copy(response.data.user), app = user.app_metadata;
    require(uuid(user.id) && (!Object.hasOwn(user, 'sub') || user.sub === user.id));
    require(text(user.email, 320) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email));
    require(typeof user.email_confirmed_at === 'string' && Number.isFinite(Date.parse(user.email_confirmed_at)));
    require(typeof verifyGoogleSession==='function' && await verifyGoogleSession(match[1],user.id)===true);
    require(record(app) && text(app.rateware_organization_id));
    const organizationId = app.rateware_organization_id.toLowerCase();
    // A vacant alias grants nothing. Canonical Rateware organization and tenant
    // resolution below remain mandatory; a conflicting non-null alias denies.
    require(!Object.hasOwn(app, 'organization_id') || app.organization_id===null
      || text(app.organization_id) && app.organization_id.toLowerCase() === organizationId);
    require(Array.isArray(app.roles) && app.roles.length <= 32 && app.roles.every(r => text(r, 64)));
    const claims = copy({ sub: user.id, email: user.email, auth_provider: 'supabase', email_confirmed: true,
      rateware_organization_id: organizationId, organization_id: organizationId,
      roles: app.roles.map(r => r.toLowerCase()) });
    const role = teamRoleFromClaims(claims);
    require(['admin', 'operator'].includes(role));
    const resolved = await resolveSourceFileUser(workspaceClient, claims);
    require(record(resolved) && resolved.owner_user_id === user.id && resolved.organization_id === organizationId
      && text(resolved.canonical_tenant_id) && text(resolved.owner_email));
    // Tenant reconciliation is awaited: evidence may have been revoked while
    // it ran. Never authorize a subsequent write using the earlier receipt.
    require(await verifyGoogleSession(match[1],user.id)===true);
    const staff = { actorId: user.id, organizationId, ownerScope: resolved.owner_email,
      tenantVerified: true, provider: 'google', emailVerified: true, role };
    require(staffValid(staff));
    return copy(staff);
  });
}

// RPC data must be finite bounded JSON; reject undefined, typed bytes and nested
// surprise values rather than silently dropping them during comparisons.
function jsonValue(value, depth = 0, budget = { nodes: 0, characters: 0 }) {
  require(depth <= 12 && ++budget.nodes <= 30000);
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') { require(Number.isFinite(value)); return; }
  if (typeof value === 'string') { budget.characters += value.length; require(value.length <= 8192 && budget.characters <= 512 * 1024); return; }
  require(Array.isArray(value) || record(value));
  for (const [key, child] of Object.entries(value)) {
    budget.characters += key.length; require(budget.characters <= 512 * 1024);
    jsonValue(child, depth + 1, budget);
  }
}

function originalValid(m, scope, rawUploadId) {
  require(record(m) && !Object.hasOwn(m, 'bytes') && referenceValid(m.reference) && m.reference.rawUploadId === rawUploadId);
  require(m.ownerScope === scope.ownerScope && m.vendorId === scope.vendorId);
  // The existing original DTO carries owner/vendor; any additional scope fields
  // returned by persistence must also agree. The RPC authorizes all six fields.
  require(SCOPE.every(k => !Object.hasOwn(m, k) || m[k] === scope[k]));
  require(!Object.hasOwn(m, 'scope') || scopeValid(m.scope) && same(m.scope, scope));
  require(m.storageProvider === 'supabase' && m.bucket === 'raw-uploads'
    && ['uploaded', 'staged'].includes(m.status) && m.archivedAt === null);
  require(text(m.path, 1024) && /^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(m.path)
    && !m.path.split('/').some(p => p === '.' || p === '..'));
  const mime = m.documentType === 'pdf' ? 'application/pdf'
    : m.documentType === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : null;
  require(mime && m.mimeType === mime && text(m.originalFilename, 240) && !/[\\/]/.test(m.originalFilename)
    && m.originalFilename.toLowerCase().endsWith(`.${m.documentType}`));
  const object = m.objectMetadata, ref = m.reference;
  require(record(object) && object.id === ref.objectId && object.version === ref.objectVersion
    && object.bucket === m.bucket && object.path === m.path && object.sizeBytes === ref.sizeBytes);
}

/** Request-bound, read-only server ports. Reauthentication occurs before every
 * RPC, including the metadata reread after the physical download. */
export function createAuthenticatedOpsReaders({ readStaff, request, rpc, downloadOriginal } = {}) {
  require(request instanceof Request && [readStaff, rpc, downloadOriginal].every(f => typeof f === 'function'));
  const read = async (kind, input, expectedStaff) => {
    const staff = copy(await readStaff(request));
    require(staffValid(staff));
    if (expectedStaff !== undefined) require(staffValid(expectedStaff) && same(staff, expectedStaff));
    if (input.scope) require(input.scope.ownerScope === staff.ownerScope);
    const result = await rpc('rateware_assisted_ops_read_local_v1', { p_staff: staff, p_kind: kind, p_input: input });
    require(record(result) && result.error === null);
    jsonValue(result.data);
    const data = copy(result.data);
    if (kind === 'binding' && exact(data, ['state']) && data.state === 'absent') return { data, staff };
    require(exact(data, ['state', 'value']) && data.state === 'found' && record(data.value));
    if (kind === 'queue' || kind === 'originals') {
      require(Array.isArray(data.value.items) && data.value.items.length <= 100 && data.value.items.every(record));
    }
    return { data, staff };
  };
  return Object.freeze({
    readStaff,
    readReservation: guarded(async argument => {
      const args = copy(argument);
      require(exact(args, ['reservationId', 'staff']) && opaque(args.reservationId) && staffValid(args.staff));
      const { data, staff } = await read('reservation', copy({ reservationId: args.reservationId }), args.staff);
      require(record(data.value.target) && scopeValid(scopeOf(data.value.target)) && data.value.target.ownerScope === staff.ownerScope);
      if (Object.hasOwn(data.value, 'reservationId')) require(data.value.reservationId === args.reservationId);
      return data;
    }),
    readCapability: guarded(async argument => {
      const args = copy(argument);
      require(exact(args, ['opsActorId', 'ownerScope', 'scope', 'staff']) && staffValid(args.staff) && scopeValid(args.scope)
        && args.opsActorId === args.staff.actorId && args.ownerScope === args.staff.ownerScope && args.ownerScope === args.scope.ownerScope);
      const { data, staff } = await read('capability', copy({ scope: args.scope }), args.staff);
      require(data.value.opsActorId === staff.actorId && data.value.ownerScope === args.scope.ownerScope
        && scopeValid(data.value.allowedTarget) && same(data.value.allowedTarget, args.scope));
      return data;
    }),
    readBinding: guarded(async argument => {
      const scope = copy(argument); require(scopeValid(scope));
      const { data } = await read('binding', copy({ scope }));
      if (data.state === 'found') require(same(scopeOf(data.value), scope) && referenceValid(data.value.reference));
      return data;
    }),
    readOriginal: guarded(async argument => {
      const args = copy(argument);
      require(exact(args, ['scope', 'rawUploadId']) && scopeValid(args.scope) && uuid(args.rawUploadId));
      const first = await read('original', args);
      originalValid(first.data.value, args.scope, args.rawUploadId);
      const downloaded = await downloadOriginal(first.data.value);
      require(downloaded instanceof Uint8Array && downloaded.byteLength > 0 && downloaded.byteLength <= MAX_BYTES
        && downloaded.byteLength === first.data.value.reference.sizeBytes);
      // Own the bytes before hashing; the injected port cannot mutate the result
      // while the subsequent authentication/metadata reads are in flight.
      const bytes = new Uint8Array(downloaded);
      require(createHash('sha256').update(bytes).digest('hex') === first.data.value.reference.sha256);
      const second = await read('original', args, first.staff);
      originalValid(second.data.value, args.scope, args.rawUploadId);
      require(same(first.data, second.data));
      return { state: 'found', value: { ...second.data.value, bytes } };
    }),
    readQueue: guarded(async (argument = {}) => {
      const args = copy(argument); require(exact(args, []));
      return (await read('queue', args)).data;
    }),
    readOriginals: guarded(async argument => {
      const args = copy(argument); require(exact(args, ['reservationId']) && opaque(args.reservationId));
      return (await read('originals', args)).data;
    }),
  });
}
