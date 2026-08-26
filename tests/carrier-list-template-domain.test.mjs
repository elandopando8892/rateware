import assert from "node:assert/strict";

import {
  partitionCarrierTemplateMembers,
  templateMemberIds
} from "../src/carrier-list-template-domain.js";
import {
  carrierTemplateExceptionCsv,
  mapCarrierTemplateHeader,
  normalizeCarrierTemplateRows,
  rowsFromCarrierTemplateMatrix
} from "../src/carrier-list-template-file.js";

const ids = {
  eligible: "11111111-1111-4111-8111-111111111111",
  filtered: "22222222-2222-4222-8222-222222222222",
  participant: "33333333-3333-4333-8333-333333333333",
  missingContact: "44444444-4444-4444-8444-444444444444",
  archived: "55555555-5555-4555-8555-555555555555",
  deleted: "66666666-6666-4666-8666-666666666666",
  foreign: "77777777-7777-4777-8777-777777777777"
};

const activeVendor = (id, extra = {}) => ({
  id,
  organization_id: "org-a",
  status: "active",
  primary_email: "pricing@example.com",
  ...extra
});

// This catches an accidental fifth primary state or any precedence/order change.
{
  const filteredVendor = activeVendor(ids.filtered, { vendor_name: "Filtered carrier" });
  const groups = partitionCarrierTemplateMembers({
    template: { vendor_ids: Object.values(ids) },
    vendors: [
      activeVendor(ids.eligible, { vendor_name: "Eligible carrier" }),
      filteredVendor,
      activeVendor(ids.participant, { vendor_name: "Already invited" }),
      activeVendor(ids.missingContact, { primary_email: "", vendor_name: "No email" }),
      activeVendor(ids.archived, { status: "archived", vendor_name: "Archived" }),
      activeVendor(ids.foreign, { organization_id: "org-b", vendor_name: "Foreign" })
    ],
    participantVendorIds: [ids.participant],
    isContactUsable: (vendor) => Boolean(vendor.primary_email),
    isVendorAvailable: (vendor) => vendor.organization_id === "org-a" && vendor.status === "active",
    passesFilters: (vendor) => vendor.id !== filteredVendor.id
  });

  assert.deepEqual(groups.counts, {
    total: 7,
    eligible: 2,
    already_in_rfx: 1,
    missing_contact: 1,
    unavailable: 3,
    filtered_out: 1
  });
  assert.equal(
    groups.counts.eligible + groups.counts.already_in_rfx + groups.counts.missing_contact + groups.counts.unavailable,
    groups.counts.total
  );
  assert.equal(new Set(Object.values(groups.rows).flat().map((row) => row.vendor_id)).size, 7);
  assert.deepEqual(groups.filtered_out_ids, [filteredVendor.id]);
  assert.deepEqual(groups.rows.eligible.map((row) => row.vendor_id), [ids.eligible, ids.filtered]);
  assert.deepEqual(groups.rows.unavailable.map((row) => row.vendor_id), [ids.archived, ids.deleted, ids.foreign]);
  assert.deepEqual(groups.rows.unavailable[1], {
    vendor_id: ids.deleted,
    id: ids.deleted,
    unavailable: true,
    primary_state: "unavailable"
  });
}

// This catches dropping the template's source order or duplicate/blank IDs.
{
  assert.deepEqual(templateMemberIds({ vendor_ids: ["  a ", "b", "a", "", null] }), ["a", "b"]);
}

// This catches header aliases that silently lose match evidence or source row provenance.
{
  const matrix = [
    ["Rateware carrier template"],
    [],
    ["ID de proveedor CRM", "CRM ID", "Numero USDOT", "Numero MC", "Correo electronico principal", "Nombre del transportista"],
    [ids.eligible, "legacy-7", "123456", "MC-765", " PRICING@Example.COM ", " Acme, Inc. "],
    ["", "", "", "", "", ""]
  ];
  const rows = rowsFromCarrierTemplateMatrix(matrix);
  assert.deepEqual(rows, [{
    vendor_id: ids.eligible,
    crm_id: "legacy-7",
    usdot_number: "123456",
    mc_number: "MC-765",
    primary_email: " PRICING@Example.COM ",
    vendor_name: " Acme, Inc. ",
    source_row_number: 4
  }]);
  assert.equal(mapCarrierTemplateHeader("Numero USDOT"), "usdot_number");
  assert.equal(mapCarrierTemplateHeader("Correo electronico principal"), "primary_email");
  assert.deepEqual(normalizeCarrierTemplateRows(rows), [{
    vendor_id: ids.eligible,
    crm_id: "legacy-7",
    usdot_number: "123456",
    usdot: "123456",
    mc_number: "MC-765",
    primary_email: "pricing@example.com",
    vendor_name: "Acme, Inc.",
    source_row_number: 4
  }]);
}

// This catches malformed CSV output when exception reasons or candidate IDs contain commas or quotes.
{
  assert.equal(
    carrierTemplateExceptionCsv([{
      source_row_number: 4,
      status: "ambiguous",
      reason: "Name, \"Acme\" needs review",
      vendor_id: null,
      candidate_vendor_ids: [ids.eligible, ids.filtered],
      requires_manual_confirmation: true
    }]),
    `source_row_number,status,reason,vendor_id,candidate_vendor_ids,requires_manual_confirmation\r\n4,ambiguous,"Name, ""Acme"" needs review",,${ids.eligible};${ids.filtered},true\r\n`
  );
}

console.log("carrier-list-template browser domain tests passed");
