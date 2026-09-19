import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/rfx-events.js", import.meta.url), "utf8");
const extract = (name) => source.match(new RegExp(`function ${name}\\([\\s\\S]*?^}`, "m"))[0];
const context = vm.createContext({});
vm.runInContext(`${extract("normalizeLookupText")}
let normalizationCount = 0;
const originalNormalize = normalizeLookupText;
normalizeLookupText = (value) => { normalizationCount++; return originalNormalize(value); };
const rfxCarrierFitTermsCache = new Map();
${extract("rfxCarrierFitTerms")}
${extract("rfxCarrierFieldMatches")}
${extract("rfxCarrierLaneMatchesNormalizedText")}
${extract("rfxCarrierProfileFitSignals")}`, context);
const run = (expression) => vm.runInContext(expression, context);

assert.equal(run('rfxCarrierFieldMatches("reefer", "Truck Trailer", "equipment")'), true);
assert.equal(run('rfxCarrierFieldMatches("northbound", "D2D Export", "operation")'), true);
assert.equal(run('rfxCarrierFieldMatches("dedicated", "One Way", "service")'), true);
assert.equal(run('rfxCarrierFieldMatches("monterrey", "Monterréy", "location")'), true);
assert.equal(run('rfxCarrierFieldMatches("reefer", "Tanker", "equipment")'), false);
assert.equal(run('rfxCarrierFieldMatches("reefer", "Truck Trailer", "location")'), false);
assert.equal(run('rfxCarrierFitTerms(null, "equipment").length'), 0);

// Repeated lane/carrier comparisons must not repeat normalization work.
run('rfxCarrierFitTermsCache.clear(); normalizationCount = 0;');
const started = performance.now();
run(`for (let carrier = 0; carrier < 1400; carrier++) {
  for (let lane = 0; lane < 69; lane++) {
    rfxCarrierFieldMatches("reefer d2d import one way", "Truck Trailer", "equipment");
    rfxCarrierFieldMatches("reefer d2d import one way", "D2D Import", "operation");
    rfxCarrierFieldMatches("reefer d2d import one way", "One Way", "service");
  }
}`);
assert.ok(run("normalizationCount") < 50, "shared route terms should be normalized once, not per carrier");
assert.equal(run('rfxCarrierFieldMatches("tanker", "Tanker", "equipment")'), true, "edited values must be recalculated");
run('for (let n = 0; n < 2200; n++) rfxCarrierFitTerms(`route-${n}`, "location");');
assert.ok(run("rfxCarrierFitTermsCache.size") <= 2048);
assert.equal(run('rfxCarrierFieldMatches("reefer", "Truck Trailer", "equipment")'), true, "eviction must preserve results");
run(`var testLanes = Array.from({length:69}, () => ({origin:'Monterrey',destination:'Dallas',equipment:'Truck Trailer',operation:'D2D Export',service:'One Way'}));
var testVendor = {tags:['ZZZ'], coverage_notes:'ZZZ coverage unknown', notes:'ZZZ '.repeat(10000)};
rfxCarrierProfileFitSignals(testVendor,testLanes);
normalizationCount = 0;`);
assert.equal(run('rfxCarrierProfileFitSignals(testVendor,testLanes).length'), 0);
// Empty lane values still normalize in term matching; count only normalization
// of long source notes, which must happen once rather than once per lane.
run(`var noteNormalizations=0;
var previousNormalize=normalizeLookupText;
normalizeLookupText=(value)=>{if(value===testVendor.notes)noteNormalizations++;return previousNormalize(value);};
rfxCarrierProfileFitSignals(testVendor,testLanes);`);
assert.equal(run('noteNormalizations'), 1);
assert.equal(run(`JSON.stringify(rfxCarrierProfileFitSignals({tags:['Reefer'],coverage_notes:'Mónterrey',notes:'northbound'},testLanes))`), JSON.stringify(['tag matches selected lane','declared coverage matches selected lane','CRM note matches selected lane']));
assert.equal(run(`rfxCarrierProfileFitSignals(testVendor,[]).length`), 0);
const fitFunction = extract('fitCarrierToOutreachLanes');
assert.ok(fitFunction.indexOf('return cached.result') < fitFunction.indexOf('vendorSearchText(vendor)'), 'cache hits must not rebuild long CRM search text');
console.log(`Carrier Fit cache passed: 289800 comparisons in ${Math.round(performance.now() - started)} ms (synthetic local benchmark).`);
