function trimmedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function defaultContactUsable(vendor) {
  return Boolean(trimmedText(vendor?.primary_email));
}

function defaultVendorAvailable(vendor) {
  const status = trimmedText(vendor?.status).toLowerCase();
  return Boolean(vendor) && status !== "archived" && status !== "deleted";
}

export function templateMemberIds(template = {}) {
  const seen = new Set();
  const ids = [];
  for (const value of Array.isArray(template?.vendor_ids) ? template.vendor_ids : []) {
    const id = trimmedText(value);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export function partitionCarrierTemplateMembers({
  template = {},
  vendors = [],
  participantVendorIds = [],
  isContactUsable = defaultContactUsable,
  isVendorAvailable = defaultVendorAvailable,
  passesFilters = () => true
} = {}) {
  const rows = {
    eligible: [],
    already_in_rfx: [],
    missing_contact: [],
    unavailable: []
  };
  const vendorById = new Map(
    (Array.isArray(vendors) ? vendors : [])
      .filter((vendor) => trimmedText(vendor?.id))
      .map((vendor) => [trimmedText(vendor.id), vendor])
  );
  const participantIds = new Set(
    (Array.isArray(participantVendorIds) ? participantVendorIds : [])
      .map(trimmedText)
      .filter(Boolean)
  );
  const filteredOutIds = [];

  for (const vendorId of templateMemberIds(template)) {
    const vendor = vendorById.get(vendorId);
    let primaryState = "eligible";
    if (participantIds.has(vendorId)) {
      primaryState = "already_in_rfx";
    } else if (!vendor || !isVendorAvailable(vendor)) {
      primaryState = "unavailable";
    } else if (!isContactUsable(vendor)) {
      primaryState = "missing_contact";
    }

    const row = vendor
      ? { ...vendor, vendor_id: vendorId, primary_state: primaryState }
      : { vendor_id: vendorId, id: vendorId, unavailable: true, primary_state: primaryState };
    rows[primaryState].push(row);
    if (!passesFilters(row)) filteredOutIds.push(vendorId);
  }

  const counts = {
    total: templateMemberIds(template).length,
    eligible: rows.eligible.length,
    already_in_rfx: rows.already_in_rfx.length,
    missing_contact: rows.missing_contact.length,
    unavailable: rows.unavailable.length,
    filtered_out: filteredOutIds.length
  };
  return { rows, counts, filtered_out_ids: filteredOutIds };
}
