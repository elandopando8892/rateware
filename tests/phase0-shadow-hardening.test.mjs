import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { executeCatalogSyncPlan } from "../supabase/functions/_shared/catalog-sync-plan.mjs";
import { decideServiceFromResolution, resolveServiceEvidence, serviceEvidenceFromParts, serviceFromNormalizedText } from "../supabase/functions/_shared/service-normalization.mjs";

assert.equal(serviceFromNormalizedText("One Way per rule: single price without RT marker"), "One Way");
assert.equal(serviceFromNormalizedText("no explicit Round Trip marker; use One Way"), "One Way");
assert.equal(serviceFromNormalizedText("RT marker visible"), "Roundtrip");
assert.equal(serviceFromNormalizedText("Round Trip explicitly quoted"), "Roundtrip");
assert.equal(serviceFromNormalizedText("Round Trip explicitly quoted; no RT surcharge"), "Roundtrip");
assert.equal(serviceFromNormalizedText("RT marker visible; no RT accessorial"), "Roundtrip");
assert.equal(serviceFromNormalizedText("RT marker visible, no RT surcharge"), "Roundtrip");
assert.equal(serviceFromNormalizedText("Round Trip explicitly quoted, no accessorial fee"), "Roundtrip");
assert.equal(serviceFromNormalizedText("RT marker visible; One Way note says without RT marker"), "Roundtrip");
assert.equal(serviceFromNormalizedText("One Way; without RT surcharge"), "One Way");
assert.equal(serviceFromNormalizedText("One Way; without RT accessorial"), "One Way");
assert.equal(serviceFromNormalizedText("RT marker not visible"), null);
assert.equal(serviceFromNormalizedText("no RT marker visible"), null);
assert.equal(serviceFromNormalizedText("One Way; no RT marker visible"), "One Way");
assert.equal(serviceFromNormalizedText("no RT surcharge"), null);
assert.equal(serviceFromNormalizedText("without RT accessorial"), null);
assert.equal(serviceFromNormalizedText("no RT fee"), null);
assert.equal(serviceFromNormalizedText("not RT charge"), null);
assert.equal(serviceFromNormalizedText("RT surcharge waived"), null);
assert.equal(serviceFromNormalizedText("Round Trip service not shown"), null);
assert.equal(serviceFromNormalizedText("RT marker not included"), null);
assert.equal(serviceFromNormalizedText("RT service not included"), null);
assert.equal(serviceFromNormalizedText("Round Trip quote not included"), null);
assert.equal(serviceFromNormalizedText("RT rate not included"), null);
assert.equal(serviceFromNormalizedText("Round Trip service not applicable"), null);
assert.equal(serviceFromNormalizedText("RT quote unavailable"), null);
assert.equal(serviceFromNormalizedText("Round Trip explicitly not quoted"), null);
assert.equal(serviceFromNormalizedText("no Round Trip explicitly quoted"), null);
assert.equal(serviceFromNormalizedText("without Round Trip explicitly stated"), null);
assert.equal(serviceFromNormalizedText("Backhaul; no RT marker"), "Backhaul");
assert.equal(serviceFromNormalizedText("Backhaul | RT marker absent"), "Backhaul");
assert.equal(serviceFromNormalizedText("RT markers not visible"), null);
assert.equal(serviceFromNormalizedText("RT services not included"), null);
assert.equal(serviceFromNormalizedText("RT quotes unavailable"), null);
assert.equal(serviceFromNormalizedText("RT rates not applicable"), null);
assert.equal(serviceFromNormalizedText("RT fees waived"), null);
assert.equal(serviceFromNormalizedText("RT charges not included"), null);
assert.equal(serviceFromNormalizedText("RT surcharges absent"), null);
assert.equal(serviceFromNormalizedText("RT accessorials not included"), null);
assert.equal(serviceFromNormalizedText("no surcharge for RT"), null);
assert.equal(serviceFromNormalizedText("fees for RT waived"), null);
assert.equal(serviceFromNormalizedText("RT-related surcharge"), null);
assert.equal(serviceFromNormalizedText("RT marker visible: false"), null);
assert.equal(serviceFromNormalizedText("Round Trip explicitly quoted: false"), null);
assert.equal(serviceFromNormalizedText("Backhaul corrected to One Way"), "One Way");
assert.equal(serviceFromNormalizedText("Service Backhaul | corrected to One Way"), "One Way");
assert.equal(serviceFromNormalizedText("Backhaul; no RT marker; corrected to One Way"), "One Way");
assert.equal(serviceFromNormalizedText("Backhaul"), "Backhaul");
assert.equal(serviceFromNormalizedText("RT marker visible: false"), null);
assert.equal(serviceFromNormalizedText("RT marker shown = no"), null);
assert.equal(serviceFromNormalizedText("RT marker visible is false"), null);
assert.equal(serviceFromNormalizedText("RT marker visible: 0"), null);
assert.equal(serviceFromNormalizedText("RT marker shown: no, carrier rejected it"), null);
assert.equal(serviceFromNormalizedText("Round Trip explicitly quoted is false"), null);
assert.equal(serviceFromNormalizedText("Round Trip explicitly quoted: false"), null);
assert.equal(serviceFromNormalizedText("NO EXPLICIT RT marker visible"), null);
assert.equal(serviceFromNormalizedText("NO LONGER EXPLICIT RT marker visible"), null);
assert.equal(serviceFromNormalizedText("NOT CONFIRMED RT marker visible"), null);
assert.equal(serviceFromNormalizedText("NOT AN RT marker shown"), null);
assert.equal(serviceFromNormalizedText("WITHOUT A Round Trip marker present"), null);
assert.equal(serviceFromNormalizedText("Not corrected to One Way; RT marker visible"), "Roundtrip");
assert.equal(serviceFromNormalizedText("Backhaul not corrected to One Way"), "Backhaul");
assert.equal(serviceFromNormalizedText("Not corrected to One Way"), null);
assert.equal(serviceFromNormalizedText("Without being corrected to One Way"), null);
assert.equal(serviceFromNormalizedText("No correction to One Way"), null);
assert.equal(serviceFromNormalizedText("Without any correction to One Way"), null);
assert.equal(serviceFromNormalizedText("Correction to One Way was not approved"), null);
assert.equal(serviceFromNormalizedText("One Way not applicable"), null);
assert.equal(serviceFromNormalizedText("Backhaul unavailable"), null);
assert.equal(serviceFromNormalizedText("OW charges waived"), null);
assert.equal(serviceFromNormalizedText("One Way surcharge excluded"), null);
assert.equal(serviceFromNormalizedText("Backhaul fee waived"), null);
assert.equal(serviceFromNormalizedText("Backhaul charges not included"), null);
assert.equal(serviceFromNormalizedText("charges for One Way waived"), null);
assert.equal(serviceFromNormalizedText("Backhaul related surcharge"), null);
assert.equal(serviceFromNormalizedText("One Way; Backhaul"), null);
assert.equal(serviceEvidenceFromParts({ sourceMarkers: ["RT"], narrativeParts: ["One Way note", "capacity 5 per week"] }), "Roundtrip");
assert.equal(serviceEvidenceFromParts({ sourceMarkers: ["SOURCE_SERVICE_MARKER: RT"], narrativeParts: ["Backhaul note"] }), "Roundtrip");
assert.equal(serviceEvidenceFromParts({ sourceMarkers: ["Round Trip"], narrativeParts: ["no RT surcharge"] }), "Roundtrip");
assert.equal(serviceEvidenceFromParts({ sourceMarkers: ["RT", "OW"], narrativeParts: [] }), null);
assert.equal(serviceEvidenceFromParts({ sourceMarkers: [], narrativeParts: ["One Way", "Backhaul"] }), null);

