import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../tools/validate-action-contract-no-regression.mjs", import.meta.url), "utf8");

assert.match(source, /resolve\(baselineRoot, "tools\/effective-action-contract\.mjs"\)/, "No-regression must compare main and current effective contracts");
assert.doesNotMatch(source, /resolve\(baselineRoot, "supabase\/functions\/_shared\/action-contract\.mjs"\)/, "No-regression must not compare current extensions against main's base-only contract");

console.log("Action contract no-regression gate contract passed.");
