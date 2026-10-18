export const OUTREACH_APPROVAL_CONTRACT = "outreach-version-v1";
export const OUTREACH_VERSION_CONFLICT = "OUTREACH_VERSION_CONFLICT: refresh the queue and review the changed message before approving again.";

const invalid = () => Object.assign(new Error("OUTREACH_APPROVAL_REQUIRED: approve one current version for each selected message."), { code: "409" });

// PostgreSQL timestamps have microsecond precision. Date alone loses the fence.
export function outreachVersionKey(value) {
  if (typeof value !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m) return null;
  const seconds = Date.parse(m[1] + m[3]);
  if (!Number.isFinite(seconds)) return null;
  return BigInt(seconds) * 1000n + BigInt((m[2] || "").padEnd(6, "0"));
}

export function expectedOutreachVersions(ids, entries) {
  if (!Array.isArray(entries) || entries.length !== ids.length) throw invalid();
  const requested = new Set(ids), versions = new Map();
  for (const row of entries) {
    if (!row || typeof row.id !== "string" || !requested.has(row.id) || versions.has(row.id) || outreachVersionKey(row.updated_at) === null) throw invalid();
    versions.set(row.id, row.updated_at);
  }
  return versions;
}

export function requireOutreachVersion(message, expected) {
  const actual = outreachVersionKey(message?.updated_at);
  if (actual === null || actual !== outreachVersionKey(expected)) {
    throw Object.assign(new Error(OUTREACH_VERSION_CONFLICT), { code: "409" });
  }
}