for (const value of [
  "RT marker visible is no",
  "RT marker visible was no",
  "RT marker visible no operator approved it",
  "RT marker visible N/A",
  "RT marker visible null",
  "RT marker visible disabled",
  "RT marker visible not confirmed",
  "RT marker visible never",
  "NEVER AN RT marker shown",
  "LACKS AN RT marker shown",
  "NOT INDEPENDENTLY CONFIRMED RT marker visible",
  "NOT YET AN RT marker shown",
  "NO EVIDENCE OF AN RT marker shown",
  "NEITHER AN RT marker shown",
  "Fee applies to One Way only",
  "Surcharge assessed on Backhaul",
  "One Way fuel surcharge",
  "Backhaul detention fee",
  "Fees waived for One Way",
  "Charges excluded on Backhaul",
  "One Way specific surcharge",
  "One Way lane service fee",
  "Backhaul spot quote fee",
  "Cost for One Way",
  "One Way FSC charge",
  "Backhaul FSC",
  "FSC for One Way",
  "Unable to determine if service is One Way",
  "Carrier did not confirm Backhaul",
  "One Way not confirmed",
  "Backhaul not confirmed"
]) {
  assert.equal(serviceFromNormalizedText(value), null, `negative or non-service context must not resolve: ${value}`);
}

