export const OUTREACH_RELATED_ROW_BATCH_LIMIT = 25000;
export const OUTREACH_RELATED_ROW_PAGE_SIZE = 1000;

export async function fetchBoundedKeysetRows({
  fetchPage,
  label,
  limit = OUTREACH_RELATED_ROW_BATCH_LIMIT,
  pageSize = OUTREACH_RELATED_ROW_PAGE_SIZE
}) {
  const rows = [];
  const seenIds = new Set();
  let afterId = "";

  while (rows.length < limit) {
    const requested = Math.min(pageSize, limit - rows.length);
    const page = await fetchPage({ afterId, limit: requested });
    if (!Array.isArray(page)) throw new TypeError(`${label} returned an invalid page.`);
    if (page.length > requested) throw new Error(`${label} returned more than ${requested} requested rows.`);
    if (!page.length) return rows;

    for (const row of page) {
      const id = String(row?.id || "").trim();
      if (!id) throw new Error(`${label} returned a row without an id.`);
      if (afterId && id.localeCompare(afterId) <= 0) throw new Error(`${label} returned rows outside deterministic id order.`);
      if (seenIds.has(id)) throw new Error(`${label} returned duplicate row ${id}.`);
      seenIds.add(id);
      rows.push(row);
      afterId = id;
    }
    if (page.length < requested) return rows;
  }

  const sentinel = await fetchPage({ afterId, limit: 1 });
  if (!Array.isArray(sentinel)) throw new TypeError(`${label} returned an invalid overflow probe.`);
  if (sentinel.length) throw new Error(`${label} exceeded the safe per-batch limit of ${limit} rows.`);
  return rows;
}

export function assertOutreachMatrixWithinLimit({ carrierCount, laneCount, loadedRows, limit }) {
  const carriers = Math.max(0, Number(carrierCount) || 0);
  const lanes = Math.max(0, Number(laneCount) || 0);
  const matrixRows = lanes ? carriers * lanes : Math.max(0, Number(loadedRows) || 0);
  if (!Number.isSafeInteger(matrixRows) || matrixRows > limit) {
    throw new Error(
      `Outreach matrix requires ${matrixRows} carrier-lane rows (${carriers} carriers x ${lanes} lanes); ` +
      `the safety limit is ${limit}. Narrow the carrier wave or lane book and retry the same campaign.`
    );
  }
  return { carrier_count: carriers, lane_count: lanes, matrix_rows: matrixRows, limit };
}
