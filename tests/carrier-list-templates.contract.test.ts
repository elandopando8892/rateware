import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  carrierTemplateNameKey,
  normalizeCarrierTemplateInput,
  normalizeCarrierTemplateVendorIds,
  permissionKeysFromClaims,
  requireCarrierTemplateManagePermission,
  resolveCarrierTemplateImportRows,
} from "../supabase/functions/rateware-api/carrier-list-templates.ts";

Deno.test("template writes require vendors:manage", () => {
  assertEquals(
    permissionKeysFromClaims({ permissions: ["vendors:manage"] }),
    new Set(["vendors:manage"]),
  );
  assertEquals(
    permissionKeysFromClaims({
      "https://kinde.com/permissions": ["vendors:manage"],
    }),
    new Set(["vendors:manage"]),
  );
  assertEquals(
    permissionKeysFromClaims({
      permissions: [
        { key: "vendors:manage" },
        { name: "vendors:read" },
        null,
        4,
      ],
    }),
    new Set(["vendors:manage", "vendors:read"]),
  );
  assertEquals(
    permissionKeysFromClaims({ permissions: [{ key: 4 }, { name: null }] }),
    new Set(),
  );
  assertThrows(
    () =>
      requireCarrierTemplateManagePermission({ permissions: ["vendors:read"] }),
    Error,
    "vendors:manage",
  );
});

Deno.test("template names and vendor ids normalize deterministically", () => {
  assertEquals(carrierTemplateNameKey("  México   Core "), "mexico core");
  assertEquals(
    normalizeCarrierTemplateVendorIds([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "11111111-1111-4111-8111-111111111111",
      "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ]),
    [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ],
  );
  assertThrows(
    () => normalizeCarrierTemplateVendorIds(["not-a-uuid"]),
    Error,
    "vendor UUID",
  );
});

Deno.test("draft may be empty but active may not", () => {
  const actor = {
    user_id: "kp_1",
    email: "buyer@example.com",
    organization_id: "org-a",
  };
  assertEquals(
    normalizeCarrierTemplateInput({
      segment_name: "Mexico Core",
      lifecycle_status: "draft",
      vendor_ids: [],
    }, actor).vendor_ids,
    [],
  );
  assertThrows(
    () =>
      normalizeCarrierTemplateInput({
        segment_name: "Mexico Core",
        lifecycle_status: "active",
        vendor_ids: [],
      }, actor),
    Error,
    "at least one carrier",
  );
  const row = normalizeCarrierTemplateInput({
    segment_name: " México   Core ",
    lifecycle_status: "active",
    vendor_ids: [
      "11111111-1111-4111-8111-111111111111",
      "11111111-1111-4111-8111-111111111111",
    ],
    owner_email: "spoof@example.com",
    organization_id: "spoof",
  }, actor);
  assertEquals(row.segment_type, "participant_template");
  assertEquals(row.segment_name, "México Core");
  assertEquals(row.name_key, "mexico core");
  assertEquals(row.owner_email, actor.email);
  assertEquals(row.organization_id, actor.organization_id);
  assertEquals(row.created_by, actor.user_id);
});

const vendorA = {
  id: "11111111-1111-4111-8111-111111111111",
  organization_id: "org-a",
  vendor_name: "Border Haul",
  primary_email: "a@example.com",
  secondary_emails: ["a2@example.com"],
  profile_data: { international: { usdot: "100", mc_number: "MC100" } },
};
const vendorB = {
  id: "22222222-2222-4222-8222-222222222222",
  organization_id: "org-a",
  vendor_name: "Exact Name",
  primary_email: "b@example.com",
  secondary_emails: ["shared@example.com"],
  profile_data: { international: { usdot: "200" } },
};
const vendorC = {
  id: "33333333-3333-4333-8333-333333333333",
  organization_id: "org-a",
  vendor_name: "Email Carrier",
  primary_email: "c@example.com",
  profile_data: { international: { mc_number: "MC300" } },
};
const vendorD = {
  id: "44444444-4444-4444-8444-444444444444",
  organization_id: "org-a",
  vendor_name: "Exact Name",
  primary_email: "d@example.com",
  secondary_emails: ["shared@example.com"],
};
const foreign = {
  id: "55555555-5555-4555-8555-555555555555",
  organization_id: "org-b",
  vendor_name: "Foreign",
  primary_email: "foreign@example.com",
  profile_data: { international: { usdot: "999" } },
};

Deno.test("import rows resolve only safe deterministic identifiers", () => {
  const rows = [
    { source_row_number: 2, vendor_id: "11111111-1111-4111-8111-111111111111" },
    { source_row_number: 3, usdot: "200" },
    { source_row_number: 4, email: "c@example.com" },
    { source_row_number: 5, vendor_name: "Exact Name" },
    { source_row_number: 6, vendor_id: "11111111-1111-4111-8111-111111111111" },
    { source_row_number: 7, usdot: "999" },
    { source_row_number: 8, email: "missing@example.com" },
    { source_row_number: 9, email: "shared@example.com" },
  ];
  const result = resolveCarrierTemplateImportRows(rows, [
    vendorA,
    vendorB,
    vendorC,
    vendorD,
    foreign,
  ], "org-a");
  assertEquals(result.summary, {
    total: 8,
    matched: 3,
    ambiguous: 2,
    not_found: 2,
    duplicates: 1,
  });
  assertEquals(result.matched.map((row) => row.vendor_id), [
    vendorA.id,
    vendorB.id,
    vendorC.id,
  ]);
  assertEquals(result.ambiguous[0].requires_manual_confirmation, true);
  assertEquals(result.ambiguous[0].candidate_vendor_ids, [
    vendorB.id,
    vendorD.id,
  ]);
  assertEquals(result.not_found.map((row) => row.source_row_number), [7, 8]);
  assertEquals(result.duplicates[0].reason, "duplicate_vendor");
  assertEquals(result.rows.map((row) => row.status), [
    "matched",
    "matched",
    "matched",
    "ambiguous",
    "duplicate",
    "not_found",
    "not_found",
    "ambiguous",
  ]);
});

Deno.test("blank import rows are row-level not_found results", () => {
  const result = resolveCarrierTemplateImportRows([{}], [vendorA], "org-a");
  assertEquals(result.rows[0].status, "not_found");
  assertEquals(result.rows[0].reason, "missing_identifier");
  assertEquals(result.rows[0].requires_manual_confirmation, false);
});

Deno.test("unique name-only matches remain manual candidates", () => {
  const result = resolveCarrierTemplateImportRows(
    [
      { source_row_number: 2, vendor_name: "Border Haul" },
    ],
    [vendorA],
    "org-a",
  );
  assertEquals(result.rows[0].status, "ambiguous");
  assertEquals(result.rows[0].requires_manual_confirmation, true);
  assertEquals(result.rows[0].vendor_id, null);
  assertEquals(result.rows[0].candidate_vendor_ids, [vendorA.id]);
});

Deno.test("foreign UUIDs are not revealed and row numbers fall back deterministically", () => {
  const result = resolveCarrierTemplateImportRows(
    [
      { vendor_id: foreign.id },
      { source_row_number: "not numeric", vendor_id: vendorA.id },
    ],
    [vendorA, foreign],
    "org-a",
  );
  assertEquals(result.rows[0].status, "not_found");
  assertEquals(result.rows[0].vendor_id, null);
  assertEquals(result.rows[0].candidate_vendor_ids, []);
  assertEquals(result.rows.map((row) => row.source_row_number), [2, 3]);
});