assert.equal(serviceFromNormalizedText("same rate covers the round trip"), "Roundtrip");
assert.equal(serviceFromNormalizedText("Service is One Way"), "One Way");
assert.equal(serviceFromNormalizedText("Quote was Backhaul"), "Backhaul");
assert.equal(serviceFromNormalizedText("Carrier confirmed Round Trip"), "Roundtrip");
assert.equal(serviceEvidenceFromParts({ narrativeParts: ["Corrected to One Way", "corrected to Backhaul"] }), null);
assert.deepEqual(resolveServiceEvidence({ sourceMarkers: [false], narrativeParts: ["RT marker visible"] }), {
  state: "invalid", tier: "structured", reason: "non_string_marker"
});
assert.deepEqual(resolveServiceEvidence({ sourceMarkers: [0], narrativeParts: ["RT marker visible"] }), {
  state: "invalid", tier: "structured", reason: "non_string_marker"
});
assert.deepEqual(resolveServiceEvidence({ sourceMarkers: [["RT"]], narrativeParts: [] }), {
  state: "invalid", tier: "structured", reason: "non_string_marker"
});
assert.deepEqual(resolveServiceEvidence({ sourceMarkers: ["false"], narrativeParts: ["RT marker visible"] }), {
  state: "invalid", tier: "structured", reason: "unrecognized_marker"
});
assert.deepEqual(resolveServiceEvidence({ sourceMarkers: ["N/A"], narrativeParts: ["RT marker visible"] }), {
  state: "invalid", tier: "structured", reason: "unrecognized_marker"
});
assert.deepEqual(resolveServiceEvidence({ sourceMarkers: ["RT: false", "RT"], narrativeParts: [] }), {
  state: "invalid", tier: "structured", reason: "unrecognized_marker"
});
assert.deepEqual(resolveServiceEvidence({ sourceMarkers: ["RT", "Round Trip"], narrativeParts: ["One Way"] }), {
  state: "resolved", service: "Roundtrip", tier: "structured"
});
assert.deepEqual(resolveServiceEvidence({ sourceMarkers: ["RT", "OW"], narrativeParts: [] }), {
  state: "conflict", tier: "structured", services: ["One Way", "Roundtrip"]
});
assert.deepEqual(resolveServiceEvidence({ sourceMarkers: ["   "], narrativeParts: ["RT marker visible"] }), {
  state: "resolved", service: "Roundtrip", tier: "narrative"
});
assert.deepEqual(
  decideServiceFromResolution(resolveServiceEvidence({ sourceMarkers: [false] }), { oneDirection: true, priced: true }),
  { state: "blocked", service: null, evidenceState: "invalid" }
);
assert.deepEqual(
  decideServiceFromResolution(resolveServiceEvidence({ narrativeParts: ["One Way", "Backhaul"] }), { oneDirection: true, priced: true }),
  { state: "blocked", service: null, evidenceState: "conflict" }
);
assert.deepEqual(
  decideServiceFromResolution(resolveServiceEvidence({}), { oneDirection: false, priced: true }),
  { state: "defaulted", service: "One Way" }
);

