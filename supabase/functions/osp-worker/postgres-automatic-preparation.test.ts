import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import type { SqlPort, SqlRow } from "../_shared/osp/database-context.ts";
import type { AutomaticPreparationPlan } from "./automatic-preparation.ts";
import { createPostgresAutomaticPreparationStore } from "./postgres-automatic-preparation.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const extractionId = "33333333-3333-4333-8333-333333333333";
const templateVersionId = "44444444-4444-4444-8444-444444444444";

function queryText(strings: TemplateStringsArray): string {
  return strings.join("?").replace(/\s+/g, " ").trim().toLowerCase();
}

function fakeDatabase(initialState = "received") {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const events: Array<{ state: string; reason: string }> = [];
  let state = initialState;
  let aggregateVersion = 1;
  let mapping: SqlRow | null = null;
  let instance: SqlRow | null = null;
  let extractionValue = "X Border Freight";

  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = queryText(strings);
      calls.push({ text, values });
      if (
        text.startsWith("set local role") || text.includes("set_config(") ||
        text.includes("pg_advisory_xact_lock")
      ) return [];
      if (
        text.startsWith(
          "select id from osp_private.customer_registration_cases",
        )
      ) return [{ id: caseId }];
      if (
        text.startsWith("select id from osp_private.form_template_versions")
      ) {
        return [{ id: templateVersionId }];
      }
      if (text.startsWith("select id from osp_private.document_extractions")) {
        return [{ id: extractionId }];
      }
      if (text.startsWith("select field_key, definition_json")) {
        return [{
          field_key: "legal_name",
          definition_json: {
            required: true,
            canonicalFieldId: "supplier.legalName",
            supplierAliases: ["Legal name"],
          },
        }];
      }
      if (
        text.startsWith(
          "select field_key, value_json, evidence_id from osp_private.load_xbf_customer_setup_candidates",
        )
      ) {
        return [{
          field_key: "supplier.legalName",
          value_json: "X Border Freight",
          evidence_id:
            "rateware:legal-entity-fact:66666666-6666-4666-8666-666666666666",
        }];
      }
      if (text.startsWith("select id, field_key, presence")) {
        return [{
          id: "55555555-5555-4555-8555-555555555555",
          field_key: "Legal name",
          presence: "present",
          value_json: extractionValue,
          confidence: "0.98",
          validation: "valid",
        }];
      }
      if (
        text.startsWith(
          "select values_json from osp_private.case_form_instances",
        )
      ) {
        return instance ? [{ values_json: instance.values_json }] : [];
      }
      if (text.startsWith("select id, version, status, mapping_json")) {
        return mapping ? [mapping] : [];
      }
      if (text.startsWith("insert into osp_private.supplier_form_mappings")) {
        mapping = {
          id: values[0],
          version: 1,
          status: "unresolved",
          mapping_json: JSON.parse(String(values[5])),
          after_sha256: values[7],
        };
        return [];
      }
      if (text.startsWith("update osp_private.supplier_form_mappings")) {
        if (!mapping) throw new Error("mapping missing");
        mapping = {
          ...mapping,
          mapping_json: JSON.parse(String(values[0])),
          after_sha256: values[2],
          version: Number(mapping.version) + 1,
        };
        return [];
      }
      if (text.startsWith("select instance.id")) {
        return instance ? [instance] : [];
      }
      if (text.startsWith("insert into osp_private.case_form_instances")) {
        instance = {
          id: values[0],
          version: 1,
          values_json: JSON.parse(String(values[4])),
          consumed: false,
        };
        return [];
      }
      if (text.startsWith("update osp_private.case_form_instances")) {
        if (!instance) throw new Error("instance missing");
        instance = {
          ...instance,
          values_json: JSON.parse(String(values[0])),
          version: Number(instance.version) + 1,
        };
        return [];
      }
      if (
        text.startsWith(
          "select state from osp_private.customer_registration_cases",
        )
      ) {
        return [{ state }];
      }
      if (text.startsWith("select aggregate_version")) {
        const expectedState = String(values[2]);
        return expectedState === state
          ? [{ aggregate_version: aggregateVersion }]
          : [];
      }
      if (text.startsWith("update osp_private.customer_registration_cases")) {
        const nextState = String(values[0]);
        const expectedState = String(values[3]);
        const expectedVersion = Number(values[4]);
        if (state !== expectedState || aggregateVersion !== expectedVersion) {
          return [];
        }
        state = nextState;
        aggregateVersion += 1;
        return [{ aggregate_version: aggregateVersion }];
      }
      if (text.startsWith("insert into osp_private.case_events")) {
        events.push({ state: String(values[4]), reason: String(values[6]) });
        return [];
      }
      throw new Error(`unexpected query: ${text}`);
    },
    {
      begin: async <T>(operation: (transaction: SqlPort) => Promise<T>) =>
        await operation(sql as SqlPort),
    },
  ) as SqlPort;

  return {
    sql,
    calls,
    events,
    state: () => state,
    mapping: () => mapping,
    instance: () => instance,
    setExtractionValue: (value: string) => {
      extractionValue = value;
    },
  };
}

