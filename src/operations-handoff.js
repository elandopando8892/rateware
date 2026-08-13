const READY_AWARD_STATUSES = new Set(["approved", "implementation_ready"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function record(value) {
  return isRecord(value) ? value : {};
}

function rows(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const result = String(value ?? "").trim();
  return result || null;
}

function numeric(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function addMissing(missing, path, value) {
  if (value === null || value === undefined || value === "") missing.push(path);
}

function locationFromLane(lane, prefix) {
  return {
    display: clean(lane[prefix]),
    city: clean(lane[`${prefix}_city`]),
    state: clean(lane[`${prefix}_state`]),
    country: clean(lane[`${prefix}_country`]),
    postal_code: clean(lane[`${prefix}_postal_code`])
  };
}

function laneIndex(snapshot) {
  const result = new Map();
  for (const lane of rows(record(snapshot).rfx_demand_lanes)) {
    const laneRecord = record(lane);
    const id = clean(laneRecord.id);
    if (id) result.set(id, laneRecord);
  }
  return result;
}

function packageIndex(detail) {
  return new Map(rows(detail.packages).map((item) => {
    const packageRecord = record(item);
    return [clean(packageRecord.id), packageRecord];
  }).filter(([id]) => id));
}

function filenamePart(value) {
  return String(value || "handoff")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "handoff";
}

export function buildOperationsHandoffPreview(detailValue, awardPackageId) {
  const detail = record(detailValue);
  const project = record(detail.project);
  const award = rows(detail.award_packages)
    .map(record)
    .find((item) => clean(item.id) === clean(awardPackageId));
  if (!award) throw new Error("Award package not found in the loaded RFx project.");

  const missing = [];
  const packagesById = packageIndex(detail);
  const sourcingPackage = packagesById.get(clean(award.rfx_package_id)) || {};
  const snapshotId = clean(sourcingPackage.demand_snapshot_id);
  const snapshot = rows(detail.demand_snapshots).map(record).find((item) => clean(item.id) === snapshotId) || {};
  const lanesById = laneIndex(snapshot);
  const packageLaneRows = rows(sourcingPackage.rfx_package_lanes).map(record);
  const packageLaneIds = new Set(packageLaneRows.map((item) => clean(item.demand_lane_id)).filter(Boolean));
  const awardLines = rows(award.rfx_award_package_lanes);
  const projectId = clean(project.id);
  const awardId = clean(award.id);
  const packageId = clean(award.rfx_package_id);
  const eventCandidates = [...new Set([
    clean(award.linked_rfx_event_id),
    clean(sourcingPackage.linked_rfx_event_id),
    clean(project.linked_rfx_event_id)
  ].filter(Boolean))];
  const eventId = eventCandidates.length === 1 ? eventCandidates[0] : null;
  const implementationChecklist = record(award.implementation_checklist);

  addMissing(missing, "references.project_id", projectId);
  addMissing(missing, "references.award_package_id", awardId);
  addMissing(missing, "references.rfx_package_id", packageId);
  if (packageId && !packagesById.has(packageId)) missing.push("references.rfx_package_id:unresolved");
  addMissing(missing, "references.demand_snapshot_id", snapshotId);
  if (snapshotId && !clean(snapshot.id)) missing.push("references.demand_snapshot_id:unresolved");
  if (!Array.isArray(sourcingPackage.rfx_package_lanes)) missing.push("references.rfx_package_lanes:array");
  if (Array.isArray(sourcingPackage.rfx_package_lanes) && !packageLaneRows.length) missing.push("references.rfx_package_lanes:at_least_one_lane");
  addMissing(missing, "references.rfx_event_id", eventId);
  if (eventCandidates.length > 1) missing.push("references.rfx_event_id:conflict");
  addMissing(missing, "customer.name", clean(project.customer_name));
  addMissing(missing, "customer.target_start_date", clean(project.target_start_date));
  if (!isRecord(award.implementation_checklist)) missing.push("award.implementation_checklist:object");
  if (isRecord(award.implementation_checklist) && !Object.keys(implementationChecklist).length) missing.push("award.implementation_checklist:not_empty");
  if (!READY_AWARD_STATUSES.has(String(award.status || "").toLowerCase())) missing.push("award.status:approved_or_implementation_ready");
  if (!awardLines.length) missing.push("lanes:at_least_one_award_line");

  const seenAwardLineIds = new Set();
  const seenLaneIds = new Set();
  const lanePayloads = awardLines.map((lineValue, index) => {
    const line = record(lineValue);
    const prefix = `lanes[${index}]`;
    const laneId = clean(line.lane_id);
    const lane = laneId ? lanesById.get(laneId) : null;
    const carrierId = clean(line.awarded_carrier_id);
    const awardedRate = numeric(line.awarded_rate);
    const currency = clean(line.currency);
    const awardedCapacity = numeric(line.awarded_capacity);

    addMissing(missing, `${prefix}.award_line_id`, clean(line.id));
    addMissing(missing, `${prefix}.lane_id`, laneId);
    if (clean(line.id) && seenAwardLineIds.has(clean(line.id))) missing.push(`${prefix}.award_line_id:duplicate`);
    if (laneId && seenLaneIds.has(laneId)) missing.push(`${prefix}.lane_id:duplicate`);
    if (clean(line.id)) seenAwardLineIds.add(clean(line.id));
    if (laneId) seenLaneIds.add(laneId);
    if (laneId && !lane) missing.push(`${prefix}.lane_id:unresolved`);
    if (laneId && !packageLaneIds.has(laneId)) missing.push(`${prefix}.lane_id:not_in_rfx_package`);
    addMissing(missing, `${prefix}.awarded_carrier_id`, carrierId);
    if (awardedRate === null || awardedRate <= 0) missing.push(`${prefix}.awarded_rate:positive`);
    addMissing(missing, `${prefix}.currency`, currency);
    if (awardedCapacity === null || awardedCapacity <= 0) missing.push(`${prefix}.awarded_capacity:positive`);
    if (!READY_AWARD_STATUSES.has(String(line.status || "").toLowerCase())) missing.push(`${prefix}.status:approved_or_implementation_ready`);

    if (!isRecord(line.service_requirements)) missing.push(`${prefix}.service_requirements:object`);
    if (!isRecord(line.accessorials)) missing.push(`${prefix}.accessorials:object`);
    if (!Array.isArray(line.accepted_exceptions)) missing.push(`${prefix}.accepted_exceptions:array`);

    const awardPayload = {
      carrier_id: carrierId,
      backup_carrier_id: clean(line.backup_carrier_id),
      rate: awardedRate,
      currency,
      weekly_capacity: awardedCapacity,
      service_requirements: record(line.service_requirements),
      accessorials: record(line.accessorials),
      accepted_exceptions: rows(line.accepted_exceptions),
      implementation_notes: clean(line.implementation_notes),
      status: clean(line.status)
    };

    if (!lane) {
      return {
        award_line_id: clean(line.id),
        lane_id: laneId,
        route: null,
        operating_requirements: null,
        award: awardPayload
      };
    }

    const origin = locationFromLane(lane, "origin");
    const destination = locationFromLane(lane, "destination");
    if (!origin.display && !origin.city) missing.push(`${prefix}.route.origin`);
    if (!destination.display && !destination.city) missing.push(`${prefix}.route.destination`);
    addMissing(missing, `${prefix}.operating_requirements.operation`, clean(lane.operation_type));
    addMissing(missing, `${prefix}.operating_requirements.service`, clean(lane.service_type));
    addMissing(missing, `${prefix}.operating_requirements.equipment`, clean(lane.equipment_type));

    return {
      award_line_id: clean(line.id),
      lane_id: laneId,
      lane_key: clean(lane.lane_key),
      route: { origin, destination },
      operating_requirements: {
        segment: clean(lane.operating_segment),
        operation: clean(lane.operation_type),
        service: clean(lane.service_type),
        equipment: clean(lane.equipment_type),
        trailer_requirements: clean(lane.trailer_requirements),
        weekly_volume: numeric(lane.weekly_volume),
        monthly_volume: numeric(lane.monthly_volume),
        frequency: clean(lane.frequency)
      },
      award: awardPayload
    };
  });

  const missingFields = [...new Set(missing)].sort();
  const payload = {
    schema_version: "rateware.operations_handoff.v1",
    handoff_kind: "award_to_operations",
    mode: "observation_only",
    target_system: "fleet_rocket",
    dispatch_authorized: false,
    tracking_execution_authorized: false,
    writeback_authorized: false,
    manual_entry_required: true,
    references: {
      project_id: projectId,
      award_package_id: awardId,
      rfx_package_id: packageId,
      demand_snapshot_id: snapshotId,
      rfx_event_id: eventId
    },
    customer: {
      id: clean(project.customer_id),
      name: clean(project.customer_name),
      target_start_date: clean(project.target_start_date)
    },
    award: {
      scenario_name: clean(award.scenario_name),
      scenario_type: clean(award.scenario_type),
      status: clean(award.status),
      source_updated_at: clean(award.updated_at),
      notes: clean(award.notes),
      implementation_checklist: implementationChecklist
    },
    lanes: lanePayloads,
    readiness: {
      status: missingFields.length ? "blocked" : "ready",
      missing_fields: missingFields
    }
  };

  return {
    award_package_id: awardId,
    filename: `${filenamePart(project.title || project.customer_name)}-${filenamePart(award.scenario_name)}-fleet-rocket-handoff.json`,
    payload,
    readiness: payload.readiness
  };
}

export function buildOperationsHandoffPreviews(detailValue) {
  const detail = record(detailValue);
  return rows(detail.award_packages).map((award) => buildOperationsHandoffPreview(detail, record(award).id));
}
