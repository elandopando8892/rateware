import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// carrier-profile-api is reached with a private link by the carrier. These
// checks pin what that link can read and change.
const source = readFileSync(new URL("../supabase/functions/carrier-profile-api/index.ts", import.meta.url), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const open = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unable to extract ${name}`);
}

function extractConst(name) {
  const match = source.match(new RegExp(`const ${name} = [^;]+;`));
  assert.ok(match, `${name} must exist`);
  return match[0];
}

// Just enough type stripping for the annotations these helpers use.
const stripTypes = (code) =>
  code
    .replace(/:\s*\[string, string\]\[\]/g, "")
    .replace(/:\s*Record<string, Record<string, unknown>>/g, "")
    .replace(/:\s*Record<string, unknown>/g, "")
    .replace(/\b([a-zA-Z]+): unknown\b/g, "$1")
    .replace(/\s+as\s+string\[\]/g, "")
    .replace(/\s+as\s+Record<string, unknown>/g, "");

const helpers = [
  "cleanText",
  "objectRecord",
  "normalizeArray",
  "normalizeProfileData",
  "clearedProfileFields",
  "mergeProfileData",
  "carrierNotes",
  "withCarrierNotes",
  "publicVendor"
].map((name) => stripTypes(extractFunction(name)));

const api = Function(`
  ${stripTypes(extractConst("CARRIER_NOTES_SECTION"))}
  ${stripTypes(extractConst("CARRIER_NOTES_FIELD"))}
  ${helpers.join("\n")}
  return { mergeProfileData, withCarrierNotes, publicVendor };
`)();

// 1. Internal notes never reach the carrier.
{
  const vendor = api.publicVendor({
    id: "v1",
    notes: "Interno: no pagar antes de 60 dias | Source ID: apollo-123",
    profile_data: { general: { carrier_notes: "Tenemos 12 cajas secas" } }
  });
  assert.equal(vendor.notes, "Tenemos 12 cajas secas");
  assert.ok(!JSON.stringify(vendor).includes("Interno"), "internal notes must not be returned");
  assert.ok(!JSON.stringify(vendor).includes("apollo-123"), "system markers must not be returned");
}

// 2. What the carrier writes as "notes" lands in the profile, not vendors.notes.
{
  const submitHandler = source.slice(source.indexOf('action === "submit_profile"'), source.indexOf('action === "add_ticket_followup"'));
  assert.doesNotMatch(submitHandler, /patch\.notes\s*=/, "submit_profile must not write vendors.notes");
  const merged = api.mergeProfileData(
    { identity: { rfc: "AAA010101AAA" } },
    api.withCarrierNotes({ identity: { usdot_number: "123" } }, "Operamos 24/7")
  );
  assert.deepEqual(merged, {
    identity: { rfc: "AAA010101AAA", usdot_number: "123" },
    general: { carrier_notes: "Operamos 24/7" }
  });
}

// 3. Name and email are never erased by a blank box.
{
  const submitHandler = source.slice(source.indexOf('action === "submit_profile"'), source.indexOf('action === "add_ticket_followup"'));
  assert.match(submitHandler, /if \(vendorName\) patch\.vendor_name = vendorName;/);
  assert.match(submitHandler, /if \(primaryEmail\) patch\.primary_email = primaryEmail;/);
}

// 4. An answer sent empty is cleared; an answer not sent is kept.
{
  const base = {
    identity: { rfc: "AAA010101AAA", usdot_number: "123" },
    carrier_profile: { geographic_scope: ["Mexico", "Canada"] },
    payments: { bank_name: "Banco" }
  };
  const merged = api.mergeProfileData(base, {
    identity: { usdot_number: "" },
    carrier_profile: { geographic_scope: [] }
  });
  assert.deepEqual(merged, {
    identity: { rfc: "AAA010101AAA" },
    payments: { bank_name: "Banco" }
  });
  // rateware's page never sends empty answers, so its saves keep everything.
  assert.deepEqual(api.mergeProfileData(base, { identity: { rfc: "BBB010101BBB" } }), {
    ...base,
    identity: { rfc: "BBB010101BBB", usdot_number: "123" }
  });
}

console.log("Carrier profile privacy tests passed (internal notes, name/email guard, explicit clears).");
