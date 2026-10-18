/** Freeze the rows already presented to the operator; never refresh at send time. */
export function freezeOutreachVersions(ids, rows) {
  return ids.map(id => {
    const matches = rows.filter(row => String(row.id) === String(id));
    const updated_at = matches[0]?.updated_at;
    if (typeof updated_at !== "string" || !updated_at || matches.some(row => row.updated_at !== updated_at)) {
      throw new Error("Refresh the queue and review each current message before approving again.");
    }
    return { id: String(id), updated_at };
  });
}
