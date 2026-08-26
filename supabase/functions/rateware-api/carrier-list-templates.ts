export const CARRIER_TEMPLATE_MANAGE_PERMISSION = "vendors:manage";
export const CARRIER_TEMPLATE_IMPORT_MAX_ROWS = 1000;
export const CARRIER_TEMPLATE_LIFECYCLES = new Set([
  "draft",
  "active",
  "archived",
]);

const PERMISSION_CLAIM_KEYS = ["permissions", "https://kinde.com/permissions"];

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function entries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined ? [] : [value];
}

export function permissionKeysFromClaims(
  claims: Record<string, unknown>,
): Set<string> {
  const permissions = new Set<string>();
  for (const key of PERMISSION_CLAIM_KEYS) {
    for (const entry of entries(claims[key])) {
      if (typeof entry === "string" && entry.trim()) {
        permissions.add(entry.trim());
      } else if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        const permission = text(record.key) ?? text(record.name);
        if (permission) permissions.add(permission);
      }
    }
  }
  return permissions;
}

export function requireCarrierTemplateManagePermission(
  claims: Record<string, unknown>,
): void {
  if (
    !permissionKeysFromClaims(claims).has(CARRIER_TEMPLATE_MANAGE_PERMISSION)
  ) {
    throw new Error(
      `Missing required permission: ${CARRIER_TEMPLATE_MANAGE_PERMISSION}`,
    );
  }
}

export function carrierTemplateNameKey(value: unknown): string {
  const translatedCharacters = "áàäâãåéèëêíìïîóòöôõúùüûñç";
  const asciiCharacters = "aaaaaaeeeeiiiiooooouuuunc";
  return String(value ?? "")
    .toLowerCase()
    .replace(
      /[áàäâãåéèëêíìïîóòöôõúùüûñç]/g,
      (character) => asciiCharacters[translatedCharacters.indexOf(character)],
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeCarrierTemplateVendorIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("vendor_ids must be an array of vendor UUIDs");
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    const id = text(item);
    if (
      !id ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(id)
    ) {
      throw new Error("vendor_ids must contain valid vendor UUIDs");
    }
    const canonicalId = id.toLowerCase();
    if (!seen.has(canonicalId)) {
      seen.add(canonicalId);
      ids.push(canonicalId);
    }
  }
  return ids;
}

export function normalizeCarrierTemplateInput(
  input: Record<string, unknown>,
  actor: { user_id: string; email: string; organization_id: string },
  options: {
    existing?: Record<string, unknown>;
    lifecycle?: "draft" | "active" | "archived";
  } = {},
): Record<string, unknown> {
  const segmentName = text(input.segment_name);
  if (!segmentName) throw new Error("segment_name is required");
  const lifecycle = options.lifecycle ?? text(input.lifecycle_status) ??
    text(input.status) ?? "draft";
  if (!CARRIER_TEMPLATE_LIFECYCLES.has(lifecycle)) {
    throw new Error("Invalid carrier template lifecycle");
  }
  const vendorIds = normalizeCarrierTemplateVendorIds(input.vendor_ids ?? []);
  if (lifecycle === "active" && vendorIds.length === 0) {
    throw new Error("An active template requires at least one carrier");
  }
  const existing = options.existing && typeof options.existing === "object"
    ? options.existing
    : {};
  const requestedDescription = input.segment_description ?? input.description ??
    existing.description;
  const description = typeof requestedDescription === "string"
    ? requestedDescription.trim()
    : "";
  const canonicalName = segmentName.replace(/\s+/g, " ").trim();
  return {
    ...existing,
    segment_name: canonicalName,
    description,
    name_key: carrierTemplateNameKey(canonicalName),
    segment_type: "participant_template",
    lifecycle_status: lifecycle,
    status: lifecycle,
    vendor_ids: vendorIds,
    owner_user_id: actor.user_id,
    owner_email: actor.email,
    organization_id: actor.organization_id,
    created_by: actor.user_id,
  };
}

