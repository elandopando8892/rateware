import {
  assert,
  assertEquals,
  assertMatch,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CARRIER_TEMPLATE_IMPORT_MAX_ROWS as SERVER_CARRIER_TEMPLATE_IMPORT_MAX_ROWS,
  carrierTemplateNameKey,
  normalizeCarrierTemplateInput,
  normalizeCarrierTemplateVendorIds,
  permissionKeysFromClaims,
  requireCarrierTemplateManagePermission,
  resolveCarrierTemplateImportRows,
} from "../supabase/functions/rateware-api/carrier-list-templates.ts";
import { normalizeCarrierTemplateRows } from "../src/carrier-list-template-file.js";
import {
  CARRIER_TEMPLATE_IMPORT_MAX_ROWS as BROWSER_CARRIER_TEMPLATE_IMPORT_MAX_ROWS,
  carrierTemplateVendorHasUsableContact as browserCarrierTemplateVendorHasUsableContact,
  carrierTemplateVendorIsAvailable as browserCarrierTemplateVendorIsAvailable,
} from "../src/carrier-list-template-domain.js";

let registeredHandler: ((request: Request) => Promise<Response>) | null = null;
const originalServe = Deno.serve;
const originalCarrierTemplateFlag = Deno.env.get(
  "CARRIER_LIST_TEMPLATES_V2_ENABLED",
);
const originalInvitationTokenEncryptionKey = Deno.env.get(
  "RFX_INVITATION_TOKEN_ENCRYPTION_KEY",
);
Deno.env.delete("CARRIER_LIST_TEMPLATES_V2_ENABLED");
Deno.env.set("RFX_INVITATION_TOKEN_ENCRYPTION_KEY", "carrier-template-request-fixture-key");
Object.defineProperty(Deno, "serve", {
  configurable: true,
  value: (handler: (request: Request) => Promise<Response>) => {
    registeredHandler = handler;
    return {};
  },
});
const ratewareApi = await import(
  "../supabase/functions/rateware-api/index.ts"
) as Record<string, unknown>;
Object.defineProperty(Deno, "serve", {
  configurable: true,
  value: originalServe,
});
if (originalCarrierTemplateFlag === undefined) {
  Deno.env.delete("CARRIER_LIST_TEMPLATES_V2_ENABLED");
} else {
  Deno.env.set(
    "CARRIER_LIST_TEMPLATES_V2_ENABLED",
    originalCarrierTemplateFlag,
  );
}
if (originalInvitationTokenEncryptionKey === undefined) {
  Deno.env.delete("RFX_INVITATION_TOKEN_ENCRYPTION_KEY");
} else {
  Deno.env.set(
    "RFX_INVITATION_TOKEN_ENCRYPTION_KEY",
    originalInvitationTokenEncryptionKey,
  );
}

const carrierTemplateActions = [
  "list_carrier_list_templates",
  "get_carrier_list_template",
  "resolve_carrier_list_template_rows",
  "create_carrier_list_template",
  "update_carrier_list_template",
  "duplicate_carrier_list_template",
  "archive_carrier_list_template",
  "restore_carrier_list_template",
] as const;

Deno.test("API preserves verified claims for canonical identity resolution", async () => {
  const resolvePrincipal = ratewareApi.resolveRatewareApiPrincipal;
  assertEquals(typeof resolvePrincipal, "function");
  if (typeof resolvePrincipal !== "function") return;

  const claims = {
    sub: "kp_1",
    permissions: ["vendors:manage"],
    organization_id: "org-a",
  };
  let resolvedClaims: Record<string, unknown> | null = null;
  const result = await resolvePrincipal(
    {},
    claims,
    {
      resolveUser: (
        _client: unknown,
        verifiedClaims: Record<string, unknown>,
        options: Record<string, unknown>,
      ) => {
        resolvedClaims = verifiedClaims;
        assertEquals(options, { persistLegacyIdentity: false });
        return Promise.resolve({
          owner_user_id: "kp_1",
          owner_email: "org:org-a",
          organization_id: "org-a",
        });
      },
    },
  ) as Record<string, unknown>;
  assertStrictEquals(resolvedClaims, claims);
  assertStrictEquals(result.claims, claims);
});

Deno.test("carrier template capability is disabled by default", () => {
  assertEquals(ratewareApi.CARRIER_LIST_TEMPLATES_V2_ENABLED, false);
});

Deno.test("API declares every explicit carrier template action", () => {
  assertEquals(
    ratewareApi.CARRIER_LIST_TEMPLATE_ACTIONS,
    carrierTemplateActions,
  );
  assertEquals(typeof ratewareApi.handleCarrierTemplateApiAction, "function");
  assertEquals(typeof registeredHandler, "function");
});

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

