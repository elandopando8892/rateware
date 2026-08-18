// Entity Vault domain.
//
// The surface an operator uses to see what canonical documents the vault holds for
// each XBF legal entity — as metadata, never as values. The underlying read model
// (provider_entity_vault_workspace) projects no document contents and no tax,
// bank or signature values; this layer only decides how that metadata is triaged
// and displayed. Pure functions, no DOM, no network, so the disclosure posture is
// testable on its own.

const text = (value) => (value == null ? '' : String(value).trim());
const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export const VAULT_QUEUES = Object.freeze(['all', 'expiring', 'expired', 'unverified', 'restricted', 'releasable']);
export const RESTRICTED_SENSITIVITIES = Object.freeze(['restricted', 'highly_restricted']);

export function normalizeVaultQueue(value) {
  const queue = text(value).toLowerCase() || 'all';
  return VAULT_QUEUES.includes(queue) ? queue : 'all';
}

/** Restricted and highly restricted documents are never released without a human. */
export function isRestricted(row = {}) {
  return RESTRICTED_SENSITIVITIES.includes(text(row.sensitivity))
    || row.requires_human_release_approval === true;
}

/**
 * Priority band for the queue rail, worst first. Expiry is the most urgent thing
 * an operator acts on — an expired tax document blocks an alta — then verification,
 * then the standing restriction posture.
 */
export function vaultPriority(row = {}) {
  const expiry = text(row.expiry_state);
  if (expiry === 'expired') return 'critical';
  if (expiry === 'expiring_soon') return 'expiring';
  if (text(row.verification_status) !== 'verified') return 'unverified';
  if (isRestricted(row)) return 'restricted';
  return 'normal';
}

/**
 * What an operator may do with the document right now.
 *   releasable         — verified, in policy, may be packaged by reference or copy
 *   requires_approval  — restricted material; disclosure needs a human decision
 *   blocked_unverified — not yet verified, so nothing may be shared from it
 *   blocked_expired    — past its expiration; must be re-collected before use
 */
export function disclosureDisposition(row = {}) {
  if (text(row.expiry_state) === 'expired') return 'blocked_expired';
  if (text(row.verification_status) !== 'verified') return 'blocked_unverified';
  if (isRestricted(row)) return 'requires_approval';
  if (row.is_releasable === true) return 'releasable';
  return 'requires_approval';
}

/** Human phrasing of the document's expiry, without inventing a date it lacks. */
export function expiryLabel(row = {}) {
  const state = text(row.expiry_state);
  if (state === 'expired') return 'Expired';
  if (state === 'expiring_soon') return 'Expiring soon';
  if (!text(row.expiration_date)) return 'No expiry';
  return 'Current';
}

/** Bytes to a compact human size. Never throws on a missing or absurd value. */
export function formatFileSize(bytes) {
  const value = number(bytes);
  if (value <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? size : Math.round(size * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

/**
 * Fallback metrics computed from the rows in hand. The server sends authoritative
 * window aggregates; this is only used before the first response or when a filtered
 * page returns nothing, so the tiles never read a filtered page as the whole vault.
 */
export function summarizeVault(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  return Object.freeze({
    total: list.length,
    expired: list.filter((row) => text(row.expiry_state) === 'expired').length,
    unverified: list.filter((row) => text(row.verification_status) !== 'verified').length,
    restricted: list.filter((row) => isRestricted(row)).length,
  });
}