export type CarrierTemplateImportResolution = {
  source_row_number: number;
  status: "matched" | "ambiguous" | "not_found" | "duplicate";
  reason: string;
  vendor_id: string | null;
  candidate_vendor_ids: string[];
  requires_manual_confirmation: boolean;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function key(value: unknown): string | null {
  return text(value)?.toLocaleLowerCase() ?? null;
}

function profileIdentifiers(
  vendor: Record<string, unknown>,
): { usdot: string[]; mc: string[] } {
  const international = record(record(vendor.profile_data).international);
  const usdot = [international.usdot, international.USDOT, international.us_dot]
    .map(key).filter((v): v is string => !!v);
  const mc = [
    international.mc,
    international.mc_number,
    international.MC,
    international.MC_number,
  ].map(key).filter((v): v is string => !!v);
  return { usdot, mc };
}

function emails(vendor: Record<string, unknown>): string[] {
  return [vendor.primary_email, ...entries(vendor.secondary_emails)].map(key)
    .filter((v): v is string => !!v);
}

export function resolveCarrierTemplateImportRows(
  rows: Record<string, unknown>[],
  vendors: Record<string, unknown>[],
  organizationId: string,
): {
  rows: CarrierTemplateImportResolution[];
  matched: CarrierTemplateImportResolution[];
  ambiguous: CarrierTemplateImportResolution[];
  not_found: CarrierTemplateImportResolution[];
  duplicates: CarrierTemplateImportResolution[];
  summary: Record<string, number>;
} {
  const workspaceVendors = vendors.filter((vendor) =>
    text(vendor.organization_id) === organizationId && text(vendor.id)
  );
  const used = new Set<string>();
  const resolved: CarrierTemplateImportResolution[] = [];
  const finish = (
    row: Record<string, unknown>,
    status: CarrierTemplateImportResolution["status"],
    reason: string,
    ids: string[],
    manual: boolean,
  ) => {
    const parsedSourceRow = Number(row.source_row_number);
    const sourceRowNumber =
      Number.isFinite(parsedSourceRow) && parsedSourceRow > 0
        ? parsedSourceRow
        : rows.indexOf(row) + 2;
    const result = {
      source_row_number: sourceRowNumber,
      status,
      reason,
      vendor_id: status === "matched" ? ids[0] : null,
      candidate_vendor_ids: ids,
      requires_manual_confirmation: manual,
    };
    resolved.push(result);
  };
  for (const row of rows) {
    const requestedId = text(row.vendor_id) ?? text(row.id) ?? text(row.crm_id);
    const id = requestedId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          .test(requestedId)
      ? requestedId.toLowerCase()
      : null;
    const hasExternalIdentifier =
      !!(row.usdot || row.USDOT || row.mc_number || row.mc || row.MC ||
        row.email || row.primary_email);
    const hasName = !!text(row.vendor_name ?? row.name);
    if (!requestedId && !hasExternalIdentifier && !hasName) {
      finish(row, "not_found", "missing_identifier", [], false);
      continue;
    }
    let candidates = id
      ? workspaceVendors.filter((vendor) => text(vendor.id) === id)
      : [];
    let reason = "workspace_uuid";
    if (!id) {
      const identifier = key(row.usdot ?? row.USDOT);
      const mc = key(row.mc_number ?? row.mc ?? row.MC);
      if (identifier || mc) {
        candidates = workspaceVendors.filter((vendor) => {
          const ids = profileIdentifiers(vendor);
          return (identifier && ids.usdot.includes(identifier)) ||
            (mc && ids.mc.includes(mc));
        });
        reason = identifier ? "unique_usdot" : "unique_mc";
      }
    }
    if (
      !id && !row.usdot && !row.USDOT && !row.mc_number && !row.mc && !row.MC
    ) {
      const email = key(row.email ?? row.primary_email);
      if (email) {
        candidates = workspaceVendors.filter((vendor) =>
          emails(vendor).includes(email)
        );
        reason = "unique_email";
      } else {
        const name = carrierTemplateNameKey(row.vendor_name ?? row.name);
        candidates = workspaceVendors.filter((vendor) =>
          carrierTemplateNameKey(vendor.vendor_name ?? vendor.name) === name
        );
        reason = "name_candidate";
      }
    }
    const candidateIds = candidates.map((vendor) => text(vendor.id) as string);
    if (candidateIds.length === 1 && reason === "name_candidate") {
      finish(row, "ambiguous", reason, candidateIds, true);
    } else if (candidateIds.length === 1) {
      if (used.has(candidateIds[0])) {
        finish(row, "duplicate", "duplicate_vendor", candidateIds, false);
      } else {
        used.add(candidateIds[0]);
        finish(row, "matched", reason, candidateIds, false);
      }
    } else if (candidateIds.length > 1) {
      finish(row, "ambiguous", reason, candidateIds, true);
    } else {finish(
        row,
        "not_found",
        requestedId ? "not_found_in_organization" : "not_found",
        [],
        false,
      );}
  }
  const matched = resolved.filter((row) => row.status === "matched");
  const ambiguous = resolved.filter((row) => row.status === "ambiguous");
  const not_found = resolved.filter((row) => row.status === "not_found");
  const duplicates = resolved.filter((row) => row.status === "duplicate");
  return {
    rows: resolved,
    matched,
    ambiguous,
    not_found,
    duplicates,
    summary: {
      total: rows.length,
      matched: matched.length,
      ambiguous: ambiguous.length,
      not_found: not_found.length,
      duplicates: duplicates.length,
    },
  };
}