Deno.test("template name keys mirror rateware_vendor_search_key SQL semantics", () => {
  const fixtures: Array<[string, string]> = [
    [
      " ÁÀÄÂÃÅ ÉÈËÊ ÍÌÏÎ ÓÒÖÔÕ ÚÙÜÛ ÑÇ ",
      "aaaaaa eeee iiii ooooo uuuu nc",
    ],
    ["Crème—Brûlée!!!   México", "creme brulee mexico"],
    [" Alpha___---\t\nBeta ", "alpha beta"],
    ["Dvořák / Straße", "dvo ak stra e"],
  ];
  for (const [input, expected] of fixtures) {
    assertEquals(carrierTemplateNameKey(input), expected, input);
  }
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

Deno.test("template descriptions normalize aliases and preserve omission while allowing an explicit clear", () => {
  const actor = {
    user_id: "kp_1",
    email: "buyer@example.com",
    organization_id: "org-a",
  };
  assertEquals(
    normalizeCarrierTemplateInput({
      segment_name: "Mexico Core",
      description: " Legacy description ",
      segment_description: " Preferred description ",
      vendor_ids: [],
    }, actor).description,
    "Preferred description",
  );
  assertEquals(
    normalizeCarrierTemplateInput({
      segment_name: "Mexico Core",
      description: "Nullish fallback description",
      segment_description: null,
      vendor_ids: [],
    }, actor).description,
    "Nullish fallback description",
  );
  assertEquals(
    normalizeCarrierTemplateInput({
      segment_name: "Mexico Core",
      vendor_ids: [],
    }, actor, { existing: { description: "Keep this description" } })
      .description,
    "Keep this description",
  );
  assertEquals(
    normalizeCarrierTemplateInput({
      segment_name: "Mexico Core",
      segment_description: "",
      vendor_ids: [],
    }, actor, { existing: { description: "Clear this description" } })
      .description,
    "",
  );
});

Deno.test("browser and server enforce one 1,000-row carrier import contract", () => {
  assertEquals(SERVER_CARRIER_TEMPLATE_IMPORT_MAX_ROWS, 1000);
  assertEquals(
    BROWSER_CARRIER_TEMPLATE_IMPORT_MAX_ROWS,
    SERVER_CARRIER_TEMPLATE_IMPORT_MAX_ROWS,
  );
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

Deno.test("browser-normalized CRM UUID rows resolve only within the workspace", () => {
  const normalizedRows = normalizeCarrierTemplateRows([
    { source_row_number: 14, crm_id: vendorA.id },
    { source_row_number: 15, crm_id: foreign.id },
    { source_row_number: 16, crm_id: "not-a-uuid" },
  ]);
  const result = resolveCarrierTemplateImportRows(
    normalizedRows,
    [vendorA, foreign, { ...vendorA, id: "not-a-uuid" }],
    "org-a",
  );
  assertEquals(result.rows, [
    {
      source_row_number: 14,
      status: "matched",
      reason: "workspace_uuid",
      vendor_id: vendorA.id,
      candidate_vendor_ids: [vendorA.id],
      requires_manual_confirmation: false,
    },
    {
      source_row_number: 15,
      status: "not_found",
      reason: "not_found_in_organization",
      vendor_id: null,
      candidate_vendor_ids: [],
      requires_manual_confirmation: false,
    },
    {
      source_row_number: 16,
      status: "not_found",
      reason: "not_found_in_organization",
      vendor_id: null,
      candidate_vendor_ids: [],
      requires_manual_confirmation: false,
    },
  ]);
});

Deno.test("carrier list template service sends every explicit action with its exact payload", async () => {
  Object.assign(globalThis as Record<string, unknown>, {
    window: globalThis,
    document: {
    addEventListener() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    documentElement: { dataset: {} },
    body: { dataset: {} },
    },
  });
  const vendorService = await import(`../src/vendor-service.js?transport-contract=${crypto.randomUUID()}`);
  const calls: Array<{ action: string; payload: Record<string, unknown> }> = [];
  const service = vendorService.createCarrierListTemplateService((action: string, payload: Record<string, unknown>) => {
    calls.push({ action, payload });
    return Promise.resolve({ action, payload });
  });
  const template = { segment_name: "MX Core", vendor_ids: [vendorA.id] };

  await Promise.all([
    service.fetchCarrierListTemplates({ lifecycle_status: "active" }),
    service.getCarrierListTemplate(vendorA.id, { usageContext: "carrier_fit" }),
    service.resolveCarrierListTemplateRows([{ crm_id: vendorA.id }]),
    service.createCarrierListTemplate(template),
    service.updateCarrierListTemplate(vendorA.id, template, 3),
    service.duplicateCarrierListTemplate(vendorA.id, "MX Core copy", 3),
    service.archiveCarrierListTemplate(vendorA.id, 3),
    service.restoreCarrierListTemplate(vendorA.id, 4),
  ]);

  assertEquals(calls, [
    { action: "list_carrier_list_templates", payload: { lifecycle_status: "active" } },
    { action: "get_carrier_list_template", payload: { id: vendorA.id, usage_context: "carrier_fit" } },
    { action: "resolve_carrier_list_template_rows", payload: { rows: [{ crm_id: vendorA.id }] } },
    { action: "create_carrier_list_template", payload: { template } },
    { action: "update_carrier_list_template", payload: { id: vendorA.id, template, expected_version: 3 } },
    { action: "duplicate_carrier_list_template", payload: { id: vendorA.id, name: "MX Core copy", expected_version: 3 } },
    { action: "archive_carrier_list_template", payload: { id: vendorA.id, expected_version: 3 } },
    { action: "restore_carrier_list_template", payload: { id: vendorA.id, expected_version: 4 } },
  ]);
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

type ScriptedResponse = {
  table: string;
  operation: string;
  data?: unknown;
  error?: unknown;
  throws?: unknown;
  count?: number | null;
  filters?: QueryTrace["filters"];
  wait?: Promise<void>;
  onTake?: () => void;
};

type QueryTrace = {
  table: string;
  operation: string;
  payload?: unknown;
  selection?: string;
  filters: Array<[string, string, unknown]>;
};

class ScriptedSupabase {
  responses: ScriptedResponse[];
  traces: QueryTrace[] = [];
  maxResultRows: number;

  constructor(
    responses: ScriptedResponse[] = [],
    { maxResultRows = Number.POSITIVE_INFINITY }: { maxResultRows?: number } = {},
  ) {
    this.responses = [...responses];
    this.maxResultRows = maxResultRows;
  }

  from(table: string) {
    const trace: QueryTrace = {
      table,
      operation: "select",
      filters: [],
    };
    this.traces.push(trace);
    return new ScriptedQuery(this, trace);
  }

  rpc(name: string, payload: unknown) {
    const trace: QueryTrace = {
      table: name,
      operation: "rpc",
      payload,
      filters: [],
    };
    this.traces.push(trace);
    return this.take(trace);
  }

  take(trace: QueryTrace) {
    if (trace.table === "carrier_template_materialization_operations" && trace.operation === "upsert") {
      const payload = trace.payload as {
        rows?: Record<string, unknown>;
        options?: Record<string, unknown>;
      };
      assertEquals(payload.options, { onConflict: "id", ignoreDuplicates: true });
      assertEquals(payload.rows?.id, materializationOperationId);
      assertEquals(payload.rows?.organization_id, "org-a");
      assertEquals(payload.rows?.rfx_event_id, materializationEventId);
      assertEquals(payload.rows?.template_id, materializationTemplateId);
      assert(Array.isArray(payload.rows?.lane_ids) && payload.rows.lane_ids.length > 0);
      assert(Array.isArray(payload.rows?.selected_vendor_ids) && payload.rows.selected_vendor_ids.length > 0);
      assertEquals(payload.rows?.actor_user_id, manageClaims.sub);
      assertEquals(payload.rows?.actor_email, manageClaims.email);
    }
    if (trace.table === "rfx_lane_vendors" && trace.operation === "upsert") {
      const traceIndex = this.traces.indexOf(trace);
      const priorTraces = this.traces.slice(0, traceIndex);
      assert(
        priorTraces.some((candidate) =>
          candidate.table === "carrier_template_materialization_operations" &&
          candidate.operation === "upsert"
        ),
        "Participant mutation must be preceded by durable materialization journal creation",
      );
      assert(
        priorTraces.some((candidate) =>
          candidate.table === "carrier_template_materialization_operations" &&
          candidate.operation === "select"
        ),
        "Participant mutation must be preceded by a server-loaded materialization journal context",
      );
      assert(
        priorTraces.some((candidate) =>
          candidate.table === "carrier_template_materialization_operations" &&
          candidate.operation === "update" &&
          (candidate.payload as Record<string, unknown> | undefined)?.status === "mutation_issued"
        ),
        "Participant mutation must be preceded by the full-context pending to mutation_issued CAS",
      );
      const rows = (trace.payload as { rows?: Array<Record<string, unknown>> } | undefined)?.rows || [];
      assert(
        rows.length > 0 && rows.every((row) =>
          row.carrier_template_materialization_operation_id === materializationOperationId
        ),
        "Every participant insert must carry the immutable materialization operation marker",
      );
    }
    if (trace.table === "rfx_lane_vendors" && trace.operation === "select") {
      const laneIds = trace.filters.find(([kind, column]) => kind === "in" && column === "rfx_lane_id")?.[2];
      const vendorIds = trace.filters.find(([kind, column]) => kind === "in" && column === "vendor_id")?.[2];
      if (Array.isArray(laneIds) && Array.isArray(vendorIds)) {
        assertMatch(
          trace.selection || "",
          /carrier_template_materialization_operation_id/,
          "Final reconciliation must read the durable participant attribution marker",
        );
        assert(
          laneIds.length * vendorIds.length <= this.maxResultRows,
          `Unsafe reconciliation query can return ${laneIds.length * vendorIds.length} rows`,
        );
      }
    }
    if (trace.table === "carrier_template_materialization_operations" && trace.operation === "update") {
      const filter = (kind: string, column: string) =>
        trace.filters.find(([candidateKind, candidateColumn]) =>
          candidateKind === kind && candidateColumn === column
        )?.[2];
      assertEquals(filter("eq", "id"), materializationOperationId);
      assertEquals(filter("eq", "organization_id"), "org-a");
      assertEquals(filter("eq", "rfx_event_id"), materializationEventId);
      assertEquals(filter("eq", "template_id"), materializationTemplateId);
      assertEquals(filter("eq", "template_version"), 4);
      const laneFilter = filter("filter", "lane_ids");
      assert(
        Array.isArray(laneFilter) &&
          laneFilter[0] === "eq" &&
          /^\{[0-9a-f-]+(?:,[0-9a-f-]+)*\}$/i.test(String(laneFilter[1])),
        "CAS lane_ids must use an exact PostgreSQL UUID-array equality literal",
      );
      const selectedVendorFilter = filter("filter", "selected_vendor_ids");
      assert(
        Array.isArray(selectedVendorFilter) &&
          selectedVendorFilter[0] === "eq" &&
          /^\{[0-9a-f-]+(?:,[0-9a-f-]+)*\}$/i.test(String(selectedVendorFilter[1])),
        "CAS selected_vendor_ids must use an exact PostgreSQL UUID-array equality literal",
      );
      assertEquals(filter("eq", "actor_user_id"), manageClaims.sub);
      assertEquals(filter("eq", "actor_email"), manageClaims.email);
      assertEquals(typeof filter("eq", "selected_count"), "number");
      const allowedStatuses = filter("in", "status");
      const targetStatus = (trace.payload as Record<string, unknown>).status;
      if (targetStatus === "mutation_issued") {
        assertEquals(filter("eq", "status"), "pending");
        assertEquals(allowedStatuses, undefined);
      } else {
        assertEquals(allowedStatuses, targetStatus === "reconciled"
          ? ["pending", "mutation_issued", "reconcile_required"]
          : targetStatus === "reconcile_required"
            ? ["pending", "mutation_issued"]
            : ["pending"]);
      }
      assertMatch(trace.selection || "", /status/);
    }
    // Promise.all-backed read paths may start in a different microtask order.
    // Match the earliest response for this exact table/operation while keeping
    // repeated mutation and reconciliation responses deterministic.
    const responseIndex = this.responses.findIndex((candidate) =>
      candidate.table === trace.table && candidate.operation === trace.operation
    );
    const [response] = responseIndex >= 0 ? this.responses.splice(responseIndex, 1) : [];
    assert(response, `Unexpected ${trace.table}.${trace.operation} query`);
    if (response.filters) assertEquals(trace.filters, response.filters);
    if (Array.isArray(response.data)) {
      assert(response.data.length <= this.maxResultRows, "Scripted provider row cap exceeded");
    }
    response.onTake?.();
    const result = () => {
      if (response.throws) return Promise.reject(response.throws);
      return Promise.resolve({
        data: response.data ?? null,
        error: response.error ?? null,
        count: response.count ?? null,
      });
    };
    return response.wait ? response.wait.then(result) : result();
  }
}

class ScriptedQuery {
  constructor(
    private readonly db: ScriptedSupabase,
    private readonly trace: QueryTrace,
  ) {}

  select(columns?: string, _options?: Record<string, unknown>) {
    this.trace.selection = columns;
    return this;
  }

  insert(payload: unknown) {
    this.trace.operation = "insert";
    this.trace.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.trace.operation = "update";
    this.trace.payload = payload;
    return this;
  }

  upsert(payload: unknown, options?: Record<string, unknown>) {
    this.trace.operation = "upsert";
    this.trace.payload = { rows: payload, options: options || {} };
    return this;
  }

  delete() {
    this.trace.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.trace.filters.push(["eq", column, value]);
    return this;
  }

  gt(column: string, value: unknown) {
    this.trace.filters.push(["gt", column, value]);
    return this;
  }

  lte(column: string, value: unknown) {
    this.trace.filters.push(["lte", column, value]);
    return this;
  }

  neq(column: string, value: unknown) {
    this.trace.filters.push(["neq", column, value]);
    return this;
  }

  in(column: string, value: unknown) {
    this.trace.filters.push(["in", column, value]);
    return this;
  }

  ilike(column: string, value: unknown) {
    this.trace.filters.push(["ilike", column, value]);
    return this;
  }

  is(column: string, value: unknown) {
    this.trace.filters.push(["is", column, value]);
    return this;
  }

  or(value: string) {
    this.trace.filters.push(["or", "", value]);
    return this;
  }

  contains(column: string, value: unknown) {
    this.trace.filters.push(["contains", column, value]);
    return this;
  }

  filter(column: string, operator: string, value: unknown) {
    this.trace.filters.push(["filter", column, [operator, value]]);
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    this.trace.filters.push(["not", column, [operator, value]]);
    return this;
  }

  order(column: string, value: unknown) {
    this.trace.filters.push(["order", column, value]);
    return this;
  }

  range(start: number, end: number) {
    this.trace.filters.push(["range", String(start), end]);
    return this;
  }

  limit(value: number) {
    this.trace.filters.push(["limit", "", value]);
    return this;
  }

  maybeSingle() {
    return this.db.take(this.trace);
  }

  single() {
    return this.db.take(this.trace);
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.db.take(this.trace).then(onfulfilled, onrejected);
  }
}

type SharedMutableResult = {
  data: {} | null;
  error: null;
  count: null;
};

class SharedMutableMaterializationDb extends ScriptedSupabase {
  journal: Record<string, unknown> | null = null;
  participants: Record<string, unknown>[] = [];
  journalHistory: string[] = [];
  pendingSnapshotReads = 0;
  claimWins = 0;
  finalizationWins = 0;
  participantInsertCommits = 0;
  auditInsertCommits = 0;
  private pendingSnapshotsReleased = false;
  private pendingSnapshotWaiters: Array<{
    resolve: (result: SharedMutableResult) => void;
    snapshot: Record<string, unknown>;
  }> = [];

  private result(data: {} | null): SharedMutableResult {
    return { data, error: null, count: null };
  }

  private filter(trace: QueryTrace, kind: string, column: string) {
    return trace.filters.find(([candidateKind, candidateColumn]) =>
      candidateKind === kind && candidateColumn === column
    )?.[2];
  }

  private arrayLiteral(value: unknown) {
    const text = String(value || "");
    return text.startsWith("{") && text.endsWith("}")
      ? text.slice(1, -1).split(",").filter(Boolean)
      : [];
  }

  private journalMatches(trace: QueryTrace) {
    if (!this.journal) return false;
    for (const [kind, column, expected] of trace.filters) {
      if (kind === "eq" && this.journal[column] !== expected) return false;
      if (
        kind === "in" && Array.isArray(expected) &&
        !expected.includes(this.journal[column])
      ) return false;
      if (kind === "filter") {
        const [operator, literal] = expected as [string, unknown];
        if (operator !== "eq") return false;
        assertEquals(this.journal[column], this.arrayLiteral(literal));
      }
    }
    return true;
  }

  private journalSelect(trace: QueryTrace) {
    const snapshot = this.journal ? structuredClone(this.journal) : null;
    if (
      snapshot?.status === "pending" && !this.pendingSnapshotsReleased &&
      this.filter(trace, "eq", "id") === materializationOperationId
    ) {
      this.pendingSnapshotReads += 1;
      return new Promise<SharedMutableResult>((resolve) => {
        this.pendingSnapshotWaiters.push({ resolve, snapshot });
        if (this.pendingSnapshotWaiters.length === 2) {
          this.pendingSnapshotsReleased = true;
          const waiters = this.pendingSnapshotWaiters.splice(0);
          queueMicrotask(() => {
            for (const waiter of waiters) {
              waiter.resolve(this.result(waiter.snapshot));
            }
          });
        }
      });
    }
    return Promise.resolve(this.result(snapshot));
  }

  override take(trace: QueryTrace): Promise<SharedMutableResult> {
    if (trace.table === "vendor_segments" && trace.operation === "select") {
      return Promise.resolve(this.result(materializationTemplate()));
    }
    if (trace.table === "vendors" && trace.operation === "select") {
      return Promise.resolve(this.result([materializationVendor()]));
    }
    if (trace.table === "rfx_lanes" && trace.operation === "select") {
      return Promise.resolve(this.result([materializationLane(materializationLaneA)]));
    }
    if (
      trace.table === "carrier_template_materialization_operations" &&
      trace.operation === "upsert"
    ) {
      const payload = trace.payload as {
        rows: Record<string, unknown>;
        options: Record<string, unknown>;
      };
      assertEquals(payload.options, { onConflict: "id", ignoreDuplicates: true });
      if (!this.journal) {
        this.journal = structuredClone(payload.rows);
        this.journalHistory.push(String(this.journal.status));
      }
      return Promise.resolve(this.result(null));
    }
    if (
      trace.table === "carrier_template_materialization_operations" &&
      trace.operation === "select"
    ) {
      return this.journalSelect(trace);
    }
    if (
      trace.table === "carrier_template_materialization_operations" &&
      trace.operation === "update"
    ) {
      if (!this.journalMatches(trace)) return Promise.resolve(this.result(null));
      const patch = structuredClone(trace.payload as Record<string, unknown>);
      Object.assign(this.journal!, patch);
      const status = String(patch.status);
      this.journalHistory.push(status);
      if (status === "mutation_issued") this.claimWins += 1;
      if (status === "reconciled") this.finalizationWins += 1;
      return Promise.resolve(this.result(structuredClone(this.journal)));
    }
    if (trace.table === "rfx_lane_vendors" && trace.operation === "upsert") {
      const payload = trace.payload as {
        rows: Record<string, unknown>[];
        options: Record<string, unknown>;
      };
      assertEquals(payload.options, {
        onConflict: "rfx_lane_id,vendor_id",
        ignoreDuplicates: true,
      });
      const inserted: Record<string, unknown>[] = [];
      for (const row of payload.rows) {
        const exists = this.participants.some((candidate) =>
          candidate.rfx_lane_id === row.rfx_lane_id &&
          candidate.vendor_id === row.vendor_id
        );
        if (exists) continue;
        const committed = {
          ...structuredClone(row),
          id: `shared-invitation-${this.participantInsertCommits + 1}`,
        };
        this.participants.push(committed);
        inserted.push(structuredClone(committed));
        this.participantInsertCommits += 1;
      }
      return Promise.resolve(this.result(inserted));
    }
    if (trace.table === "rfx_lane_vendors" && trace.operation === "select") {
      const eventId = this.filter(trace, "eq", "rfx_event_id");
      const laneIds = this.filter(trace, "in", "rfx_lane_id") as string[];
      const vendorIds = this.filter(trace, "in", "vendor_id") as string[];
      const rows = this.participants.filter((row) =>
        row.rfx_event_id === eventId && laneIds.includes(String(row.rfx_lane_id)) &&
        vendorIds.includes(String(row.vendor_id))
      ).map((row) => structuredClone(row));
      return Promise.resolve(this.result(rows));
    }
    if (trace.table === "saas_audit_log" && trace.operation === "insert") {
      this.auditInsertCommits += 1;
      return Promise.resolve(this.result(null));
    }
    throw new Error(`Unexpected shared mutable query ${trace.table}.${trace.operation}`);
  }
}

function createSharedMutableMaterializationDb() {
  return new SharedMutableMaterializationDb();
}

Deno.test("scripted Supabase rejects unsafe critical query shapes", () => {
  const db = new ScriptedSupabase([{
    table: "vendor_segments",
    operation: "update",
    data: { id: "safe" },
    filters: [["eq", "id", "safe"]],
  }]);
  assertThrows(() =>
    db.from("vendor_segments")
      .update({ segment_name: "Core" })
      .eq("id", "unsafe")
      .maybeSingle()
  );
});

const workspaceUser = {
  owner_user_id: "kp_1",
  owner_email: "org:org-a",
  organization_id: "org-a",
};
const manageClaims = {
  sub: "kp_1",
  email: "buyer@example.com",
  permissions: ["vendors:manage"],
};

async function callCarrierTemplateAction(
  db: ScriptedSupabase,
  body: Record<string, unknown>,
  options: Record<string, unknown> = { enabled: true },
  claims: Record<string, unknown> = manageClaims,
) {
  const handler = ratewareApi.handleCarrierTemplateApiAction;
  assertEquals(typeof handler, "function");
  if (typeof handler !== "function") return null;
  return await handler(db, workspaceUser, claims, body, options) as {
    status: number;
    body: Record<string, unknown>;
  } | null;
}

function createTestRatewareApiHandler(
  db: ScriptedSupabase,
  {
    enabled = true,
    claims = manageClaims,
    user = workspaceUser,
    onResolve,
  }: {
    enabled?: boolean;
    claims?: Record<string, unknown>;
    user?: {
      owner_user_id: string;
      owner_email: string;
      organization_id: string | null;
    };
    onResolve?: (claims: Record<string, unknown>) => void;
  } = {},
) {
  const factory = ratewareApi.createRatewareApiHandler;
  assertEquals(typeof factory, "function");
  if (typeof factory !== "function") return null;
  return factory({
    getClient: () => db,
    authenticate: (_request: Request) => Promise.resolve(claims),
    resolveUser: (
      _client: unknown,
      verifiedClaims: Record<string, unknown>,
      options: Record<string, unknown>,
    ) => {
      assertStrictEquals(verifiedClaims, claims);
      assertEquals(options, { persistLegacyIdentity: false });
      onResolve?.(verifiedClaims);
      return Promise.resolve(user);
    },
    carrierTemplatesEnabled: enabled,
  }) as (request: Request) => Promise<Response>;
}

function jsonActionRequest(body: Record<string, unknown>) {
  return new Request("https://rateware.test/functions/v1/rateware-api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const materializationTemplateId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const materializationOperationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const materializationEventId = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const materializationLaneA = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const materializationLaneB = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";

function materializationTemplate(
  vendorIds = [vendorA.id],
  patch: Record<string, unknown> = {},
) {
  return {
    id: materializationTemplateId,
    organization_id: "org-a",
    segment_type: "participant_template",
    lifecycle_status: "active",
    status: "active",
    template_version: 4,
    vendor_ids: vendorIds,
    ...patch,
  };
}

function materializationVendor(
  vendor: Record<string, unknown> = vendorA,
  patch: Record<string, unknown> = {},
) {
  return {
    ...vendor,
    status: "active",
    base_stage: "procurement",
    whatsapp_phone: "",
    ...patch,
  };
}

function materializationLane(id: string) {
  return {
    id,
    rfx_event_id: materializationEventId,
    rfx_events: { id: materializationEventId, owner_email: workspaceUser.owner_email },
  };
}

function materializationAction(
  vendorIds = [vendorA.id],
  laneIds = [materializationLaneA],
  context: Record<string, unknown> = {},
) {
  return {
    action: "shortlist_rfx_lane_vendors",
    lane_ids: laneIds,
    vendor_ids: vendorIds,
    carrier_template_context: {
      template_id: materializationTemplateId,
      template_version: 4,
      materialization_operation_id: materializationOperationId,
      ...context,
    },
  };
}

function templateRead(vendorIds = [vendorA.id], patch: Record<string, unknown> = {}): ScriptedResponse {
  return {
    table: "vendor_segments",
    operation: "select",
    data: materializationTemplate(vendorIds, patch),
    filters: [
      ["eq", "id", materializationTemplateId],
      ["eq", "organization_id", "org-a"],
      ["eq", "segment_type", "participant_template"],
    ],
  };
}

function vendorRead(vendorIds: string[], rows: Record<string, unknown>[]): ScriptedResponse {
  return {
    table: "vendors",
    operation: "select",
    data: rows,
    filters: [
      ["eq", "organization_id", "org-a"],
      ["in", "id", vendorIds],
    ],
  };
}

function laneRead(laneIds: string[]): ScriptedResponse {
  return {
    table: "rfx_lanes",
    operation: "select",
    data: laneIds.map(materializationLane),
    filters: [
      ["in", "id", laneIds],
      ["eq", "rfx_events.owner_email", workspaceUser.owner_email],
    ],
  };
}

function materializationJournalRow(
  vendorIds = [vendorA.id],
  laneIds = [materializationLaneA],
  patch: Record<string, unknown> = {},
) {
  return {
    id: materializationOperationId,
    organization_id: "org-a",
    rfx_event_id: materializationEventId,
    template_id: materializationTemplateId,
    template_version: 4,
    lane_ids: laneIds,
    selected_vendor_ids: vendorIds,
    actor_user_id: workspaceUser.owner_user_id,
    actor_email: manageClaims.email,
    status: "pending",
    selected_count: vendorIds.length * laneIds.length,
    ...patch,
  };
}

function materializationJournalStart(
  vendorIds = [vendorA.id],
  laneIds = [materializationLaneA],
  patch: Record<string, unknown> = {},
): ScriptedResponse[] {
  return [
    {
      table: "carrier_template_materialization_operations",
      operation: "upsert",
      data: null,
    },
    {
      table: "carrier_template_materialization_operations",
      operation: "select",
      data: materializationJournalRow(vendorIds, laneIds, patch),
      filters: [["eq", "id", materializationOperationId]],
    },
  ];
}

function materializationJournalFinish(
  vendorIds = [vendorA.id],
  laneIds = [materializationLaneA],
  patch: Record<string, unknown> = {},
): ScriptedResponse {
  return {
    table: "carrier_template_materialization_operations",
    operation: "update",
    data: materializationJournalRow(vendorIds, laneIds, {
      status: "reconciled",
      result: "inserted",
      confirmed_count: vendorIds.length * laneIds.length,
      inserted_count: vendorIds.length * laneIds.length,
      already_present_count: 0,
      rejected_count: 0,
      pending_count: 0,
      confirmed_vendor_ids: vendorIds,
      outcomes: [],
      ...patch,
    }),
  };
}

function materializationJournalClaim(
  vendorIds = [vendorA.id],
  laneIds = [materializationLaneA],
  patch: Record<string, unknown> = {},
): ScriptedResponse {
  return {
    table: "carrier_template_materialization_operations",
    operation: "update",
    data: materializationJournalRow(vendorIds, laneIds, {
      status: "mutation_issued",
      result: null,
      confirmed_count: 0,
      inserted_count: 0,
      already_present_count: 0,
      rejected_count: 0,
      pending_count: vendorIds.length * laneIds.length,
      confirmed_vendor_ids: [],
      outcomes: [],
      ...patch,
    }),
  };
}

function finalInvitationRead(
  laneIds: string[],
  vendorIds: string[],
  rows: Record<string, unknown>[],
  error: unknown = null,
): ScriptedResponse {
  return {
    table: "rfx_lane_vendors",
    operation: "select",
    data: rows,
    error,
    filters: [
      ["eq", "rfx_event_id", materializationEventId],
      ["eq", "rfx_events.organization_id", "org-a"],
      ["in", "rfx_lane_id", laneIds],
      ["in", "vendor_id", vendorIds],
    ],
  };
}

Deno.test("Task 7 canonical browser and server eligibility predicates agree", () => {
  const serverAvailable = ratewareApi.carrierTemplateVendorIsAvailable;
  const serverContact = ratewareApi.carrierTemplateVendorHasUsableContact;
  assertEquals(typeof serverAvailable, "function");
  assertEquals(typeof serverContact, "function");
  if (typeof serverAvailable !== "function" || typeof serverContact !== "function") return;
  const fixtures = [
    materializationVendor(vendorA),
    materializationVendor(vendorA, { status: "blocked" }),
    materializationVendor(vendorA, { status: "inactive" }),
    materializationVendor(vendorA, { status: "archived" }),
    materializationVendor(vendorA, { status: "deleted" }),
    materializationVendor(vendorA, { base_stage: "archived" }),
    materializationVendor(vendorA, { primary_email: "", secondary_emails: [], whatsapp_phone: "+52 867 100 2000" }),
    materializationVendor(vendorA, { primary_email: "", secondary_emails: ["secondary@example.com"], whatsapp_phone: "" }),
    materializationVendor(vendorA, { primary_email: "", secondary_emails: [], whatsapp_phone: "" }),
  ];
  for (const vendor of fixtures) {
    assertEquals(serverAvailable(vendor), browserCarrierTemplateVendorIsAvailable(vendor));
    assertEquals(serverContact(vendor), browserCarrierTemplateVendorHasUsableContact(vendor));
  }
});

Deno.test("Task 7 materialization fails closed for disabled and unauthorized workspaces", async () => {
  const disabledDb = new ScriptedSupabase();
  const disabledHandler = createTestRatewareApiHandler(disabledDb, { enabled: false });
  assert(disabledHandler);
  const disabledResponse = await disabledHandler(jsonActionRequest(materializationAction()));
  assertEquals(disabledResponse.status, 404);
  assertEquals(await disabledResponse.json(), {
    enabled: false,
    error: "Carrier list templates are not enabled.",
  });
  assertEquals(disabledDb.traces, []);

  const unauthorizedDb = new ScriptedSupabase();
  const unauthorizedHandler = createTestRatewareApiHandler(unauthorizedDb, {
    user: { ...workspaceUser, organization_id: null },
  });
  assert(unauthorizedHandler);
  const unauthorizedResponse = await unauthorizedHandler(jsonActionRequest(materializationAction()));
  assertEquals(unauthorizedResponse.status, 403);
  assertEquals(await unauthorizedResponse.json(), {
    code: "carrier_template_workspace_required",
    error: "An organization-scoped workspace is required.",
  });
  assertEquals(unauthorizedDb.traces, []);
});

Deno.test("Task 7 materialization rejects foreign, inactive, stale-version, and nonmember templates before mutation", async () => {
  const foreignDb = new ScriptedSupabase([{
    ...templateRead(),
    data: null,
  }]);
  const foreignHandler = createTestRatewareApiHandler(foreignDb);
  assert(foreignHandler);
  const foreignResponse = await foreignHandler(jsonActionRequest(materializationAction()));
  assertEquals(foreignResponse.status, 409);
  assertEquals((await foreignResponse.json()).code, "carrier_template_unavailable");
  assertEquals(foreignDb.traces.some((trace) => trace.operation === "upsert"), false);

  for (const fixture of [
    { patch: { lifecycle_status: "archived" }, context: {}, code: "carrier_template_inactive" },
    { patch: {}, context: { template_version: 3 }, code: "template_version_conflict" },
  ]) {
    const db = new ScriptedSupabase([templateRead([vendorA.id], fixture.patch)]);
    const handler = createTestRatewareApiHandler(db);
    assert(handler);
    const response = await handler(jsonActionRequest(materializationAction(
      [vendorA.id],
      [materializationLaneA],
      fixture.context,
    )));
    assertEquals(response.status, 409);
    assertEquals((await response.json()).code, fixture.code);
    assertEquals(db.traces.some((trace) => trace.operation === "upsert"), false);
    assertEquals(db.traces.some((trace) => trace.table === "saas_audit_log"), false);
  }

  const nonmemberDb = new ScriptedSupabase([templateRead([vendorA.id])]);
  const nonmemberHandler = createTestRatewareApiHandler(nonmemberDb);
  assert(nonmemberHandler);
  const nonmemberResponse = await nonmemberHandler(jsonActionRequest(materializationAction([vendorB.id])));
  assertEquals(nonmemberResponse.status, 400);
  assertEquals((await nonmemberResponse.json()).code, "carrier_template_invalid_selection");
  assertEquals(nonmemberDb.traces.some((trace) => trace.operation === "upsert"), false);
  assertEquals(nonmemberDb.traces.some((trace) => trace.table === "saas_audit_log"), false);
});

for (const fixture of [
  { patch: { status: "blocked" }, reason: "status_blocked" },
  { patch: { status: "inactive" }, reason: "status_inactive" },
  { patch: { base_stage: "archived" }, reason: "base_stage_archived" },
  { patch: { primary_email: "", secondary_emails: [], whatsapp_phone: "" }, reason: "missing_contact" },
]) {
  Deno.test(`Task 7 materialization rejects ${fixture.reason} vendors without a success audit`, async () => {
    const vendor = materializationVendor(vendorA, fixture.patch);
    const db = new ScriptedSupabase([
      templateRead(),
      vendorRead([vendorA.id], [vendor]),
      laneRead([materializationLaneA]),
      ...materializationJournalStart(),
      materializationJournalFinish([vendorA.id], [materializationLaneA], {
        status: "rejected",
        result: "rejected",
        confirmed_count: 0,
        inserted_count: 0,
        rejected_count: 1,
        confirmed_vendor_ids: [],
      }),
    ]);
    const handler = createTestRatewareApiHandler(db);
    assert(handler);
    const response = await handler(jsonActionRequest(materializationAction()));
    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.result, "rejected");
    assertEquals(body.counts, {
      selected: 1,
      confirmed: 0,
      inserted: 0,
      already_present: 0,
      rejected: 1,
      pending: 0,
    });
    assertEquals(body.outcomes, [{
      lane_id: materializationLaneA,
      vendor_id: vendorA.id,
      outcome: "rejected",
      reason: fixture.reason,
    }]);
    assertEquals(body.confirmed_audience_vendor_ids, []);
    assertEquals(db.traces.some((trace) => trace.table === "rfx_lane_vendors" && trace.operation === "upsert"), false);
    assertEquals(db.traces.some((trace) => trace.table === "saas_audit_log"), false);
  });
}

Deno.test("Task 7 rejects reuse of a materialization UUID with mismatched immutable context before participant mutation", async () => {
  const db = new ScriptedSupabase([
    templateRead(),
    vendorRead([vendorA.id], [materializationVendor()]),
    laneRead([materializationLaneA]),
    ...materializationJournalStart([vendorA.id], [materializationLaneA], {
      template_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    }),
  ]);
  const handler = createTestRatewareApiHandler(db);
  assert(handler);
  const response = await handler(jsonActionRequest(materializationAction()));
  assertEquals(response.status, 409);
  assertEquals((await response.json()).code, "carrier_template_materialization_operation_conflict");
  assertEquals(
    db.traces.some((trace) => trace.table === "rfx_lane_vendors" && trace.operation === "upsert"),
    false,
  );
  assertEquals(db.traces.some((trace) => trace.table === "saas_audit_log"), false);
});

Deno.test("Task 7 lost-response retry reconciles an already-present operation audience", async () => {
  const finalRow = {
    id: "invitation-a",
    rfx_event_id: materializationEventId,
    rfx_lane_id: materializationLaneA,
    vendor_id: vendorA.id,
  };
  const db = new ScriptedSupabase([
    templateRead(),
    vendorRead([vendorA.id], [materializationVendor()]),
    laneRead([materializationLaneA]),
    ...materializationJournalStart(),
    materializationJournalClaim(),
    { table: "rfx_lane_vendors", operation: "upsert", data: [] },
    finalInvitationRead([materializationLaneA], [vendorA.id], [finalRow]),
    materializationJournalFinish([vendorA.id], [materializationLaneA], {
      result: "reconciled",
      inserted_count: 0,
      already_present_count: 1,
    }),
    { table: "saas_audit_log", operation: "insert", data: null },
  ]);
  const handler = createTestRatewareApiHandler(db);
  assert(handler);
  const response = await handler(jsonActionRequest(materializationAction()));
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.materialization_operation_id, materializationOperationId);
  assertEquals(body.result, "reconciled");
  assertEquals(body.counts, {
    selected: 1,
    confirmed: 1,
    inserted: 0,
    already_present: 1,
    rejected: 0,
    pending: 0,
  });
  assertEquals(body.outcomes, [{
    lane_id: materializationLaneA,
    vendor_id: vendorA.id,
    outcome: "reconciled",
    invitation_id: "invitation-a",
  }]);
  assertEquals(body.confirmed_audience_vendor_ids, [vendorA.id]);
  const journalUpdate = db.traces.find((trace) =>
    trace.table === "carrier_template_materialization_operations" &&
    trace.operation === "update" &&
    (trace.payload as Record<string, unknown>).status === "reconciled"
  );
  assertEquals(
    (journalUpdate?.payload as Record<string, unknown>).status,
    "reconciled",
  );
  assertEquals(
    (journalUpdate?.payload as Record<string, unknown>).inserted_count,
    0,
  );
  const audit = db.traces.find((trace) => trace.table === "saas_audit_log");
  const auditPayload = audit?.payload as Record<string, unknown>;
  assertEquals(auditPayload.action, "carrier_template.add_selected_to_rfx");
  assertEquals(auditPayload.metadata, {
    template_id: materializationTemplateId,
    template_version: 4,
    rfx_event_id: materializationEventId,
    selected_count: 1,
    confirmed_count: 1,
    already_present_count: 1,
    inserted_count: 0,
    rejected_count: 0,
    pending_count: 0,
    result: "reconciled",
  });
  assertEquals(/primary_email|secondary_emails|whatsapp|contact/i.test(JSON.stringify(auditPayload)), false);
});

Deno.test("Task 7 first-upsert lost response reconciles rows visible in final committed reads", async () => {
  const finalRow = {
    id: "invitation-first-batch-committed",
    rfx_event_id: materializationEventId,
    rfx_lane_id: materializationLaneA,
    vendor_id: vendorA.id,
    carrier_template_materialization_operation_id: materializationOperationId,
  };
  const db = new ScriptedSupabase([
    templateRead(),
    vendorRead([vendorA.id], [materializationVendor()]),
    laneRead([materializationLaneA]),
    ...materializationJournalStart(),
    materializationJournalClaim(),
    { table: "rfx_lane_vendors", operation: "upsert", throws: new Error("transport response lost") },
    finalInvitationRead([materializationLaneA], [vendorA.id], [finalRow]),
    materializationJournalFinish(),
    { table: "saas_audit_log", operation: "insert", data: null },
  ]);
  const handler = createTestRatewareApiHandler(db);
  assert(handler);
  const response = await handler(jsonActionRequest(materializationAction()));
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.result, "inserted");
  assertEquals(body.counts, {
    selected: 1,
    confirmed: 1,
    inserted: 1,
    already_present: 0,
    rejected: 0,
    pending: 0,
  });
  assertEquals(body.confirmed_audience_vendor_ids, [vendorA.id]);
  const journalUpdate = db.traces.find((trace) =>
    trace.table === "carrier_template_materialization_operations" &&
    trace.operation === "update" &&
    (trace.payload as Record<string, unknown>).status === "reconciled"
  );
  assertEquals(
    (journalUpdate?.payload as Record<string, unknown>).status,
    "reconciled",
  );
  assertEquals(
    (journalUpdate?.payload as Record<string, unknown>).inserted_count,
    1,
  );
  const audit = db.traces.find((trace) => trace.table === "saas_audit_log");
  assertEquals(
    ((audit?.payload as Record<string, unknown>).metadata as Record<string, unknown>).inserted_count,
    1,
  );
});

Deno.test("Task 7 returned first-upsert loss still attributes marked committed rows to the operation", async () => {
  const finalRow = {
    id: "invitation-first-batch-returned-loss",
    rfx_event_id: materializationEventId,
    rfx_lane_id: materializationLaneA,
    vendor_id: vendorA.id,
    carrier_template_materialization_operation_id: materializationOperationId,
  };
  const db = new ScriptedSupabase([
    templateRead(),
    vendorRead([vendorA.id], [materializationVendor()]),
    laneRead([materializationLaneA]),
    ...materializationJournalStart(),
    materializationJournalClaim(),
    { table: "rfx_lane_vendors", operation: "upsert", error: { message: "response lost after commit" } },
    finalInvitationRead([materializationLaneA], [vendorA.id], [finalRow]),
    materializationJournalFinish(),
    { table: "saas_audit_log", operation: "insert", data: null },
  ]);
  const handler = createTestRatewareApiHandler(db);
  assert(handler);
  const response = await handler(jsonActionRequest(materializationAction()));
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.result, "inserted");
  assertEquals(body.counts.inserted, 1);
  assertEquals(body.counts.already_present, 0);
  assertEquals(body.confirmed_audience_vendor_ids, [vendorA.id]);
  const audit = db.traces.find((trace) => trace.table === "saas_audit_log");
  assertEquals(
    ((audit?.payload as Record<string, unknown>).metadata as Record<string, unknown>).inserted_count,
    1,
  );
});

Deno.test("Task 7 first-upsert uncertainty with incomplete final reads returns audited reconcile_required", async () => {
  const db = new ScriptedSupabase([
    templateRead(),
    vendorRead([vendorA.id], [materializationVendor()]),
    laneRead([materializationLaneA]),
    ...materializationJournalStart(),
    materializationJournalClaim(),
    { table: "rfx_lane_vendors", operation: "upsert", error: { message: "transport response lost" } },
    finalInvitationRead([materializationLaneA], [vendorA.id], []),
    materializationJournalFinish([vendorA.id], [materializationLaneA], {
      status: "reconcile_required",
      result: "reconcile_required",
      confirmed_count: 0,
      inserted_count: 0,
      pending_count: 1,
      confirmed_vendor_ids: [],
    }),
    { table: "saas_audit_log", operation: "insert", data: null },
  ]);
  const handler = createTestRatewareApiHandler(db);
  assert(handler);
  const response = await handler(jsonActionRequest(materializationAction()));
  assertEquals(response.status, 202);
  const body = await response.json();
  assertEquals(body.result, "reconcile_required");
  assertEquals(body.materialization_operation_id, materializationOperationId);
  assertMatch(body.correlation_id, /^[0-9a-f-]{36}$/i);
  assertEquals(body.outcomes, [{
    lane_id: materializationLaneA,
    vendor_id: vendorA.id,
    outcome: "pending_reconciliation",
  }]);
  const audit = db.traces.find((trace) => trace.table === "saas_audit_log");
  assertEquals(
    ((audit?.payload as Record<string, unknown>).metadata as Record<string, unknown>).result,
    "reconcile_required",
  );
});

function matrixUuid(kind: number, index: number) {
  return `${kind.toString(16).padStart(8, "0")}-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

Deno.test("Task 7 final reconciliation batches both dimensions below provider row limits", async () => {
  const vendorIds = Array.from({ length: 40 }, (_, index) => matrixUuid(0x10000000, index + 1));
  const laneIds = Array.from({ length: 30 }, (_, index) => matrixUuid(0x20000000, index + 1));
  const finalRows = laneIds.flatMap((laneId, laneIndex) => vendorIds.map((vendorId, vendorIndex) => ({
    id: `invitation-${laneIndex}-${vendorIndex}`,
    rfx_event_id: materializationEventId,
    rfx_lane_id: laneId,
    vendor_id: vendorId,
    carrier_template_materialization_operation_id: materializationOperationId,
  })));
  const laneBatches = [laneIds.slice(0, 25), laneIds.slice(25)];
  const vendorBatches = [vendorIds.slice(0, 36), vendorIds.slice(36)];
  const finalReadResponses = laneBatches.flatMap((laneBatch) => vendorBatches.map((vendorBatch) =>
    finalInvitationRead(
      laneBatch,
      vendorBatch,
      finalRows.filter((row) => laneBatch.includes(row.rfx_lane_id) && vendorBatch.includes(row.vendor_id)).reverse(),
    )
  ));
  const db = new ScriptedSupabase([
    templateRead(vendorIds),
    vendorRead(vendorIds, vendorIds.map((id) => materializationVendor({ id, primary_email: `${id}@example.com` }))),
    laneRead(laneIds),
    ...materializationJournalStart(vendorIds, laneIds),
    materializationJournalClaim(vendorIds, laneIds),
    { table: "rfx_lane_vendors", operation: "upsert", data: finalRows.slice(0, 500) },
    { table: "rfx_lane_vendors", operation: "upsert", data: finalRows.slice(500, 1000) },
    { table: "rfx_lane_vendors", operation: "upsert", data: finalRows.slice(1000) },
    ...finalReadResponses,
    materializationJournalFinish(vendorIds, laneIds),
    { table: "saas_audit_log", operation: "insert", data: null },
  ], { maxResultRows: 900 });
  const handler = createTestRatewareApiHandler(db);
  assert(handler);
  const response = await handler(jsonActionRequest(materializationAction(vendorIds, laneIds)));
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.counts, {
    selected: 1200,
    confirmed: 1200,
    inserted: 1200,
    already_present: 0,
    rejected: 0,
    pending: 0,
  });
  assertEquals(body.outcomes.length, 1200);
  assertEquals(body.confirmed_audience_vendor_ids, vendorIds);
  assertEquals(
    body.rows.map((row: Record<string, unknown>) => `${row.rfx_lane_id}:${row.vendor_id}`),
    finalRows.map((row) => `${row.rfx_lane_id}:${row.vendor_id}`),
  );
  assertEquals(
    body.rows.some((row: Record<string, unknown>) =>
      Object.hasOwn(row, "carrier_template_materialization_operation_id")
    ),
    false,
  );
  const finalReads = db.traces.filter((trace) => trace.table === "rfx_lane_vendors" && trace.operation === "select");
  assertEquals(finalReads.length, 4);
});

Deno.test("Task 7 materialization canonicalizes UUID input before scoped reconciliation", async () => {
  const finalRow = {
    id: "invitation-canonical",
    rfx_event_id: materializationEventId,
    rfx_lane_id: materializationLaneA,
    vendor_id: vendorA.id,
    carrier_template_materialization_operation_id: materializationOperationId,
  };
  const db = new ScriptedSupabase([
    templateRead(),
    vendorRead([vendorA.id], [materializationVendor()]),
    laneRead([materializationLaneA]),
    ...materializationJournalStart(),
    materializationJournalClaim(),
    { table: "rfx_lane_vendors", operation: "upsert", data: [finalRow] },
    finalInvitationRead([materializationLaneA], [vendorA.id], [finalRow]),
    materializationJournalFinish(),
    { table: "saas_audit_log", operation: "insert", data: null },
  ]);
  const handler = createTestRatewareApiHandler(db);
  assert(handler);
  const response = await handler(jsonActionRequest(materializationAction(
    [vendorA.id.toUpperCase()],
    [materializationLaneA.toUpperCase()],
  )));
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.confirmed_audience_vendor_ids, [vendorA.id]);
  assertEquals(body.lane_ids, [materializationLaneA]);
});

Deno.test("Task 7 concurrent insertion derives mixed outcomes from the final committed scope", async () => {
  const vendorIds = [vendorA.id, vendorB.id];
  const concurrentOperationId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
  const insertedRow = {
    id: "invitation-new",
    rfx_event_id: materializationEventId,
    rfx_lane_id: materializationLaneA,
    vendor_id: vendorA.id,
    carrier_template_materialization_operation_id: materializationOperationId,
  };
  const racedRow = {
    id: "invitation-raced",
    rfx_event_id: materializationEventId,
    rfx_lane_id: materializationLaneA,
    vendor_id: vendorB.id,
    carrier_template_materialization_operation_id: concurrentOperationId,
  };
  const db = new ScriptedSupabase([
    templateRead(vendorIds),
    vendorRead(vendorIds, [materializationVendor(vendorA), materializationVendor(vendorB)]),
    laneRead([materializationLaneA]),
    ...materializationJournalStart(vendorIds),
    materializationJournalClaim(vendorIds),
    { table: "rfx_lane_vendors", operation: "upsert", data: [insertedRow] },
    finalInvitationRead([materializationLaneA], vendorIds, [insertedRow, racedRow]),
    materializationJournalFinish(vendorIds, [materializationLaneA], {
      result: "mixed",
      confirmed_count: 2,
      inserted_count: 1,
      already_present_count: 1,
    }),
    { table: "saas_audit_log", operation: "insert", data: null },
  ]);
  const handler = createTestRatewareApiHandler(db);
  assert(handler);
  const response = await handler(jsonActionRequest(materializationAction(vendorIds)));
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.counts, {
    selected: 2,
    confirmed: 2,
    inserted: 1,
    already_present: 1,
    rejected: 0,
    pending: 0,
  });
  assertEquals(body.outcomes.map((row: Record<string, unknown>) => row.outcome), ["inserted", "reconciled"]);
  assertEquals(body.confirmed_audience_vendor_ids, vendorIds);
  const upsert = db.traces.find((trace) => trace.table === "rfx_lane_vendors" && trace.operation === "upsert");
  assertEquals((upsert?.payload as Record<string, unknown>).options, {
    onConflict: "rfx_lane_id,vendor_id",
    ignoreDuplicates: true,
  });
});

Deno.test("Task 7 partial multi-lane retry completes and confirms only the full operation audience", async () => {
  const laneIds = [materializationLaneA, materializationLaneB];
  const priorRow = {
    id: "invitation-prior",
    rfx_event_id: materializationEventId,
    rfx_lane_id: materializationLaneA,
    vendor_id: vendorA.id,
  };
  const insertedRow = {
    id: "invitation-completed",
    rfx_event_id: materializationEventId,
    rfx_lane_id: materializationLaneB,
    vendor_id: vendorA.id,
    carrier_template_materialization_operation_id: materializationOperationId,
  };
  const db = new ScriptedSupabase([
    templateRead(),
    vendorRead([vendorA.id], [materializationVendor()]),
    laneRead(laneIds),
    ...materializationJournalStart([vendorA.id], laneIds),
    materializationJournalClaim([vendorA.id], laneIds),
    { table: "rfx_lane_vendors", operation: "upsert", data: [insertedRow] },
    finalInvitationRead(laneIds, [vendorA.id], [priorRow, insertedRow]),
    materializationJournalFinish([vendorA.id], laneIds, {
      result: "mixed",
      confirmed_count: 2,
      inserted_count: 1,
      already_present_count: 1,
    }),
    { table: "saas_audit_log", operation: "insert", data: null },
  ]);
  const handler = createTestRatewareApiHandler(db);
  assert(handler);
  const response = await handler(jsonActionRequest(materializationAction([vendorA.id], laneIds)));
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.counts, {
    selected: 2,
    confirmed: 2,
    inserted: 1,
    already_present: 1,
    rejected: 0,
    pending: 0,
  });
  assertEquals(body.outcomes, [
    { lane_id: materializationLaneA, vendor_id: vendorA.id, outcome: "reconciled", invitation_id: "invitation-prior" },
    { lane_id: materializationLaneB, vendor_id: vendorA.id, outcome: "inserted", invitation_id: "invitation-completed" },
  ]);
  assertEquals(body.confirmed_audience_vendor_ids, [vendorA.id]);
});

Deno.test("Task 7 post-commit read failure returns and audits reconcile_required", async () => {
  const insertedRow = {
    id: "invitation-uncertain",
    rfx_event_id: materializationEventId,
    rfx_lane_id: materializationLaneA,
    vendor_id: vendorA.id,
  };
  const db = new ScriptedSupabase([
    templateRead(),
    vendorRead([vendorA.id], [materializationVendor()]),
    laneRead([materializationLaneA]),
    ...materializationJournalStart(),
    materializationJournalClaim(),
    { table: "rfx_lane_vendors", operation: "upsert", data: [insertedRow] },
    finalInvitationRead([materializationLaneA], [vendorA.id], [], { message: "post-commit read failed" }),
    materializationJournalFinish([vendorA.id], [materializationLaneA], {
      status: "reconcile_required",
      result: "reconcile_required",
      confirmed_count: 0,
      inserted_count: 0,
      pending_count: 1,
      confirmed_vendor_ids: [],
    }),
    { table: "saas_audit_log", operation: "insert", data: null },
  ]);
  const handler = createTestRatewareApiHandler(db);
  assert(handler);
  const response = await handler(jsonActionRequest(materializationAction()));
  assertEquals(response.status, 202);
  const body = await response.json();
  assertEquals(body.result, "reconcile_required");
  assertEquals(body.materialization_operation_id, materializationOperationId);
  assertMatch(body.correlation_id, /^[0-9a-f-]{36}$/i);
  assertEquals(body.counts, {
    selected: 1,
    confirmed: 0,
    inserted: 0,
    already_present: 0,
    rejected: 0,
    pending: 1,
  });
  assertEquals(body.outcomes, [{
    lane_id: materializationLaneA,
    vendor_id: vendorA.id,
    outcome: "pending_reconciliation",
  }]);
  const audit = db.traces.find((trace) => trace.table === "saas_audit_log");
  assertEquals(
    ((audit?.payload as Record<string, unknown>).metadata as Record<string, unknown>).result,
    "reconcile_required",
  );
});

Deno.test("Task 7 late incomplete request adopts the reconciled CAS winner without stale audit", async () => {
  let releaseDelayedRead!: () => void;
  let signalDelayedRead!: () => void;
  const delayedReadGate = new Promise<void>((resolve) => releaseDelayedRead = resolve);
  const delayedReadStarted = new Promise<void>((resolve) => signalDelayedRead = resolve);
  const finalRow = {
    id: "invitation-interleaved",
    rfx_event_id: materializationEventId,
    rfx_lane_id: materializationLaneA,
    vendor_id: vendorA.id,
    carrier_template_materialization_operation_id: materializationOperationId,
  };
  const canonicalOutcome = {
    lane_id: materializationLaneA,
    vendor_id: vendorA.id,
    outcome: "inserted",
    invitation_id: finalRow.id,
  };
  const canonicalJournal = materializationJournalRow([vendorA.id], [materializationLaneA], {
    status: "reconciled",
    result: "inserted",
    confirmed_count: 1,
    inserted_count: 1,
    already_present_count: 0,
    rejected_count: 0,
    pending_count: 0,
    confirmed_vendor_ids: [vendorA.id],
    outcomes: [canonicalOutcome],
    correlation_id: null,
  });
  const db = new ScriptedSupabase([
    // Request B starts first and reaches an incomplete final read, but its
    // response is delayed until request A wins journal finalization.
    templateRead(),
    vendorRead([vendorA.id], [materializationVendor()]),
    laneRead([materializationLaneA]),
    ...materializationJournalStart(),
    materializationJournalClaim(),
    { table: "rfx_lane_vendors", operation: "upsert", data: [] },
    {
      ...finalInvitationRead([materializationLaneA], [vendorA.id], []),
      wait: delayedReadGate,
      onTake: signalDelayedRead,
    },
    // Request A loaded the same pending generation, loses its mutation claim,
    // reloads mutation_issued, and then completes the idempotent operation.
    templateRead(),
    vendorRead([vendorA.id], [materializationVendor()]),
    laneRead([materializationLaneA]),
    ...materializationJournalStart(),
    { table: "carrier_template_materialization_operations", operation: "update", data: null },
    {
      table: "carrier_template_materialization_operations",
      operation: "select",
      data: materializationJournalRow([vendorA.id], [materializationLaneA], { status: "mutation_issued" }),
      filters: [["eq", "id", materializationOperationId]],
    },
    { table: "rfx_lane_vendors", operation: "upsert", data: [finalRow] },
    finalInvitationRead([materializationLaneA], [vendorA.id], [finalRow]),
    materializationJournalFinish([vendorA.id], [materializationLaneA], {
      outcomes: [canonicalOutcome],
    }),
    { table: "saas_audit_log", operation: "insert", data: null },
    // Request B's late reconcile_required CAS loses, so it reloads both the
    // canonical journal and final matrix and returns A's success.
    { table: "carrier_template_materialization_operations", operation: "update", data: null },
    {
      table: "carrier_template_materialization_operations",
      operation: "select",
      data: canonicalJournal,
      filters: [["eq", "id", materializationOperationId]],
    },
    finalInvitationRead([materializationLaneA], [vendorA.id], [finalRow]),
  ]);
  const handler = createTestRatewareApiHandler(db);
  assert(handler);

  const delayedResponsePromise = handler(jsonActionRequest(materializationAction()));
  await delayedReadStarted;
  const winningResponse = await handler(jsonActionRequest(materializationAction()));
  releaseDelayedRead();
  const delayedResponse = await delayedResponsePromise;

  assertEquals(winningResponse.status, 200);
  assertEquals(delayedResponse.status, 200);
  const delayedBody = await delayedResponse.json();
  assertEquals(delayedBody.result, "inserted");
  assertEquals(delayedBody.counts.inserted, 1);
  assertEquals(delayedBody.outcomes, [canonicalOutcome]);
  assertEquals(delayedBody.confirmed_audience_vendor_ids, [vendorA.id]);
  assertEquals(JSON.stringify(delayedBody).includes("carrier_template_materialization_operation_id"), false);
  assertEquals(db.traces.filter((trace) => trace.table === "saas_audit_log").length, 1);
  assertEquals(db.responses.length, 0);
});

Deno.test("Task 7 late rejected CAS cannot overwrite canonical reconciliation", async () => {
  const finalRow = {
    id: "invitation-before-late-rejection",
    rfx_event_id: materializationEventId,
    rfx_lane_id: materializationLaneA,
    vendor_id: vendorA.id,
    carrier_template_materialization_operation_id: materializationOperationId,
  };
  const canonicalOutcome = {
    lane_id: materializationLaneA,
    vendor_id: vendorA.id,
    outcome: "inserted",
    invitation_id: finalRow.id,
  };
  const canonicalJournal = materializationJournalRow([vendorA.id], [materializationLaneA], {
    status: "reconciled",
    result: "inserted",
    confirmed_count: 1,
    inserted_count: 1,
    already_present_count: 0,
    rejected_count: 0,
    pending_count: 0,
    confirmed_vendor_ids: [vendorA.id],
    outcomes: [canonicalOutcome],
  });
  const db = new ScriptedSupabase([
    templateRead(),
    vendorRead([vendorA.id], [materializationVendor(vendorA, { status: "blocked" })]),
    laneRead([materializationLaneA]),
    ...materializationJournalStart(),
    { table: "carrier_template_materialization_operations", operation: "update", data: null },
    {
      table: "carrier_template_materialization_operations",
      operation: "select",
      data: canonicalJournal,
      filters: [["eq", "id", materializationOperationId]],
    },
    finalInvitationRead([materializationLaneA], [vendorA.id], [finalRow]),
  ]);
  const handler = createTestRatewareApiHandler(db);
  assert(handler);

  const response = await handler(jsonActionRequest(materializationAction()));
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.result, "inserted");
  assertEquals(body.outcomes, [canonicalOutcome]);
  assertEquals(body.confirmed_audience_vendor_ids, [vendorA.id]);
  assertEquals(db.traces.some((trace) => trace.table === "rfx_lane_vendors" && trace.operation === "upsert"), false);
  assertEquals(db.traces.some((trace) => trace.table === "saas_audit_log"), false);
  assertEquals(db.responses.length, 0);
});

Deno.test("Task 7 terminal rejected journal cannot be reopened by later eligibility", async () => {
  const rejectedOutcome = {
    lane_id: materializationLaneA,
    vendor_id: vendorA.id,
    outcome: "rejected",
    reason: "status_blocked",
  };
  const db = new ScriptedSupabase([
    templateRead(),
    // The carrier is eligible now, but this UUID already reached a terminal
    // zero-mutation rejection and must not acquire a new meaning.
    vendorRead([vendorA.id], [materializationVendor()]),
    laneRead([materializationLaneA]),
    ...materializationJournalStart([vendorA.id], [materializationLaneA], {
      status: "rejected",
      result: "rejected",
      confirmed_count: 0,
      inserted_count: 0,
      already_present_count: 0,
      rejected_count: 1,
      pending_count: 0,
      confirmed_vendor_ids: [],
      outcomes: [rejectedOutcome],
    }),
  ]);
  const handler = createTestRatewareApiHandler(db);
  assert(handler);

  const response = await handler(jsonActionRequest(materializationAction()));
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.result, "rejected");
  assertEquals(body.outcomes, [rejectedOutcome]);
  assertEquals(body.confirmed_audience_vendor_ids, []);
  assertEquals(db.traces.some((trace) => trace.table === "rfx_lane_vendors"), false);
  assertEquals(db.traces.some((trace) => trace.table === "carrier_template_materialization_operations" && trace.operation === "update"), false);
  assertEquals(db.traces.some((trace) => trace.table === "saas_audit_log"), false);
  assertEquals(db.responses.length, 0);
});

Deno.test("Task 7 rejected-first interleaving prevents every eligible participant upsert", async () => {
  let releaseRejectedClaim!: () => void;
  let signalRejectedClaim!: () => void;
  const rejectedClaimGate = new Promise<void>((resolve) => releaseRejectedClaim = resolve);
  const rejectedClaimStarted = new Promise<void>((resolve) => signalRejectedClaim = resolve);
  const rejectedOutcome = {
    lane_id: materializationLaneA,
    vendor_id: vendorA.id,
    outcome: "rejected",
    reason: "status_blocked",
  };
  const rejectedJournal = materializationJournalRow([vendorA.id], [materializationLaneA], {
    status: "rejected",
    result: "rejected",
    confirmed_count: 0,
    inserted_count: 0,
    already_present_count: 0,
    rejected_count: 1,
    pending_count: 0,
    confirmed_vendor_ids: [],
    outcomes: [rejectedOutcome],
  });
  const db = new ScriptedSupabase([
    // Request A observes blocked eligibility and wins pending -> rejected. Its
    // response is delayed after the database transition has taken effect.
    templateRead(),
    vendorRead([vendorA.id], [materializationVendor(vendorA, { status: "blocked" })]),
    laneRead([materializationLaneA]),
    ...materializationJournalStart(),
    {
      ...materializationJournalFinish([vendorA.id], [materializationLaneA], {
        status: "rejected",
        result: "rejected",
        confirmed_count: 0,
        inserted_count: 0,
        rejected_count: 1,
        confirmed_vendor_ids: [],
        outcomes: [rejectedOutcome],
      }),
      wait: rejectedClaimGate,
      onTake: signalRejectedClaim,
    },
    // Request B's earlier eligibility snapshot cannot reopen the same UUID.
    templateRead(),
    vendorRead([vendorA.id], [materializationVendor()]),
    laneRead([materializationLaneA]),
    ...materializationJournalStart([vendorA.id], [materializationLaneA], {
      ...rejectedJournal,
    }),
  ]);
  const handler = createTestRatewareApiHandler(db);
  assert(handler);

  const rejectedResponsePromise = handler(jsonActionRequest(materializationAction()));
  await rejectedClaimStarted;
  const eligibleResponse = await handler(jsonActionRequest(materializationAction()));
  releaseRejectedClaim();
  const rejectedResponse = await rejectedResponsePromise;

  assertEquals(rejectedResponse.status, 200);
  assertEquals(eligibleResponse.status, 200);
  assertEquals((await eligibleResponse.json()).result, "rejected");
  assertEquals(db.traces.filter((trace) => trace.table === "rfx_lane_vendors" && trace.operation === "upsert").length, 0);
  assertEquals(db.traces.filter((trace) => trace.table === "carrier_template_materialization_operations" && trace.operation === "update").length, 1);
  assertEquals(db.traces.filter((trace) => trace.table === "saas_audit_log").length, 0);
  assertEquals(db.responses.length, 0);
});

Deno.test("Task 7 mutation-issued-first interleaving makes rejection lose and converges once", async () => {
  let releaseMutationClaim!: () => void;
  let signalMutationClaim!: () => void;
  let releaseBlockedFinalRead!: () => void;
  let signalBlockedFinalRead!: () => void;
  const mutationClaimGate = new Promise<void>((resolve) => releaseMutationClaim = resolve);
  const mutationClaimStarted = new Promise<void>((resolve) => signalMutationClaim = resolve);
  const blockedFinalReadGate = new Promise<void>((resolve) => releaseBlockedFinalRead = resolve);
  const blockedFinalReadStarted = new Promise<void>((resolve) => signalBlockedFinalRead = resolve);
  const finalRow = {
    id: "invitation-mutation-claim-winner",
    rfx_event_id: materializationEventId,
    rfx_lane_id: materializationLaneA,
    vendor_id: vendorA.id,
    carrier_template_materialization_operation_id: materializationOperationId,
  };
  const canonicalOutcome = {
    lane_id: materializationLaneA,
    vendor_id: vendorA.id,
    outcome: "inserted",
    invitation_id: finalRow.id,
  };
  const canonicalJournal = materializationJournalRow([vendorA.id], [materializationLaneA], {
    status: "reconciled",
    result: "inserted",
    confirmed_count: 1,
    inserted_count: 1,
    already_present_count: 0,
    rejected_count: 0,
    pending_count: 0,
    confirmed_vendor_ids: [vendorA.id],
    outcomes: [canonicalOutcome],
  });
  const db = new ScriptedSupabase([
    // Eligible request A atomically claims mutation ownership before writing.
    templateRead(),
    vendorRead([vendorA.id], [materializationVendor()]),
    laneRead([materializationLaneA]),
    ...materializationJournalStart(),
    {
      ...materializationJournalClaim(),
      wait: mutationClaimGate,
      onTake: signalMutationClaim,
    },
    // Blocked request B cannot change mutation_issued to rejected. It reloads
    // canonical operation context and waits on final reconciliation.
    templateRead(),
    vendorRead([vendorA.id], [materializationVendor(vendorA, { status: "blocked" })]),
    laneRead([materializationLaneA]),
    ...materializationJournalStart([vendorA.id], [materializationLaneA], { status: "mutation_issued" }),
    {
      ...finalInvitationRead([materializationLaneA], [vendorA.id], [finalRow]),
      wait: blockedFinalReadGate,
      onTake: signalBlockedFinalRead,
    },
    // A resumes, writes once, and wins terminal reconciliation/audit.
    { table: "rfx_lane_vendors", operation: "upsert", data: [finalRow] },
    finalInvitationRead([materializationLaneA], [vendorA.id], [finalRow]),
    materializationJournalFinish([vendorA.id], [materializationLaneA], { outcomes: [canonicalOutcome] }),
    { table: "saas_audit_log", operation: "insert", data: null },
    // B's late reconciliation CAS loses and returns A's canonical success.
    { table: "carrier_template_materialization_operations", operation: "update", data: null },
    {
      table: "carrier_template_materialization_operations",
      operation: "select",
      data: canonicalJournal,
      filters: [["eq", "id", materializationOperationId]],
    },
    finalInvitationRead([materializationLaneA], [vendorA.id], [finalRow]),
  ]);
  const handler = createTestRatewareApiHandler(db);
  assert(handler);

  const eligibleResponsePromise = handler(jsonActionRequest(materializationAction()));
  await mutationClaimStarted;
  const blockedResponsePromise = handler(jsonActionRequest(materializationAction()));
  await blockedFinalReadStarted;
  releaseMutationClaim();
  const eligibleResponse = await eligibleResponsePromise;
  releaseBlockedFinalRead();
  const blockedResponse = await blockedResponsePromise;

  assertEquals(eligibleResponse.status, 200);
  assertEquals(blockedResponse.status, 200);
  const blockedBody = await blockedResponse.json();
  assertEquals(blockedBody.result, "inserted");
  assertEquals(blockedBody.outcomes, [canonicalOutcome]);
  assertEquals(db.traces.filter((trace) => trace.table === "rfx_lane_vendors" && trace.operation === "upsert").length, 1);
  assertEquals(db.traces.filter((trace) => trace.table === "saas_audit_log").length, 1);
  assertEquals(
    db.traces.filter((trace) =>
      trace.table === "carrier_template_materialization_operations" &&
      trace.operation === "update" &&
      (trace.payload as Record<string, unknown>).status === "rejected"
    ).length,
    0,
    "Blocked request observing mutation_issued must never attempt rejection",
  );
  assertEquals(db.responses.length, 0);
});

Deno.test("Task 9 shared mutable journal lets one CAS result govern both concurrent requests", async () => {
  const db = createSharedMutableMaterializationDb();
  const handler = createTestRatewareApiHandler(db);
  assert(handler);

  const [firstResponse, secondResponse] = await Promise.all([
    handler(jsonActionRequest(materializationAction())),
    handler(jsonActionRequest(materializationAction())),
  ]);

  assertEquals(firstResponse.status, 200);
  assertEquals(secondResponse.status, 200);
  const [firstBody, secondBody] = await Promise.all([
    firstResponse.json(),
    secondResponse.json(),
  ]);
  assertEquals(firstBody.result, "inserted");
  assertEquals(secondBody.result, "inserted");
  assertEquals(firstBody.counts, secondBody.counts);
  assertEquals(firstBody.outcomes, secondBody.outcomes);
  assertEquals(db.pendingSnapshotReads, 2);
  assertEquals(db.claimWins, 1);
  assertEquals(db.finalizationWins, 1);
  assertEquals(db.participantInsertCommits, 1);
  assertEquals(db.auditInsertCommits, 1);
  assertEquals(db.journal?.status, "reconciled");
  assertEquals(db.journal?.inserted_count, 1);
  assertEquals(db.journalHistory, ["pending", "mutation_issued", "reconciled"]);
  assertEquals(db.participants.length, 1);
  assertEquals(
    db.participants[0].carrier_template_materialization_operation_id,
    materializationOperationId,
  );
  assertEquals(
    JSON.stringify([firstBody, secondBody]).includes(
      "carrier_template_materialization_operation_id",
    ),
    false,
  );
});

Deno.test("Task 7 normal RFx detail serialization never exposes the internal operation marker", async () => {
  const invitation = {
    id: "invitation-public-detail",
    rfx_event_id: materializationEventId,
    rfx_lane_id: materializationLaneA,
    vendor_id: vendorA.id,
    invitation_status: "drafted",
    invitation_token: null,
    invitation_token_encrypted: null,
    invitation_token_hash: "internal-hash",
    carrier_template_materialization_operation_id: materializationOperationId,
    vendors: { id: vendorA.id, vendor_name: "Carrier A" },
  };
  const db = new ScriptedSupabase([
    {
      table: "rfx_events",
      operation: "select",
      data: {
        id: materializationEventId,
        owner_email: workspaceUser.owner_email,
        status: "closed",
      },
      filters: [
        ["eq", "id", materializationEventId],
        ["eq", "owner_email", workspaceUser.owner_email],
      ],
    },
    {
      table: "rfx_lanes",
      operation: "select",
      data: [{ id: materializationLaneA, rfx_event_id: materializationEventId, lane_number: 1 }],
      filters: [
        ["in", "rfx_event_id", [materializationEventId]],
        ["order", "id", { ascending: true }],
        ["range", "0", 999],
      ],
    },
    {
      table: "rfx_lane_vendors",
      operation: "select",
      data: [invitation],
      filters: [
        ["eq", "rfx_event_id", materializationEventId],
        ["order", "created_at", { ascending: true }],
        ["order", "id", { ascending: true }],
        ["range", "0", 999],
      ],
    },
    { table: "rfx_benchmark_candidate_rate_ids", operation: "rpc", data: [] },
    { table: "rateware_fx_spot_rates", operation: "select", data: null },
  ]);
  const handler = createTestRatewareApiHandler(db);
  assert(handler);

  const response = await handler(jsonActionRequest({
    action: "list_rfx_detail",
    event_id: materializationEventId,
  }));
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.lanes[0].invitations[0].id, invitation.id);
  assertEquals(JSON.stringify(body).includes("carrier_template_materialization_operation_id"), false);
  assertEquals(JSON.stringify(body).includes("invitation_token_hash"), false);
  assertEquals(db.responses.length, 0);
});

Deno.test("real request dispatcher preserves raw claims and resolved organization scope", async () => {
  const db = new ScriptedSupabase([{
    table: "vendor_segments",
    operation: "select",
    data: [{ id: "template-a" }],
    count: 1,
  }]);
  let resolvedClaims: Record<string, unknown> | null = null;
  const rawClaims = {
    ...manageClaims,
    organization_id: "client-claim-org-must-not-scope",
  };
  const handler = createTestRatewareApiHandler(db, {
    claims: rawClaims,
    onResolve: (claims) => resolvedClaims = claims,
  });
  assert(handler);

  const response = await handler(jsonActionRequest({
    action: "list_carrier_list_templates",
    organization_id: "client-body-org-must-not-scope",
  }));

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    enabled: true,
    rows: [{ id: "template-a" }],
    total: 1,
    limit: 50,
    offset: 0,
    has_more: false,
  });
  assertStrictEquals(resolvedClaims, rawClaims);
  assertEquals(db.traces[0].filters, [
    ["eq", "organization_id", "org-a"],
    ["eq", "segment_type", "participant_template"],
    ["order", "updated_at", { ascending: false }],
    ["range", "0", 49],
  ]);
});

Deno.test("filtered vendor search uses a fixed-snapshot keyset RPC and returns a complete deterministic total", async () => {
  const searchIds = Array.from({ length: 1002 }, (_, index) =>
    `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`
  );
  const matchingRows = [
    { id: searchIds[10], vendor_name: "First filtered match" },
    { id: searchIds[1000], vendor_name: "Second filtered match" },
    { id: searchIds[1001], vendor_name: "Third filtered match" },
  ];
  const db = new ScriptedSupabase([
    {
      table: "search_workspace_vendors_keyset",
      operation: "rpc",
      data: searchIds.slice(0, 1000).map((id, index) => ({
        id,
        match_rank: index < 20 ? 0 : 4,
        sort_key: id,
        total_count: 1002,
        has_more: true,
      })),
    },
    { table: "vendors", operation: "select", data: [matchingRows[0]], count: 1 },
    {
      table: "search_workspace_vendors_keyset",
      operation: "rpc",
      data: searchIds.slice(1000).map((id) => ({
        id,
        match_rank: 4,
        sort_key: id,
        total_count: 1002,
        has_more: false,
      })),
    },
    { table: "vendors", operation: "select", data: matchingRows.slice(1), count: 2 },
  ]);
  const handler = createTestRatewareApiHandler(db);
  assert(handler);
  const response = await handler(jsonActionRequest({
    action: "list_vendors",
    search: "Mexico",
    status: "active",
    base_stage: "procurement",
    channel: "email",
    tag: "alta",
    coverage: "Cross-border",
    lightweight: true,
    limit: 2,
    offset: 1,
  }));

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.rows, matchingRows.slice(1));
  assertEquals(body.total, 3);
  assertEquals(body.search_total, 1002);
  assertEquals(body.search_capped, false);
  const rpcTraces = db.traces.filter((trace) =>
    trace.table === "search_workspace_vendors_keyset"
  );
  const rpcPayloads = rpcTraces.map((trace) => trace.payload as Record<string, unknown>);
  assertEquals(rpcPayloads.map((payload) => ({
    owner: payload.p_owner_email,
    organization: payload.p_organization_id,
    search: payload.p_search,
    limit: payload.p_limit,
    after: payload.p_after_id,
  })), [
    { owner: "org:org-a", organization: "org-a", search: "Mexico", limit: 1000, after: null },
    { owner: "org:org-a", organization: "org-a", search: "Mexico", limit: 1000, after: searchIds[999] },
  ]);
  assertEquals(typeof rpcPayloads[0].p_snapshot_at, "string");
  assertEquals(rpcPayloads[1].p_snapshot_at, rpcPayloads[0].p_snapshot_at);
  const vendorTraces = db.traces.filter((trace) => trace.table === "vendors");
  assertEquals(
    (vendorTraces[0].filters.find((filter) => filter[0] === "in")?.[2] as unknown[]).length,
    1000,
  );
  assertEquals(
    (vendorTraces[1].filters.find((filter) => filter[0] === "in")?.[2] as unknown[]).length,
    2,
  );
  for (const trace of vendorTraces) {
    assert(trace.filters.some((filter) =>
      filter[0] === "eq" && filter[1] === "owner_email" && filter[2] === "org:org-a"
    ));
    assert(trace.filters.some((filter) =>
      filter[0] === "eq" && filter[1] === "organization_id" && filter[2] === "org-a"
    ));
    assert(trace.filters.some((filter) =>
      filter[0] === "eq" && filter[1] === "status" && filter[2] === "active"
    ));
    assert(trace.filters.some((filter) =>
      filter[0] === "eq" && filter[1] === "base_stage" && filter[2] === "procurement"
    ));
    assert(trace.filters.some((filter) => filter[0] === "contains" && filter[1] === "tags"));
    assert(trace.filters.some((filter) => filter[0] === "or"));
  }
});

Deno.test("member validation batches more than one thousand exact organization-scoped UUIDs", async () => {
  const validateMembers = ratewareApi.validateCarrierTemplateMembers;
  assertEquals(typeof validateMembers, "function");
  if (typeof validateMembers !== "function") return;
  const ids = Array.from({ length: 1001 }, (_, index) =>
    `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`
  );
  const db = new ScriptedSupabase([
    { table: "vendors", operation: "select", data: ids.slice(0, 500).map((id) => ({ id })) },
    { table: "vendors", operation: "select", data: ids.slice(500, 1000).map((id) => ({ id })) },
    { table: "vendors", operation: "select", data: ids.slice(1000).map((id) => ({ id })) },
  ]);
  assertEquals(await validateMembers(db, "org-a", ids), true);
  assertEquals(db.traces.map((trace) => trace.filters), [
    [["eq", "organization_id", "org-a"], ["in", "id", ids.slice(0, 500)]],
    [["eq", "organization_id", "org-a"], ["in", "id", ids.slice(500, 1000)]],
    [["eq", "organization_id", "org-a"], ["in", "id", ids.slice(1000)]],
  ]);
});

Deno.test("member validation rejects a missing or foreign UUID in a later bounded batch", async () => {
  const validateMembers = ratewareApi.validateCarrierTemplateMembers;
  assertEquals(typeof validateMembers, "function");
  if (typeof validateMembers !== "function") return;
  const ids = Array.from({ length: 750 }, (_, index) =>
    `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`
  );
  const db = new ScriptedSupabase([
    { table: "vendors", operation: "select", data: ids.slice(0, 500).map((id) => ({ id })) },
    { table: "vendors", operation: "select", data: ids.slice(500, 749).map((id) => ({ id })) },
  ]);
  assertEquals(await validateMembers(db, "org-a", ids), false);
  assertEquals(db.traces.length, 2);
  assert(db.traces.every((trace) => trace.filters.some((filter) =>
    filter[0] === "eq" && filter[1] === "organization_id" && filter[2] === "org-a"
  )));
});

Deno.test("real request dispatcher honors feature flag and raw-claim write permission", async () => {
  const disabledDb = new ScriptedSupabase();
  const disabledHandler = createTestRatewareApiHandler(disabledDb, {
    enabled: false,
  });
  assert(disabledHandler);
  const disabledResponse = await disabledHandler(jsonActionRequest({
    action: "list_carrier_list_templates",
  }));
  assertEquals(disabledResponse.status, 404);
  assertEquals(await disabledResponse.json(), {
    enabled: false,
    error: "Carrier list templates are not enabled.",
  });
  assertEquals(disabledDb.traces, []);

  const deniedDb = new ScriptedSupabase();
  const deniedHandler = createTestRatewareApiHandler(deniedDb, {
    claims: { sub: "kp_1", permissions: ["vendors:read"] },
  });
  assert(deniedHandler);
  const deniedResponse = await deniedHandler(jsonActionRequest({
    action: "create_carrier_list_template",
    template: { segment_name: "Core", vendor_ids: [vendorA.id] },
  }));
  assertEquals(deniedResponse.status, 403);
  assertEquals(await deniedResponse.json(), {
    enabled: true,
    error: "Missing required permission: vendors:manage",
  });
  assertEquals(deniedDb.traces, []);
});

Deno.test("real create request persists the normalized template description", async () => {
  const saved = {
    id: "aaaaaaaa-1111-4111-8111-111111111111",
    segment_name: "Mexico Core",
    description: "Operations-owned shortlist",
    lifecycle_status: "draft",
    status: "draft",
    vendor_ids: [],
    template_version: 1,
  };
  const db = new ScriptedSupabase([
    { table: "vendor_segments", operation: "select", data: [] },
    { table: "vendor_segments", operation: "insert", data: saved },
    { table: "saas_audit_log", operation: "insert", data: null },
  ]);
  const handler = createTestRatewareApiHandler(db);
  assert(handler);

  const response = await handler(jsonActionRequest({
    action: "create_carrier_list_template",
    template: {
      segment_name: "Mexico Core",
      segment_description: " Operations-owned shortlist ",
      lifecycle_status: "draft",
      vendor_ids: [],
    },
  }));

  assertEquals(response.status, 201);
  assertEquals((await response.json()).row.description, saved.description);
  const insert = db.traces.find((trace) =>
    trace.table === "vendor_segments" && trace.operation === "insert"
  );
  assertEquals(
    (insert?.payload as Record<string, unknown>).description,
    saved.description,
  );
});

Deno.test("real update requests preserve an omitted description and allow an explicit clear", async () => {
  const templateId = "aaaaaaaa-1111-4111-8111-111111111111";
  const current = {
    id: templateId,
    segment_name: "Mexico Core",
    description: "Keep until explicitly cleared",
    lifecycle_status: "draft",
    status: "draft",
    vendor_ids: [],
    template_version: 4,
  };

  const preserveDb = new ScriptedSupabase([
    { table: "vendor_segments", operation: "select", data: current },
    {
      table: "vendor_segments",
      operation: "update",
      data: { ...current, template_version: 5 },
    },
  ]);
  const preserveHandler = createTestRatewareApiHandler(preserveDb);
  assert(preserveHandler);
  const preserveResponse = await preserveHandler(jsonActionRequest({
    action: "update_carrier_list_template",
    id: templateId,
    expected_version: 4,
    template: {
      segment_name: "Mexico Core",
      lifecycle_status: "draft",
      vendor_ids: [],
    },
  }));
  assertEquals(preserveResponse.status, 200);
  assertEquals(
    (preserveDb.traces.find((trace) => trace.operation === "update")
      ?.payload as Record<string, unknown>).description,
    current.description,
  );

  const clearDb = new ScriptedSupabase([
    { table: "vendor_segments", operation: "select", data: current },
    {
      table: "vendor_segments",
      operation: "update",
      data: { ...current, description: "", template_version: 5 },
    },
    { table: "saas_audit_log", operation: "insert", data: null },
  ]);
  const clearHandler = createTestRatewareApiHandler(clearDb);
  assert(clearHandler);
  const clearResponse = await clearHandler(jsonActionRequest({
    action: "update_carrier_list_template",
    id: templateId,
    expected_version: 4,
    template: {
      segment_name: "Mexico Core",
      segment_description: "",
      lifecycle_status: "draft",
      vendor_ids: [],
    },
  }));
  assertEquals(clearResponse.status, 200);
  assertEquals(
    (clearDb.traces.find((trace) => trace.operation === "update")
      ?.payload as Record<string, unknown>).description,
    "",
  );
  assertEquals(
    (clearDb.traces.find((trace) => trace.table === "saas_audit_log")
      ?.payload as Record<string, unknown>).action,
    "carrier_template.update_details",
  );
});

Deno.test("resolve rejects rows beyond the shared limit before any vendor query", async () => {
  const db = new ScriptedSupabase();
  const handler = createTestRatewareApiHandler(db);
  assert(handler);
  const response = await handler(jsonActionRequest({
    action: "resolve_carrier_list_template_rows",
    rows: Array.from(
      { length: SERVER_CARRIER_TEMPLATE_IMPORT_MAX_ROWS + 1 },
      (_, index) => ({ source_row_number: index + 2, vendor_name: `Carrier ${index}` }),
    ),
  }));
  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    enabled: true,
    error: "Resolve up to 1,000 carrier rows at a time.",
  });
  assertEquals(db.traces, []);
});

Deno.test("real duplicate request requires and enforces the displayed source version", async () => {
  const source = {
    id: "aaaaaaaa-1111-4111-8111-111111111111",
    segment_name: "Source",
    lifecycle_status: "active",
    status: "active",
    vendor_ids: [vendorB.id, vendorA.id],
    template_version: 4,
    updated_at: "2026-08-25T10:00:00.000Z",
  };

  const missingVersionDb = new ScriptedSupabase();
  const missingVersionHandler = createTestRatewareApiHandler(missingVersionDb);
  assert(missingVersionHandler);
  const missingVersionResponse = await missingVersionHandler(jsonActionRequest({
    action: "duplicate_carrier_list_template",
    id: source.id,
    name: "Source Copy",
  }));
  assertEquals(missingVersionResponse.status, 400);
  assertEquals(await missingVersionResponse.json(), {
    enabled: true,
    error: "expected_version is required.",
  });
  assertEquals(missingVersionDb.traces, []);

  const notFoundDb = new ScriptedSupabase([{
    table: "rateware_duplicate_carrier_list_template",
    operation: "rpc",
    data: [{ outcome: "not_found", row_data: null }],
  }]);
  const notFoundHandler = createTestRatewareApiHandler(notFoundDb);
  assert(notFoundHandler);
  const notFoundResponse = await notFoundHandler(jsonActionRequest({
    action: "duplicate_carrier_list_template",
    id: source.id,
    name: "Source Copy",
    expected_version: 4,
    organization_id: "body-org-must-be-ignored",
    owner_user_id: "body-owner-must-be-ignored",
    owner_email: "attacker@example.com",
    actor_user_id: "body-actor-must-be-ignored",
    actor_email: "attacker@example.com",
  }));
  assertEquals(notFoundResponse.status, 404);
  assertEquals(await notFoundResponse.json(), {
    enabled: true,
    error: "Carrier list template was not found.",
  });
  assertEquals(notFoundDb.traces[0].payload, {
    p_organization_id: "org-a",
    p_source_template_id: source.id,
    p_expected_version: 4,
    p_name: "Source Copy",
    p_owner_user_id: "kp_1",
    p_owner_email: "org:org-a",
    p_actor_user_id: "kp_1",
    p_actor_email: "buyer@example.com",
  });
  assertEquals(notFoundDb.traces.some((trace) => trace.table === "saas_audit_log"), false);

  const staleVersionDb = new ScriptedSupabase([{
    table: "rateware_duplicate_carrier_list_template",
    operation: "rpc",
    data: [{
      outcome: "version_conflict",
      row_data: null,
      current_version: 4,
      current_updated_at: source.updated_at,
    }],
  }]);
  const staleVersionHandler = createTestRatewareApiHandler(staleVersionDb);
  assert(staleVersionHandler);
  const staleVersionResponse = await staleVersionHandler(jsonActionRequest({
    action: "duplicate_carrier_list_template",
    id: source.id,
    name: "Source Copy",
    expected_version: 3,
  }));
  assertEquals(staleVersionResponse.status, 409);
  assertEquals(await staleVersionResponse.json(), {
    enabled: true,
    code: "template_version_conflict",
    error: "Carrier list template changed since it was loaded.",
    current_version: 4,
    current_updated_at: source.updated_at,
    template_id: source.id,
  });
  assertEquals(
    staleVersionDb.traces.some((trace) => ["insert", "update", "delete"].includes(trace.operation)),
    false,
  );
  assertEquals(staleVersionDb.traces.some((trace) => trace.table === "saas_audit_log"), false);

  const duplicate = {
    ...source,
    id: "bbbbbbbb-2222-4222-8222-222222222222",
    segment_name: "Source Copy",
    lifecycle_status: "draft",
    status: "draft",
    template_version: 1,
  };
  const currentVersionDb = new ScriptedSupabase([
    {
      table: "rateware_duplicate_carrier_list_template",
      operation: "rpc",
      data: [{
        outcome: "success",
        row_data: duplicate,
        current_version: 1,
        current_updated_at: duplicate.updated_at,
      }],
    },
    { table: "saas_audit_log", operation: "insert", data: null },
  ]);
  const currentVersionHandler = createTestRatewareApiHandler(currentVersionDb);
  assert(currentVersionHandler);
  const currentVersionResponse = await currentVersionHandler(jsonActionRequest({
    action: "duplicate_carrier_list_template",
    id: source.id,
    name: " Source   Copy ",
    expected_version: 4,
  }));
  assertEquals(currentVersionResponse.status, 201);
  assertEquals(await currentVersionResponse.json(), {
    enabled: true,
    row: duplicate,
  });
  const rpc = currentVersionDb.traces.find((trace) => trace.operation === "rpc");
  assertEquals(rpc?.table, "rateware_duplicate_carrier_list_template");
  assertEquals(rpc?.payload, {
    p_organization_id: "org-a",
    p_source_template_id: source.id,
    p_expected_version: 4,
    p_name: "Source Copy",
    p_owner_user_id: "kp_1",
    p_owner_email: "org:org-a",
    p_actor_user_id: "kp_1",
    p_actor_email: "buyer@example.com",
  });
  const audit = currentVersionDb.traces.find((trace) => trace.table === "saas_audit_log");
  assertEquals((audit?.payload as Record<string, unknown>).action, "carrier_template.duplicate");

  const nameConflictDb = new ScriptedSupabase([{
    table: "rateware_duplicate_carrier_list_template",
    operation: "rpc",
    data: [{ outcome: "name_conflict", row_data: null }],
  }]);
  const nameConflictHandler = createTestRatewareApiHandler(nameConflictDb);
  assert(nameConflictHandler);
  const nameConflictResponse = await nameConflictHandler(jsonActionRequest({
    action: "duplicate_carrier_list_template",
    id: source.id,
    name: "Existing Name",
    expected_version: 4,
  }));
  assertEquals(nameConflictResponse.status, 409);
  assertEquals(await nameConflictResponse.json(), {
    enabled: true,
    code: "template_name_conflict",
    error: "A carrier list template with that name already exists in this organization.",
  });
  assertEquals(nameConflictDb.traces.some((trace) => trace.table === "saas_audit_log"), false);
});

Deno.test("real duplicate request maps only production-shaped name-index 23505 errors", async () => {
  const sourceId = "aaaaaaaa-1111-4111-8111-111111111111";
  const expectedConflicts = [
    {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "vendor_segments_participant_template_org_name_uidx"',
      details: "Key (organization_id, rateware_vendor_search_key(segment_name))=(org-a, source copy) already exists.",
      hint: null,
    },
    {
      code: "23505",
      message: "duplicate key value violates unique constraint",
      details:
        "Key (organization_id, rateware_vendor_search_key(segment_name))=(org-a, source copy) already exists.",
      hint: null,
    },
  ];

  for (const conflict of expectedConflicts) {
    const db = new ScriptedSupabase([{
      table: "rateware_duplicate_carrier_list_template",
      operation: "rpc",
      error: conflict,
    }]);
    const handler = createTestRatewareApiHandler(db);
    assert(handler);

    const response = await handler(jsonActionRequest({
      action: "duplicate_carrier_list_template",
      id: sourceId,
      name: "Source Copy",
      expected_version: 4,
    }));

    assertEquals(response.status, 409);
    assertEquals(await response.json(), {
      enabled: true,
      code: "template_name_conflict",
      error: "A carrier list template with that name already exists in this organization.",
    });
    assertEquals(db.traces.some((trace) => trace.table === "saas_audit_log"), false);
  }
});

Deno.test("real duplicate request propagates production-shaped non-name 23505 identifiers", async () => {
  const sourceId = "aaaaaaaa-1111-4111-8111-111111111111";
  const unrelatedConstraints = [
    "vendor_segments_participant_template_org_name_uidx_shadow",
    "vendor_segments_participant_template_org_name_uidx$shadow",
    "vendor_segments_participant_template_org_name_uidx-shadow",
  ];
  const statuses: number[] = [];
  const auditActions: string[][] = [];

  for (const constraintName of unrelatedConstraints) {
    const db = new ScriptedSupabase([
      {
        table: "rateware_duplicate_carrier_list_template",
        operation: "rpc",
        error: {
          code: "23505",
          message: `duplicate key value violates unique constraint "${constraintName}"`,
          details:
            "Key (organization_id, rateware_vendor_search_key(segment_name))=(org-a, source copy) already exists.",
          hint: null,
        },
      },
      { table: "saas_audit_log", operation: "insert", data: null },
    ]);
    const handler = createTestRatewareApiHandler(db);
    assert(handler);

    const response = await handler(jsonActionRequest({
      action: "duplicate_carrier_list_template",
      id: sourceId,
      name: "Source Copy",
      expected_version: 4,
    }));
    statuses.push(response.status);
    auditActions.push(db.traces
      .filter((trace) => trace.table === "saas_audit_log")
      .map((trace) => String((trace.payload as Record<string, unknown>).action)));
  }

  assertEquals(statuses, [500, 500, 500]);
  assertEquals(auditActions, [["api.error"], ["api.error"], ["api.error"]]);
});

Deno.test("enabled legacy generic mutations guard the final dynamic row mutation", async () => {
  const segmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const dynamicSegment = {
    id: segmentId,
    segment_name: "Dynamic Core",
    segment_type: "dynamic",
    vendor_ids: [],
  };
  const updateDb = new ScriptedSupabase([
    {
      table: "vendor_segments",
      operation: "select",
      data: dynamicSegment,
      filters: [
        ["eq", "id", segmentId],
        ["eq", "organization_id", "org-a"],
      ],
    },
    {
      table: "vendor_segments",
      operation: "update",
      data: dynamicSegment,
      filters: [
        ["eq", "owner_email", "org:org-a"],
        ["eq", "id", segmentId],
        ["neq", "segment_type", "participant_template"],
      ],
    },
    { table: "saas_audit_log", operation: "insert", data: {} },
  ]);
  const updateHandler = createTestRatewareApiHandler(updateDb);
  assert(updateHandler);
  const updateResponse = await updateHandler(jsonActionRequest({
    action: "update_vendor_segment",
    id: segmentId,
    patch: { segment_name: "Dynamic Core" },
  }));
  assertEquals(updateResponse.status, 200);
  const finalUpdate = updateDb.traces.find((trace) =>
    trace.table === "vendor_segments" && trace.operation === "update"
  );
  assertEquals(finalUpdate?.filters, [
    ["eq", "owner_email", "org:org-a"],
    ["eq", "id", segmentId],
    ["neq", "segment_type", "participant_template"],
  ]);

  const deleteDb = new ScriptedSupabase([
    {
      table: "vendor_segments",
      operation: "select",
      data: dynamicSegment,
      filters: [
        ["eq", "id", segmentId],
        ["eq", "organization_id", "org-a"],
      ],
    },
    {
      table: "vendor_segments",
      operation: "delete",
      data: dynamicSegment,
      filters: [
        ["eq", "owner_email", "org:org-a"],
        ["eq", "id", segmentId],
        ["neq", "segment_type", "participant_template"],
      ],
    },
    { table: "saas_audit_log", operation: "insert", data: {} },
  ]);
  const deleteHandler = createTestRatewareApiHandler(deleteDb);
  assert(deleteHandler);
  const deleteResponse = await deleteHandler(jsonActionRequest({
    action: "delete_vendor_segment",
    id: segmentId,
    confirmed: true,
    confirmation_action: "delete_vendor_segment",
  }));
  assertEquals(deleteResponse.status, 200);
  const finalDelete = deleteDb.traces.find((trace) =>
    trace.table === "vendor_segments" && trace.operation === "delete"
  );
  assertEquals(finalDelete?.filters, [
    ["eq", "owner_email", "org:org-a"],
    ["eq", "id", segmentId],
    ["neq", "segment_type", "participant_template"],
  ]);
});

Deno.test("enabled legacy final mutation guard fails closed after pre-read misses or races", async () => {
  const segmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const dynamicSegment = {
    id: segmentId,
    segment_name: "Dynamic Core",
    segment_type: "dynamic",
    vendor_ids: [],
  };
  for (const action of ["update_vendor_segment", "delete_vendor_segment"]) {
    const operation = action === "update_vendor_segment" ? "update" : "delete";
    const db = new ScriptedSupabase([
      {
        table: "vendor_segments",
        operation: "select",
        data: dynamicSegment,
        filters: [
          ["eq", "id", segmentId],
          ["eq", "organization_id", "org-a"],
        ],
      },
      {
        table: "vendor_segments",
        operation,
        data: null,
        filters: [
          ["eq", "owner_email", "org:org-a"],
          ["eq", "id", segmentId],
          ["neq", "segment_type", "participant_template"],
        ],
      },
    ]);
    const handler = createTestRatewareApiHandler(db);
    assert(handler);
    const response = await handler(jsonActionRequest({
      action,
      id: segmentId,
      patch: { segment_name: "Dynamic Core" },
      confirmed: true,
      confirmation_action: "delete_vendor_segment",
    }));
    assertEquals(response.status, 409);
    assertEquals(await response.json(), {
      error:
        "Participant templates must use the explicit carrier list template actions.",
    });
    assertEquals(db.traces[1].filters, [
      ["eq", "owner_email", "org:org-a"],
      ["eq", "id", segmentId],
      ["neq", "segment_type", "participant_template"],
    ]);
  }

  const nullOrganizationDb = new ScriptedSupabase([
    {
      table: "vendor_segments",
      operation: "update",
      data: null,
      filters: [
        ["eq", "owner_email", "org:org-a"],
        ["eq", "id", segmentId],
        ["neq", "segment_type", "participant_template"],
      ],
    },
  ]);
  const nullOrganizationHandler = createTestRatewareApiHandler(
    nullOrganizationDb,
    { user: { ...workspaceUser, organization_id: null } },
  );
  assert(nullOrganizationHandler);
  const nullOrganizationResponse = await nullOrganizationHandler(
    jsonActionRequest({
      action: "update_vendor_segment",
      id: segmentId,
      patch: { segment_name: "Dynamic Core" },
    }),
  );
  assertEquals(nullOrganizationResponse.status, 409);
  assertEquals(nullOrganizationDb.traces[0].filters, [
    ["eq", "owner_email", "org:org-a"],
    ["eq", "id", segmentId],
    ["neq", "segment_type", "participant_template"],
  ]);
});

Deno.test("explicit template actions fail closed while capability is disabled", async () => {
  const db = new ScriptedSupabase();
  assertEquals(
    await callCarrierTemplateAction(
      db,
      { action: "get_carrier_list_template", id: vendorA.id },
      { enabled: false },
    ),
    {
      status: 404,
      body: {
        enabled: false,
        error: "Carrier list templates are not enabled.",
      },
    },
  );
  assertEquals(db.traces, []);
});

Deno.test("list is organization scoped and pagination is bounded", async () => {
  const db = new ScriptedSupabase([
    {
      table: "vendor_segments",
      operation: "select",
      data: [{ id: "template-a" }],
      count: 205,
    },
  ]);
  const result = await callCarrierTemplateAction(db, {
    action: "list_carrier_list_templates",
    organization_id: "org-b",
    lifecycle_status: "active",
    search: "Mexico",
    limit: 900,
    offset: 5,
  });
  assertEquals(result, {
    status: 200,
    body: {
      enabled: true,
      rows: [{ id: "template-a" }],
      total: 205,
      limit: 200,
      offset: 5,
      has_more: true,
    },
  });
  assertEquals(db.traces[0].filters, [
    ["eq", "organization_id", "org-a"],
    ["eq", "segment_type", "participant_template"],
    ["eq", "lifecycle_status", "active"],
    ["ilike", "segment_name", "%Mexico%"],
    ["order", "updated_at", { ascending: false }],
    ["range", "5", 204],
  ]);
});

Deno.test("template writes require raw-claim manage permission", async () => {
  for (const action of carrierTemplateActions.slice(3)) {
    const db = new ScriptedSupabase();
    const result = await callCarrierTemplateAction(
      db,
      { action },
      { enabled: true },
      { permissions: ["vendors:read"] },
    );
    assertEquals(result?.status, 403);
    assertEquals(db.traces, []);
  }
});

Deno.test("create rejects active-empty and foreign or missing members without revealing which", async () => {
  const emptyDb = new ScriptedSupabase();
  const empty = await callCarrierTemplateAction(emptyDb, {
    action: "create_carrier_list_template",
    template: {
      segment_name: "Empty Active",
      lifecycle_status: "active",
      vendor_ids: [],
    },
  });
  assertEquals(empty?.status, 400);
  assertEquals(emptyDb.traces, []);

  const foreignDb = new ScriptedSupabase([
    { table: "vendors", operation: "select", data: [] },
  ]);
  const foreignResult = await callCarrierTemplateAction(foreignDb, {
    action: "create_carrier_list_template",
    organization_id: "org-b",
    template: {
      segment_name: "Foreign",
      lifecycle_status: "active",
      organization_id: "org-b",
      vendor_ids: [foreign.id],
    },
  });
  assertEquals(foreignResult, {
    status: 400,
    body: {
      enabled: true,
      error:
        "One or more selected carriers are unavailable in this organization.",
    },
  });
  assertEquals(foreignDb.traces[0].filters, [
    ["eq", "organization_id", "org-a"],
    ["in", "id", [foreign.id]],
  ]);
});

Deno.test("create returns a stable duplicate-name conflict", async () => {
  const db = new ScriptedSupabase([
    { table: "vendors", operation: "select", data: [vendorA] },
    {
      table: "vendor_segments",
      operation: "select",
      data: [{ id: "existing", segment_name: "México Core" }],
    },
  ]);
  const result = await callCarrierTemplateAction(db, {
    action: "create_carrier_list_template",
    template: {
      segment_name: " Mexico   Core ",
      lifecycle_status: "active",
      vendor_ids: [vendorA.id],
    },
  });
  assertEquals(result?.status, 409);
  assertEquals(result?.body.enabled, true);
  assertEquals(result?.body.code, "template_name_conflict");
  assertEquals(db.traces.some((trace) => trace.operation === "insert"), false);
});

Deno.test("duplicate-name checks paginate beyond the first thousand templates", async () => {
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({
    id: `page-one-${index}`,
    segment_name: `Template ${index}`,
  }));
  const db = new ScriptedSupabase([
    { table: "vendors", operation: "select", data: [vendorA] },
    { table: "vendor_segments", operation: "select", data: firstPage },
    {
      table: "vendor_segments",
      operation: "select",
      data: [{ id: "page-two", segment_name: "México Core" }],
    },
  ]);
  const result = await callCarrierTemplateAction(db, {
    action: "create_carrier_list_template",
    template: {
      segment_name: " Mexico   Core ",
      lifecycle_status: "active",
      vendor_ids: [vendorA.id],
    },
  });
  assertEquals(result?.status, 409);
  assertEquals(
    db.traces.filter((trace) => trace.table === "vendor_segments").length,
    2,
  );
  assertEquals(db.traces.some((trace) => trace.operation === "insert"), false);
});

Deno.test("update uses an expected-version barrier and reports the current version without overwriting", async () => {
  const current = {
    id: "aaaaaaaa-1111-4111-8111-111111111111",
    segment_name: "Core",
    lifecycle_status: "active",
    status: "active",
    vendor_ids: [vendorA.id],
    template_version: 2,
    updated_at: "2026-08-25T10:00:00.000Z",
  };
  const raced = {
    ...current,
    template_version: 3,
    updated_at: "2026-08-25T10:01:00.000Z",
  };
  const db = new ScriptedSupabase([
    { table: "vendor_segments", operation: "select", data: current },
    {
      table: "vendor_segments",
      operation: "update",
      data: null,
      filters: [
        ["eq", "id", current.id],
        ["eq", "organization_id", "org-a"],
        ["eq", "segment_type", "participant_template"],
        ["eq", "template_version", 2],
      ],
    },
    { table: "vendor_segments", operation: "select", data: raced },
  ]);
  const result = await callCarrierTemplateAction(db, {
    action: "update_carrier_list_template",
    id: current.id,
    expected_version: 2,
    template: {
      segment_name: "Core",
      lifecycle_status: "active",
      vendor_ids: [vendorA.id],
    },
  });
  assertEquals(result, {
    status: 409,
    body: {
      enabled: true,
      code: "template_version_conflict",
      error: "Carrier list template changed since it was loaded.",
      current_version: 3,
      current_updated_at: raced.updated_at,
      template_id: current.id,
    },
  });
  assertEquals(
    db.traces.find((trace) => trace.operation === "update")?.filters,
    [
      ["eq", "id", current.id],
      ["eq", "organization_id", "org-a"],
      ["eq", "segment_type", "participant_template"],
      ["eq", "template_version", 2],
    ],
  );
});

Deno.test("create and update cannot bypass explicit archive or restore actions", async () => {
  const archivedCreateDb = new ScriptedSupabase();
  assertEquals(
    (await callCarrierTemplateAction(archivedCreateDb, {
      action: "create_carrier_list_template",
      template: {
        segment_name: "Already Archived",
        lifecycle_status: "archived",
        vendor_ids: [],
      },
    }))?.status,
    400,
  );
  assertEquals(archivedCreateDb.traces, []);

  const templateId = "aaaaaaaa-1111-4111-8111-111111111111";
  for (
    const [currentLifecycle, requestedLifecycle] of [
      ["active", "archived"],
      ["archived", "active"],
    ]
  ) {
    const current = {
      id: templateId,
      segment_name: "Core",
      lifecycle_status: currentLifecycle,
      status: currentLifecycle,
      vendor_ids: [vendorA.id],
      template_version: 2,
    };
    const db = new ScriptedSupabase([
      { table: "vendor_segments", operation: "select", data: current },
    ]);
    const result = await callCarrierTemplateAction(db, {
      action: "update_carrier_list_template",
      id: templateId,
      expected_version: 2,
      template: {
        segment_name: "Core",
        lifecycle_status: requestedLifecycle,
        vendor_ids: [vendorA.id],
      },
    });
    assertEquals(result?.status, 400);
    assertEquals(
      db.traces.some((trace) => trace.operation === "update"),
      false,
    );
  }
});

Deno.test("member changes validate additions only and write UUID-only diff audits", async () => {
  const templateId = "aaaaaaaa-1111-4111-8111-111111111111";
  const current = {
    id: templateId,
    segment_name: "Core",
    lifecycle_status: "active",
    status: "active",
    vendor_ids: [vendorA.id, vendorB.id],
    template_version: 1,
    updated_at: "2026-08-25T10:00:00.000Z",
  };
  const updated = {
    ...current,
    vendor_ids: [vendorB.id, vendorC.id],
    template_version: 2,
  };
  const db = new ScriptedSupabase([
    { table: "vendor_segments", operation: "select", data: current },
    { table: "vendors", operation: "select", data: [vendorC] },
    { table: "vendor_segments", operation: "update", data: updated },
    { table: "saas_audit_log", operation: "insert", data: null },
    { table: "saas_audit_log", operation: "insert", data: null },
  ]);
  const result = await callCarrierTemplateAction(db, {
    action: "update_carrier_list_template",
    id: templateId,
    expected_version: 1,
    template: {
      segment_name: "Core",
      lifecycle_status: "active",
      vendor_ids: [vendorB.id, vendorC.id],
    },
  });
  assertEquals(result?.status, 200);
  const vendorLookup = db.traces.find((trace) => trace.table === "vendors");
  assertEquals(vendorLookup?.filters, [
    ["eq", "organization_id", "org-a"],
    ["in", "id", [vendorC.id]],
  ]);
  const auditRows = db.traces
    .filter((trace) => trace.table === "saas_audit_log")
    .map((trace) => trace.payload as Record<string, unknown>);
  assertEquals(auditRows.map((row) => row.action), [
    "carrier_template.add_members",
    "carrier_template.remove_members",
  ]);
  assertEquals(
    auditRows.map((row) =>
      (row.metadata as Record<string, unknown>).added_vendor_ids ??
        (row.metadata as Record<string, unknown>).removed_vendor_ids
    ),
    [[vendorC.id], [vendorA.id]],
  );
});

Deno.test("duplicate copies ordered members into a new draft", async () => {
  const source = {
    id: "aaaaaaaa-1111-4111-8111-111111111111",
    segment_name: "Source",
    lifecycle_status: "active",
    status: "active",
    vendor_ids: [vendorB.id, vendorA.id],
    template_version: 4,
  };
  const duplicate = {
    ...source,
    id: "bbbbbbbb-2222-4222-8222-222222222222",
    segment_name: "Source Copy",
    lifecycle_status: "draft",
    status: "draft",
    template_version: 1,
  };
  const db = new ScriptedSupabase([
    {
      table: "rateware_duplicate_carrier_list_template",
      operation: "rpc",
      data: [{ outcome: "success", row_data: duplicate }],
    },
    { table: "saas_audit_log", operation: "insert", data: null },
  ]);
  const result = await callCarrierTemplateAction(db, {
    action: "duplicate_carrier_list_template",
    id: source.id,
    name: "Source Copy",
    expected_version: 4,
  });
  assertEquals(result, {
    status: 201,
    body: { enabled: true, row: duplicate },
  });
  const rpc = db.traces.find((trace) => trace.operation === "rpc");
  assertEquals(rpc?.payload, {
    p_organization_id: "org-a",
    p_source_template_id: source.id,
    p_expected_version: 4,
    p_name: "Source Copy",
    p_owner_user_id: "kp_1",
    p_owner_email: "org:org-a",
    p_actor_user_id: "kp_1",
    p_actor_email: "buyer@example.com",
  });
});

Deno.test("archive and restore increment versions while restore preserves missing member ids", async () => {
  const templateId = "aaaaaaaa-1111-4111-8111-111111111111";
  const missingId = "99999999-9999-4999-8999-999999999999";
  const active = {
    id: templateId,
    segment_name: "Core",
    lifecycle_status: "active",
    status: "active",
    vendor_ids: [vendorA.id, missingId],
    template_version: 4,
  };
  const archived = {
    ...active,
    lifecycle_status: "archived",
    status: "archived",
    template_version: 5,
  };
  for (const action of [
    "archive_carrier_list_template",
    "restore_carrier_list_template",
  ]) {
    const staleDb = new ScriptedSupabase([{
      table: "vendor_segments",
      operation: "select",
      data: action === "archive_carrier_list_template" ? active : archived,
    }]);
    const stale = await callCarrierTemplateAction(staleDb, {
      action,
      id: templateId,
      expected_version: 3,
    });
    assertEquals(stale?.status, 409);
    assertEquals(stale?.body.code, "template_version_conflict");
    assertEquals(staleDb.traces.some((trace) => trace.operation === "update"), false);
    assertEquals(staleDb.traces.some((trace) => trace.table === "saas_audit_log"), false);
  }
  const archiveDb = new ScriptedSupabase([
    { table: "vendor_segments", operation: "select", data: active },
    {
      table: "vendor_segments",
      operation: "update",
      data: archived,
      filters: [
        ["eq", "id", templateId],
        ["eq", "organization_id", "org-a"],
        ["eq", "segment_type", "participant_template"],
        ["eq", "template_version", 4],
      ],
    },
    { table: "saas_audit_log", operation: "insert", data: null },
  ]);
  assertEquals(
    await callCarrierTemplateAction(archiveDb, {
      action: "archive_carrier_list_template",
      id: templateId,
      expected_version: 4,
    }),
    { status: 200, body: { enabled: true, row: archived } },
  );

  const restored = {
    ...active,
    template_version: 6,
  };
  const restoreDb = new ScriptedSupabase([
    { table: "vendor_segments", operation: "select", data: archived },
    { table: "vendors", operation: "select", data: [vendorA] },
    {
      table: "vendor_segments",
      operation: "update",
      data: restored,
      filters: [
        ["eq", "id", templateId],
        ["eq", "organization_id", "org-a"],
        ["eq", "segment_type", "participant_template"],
        ["eq", "template_version", 5],
      ],
    },
    { table: "saas_audit_log", operation: "insert", data: null },
  ]);
  assertEquals(
    await callCarrierTemplateAction(restoreDb, {
      action: "restore_carrier_list_template",
      id: templateId,
      expected_version: 5,
    }),
    { status: 200, body: { enabled: true, row: restored } },
  );
  const restorePatch = restoreDb.traces.find((trace) =>
    trace.table === "vendor_segments" && trace.operation === "update"
  )?.payload as Record<string, unknown>;
  assertEquals(restorePatch.vendor_ids, [vendorA.id, missingId]);
  assertEquals(restorePatch.template_version, 6);
  assertEquals(
    archiveDb.traces.find((trace) => trace.operation === "update")?.filters,
    [
      ["eq", "id", templateId],
      ["eq", "organization_id", "org-a"],
      ["eq", "segment_type", "participant_template"],
      ["eq", "template_version", 4],
    ],
  );
  assertEquals(
    restoreDb.traces.find((trace) => trace.operation === "update")?.filters,
    [
      ["eq", "id", templateId],
      ["eq", "organization_id", "org-a"],
      ["eq", "segment_type", "participant_template"],
      ["eq", "template_version", 5],
    ],
  );
});

Deno.test("get returns the same 404 for absent or foreign organization ids", async () => {
  const db = new ScriptedSupabase([
    { table: "vendor_segments", operation: "select", data: null },
  ]);
  const result = await callCarrierTemplateAction(db, {
    action: "get_carrier_list_template",
    id: foreign.id,
    organization_id: "org-b",
  });
  assertEquals(result, {
    status: 404,
    body: { enabled: true, error: "Carrier list template was not found." },
  });
  assertEquals(db.traces[0].filters, [
    ["eq", "id", foreign.id],
    ["eq", "organization_id", "org-a"],
    ["eq", "segment_type", "participant_template"],
  ]);
});

Deno.test("get audits only the recognized carrier-fit usage context", async () => {
  const template = {
    id: "aaaaaaaa-1111-4111-8111-111111111111",
    vendor_ids: [vendorA.id],
    template_version: 3,
  };
  const db = new ScriptedSupabase([
    { table: "vendor_segments", operation: "select", data: template },
    { table: "saas_audit_log", operation: "insert", data: null },
  ]);
  assertEquals(
    await callCarrierTemplateAction(db, {
      action: "get_carrier_list_template",
      id: template.id,
      usage_context: "carrier_fit",
    }),
    { status: 200, body: { enabled: true, row: template } },
  );
  const audit = db.traces.find((trace) => trace.table === "saas_audit_log");
  assertEquals(
    (audit?.payload as Record<string, unknown>).action,
    "carrier_template.load_in_carrier_fit",
  );

  const invalidDb = new ScriptedSupabase();
  assertEquals(
    (await callCarrierTemplateAction(invalidDb, {
      action: "get_carrier_list_template",
      id: template.id,
      usage_context: "rfx",
    }))?.status,
    400,
  );
  assertEquals(invalidDb.traces, []);
});

Deno.test("resolve is read-only for vendors and keeps name-only matches manual", async () => {
  const db = new ScriptedSupabase([
    { table: "vendors", operation: "select", data: [vendorA] },
    { table: "saas_audit_log", operation: "insert", data: null },
  ]);
  const result = await callCarrierTemplateAction(db, {
    action: "resolve_carrier_list_template_rows",
    rows: [{ source_row_number: 2, vendor_name: "Border Haul" }],
  });
  assertEquals(result?.status, 200);
  assertEquals(
    (result?.body.rows as Array<Record<string, unknown>>)[0],
    {
      source_row_number: 2,
      status: "ambiguous",
      reason: "name_candidate",
      vendor_id: null,
      candidate_vendor_ids: [vendorA.id],
      requires_manual_confirmation: true,
    },
  );
  const vendorQueries = db.traces.filter((trace) => trace.table === "vendors");
  assertEquals(vendorQueries.length, 1);
  assertEquals(vendorQueries[0].operation, "select");
  assertEquals(vendorQueries[0].filters.filter((filter) => filter[0] !== "lte"), [
    ["eq", "organization_id", "org-a"],
    ["order", "id", { ascending: true }],
    ["limit", "", 1000],
  ]);
  const snapshotFilter = vendorQueries[0].filters.find((filter) => filter[0] === "lte");
  assertEquals(snapshotFilter?.[1], "created_at");
  assertEquals(typeof snapshotFilter?.[2], "string");
  const audit = db.traces.find((trace) => trace.table === "saas_audit_log");
  assertEquals(
    (audit?.payload as Record<string, unknown>).action,
    "carrier_template.resolve_import",
  );
  const metadata = (audit?.payload as Record<string, unknown>)
    .metadata as Record<string, unknown>;
  assertEquals(metadata, {
    template_id: null,
    total: 1,
    matched: 0,
    ambiguous: 1,
    not_found: 0,
    duplicates: 0,
  });
});

Deno.test("resolver scans a fixed-snapshot organization keyset until a match beyond page one is reached", async () => {
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    organization_id: "org-a",
    vendor_name: `Page one ${index}`,
  }));
  const db = new ScriptedSupabase([
    { table: "vendors", operation: "select", data: firstPage },
    { table: "vendors", operation: "select", data: [vendorA] },
    { table: "saas_audit_log", operation: "insert", data: null },
  ]);
  const result = await callCarrierTemplateAction(db, {
    action: "resolve_carrier_list_template_rows",
    rows: [
      { source_row_number: 8, vendor_id: vendorA.id },
      { source_row_number: 9, vendor_id: firstPage[10].id },
      { source_row_number: 10, vendor_id: vendorA.id },
    ],
  });
  assertEquals(result?.status, 200);
  assertEquals(
    (result?.body.rows as Array<Record<string, unknown>>).map((row) => [
      row.source_row_number,
      row.status,
      row.vendor_id,
    ]),
    [
      [8, "matched", vendorA.id],
      [9, "matched", firstPage[10].id],
      [10, "duplicate", null],
    ],
  );
  const vendorQueries = db.traces.filter((trace) => trace.table === "vendors");
  const firstSnapshot = vendorQueries[0].filters.find((filter) => filter[0] === "lte")?.[2];
  assertEquals(typeof firstSnapshot, "string");
  assertEquals(vendorQueries.map((trace) => trace.filters), [
    [
      ["eq", "organization_id", "org-a"],
      ["lte", "created_at", firstSnapshot],
      ["order", "id", { ascending: true }],
      ["limit", "", 1000],
    ],
    [
      ["eq", "organization_id", "org-a"],
      ["lte", "created_at", firstSnapshot],
      ["gt", "id", firstPage[999].id],
      ["order", "id", { ascending: true }],
      ["limit", "", 1000],
    ],
  ]);
  assertEquals(vendorQueries.some((trace) => trace.filters.some((filter) => filter[0] === "range")), false);
});

Deno.test("resolver accepts the exact safety ceiling and rejects only a sentinel beyond it", async () => {
  const fetchResolver = ratewareApi.fetchCarrierTemplateResolverVendors as (
    supabase: unknown,
    organizationId: string,
    options: { pageSize: number; safetyLimit: number; snapshotAt: string },
  ) => Promise<Array<Record<string, unknown>>>;
  const pageOne = [
    { id: "10000000-0000-4000-8000-000000000001", organization_id: "org-a" },
    { id: "10000000-0000-4000-8000-000000000002", organization_id: "org-a" },
  ];
  const pageTwo = [
    { id: "10000000-0000-4000-8000-000000000003", organization_id: "org-a" },
    { id: "10000000-0000-4000-8000-000000000004", organization_id: "org-a" },
  ];
  const exact = new ScriptedSupabase([
    { table: "vendors", operation: "select", data: pageOne },
    { table: "vendors", operation: "select", data: pageTwo },
    { table: "vendors", operation: "select", data: [] },
  ]);
  assertEquals(
    (await fetchResolver(exact, "org-a", {
      pageSize: 2,
      safetyLimit: 4,
      snapshotAt: "2026-08-26T00:00:00.000Z",
    })).map((row: Record<string, unknown>) => row.id),
    [...pageOne, ...pageTwo].map((row) => row.id),
  );
  assertEquals(exact.traces.at(-1)?.filters, [
    ["eq", "organization_id", "org-a"],
    ["lte", "created_at", "2026-08-26T00:00:00.000Z"],
    ["gt", "id", pageTwo[1].id],
    ["order", "id", { ascending: true }],
    ["limit", "", 1],
  ]);

  const over = new ScriptedSupabase([
    { table: "vendors", operation: "select", data: pageOne },
    { table: "vendors", operation: "select", data: pageTwo },
    { table: "vendors", operation: "select", data: [{ id: "10000000-0000-4000-8000-000000000005" }] },
  ]);
  await assertRejects(
    () => fetchResolver(over, "org-a", {
      pageSize: 2,
      safetyLimit: 4,
      snapshotAt: "2026-08-26T00:00:00.000Z",
    }),
    Error,
    "exceeded the 4-vendor safety limit",
  );
  assertEquals(ratewareApi.CARRIER_TEMPLATE_RESOLVER_VENDOR_SAFETY_LIMIT, 200000);
});

Deno.test("resolver keyset tolerates insert/delete page shifts without skipping or duplicating later matches", async () => {
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({
    id: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    organization_id: "org-a",
    vendor_name: `Snapshot page one ${index}`,
  }));
  const laterMatch = {
    ...vendorA,
    id: "40000000-0000-4000-8000-000000000001",
  };
  // Between calls the conceptual source deletes an early row and inserts a
  // post-snapshot row. The scripted second page contains only ids beyond the
  // first cursor; no offset shift can hide laterMatch or duplicate page one.
  const db = new ScriptedSupabase([
    { table: "vendors", operation: "select", data: firstPage },
    { table: "vendors", operation: "select", data: [laterMatch] },
    { table: "saas_audit_log", operation: "insert", data: null },
  ]);
  const result = await callCarrierTemplateAction(db, {
    action: "resolve_carrier_list_template_rows",
    rows: [{ source_row_number: 2, vendor_id: laterMatch.id }],
  });
  assertEquals(result?.status, 200);
  assertEquals((result?.body.rows as Array<Record<string, unknown>>)[0].vendor_id, laterMatch.id);
  const vendorQueries = db.traces.filter((trace) => trace.table === "vendors");
  assertEquals(vendorQueries[1].filters.some((filter) =>
    filter[0] === "gt" && filter[1] === "id" && filter[2] === firstPage[999].id
  ), true);
  assertEquals(vendorQueries[1].filters.some((filter) => filter[0] === "range"), false);
});

Deno.test("legacy participant-template reads switch from owner to organization only when enabled", () => {
  const scope = ratewareApi.carrierTemplateLegacyReadScope;
  assertEquals(typeof scope, "function");
  if (typeof scope !== "function") return;
  assertEquals(scope(false, "participant_template", workspaceUser), {
    column: "owner_email",
    value: "org:org-a",
  });
  assertEquals(scope(true, "participant_template", workspaceUser), {
    column: "organization_id",
    value: "org-a",
  });
  assertEquals(scope(true, "dynamic", workspaceUser), null);
});

Deno.test("legacy participant-template mutations are blocked only after enablement", () => {
  const blocked = ratewareApi.carrierTemplateLegacyMutationBlocked;
  assertEquals(typeof blocked, "function");
  if (typeof blocked !== "function") return;
  assertEquals(blocked(false, "participant_template", null), false);
  assertEquals(blocked(true, "participant_template", null), true);
  assertEquals(blocked(true, "dynamic", "participant_template"), true);
  assertEquals(blocked(true, "dynamic", "dynamic"), false);
});
