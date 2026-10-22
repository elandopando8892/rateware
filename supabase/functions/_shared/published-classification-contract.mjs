/** Shared fail-closed projection for the approved, partial ChatGPT publication. */
export const PUBLICATION_SCHEMA = 'bidware-published-classification/1';
export const PUBLICATION_METHOD = 'bidware-aguila-derived-classification/20261021-v1';
// Exact unresolved source row from the approved ChatGPT evidence; never infer identity by scanning names.
export const IDENTITY_PENDING_RATE_ID = 'cc9f309e-24d4-4d39-bdff-6722bbbc260b';
export const PENDING_CASES = Object.freeze([
  Object.freeze({ key: 'nava', vendor_id: 'd84962e6-2a87-4569-a1e0-48637eb7cdd3', row_count: 15,
    classification_status: 'environment_unverified', resolution_status: 'corroborated_name' }),
  Object.freeze({ key: 'octavio', vendor_id: 'cf10b2ef-1afe-4a84-81f1-57d3a73d6f67', row_count: 1,
    classification_status: 'identity_unverified', resolution_status: 'uncorroborated_id' }),
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const invalid = () => { throw new Error('PUBLISHED_CLASSIFICATION_INVALID'); };
const check = value => { if (!value) invalid(); };
const text = (value, max = 200) => { check(typeof value === 'string' && value.length > 0 && value.length <= max); return value; };
const uuid = value => { check(typeof value === 'string' && UUID.test(value)); return value; };
const sha = value => { check(typeof value === 'string' && SHA.test(value)); return value; };

/** Pick fields explicitly: never return contacts, prices, local paths or arbitrary JSON. */
export function parsePublishedClassification(value, organizationId) {
  check(typeof organizationId === 'string' && organizationId.length > 0);
  check(value?.schema_version === PUBLICATION_SCHEMA && value.organization_id === organizationId);
  const envelope = { schema_version: PUBLICATION_SCHEMA, organization_id: organizationId };
  if (value.status === 'empty') {
    check(value.publication === null && ['NO_PUBLICATION', 'NOT_PUBLISHED'].includes(value.reason));
    return { ...envelope, status: 'empty', reason: value.reason, publication: null };
  }
  check(value.status === 'published');
  const p = value.publication;
  check(p && p.methodology_version === PUBLICATION_METHOD && p.scope === 'partial_derived_classification_13_rows_only');
  check(p.full_universe_replacement === false && p.original_sources_preserved === true);
  check(p.approved_row_count === 13 && Array.isArray(p.approved_rate_ids) && p.approved_rate_ids.length === 13);
  const approvedIds = p.approved_rate_ids.map(uuid);
  check(new Set(approvedIds).size === 13);
  const vendorId = uuid(p.vendor_id), baseRunId = uuid(p.source_run_id), runId = uuid(p.run_id);
  check(runId !== baseRunId && !PENDING_CASES.some(c => c.vendor_id === vendorId));
  check(typeof p.completed_at === 'string' && Number.isFinite(Date.parse(p.completed_at)));
  check(Array.isArray(p.rows) && p.rows.length === 13);
  const rows = p.rows.map(row => {
    check(row && approvedIds.includes(uuid(row.rate_id)) && row.vendor_id === vendorId && row.source_run_id === baseRunId);
    check(row.environment === 'MX Northbound & Southbound' && row.direction === 'NB' && row.equipment_family === 'Dry Van');
    check(row.classification_status === 'evidence_supported' && row.approval_status === 'user_approved_derived');
    check(row.derived_operation === 'MX Northbound' && row.source_operation === 'MX Southbound');
    check(row.original_document_and_rate_unchanged === true && row.membership_action === 'keep_pending' && row.execution_role_status === 'unknown');
    check(row.rfq_preselection_eligible === false && row.operational_assignment_approved === false && row.invitation_authorized === false);
    check(Array.isArray(row.template_names) && row.template_names.length === 1 && row.template_names[0] === 'MX Northbound & Southbound - Dry Van');
    check(Number.isInteger(row.source_row) && row.source_row > 0);
    return { rate_id: row.rate_id, vendor_id: vendorId, vendor_name: text(row.vendor_name),
      environment: row.environment, direction: row.direction, equipment_family: row.equipment_family,
      template_names: [...row.template_names], classification_status: row.classification_status,
      source_operation: row.source_operation, derived_operation: row.derived_operation,
      origin: text(row.origin), destination: text(row.destination), source_sheet: text(row.source_sheet),
      source_row: row.source_row, shipment_id: text(row.shipment_id), source_sha256: sha(row.source_sha256),
      source_run_id: baseRunId, approval_status: row.approval_status, original_document_and_rate_unchanged: true,
      membership_action: 'keep_pending', execution_role_status: 'unknown', rfq_preselection_eligible: false,
      operational_assignment_approved: false, invitation_authorized: false };
  });
  check(new Set(rows.map(r => r.rate_id)).size === 13);
  check(Array.isArray(p.pending) && p.pending.length === 2);
  const pending = PENDING_CASES.map(expected => {
    const matches = p.pending.filter(c => c.vendor_id === expected.vendor_id);
    check(matches.length === 1);
    const item = matches[0];
    check(item.row_count === expected.row_count);
    check(item.action === undefined || item.action === 'keep_pending');
    for (const guard of ['rfq_preselection_eligible', 'operational_assignment_approved', 'invitation_authorized']) check(item[guard] === undefined || item[guard] === false);
    check(Array.isArray(item.classification_statuses) && item.classification_statuses.length === 1 && item.classification_statuses[0] === expected.classification_status);
    check(Array.isArray(item.resolution_statuses) && item.resolution_statuses.length === 1 && item.resolution_statuses[0] === expected.resolution_status);
    return { key: expected.key, vendor_id: expected.vendor_id, row_count: expected.row_count,
      classification_status: expected.classification_status, resolution_status: expected.resolution_status,
      classification_statuses: [expected.classification_status], resolution_statuses: [expected.resolution_status],
      action: 'keep_pending', rfq_preselection_eligible: false, operational_assignment_approved: false, invitation_authorized: false };
  });
  return { ...envelope, status: 'published', reason: null, publication: {
    run_id: runId, source_run_id: baseRunId, completed_at: p.completed_at, methodology_version: PUBLICATION_METHOD,
    payload_sha256: sha(p.payload_sha256), scope: p.scope, approved_row_count: 13,
    approved_rate_ids: [...approvedIds].sort(), vendor_id: vendorId, full_universe_replacement: false,
    original_sources_preserved: true, rows: rows.sort((a, b) => a.source_row - b.source_row), pending,
  } };
}