const readyPlan: AutomaticPreparationPlan = {
  status: "ready_for_operations_review",
  values: { legal_name: "X Border Freight" },
  fields: [{
    fieldId: "legal_name",
    source: "rateware",
    status: "prepared",
    evidenceIds: [
      "55555555-5555-4555-8555-555555555555",
      "rateware:legal-entity-fact:66666666-6666-4666-8666-666666666666",
    ],
  }],
  externalEffects: false,
};

Deno.test("postgres preparation loads published fields and grounded extraction candidates", async () => {
  const fake = fakeDatabase();
  const store = createPostgresAutomaticPreparationStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => fake.sql,
  });
  const loaded = await store.load({
    organizationId,
    caseId,
    extractionId,
    templateVersionId,
  });
  assertEquals(loaded.fields, [{
    fieldId: "legal_name",
    canonicalFieldId: "supplier.legalName",
    supplierAliases: ["Legal name"],
    required: true,
  }]);
  assertEquals(loaded.candidates, [
    {
      fieldKey: "supplier.legalName",
      value: "X Border Freight",
      source: "rateware",
      confidence: 1,
      validation: "valid",
      evidenceIds: [
        "rateware:legal-entity-fact:66666666-6666-4666-8666-666666666666",
      ],
    },
    {
      fieldKey: "Legal name",
      value: "X Border Freight",
      source: "attachment",
      confidence: 0.98,
      validation: "valid",
      evidenceIds: ["55555555-5555-4555-8555-555555555555"],
    },
  ]);
});

Deno.test("postgres preparation persists a reviewable draft and stops at preparing", async () => {
  const fake = fakeDatabase();
  const store = createPostgresAutomaticPreparationStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => fake.sql,
  });
  await store.persist({
    organizationId,
    correlationId: "job-1",
    caseId,
    extractionId,
    templateVersionId,
    plan: readyPlan,
  });
  assertEquals(fake.state(), "preparing");
  assertEquals(fake.instance()?.values_json, {
    legal_name: "X Border Freight",
  });
  const mappingJson = fake.mapping()?.mapping_json as
    | Record<string, unknown>
    | undefined;
  assertEquals(mappingJson?.externalEffects, false);
  assertEquals(
    mappingJson?.status,
    "ready_for_operations_review",
  );
  assertEquals(fake.events, [
    {
      state: "analyzing_requirements",
      reason: "requirements_analysis_started",
    },
    { state: "preparing", reason: "preparation_started" },
  ]);
  assertEquals(
    fake.calls.some((call) => call.text.includes("operations_review")),
    false,
  );
});

Deno.test("postgres preparation refuses to rewrite a human-governed downstream case", async () => {
  const fake = fakeDatabase("operations_review");
  const store = createPostgresAutomaticPreparationStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => fake.sql,
  });
  await assertRejects(
    () =>
      store.persist({
        organizationId,
        correlationId: "job-2",
        caseId,
        extractionId,
        templateVersionId,
        plan: readyPlan,
      }),
    Error,
    "INVALID_INPUT",
  );
});

Deno.test("postgres preparation rejects a stale plan when source evidence changed", async () => {
  const fake = fakeDatabase();
  const store = createPostgresAutomaticPreparationStore({
    databaseUrl: "postgresql://synthetic.example.test/db",
    postgresFactory: () => fake.sql,
  });
  fake.setExtractionValue("X Border Freight Updated");
  await assertRejects(
    () =>
      store.persist({
        organizationId,
        correlationId: "job-3",
        caseId,
        extractionId,
        templateVersionId,
        plan: readyPlan,
      }),
    Error,
    "VERSION_CONFLICT",
  );
  assertEquals(fake.mapping(), null);
  assertEquals(fake.instance(), null);
  assertEquals(fake.events, []);
});
