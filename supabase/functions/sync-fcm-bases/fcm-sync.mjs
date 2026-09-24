// Pure helpers for sync-fcm-bases: which FCM assumption sets QuoteDesk can price
// with, which rateware workspace each FCM organization belongs to (by its users'
// emails), and the rows written to the fcm_* copy tables.

/** The FCM prices only with the published version of a live cost base, or an org's active legacy set. */
export function usableSet(set) {
  if (set.base_id) {
    return set.base_status !== "ARCHIVED" && set.version_status === "PUBLISHED" && Boolean(set.is_active) && Boolean(set.has_profile);
  }
  return Boolean(set.is_active) && set.version_status !== "ARCHIVED";
}

/** Default: the org's active legacy set (what the FCM uses with no base chosen), else its default base, else any usable one. */
export function defaultSetId(sets) {
  const usable = sets.filter(usableSet);
  return (usable.find((set) => !set.base_id) || usable.find((set) => set.base_default) || usable[0])?.id ?? null;
}

export function paramMap(params) {
  const map = {};
  for (const param of params) {
    const value = Number(param.value);
    if (param.section && param.field && Number.isFinite(value)) map[`${param.section}__${param.field}`] = value;
  }
  return map;
}

/**
 * FCM organization -> rateware workspace, through the FCM users' emails and the
 * workspace identity aliases (identity_key = email). An org whose users map to
 * more than one workspace is left out rather than guessed.
 */
export function workspacesByOrg(fcmUsers, aliases, registry) {
  const ownerByOrganization = new Map(registry.map((row) => [String(row.organization_id), row]));
  const workspaceByEmail = new Map();
  for (const alias of aliases) {
    const email = String(alias.identity_key || "").trim().toLowerCase();
    const workspace = ownerByOrganization.get(String(alias.organization_id));
    if (email && workspace?.canonical_owner_key) workspaceByEmail.set(email, workspace);
  }
  const candidates = new Map();
  for (const user of fcmUsers) {
    const workspace = workspaceByEmail.get(String(user.email || "").trim().toLowerCase());
    if (!workspace) continue;
    const found = candidates.get(user.org_id) ?? new Map();
    found.set(workspace.canonical_owner_key, workspace);
    candidates.set(user.org_id, found);
  }
  const result = new Map();
  const conflicts = [];
  for (const [orgId, found] of candidates) {
    if (found.size === 1) {
      const workspace = [...found.values()][0];
      result.set(orgId, { owner_email: workspace.canonical_owner_key, organization_id: String(workspace.organization_id) });
    } else {
      conflicts.push(orgId);
    }
  }
  return { byOrg: result, conflicts };
}

/** fcm_cost_bases rows for the mapped organizations. */
export function costBaseRows({ sets, params, organizations, workspaces, syncedAt }) {
  const paramsBySet = new Map();
  for (const param of params) {
    const list = paramsBySet.get(param.set_id) ?? [];
    list.push(param);
    paramsBySet.set(param.set_id, list);
  }
  const orgName = new Map(organizations.map((org) => [org.id, org.name]));
  const rows = [];
  const byOrg = new Map();
  for (const set of sets) {
    if (!workspaces.has(set.org_id)) continue;
    const list = byOrg.get(set.org_id) ?? [];
    list.push(set);
    byOrg.set(set.org_id, list);
  }
  for (const [orgId, orgSets] of byOrg) {
    const workspace = workspaces.get(orgId);
    const defaultId = defaultSetId(orgSets);
    for (const set of orgSets) {
      const map = paramMap(paramsBySet.get(set.id) ?? []);
      rows.push({
        id: set.id,
        owner_email: workspace.owner_email,
        organization_id: workspace.organization_id,
        fcm_organization_id: orgId,
        fcm_organization_name: orgName.get(orgId) ?? null,
        fcm_cost_base_id: set.base_id ?? null,
        code: set.code ?? null,
        name: set.base_id ? set.base_name : set.set_name,
        scope: set.scope ?? null,
        cost_base_status: set.base_status ?? null,
        version: Number(set.version) || 1,
        version_status: set.version_status,
        is_active: Boolean(set.is_active),
        usable: usableSet(set),
        is_default: set.id === defaultId,
        policy: set.policy === "WORKBOOK_V3" ? "WORKBOOK_V3" : "OPERATIONAL_V3",
        currency: set.currency ?? null,
        params: map,
        param_count: Object.keys(map).length,
        profile: set.profile && typeof set.profile === "object" ? set.profile : null,
        source_updated_at: set.updated_at ? new Date(set.updated_at).toISOString() : null,
        synced_at: syncedAt
      });
    }
  }
  return rows;
}

export function chunk(items, size) {
  const parts = [];
  for (let index = 0; index < items.length; index += size) parts.push(items.slice(index, index + size));
  return parts;
}
