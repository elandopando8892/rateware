import { assertEquals } from "jsr:@std/assert@1.0.14";

import { XBF_STARTER_SURVEY } from "../../../apps/osp/src/features/forms/xbf-starter-survey.ts";
import { surveyJsonToCanonical } from "../../../apps/osp/src/features/forms/surveyjs-canonical-adapter.ts";

Deno.test("XBF starter remains the canonical four-field production template", async () => {
  const canonical = await surveyJsonToCanonical(XBF_STARTER_SURVEY, {
    templateId: "11111111-1111-4111-8111-111111111111",
    versionId: "22222222-2222-4222-8222-222222222222",
    version: 1,
    status: "published",
    canonicalFieldIds: [
      "supplier.legalName",
      "supplier.address",
      "fiscal.taxIdentifier",
      "banking.accountNumber",
    ],
  });
  assertEquals(
    canonical.schemaSha256,
    "9ff92b2e6090a2f716dd1d582f9a9f979b81a92a5964c6b1b6bb033c2bcca684",
  );
  assertEquals(
    canonical.fields.map((field) => ({
      id: field.id,
      canonicalFieldId: field.canonicalFieldId,
      required: field.required,
    })),
    [
      {
        id: "legal_name",
        canonicalFieldId: "supplier.legalName",
        required: true,
      },
      {
        id: "tax_identifier",
        canonicalFieldId: "fiscal.taxIdentifier",
        required: true,
      },
      {
        id: "registered_address",
        canonicalFieldId: "supplier.address",
        required: true,
      },
      {
        id: "bank_account",
        canonicalFieldId: "banking.accountNumber",
        required: true,
      },
    ],
  );
});