const narrativeResolves = [
  ["Carrier confirmed the service as One Way", "One Way"],
  ["The carrier quoted the service as Backhaul", "Backhaul"],
  ["Corrected from One Way to Backhaul", "Backhaul"],
  ["Correction from Backhaul to One Way", "One Way"],
  ["Corrected to Round Trip then reverted to One Way", "One Way"],
  ["Correction to One Way superseded by Backhaul", "Backhaul"],
  ["Carrier rejected Backhaul then confirmed One Way", "One Way"],
  ["Carrier did not confirm RT initially but later confirmed RT", "Roundtrip"],
  ["Carrier rejected One Way, then confirmed Backhaul", "Backhaul"],
  ["Carrier confirmed One Way, not Backhaul", "One Way"],
  ["Carrier rejected One Way, then confirmed Backhaul", "Backhaul"],
  ["Use Backhaul not One Way", "Backhaul"]
];
for (const [value, expected] of narrativeResolves) {
  assert.equal(serviceFromNormalizedText(value), expected, `final declarative evidence must resolve: ${value}`);
}

for (const value of [
  "We could use One Way after approval",
  "Operations may use Backhaul if capacity opens",
  "Should we use Round Trip for this lane",
  "Planning to use One Way next quarter",
  "Preference is to use Backhaul",
  "If management agrees use Round Trip",
  "Do we use One Way here",
  "Use Backhaul is prohibited by the contract",
  "Use One Way pending carrier confirmation",
  "Use Round Trip was only a suggestion",
  "Use One Way option was declined",
  "Carrier quoted One Way before retracting that quote",
  "Carrier stated Backhaul as a hypothetical",
  "Quote was Round Trip in the superseded draft",
  "Could be corrected to One Way",
  "May be corrected to Backhaul",
  "Should be corrected to Round Trip",
  "If approved corrected to One Way",
  "Proposed correction to Backhaul",
  "Draft correction to One Way",
  "Correction to Round Trip is pending approval",
  "Correction to OW was rescinded",
  "Correction to Backhaul was declined",
  "Corrected to One Way in an obsolete draft",
  "Carrier previously stated One Way now rejected",
  "Service is One Way?",
  "Is service One Way?",
  "Please confirm service is Backhaul",
  "Carrier quoted One Way if approved",
  "Carrier quoted One Way pending confirmation",
  "Carrier stated Backhaul unless accepted",
  "Quote is RT subject to approval",
  "Use Round Trip only if authorized",
  "Quote was One Way; carrier rejected it"
]) {
  assert.equal(serviceFromNormalizedText(value), null, `non-final or revoked narrative must not resolve: ${value}`);
}

for (const value of [
  "Carrier confirmed One Way and Backhaul",
  "Quote is One Way or Backhaul",
  "Service is Roundtrip/One Way",
  "Confirmed One Way versus Backhaul"
]) {
  const result = resolveServiceEvidence({ narrativeParts: [value] });
  assert.equal(result.state, "conflict", `alternatives must conflict: ${value}`);
}

assert.deepEqual(resolveServiceEvidence({ sourceMarkers: ["R.T."] }), {
  state: "resolved", service: "Roundtrip", tier: "structured"
});
assert.deepEqual(resolveServiceEvidence({ sourceMarkers: null }), {
  state: "invalid", tier: "structured", reason: "non_array_source_markers"
});
assert.deepEqual(resolveServiceEvidence({ sourceMarkers: "RT" }), {
  state: "invalid", tier: "structured", reason: "non_array_source_markers"
});
assert.deepEqual(resolveServiceEvidence({ sourceMarkers: { 0: "RT" } }), {
  state: "invalid", tier: "structured", reason: "non_array_source_markers"
});
assert.deepEqual(resolveServiceEvidence({ narrativeParts: null }), {
  state: "invalid", tier: "narrative", reason: "non_array_narrative_parts"
});
assert.deepEqual(resolveServiceEvidence({ narrativeParts: "Carrier confirmed One Way" }), {
  state: "invalid", tier: "narrative", reason: "non_array_narrative_parts"
});
assert.deepEqual(resolveServiceEvidence({ narrativeParts: { 0: "One Way" } }), {
  state: "invalid", tier: "narrative", reason: "non_array_narrative_parts"
});
for (const container of [new Date(0), new Map(), new Set(), /RT/, new String("RT")]) {
  assert.deepEqual(resolveServiceEvidence(container), {
    state: "invalid", tier: "structured", reason: "invalid_evidence_container"
  });
}
const hostileEvidence = {};
Object.defineProperty(hostileEvidence, "sourceMarkers", { get() { throw new Error("hostile getter"); } });
assert.deepEqual(resolveServiceEvidence(hostileEvidence), {
  state: "invalid", tier: "structured", reason: "invalid_evidence_container"
});
assert.deepEqual(resolveServiceEvidence({ sourceMarkers: ["[]"], narrativeParts: ["The quote is One Way"] }), {
  state: "invalid", tier: "structured", reason: "unrecognized_marker"
});

