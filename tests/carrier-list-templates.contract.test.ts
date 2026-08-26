import {
  assert,
  assertEquals,
  assertStrictEquals,
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

let registeredHandler: ((request: Request) => Promise<Response>) | null = null;
const originalServe = Deno.serve;
const originalCarrierTemplateFlag = Deno.env.get(
  "CARRIER_LIST_TEMPLATES_V2_ENABLED",
);
Deno.env.delete("CARRIER_LIST_TEMPLATES_V2_ENABLED");
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

type ScriptedResponse = {
  table: string;
  operation: string;
  data?: unknown;
  error?: unknown;
  count?: number | null;
};

type QueryTrace = {
  table: string;
  operation: string;
  payload?: unknown;
  filters: Array<[string, string, unknown]>;
};

class ScriptedSupabase {
  responses: ScriptedResponse[];
  traces: QueryTrace[] = [];

  constructor(responses: ScriptedResponse[] = []) {
    this.responses = [...responses];
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

  take(trace: QueryTrace) {
    const response = this.responses.shift();
    assert(response, `Unexpected ${trace.table}.${trace.operation} query`);
    assertEquals(response.table, trace.table);
    assertEquals(response.operation, trace.operation);
    return Promise.resolve({
      data: response.data ?? null,
      error: response.error ?? null,
      count: response.count ?? null,
    });
  }
}

class ScriptedQuery {
  constructor(
    private readonly db: ScriptedSupabase,
    private readonly trace: QueryTrace,
  ) {}

  select(_columns?: string, _options?: Record<string, unknown>) {
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

  delete() {
    this.trace.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.trace.filters.push(["eq", column, value]);
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
    { table: "vendor_segments", operation: "update", data: null },
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
      error: "Carrier list template changed since it was loaded.",
      current_version: 3,
      current_updated_at: raced.updated_at,
      template_id: current.id,
    },
  });
  assert(
    db.traces.some((trace) =>
      trace.operation === "update" &&
      trace.filters.some((filter) =>
        filter[0] === "eq" && filter[1] === "template_version" &&
        filter[2] === 2
      )
    ),
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
    { table: "vendor_segments", operation: "select", data: source },
    { table: "vendors", operation: "select", data: [vendorA, vendorB] },
    { table: "vendor_segments", operation: "select", data: [] },
    { table: "vendor_segments", operation: "insert", data: duplicate },
    { table: "saas_audit_log", operation: "insert", data: null },
  ]);
  const result = await callCarrierTemplateAction(db, {
    action: "duplicate_carrier_list_template",
    id: source.id,
    segment_name: "Source Copy",
  });
  assertEquals(result, {
    status: 201,
    body: { enabled: true, row: duplicate },
  });
  const insert = db.traces.find((trace) =>
    trace.table === "vendor_segments" && trace.operation === "insert"
  );
  const payload = insert?.payload as Record<string, unknown>;
  assertEquals(payload.lifecycle_status, "draft");
  assertEquals(payload.vendor_ids, [vendorB.id, vendorA.id]);
  assertEquals(payload.organization_id, "org-a");
  assertEquals(payload.owner_user_id, "kp_1");
  assertEquals(payload.owner_email, "org:org-a");
  assertEquals(payload.created_by_email, "buyer@example.com");
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
  const archiveDb = new ScriptedSupabase([
    { table: "vendor_segments", operation: "select", data: active },
    { table: "vendor_segments", operation: "update", data: archived },
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
    { table: "vendor_segments", operation: "update", data: restored },
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
  assertEquals(vendorQueries[0].filters, [["eq", "organization_id", "org-a"]]);
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
