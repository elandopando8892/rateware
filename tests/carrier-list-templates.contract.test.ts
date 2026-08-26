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
import { normalizeCarrierTemplateRows } from "../src/carrier-list-template-file.js";

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
  count?: number | null;
  filters?: QueryTrace["filters"];
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
    const response = this.responses.shift();
    assert(response, `Unexpected ${trace.table}.${trace.operation} query`);
    assertEquals(response.table, trace.table);
    assertEquals(response.operation, trace.operation);
    if (response.filters) assertEquals(trace.filters, response.filters);
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