const finalDeclarativeServices = [
  ["The carrier explicitly accepted Round Trip as the binding service.", "Roundtrip"],
  ["Final carrier selection is One Way.", "One Way"],
  ["Backhaul remains the agreed service.", "Backhaul"],
  ["The carrier approved RT for this movement.", "Roundtrip"],
  ["The carrier selected OW as final.", "One Way"],
  ["Service designation is Round Trip.", "Roundtrip"],
  ["The agreed service is Backhaul.", "Backhaul"],
  ["We received carrier confirmation of One Way.", "One Way"],
  ["Carrier commitment: Round Trip.", "Roundtrip"],
  ["Backhaul service is locked in.", "Backhaul"],
  ["The quote reflects One Way service.", "One Way"],
  ["The carrier has reconfirmed RT.", "Roundtrip"],
  ["Finalized service equals Backhaul.", "Backhaul"],
  ["The rate was accepted as Round Trip.", "Roundtrip"],
  ["Service basis remains One Way.", "One Way"],
  ["The carrier verified Backhaul as the service.", "Backhaul"],
  ["Round Trip is the final carrier-approved service.", "Roundtrip"],
  ["One Way was formally selected.", "One Way"],
  ["Backhaul was explicitly agreed.", "Backhaul"],
  ["Carrier acceptance names RT.", "Roundtrip"],
  ["Operational service is One Way.", "One Way"],
  ["Awarded service: Backhaul.", "Backhaul"],
  ["The carrier finalized Round Trip.", "Roundtrip"],
  ["The signed quote specifies One Way.", "One Way"],
  ["The carrier did confirm Backhaul.", "Backhaul"],
  ["Round Trip service was approved by the carrier.", "Roundtrip"],
  ["Final service: One Way.", "One Way"],
  ["O.W.", "One Way"],
  ["Service (final) = Backhaul", "Backhaul"]
];
for (const [value, expected] of finalDeclarativeServices) {
  assert.equal(serviceFromNormalizedText(value), expected, `final declaration must resolve: ${value}`);
}

for (const value of [
  "Which service applies, Round Trip or Backhaul?",
  "Round Trip or One Way?",
  "If tendered, use Round Trip.",
  "Should the lane award, use Round Trip.",
  "Upon customer approval, use One Way.",
  "Provided pricing holds, service is Backhaul.",
  "Could be RT/OW.",
  "Question is Round Trip or Backhaul?",
  "Please choose One Way versus Backhaul.",
  "If approved, RT or OW."
]) {
  assert.equal(serviceFromNormalizedText(value), null, `question or conditional must not resolve: ${value}`);
}

for (const value of [
  "Carrier confirmed Round Trip; carrier later withdrew that confirmation.",
  "Carrier stated One Way; the statement was revoked.",
  "Carrier quoted Backhaul; quote subsequently rescinded.",
  "Carrier confirmed OW; carrier canceled the selection."
]) {
  assert.equal(serviceFromNormalizedText(value), null, `revoked evidence must not resolve: ${value}`);
}

