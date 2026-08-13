import { readFileSync } from 'node:fs';
import { evaluateProviderAgentAction } from '../../src/provider-service-agent-policy.js';
const cases = readFileSync(new URL('./cases.jsonl', import.meta.url), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
let failed = 0;
for (const c of cases) {
  const a = evaluateProviderAgentAction(c.input);
  const pass = a.decision === c.expected.decision && a.approvalMode === c.expected.approvalMode;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${c.name}`);
  if (!pass) failed++;
}
console.log(`${cases.length - failed}/${cases.length} passed`);
process.exitCode = failed ? 1 : 0;
