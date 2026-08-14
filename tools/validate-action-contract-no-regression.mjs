import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { ACTION_CONTRACT as CURRENT_CONTRACT } from "./effective-action-contract.mjs";
import { discoverGovernableSurfaces, validateActionContract } from "./action-contract-lib.mjs";

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const baselineRoot = resolve(arg("--baseline-root") || "");
if (!baselineRoot || baselineRoot === resolve("")) {
  throw new Error("--baseline-root must point to a checked-out main worktree.");
}

const baselineContractUrl = pathToFileURL(resolve(baselineRoot, "supabase/functions/_shared/action-contract.mjs")).href;
const { ACTION_CONTRACT: BASELINE_CONTRACT } = await import(`${baselineContractUrl}?build13=${Date.now()}`);

function errors(contract, repoRoot) {
  const discovered = discoverGovernableSurfaces(repoRoot);
  const result = validateActionContract(contract, discovered, { repoRoot });
  const normalized = result.issues
    .filter((issue) => issue.level === "error")
    .map((issue) => `${issue.code}\t${issue.canonicalId || ""}`)
    .sort();
  return { discovered, result, normalized };
}

const baseline = errors(BASELINE_CONTRACT, baselineRoot);
const current = errors(CURRENT_CONTRACT, process.cwd());
const baselineSet = new Set(baseline.normalized);
const newErrors = current.normalized.filter((entry) => !baselineSet.has(entry));
const currentById = new Map(current.discovered.map((surface) => [surface.canonicalId, surface]));

console.log(`main: discovered=${baseline.discovered.length} errors=${baseline.normalized.length}`);
console.log(`current: discovered=${current.discovered.length} errors=${current.normalized.length}`);
console.log(`new authorization errors=${newErrors.length}`);

if (newErrors.length) {
  console.error("Current branch introduced authorization-contract errors not present on main:");
  for (const entry of newErrors) {
    console.error(`- ${entry}`);
    const canonicalId = entry.split("\t")[1] || "";
    const surface = currentById.get(canonicalId);
    if (surface) {
      console.error(`  discovered=${JSON.stringify({
        canonicalId: surface.canonicalId,
        sourceFingerprint: surface.sourceFingerprint,
        metadataFingerprint: surface.metadataFingerprint,
        authorizationFingerprint: surface.authorizationFingerprint,
        sourceFile: surface.sourceFile,
      })}`);
    }
  }
  process.exit(1);
}

if (current.discovered.length !== CURRENT_CONTRACT.expectedCounts.governable) {
  throw new Error(`Effective contract count mismatch: discovered ${current.discovered.length}, expected ${CURRENT_CONTRACT.expectedCounts.governable}.`);
}

console.log("Action contract no-regression gate: PASS");