const finalTransitions = [
  ["Round Trip was replaced by One Way.", "One Way"],
  ["One Way changed to Backhaul.", "Backhaul"],
  ["Backhaul transitioned to Round Trip.", "Roundtrip"],
  ["Initial service was Round Trip; final service is One Way.", "One Way"],
  ["Earlier quote was Backhaul; carrier now confirms RT.", "Roundtrip"],
  ["Carrier revoked One Way and selected Backhaul.", "Backhaul"],
  ["Carrier withdrew Backhaul, then accepted Round Trip.", "Roundtrip"],
  ["Round Trip is superseded by One Way.", "One Way"],
  ["One Way is obsolete; Backhaul is final.", "Backhaul"],
  ["Service was RT; it has since been replaced with OW.", "One Way"],
  ["Carrier first quoted One Way; ultimately approved Backhaul.", "Backhaul"],
  ["Withdraw Backhaul; carrier confirms One Way.", "One Way"],
  ["Previous OW selection expired; final carrier service is RT.", "Roundtrip"],
  ["Carrier rejected Round Trip; later accepted Backhaul.", "Backhaul"],
  ["Carrier did not confirm Backhaul but eventually confirmed Round Trip.", "Roundtrip"],
  ["Correction to Backhaul, afterwards reverted to Round Trip.", "Roundtrip"]
];
for (const [value, expected] of finalTransitions) {
  assert.equal(serviceFromNormalizedText(value), expected, `final transition must resolve: ${value}`);
}

for (const value of [
  "Round Trip compared against One Way.",
  "Backhaul as an alternative to RT.",
  "One Way alongside Round Trip.",
  "RT or potentially Backhaul.",
  "Either OW, Backhaul, or Round Trip.",
  "RT v Backhaul.",
  "OW + Round Trip."
]) {
  assert.equal(resolveServiceEvidence({ narrativeParts: [value] }).state, "conflict", `alternatives must conflict: ${value}`);
}
for (const [value, expected] of [
  ["Round Trip rather than One Way.", "Roundtrip"],
  ["Backhaul instead of RT.", "Backhaul"],
  ["Backhaul over One Way.", "Backhaul"]
]) {
  assert.equal(serviceFromNormalizedText(value), expected, `contrast must resolve preferred service: ${value}`);
}

for (const value of [
  "Awaiting confirmation: Round Trip versus Backhaul",
  "Option under review is One Way or Backhaul",
  "Tentatively considering RT instead of Backhaul",
  "We need guidance on OW vs Backhaul",
  "No final service; possibilities are Round Trip and Backhaul",
  "Rate request asks for One Way or Backhaul",
  "Which service did the carrier intend: Round Trip or One Way",
  "Advise whether Round Trip or One Way applies",
  "Perhaps the service is Round Trip or One Way",
  "The carrier can perform Round Trip or One Way",
  "In case the carrier approves Round Trip or One Way, hold the row",
  "The carrier failed to confirm Round Trip or One Way",
  "Would operations prefer Backhaul over One Way?",
  "Compare FSC for One Way and Round Trip.",
  "RT is explicitly included in the accessorial schedule.",
  "FSC comparison lists OW versus RT"
]) {
  assert.equal(serviceFromNormalizedText(value), null, `non-final or charge comparison must not resolve: ${value}`);
}

for (const [value, expected] of [
  ["Carrier initially quoted RT; final confirmed service is Backhaul", "Backhaul"],
  ["Carrier changed service from One Way to Backhaul", "Backhaul"],
  ["Final award supersedes Round Trip with Backhaul", "Backhaul"],
  ["Carrier approved One Way; the approval was voided", null],
  ["Carrier approved One Way; approval was voided; carrier ultimately accepted Round Trip", "Roundtrip"],
  ["One Way was obsolete; Round Trip is final", "Roundtrip"]
]) {
  assert.equal(serviceFromNormalizedText(value), expected, `final/revoked transition must resolve safely: ${value}`);
}
assert.equal(resolveServiceEvidence({ narrativeParts: ["Signed quote specifies Backhaul plus Round Trip."] }).state, "conflict");

