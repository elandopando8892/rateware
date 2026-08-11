import { ACTION_CONTRACT } from "../supabase/functions/_shared/action-contract.mjs";
import { discoverGovernableSurfaces, formatValidationResult, repoRootFrom, validateActionContract, validationExitCode } from "./action-contract-lib.mjs";

const repoRoot = repoRootFrom(process.cwd());
const discovered = discoverGovernableSurfaces(repoRoot);
const result = validateActionContract(ACTION_CONTRACT, discovered, { repoRoot });

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(formatValidationResult(result));
}

process.exitCode = validationExitCode(result);
