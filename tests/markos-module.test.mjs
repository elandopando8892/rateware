import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const page = read("../markos.html");
const source = read("../src/markos.js");
const styles = read("../src/markos.css");
const auth = read("../src/auth.js");
const outreachService = read("../src/outreach-service.js");

assert.match(auth, /title: "Analyze"[\s\S]+label: "Growth Hacking"[\s\S]+label: "Agentic MarkOS"/, "Rateware should keep the current Analyze route group and add MarkOS beside Growth Hacking");
assert.match(auth, /markos:\s*\{[\s\S]+title: "Agentic MarkOS"/, "The shell should provide metadata for the MarkOS page");
assert.match(page, /data-markos-scope="customer"[\s\S]+data-markos-scope="provider"/, "MarkOS should preserve separate customer and provider scopes");
assert.match(page, /Growth Hacking[\s\S]+Bid Room[\s\S]+Agentic MarkOS[\s\S]+Outreach[\s\S]+CRM \+ resultados/, "The page should explain ownership across strategy, opportunity, conversation, delivery, and records");
assert.match(page, /El AI propone; el equipo confirma/, "Profile changes should remain human controlled");
assert.match(source, /listGrowthCampaigns\(\)[\s\S]+fetchOutreachCampaigns\(\)[\s\S]+fetchContactHistoryPage/, "The dashboard should reuse existing campaign and history APIs");
assert.doesNotMatch(source, /sendOutreachMessages|sendWhatsappOutreachMessages|createOutreachCampaign/, "The MarkOS overview must not send or create outreach as a side effect of loading");
assert.match(outreachService, /export async function fetchContactHistoryPage/, "MarkOS should load a bounded recent history page instead of the complete contact archive");
assert.match(styles, /\.markos-operating-grid[\s\S]+grid-template-columns/, "The operating dashboard should use a responsive decision-first layout");

console.log("Agentic MarkOS module contract checks passed.");