for (const value of [
  "Carrier offers either RT or Backhaul",
  "Carrier offers either Round Trip or Backhaul",
  "Carrier offers either One Way or Backhaul",
  "Quote contains both RT and Backhaul",
  "Quote contains both Round Trip and Backhaul",
  "Quote contains both One Way and Backhaul",
  "Carrier submitted RT versus Backhaul",
  "Carrier submitted Round Trip versus Backhaul",
  "Carrier submitted One Way versus Backhaul",
  "Service alternatives: RT / Backhaul",
  "Service alternatives: Round Trip / Backhaul",
  "Service alternatives: One Way / Backhaul",
  "Carrier can honor RT or Backhaul",
  "Carrier can honor Round Trip or Backhaul",
  "Carrier can honor One Way or Backhaul",
  "The carrier offers One Way and Backhaul for this lane.",
  "Carrier response shows OW versus Round Trip.",
  "Both Backhaul and One Way were quoted by the carrier.",
  "Carrier priced RT alongside OW.",
  "The signed sheet contains One Way compared against Backhaul.",
  "Carrier confirmed OW as an alternative to Backhaul.",
  "The final quote includes Round Trip or Backhaul service.",
  "Carrier confirmed services One Way and Backhaul.",
  "Carrier acceptance names OW or Backhaul.",
  "Operational services are One Way and Round Trip.",
  "Carrier commitment includes Backhaul alongside OW.",
  "Awarded services: RT and Backhaul.",
  "Finalized service alternatives are One Way versus RT.",
  "Carrier verified Roundtrip and Backhaul.",
  "Carrier quoted One Way, Backhaul, and Round Trip."
]) {
  const resolution = resolveServiceEvidence({ narrativeParts: [value] });
  assert.equal(resolution.state, "conflict", `carrier alternatives must fail closed: ${value}`);
  assert.equal(
    decideServiceFromResolution(resolution, { priced: true }).state,
    "blocked",
    `carrier alternatives must not default to One Way: ${value}`
  );
}

for (const value of [
  "Carrier confirmed Round Trip; that confirmation is no longer effective",
  "Carrier selected Backhaul; the selection was annulled",
  "Carrier stated OW; that statement was disavowed",
  "Carrier confirmed Backhaul; the commitment was terminated",
  "Carrier selected One Way; that choice was abandoned",
  "Carrier stated Backhaul; the designation was discontinued",
  "Carrier quoted RT; the quote is no longer binding"
]) {
  assert.equal(serviceFromNormalizedText(value), null, `revoked carrier evidence must be discarded: ${value}`);
}

for (const value of [
  "The same rate covers the round trip fuel surcharge only.",
  "Same rate covers Round Trip detention charges, not service.",
  "RT marker is visible in the accessorial fee table only.",
  "Visible service marker is RT in the FSC legend only.",
  "RT explicitly stated in surcharge notes.",
  "Round Trip explicitly shown under accessorial cost.",
  "RT explicitly included as a fuel code.",
  "Same rate covers the round trip toll calculation only."
]) {
  assert.equal(serviceFromNormalizedText(value), null, `charge-only RT text must not determine service: ${value}`);
}

const operations = [
  { table: "a", rows: [{ id: 1 }], onConflict: "id" },
  { table: "b", rows: [{ id: 2 }], onConflict: "id", enabled: false },
  { table: "c", rows: [{ id: 3 }], onConflict: "id" }
];
const writes = [];
const preview = await executeCatalogSyncPlan({ dryRun: true, operations, upsert: async (...args) => writes.push(args) });
assert.deepEqual(preview, { tables_written: 0, operations_planned: 2 });
assert.equal(writes.length, 0, "dry-run must never call an upsert");

const applied = await executeCatalogSyncPlan({ dryRun: false, operations, upsert: async (...args) => writes.push(args) });
assert.deepEqual(applied, { tables_written: 2, operations_planned: 2 });
assert.deepEqual(writes.map(([table]) => table), ["a", "c"]);

const catalogServiceSource = readFileSync(new URL("../src/catalog-service.js", import.meta.url), "utf8");
const catalogWorkbenchSource = readFileSync(new URL("../src/catalog-workbench.js", import.meta.url), "utf8");
assert.match(catalogServiceSource, /dry_run: dryRun/, "Catalog preview must send dry_run explicitly");
assert.match(catalogWorkbenchSource, /async function previewCatalogSync\(\)[\s\S]+dryRun: true/, "Catalog UI must expose a non-writing preview action");
assert.match(catalogWorkbenchSource, /No rows were written/, "Catalog preview must state its non-writing result");

console.log("Phase 0.2 shadow hardening tests passed.");
