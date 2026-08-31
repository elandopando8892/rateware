import assert from "node:assert/strict";
import test from "node:test";
import {
  MUTATION_RISK_REGISTER,
  renderMutationRiskRegister,
  validateMutationRiskRegister
} from "../tools/p3-mutation-risk-register.mjs";

test("P3 mutation register stays aligned with the governed action contract", () => {
  const result = validateMutationRiskRegister();
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("P3 register distinguishes durable delivery controls from open award risks", () => {
  const byId = new Map(MUTATION_RISK_REGISTER.map((risk) => [risk.canonicalId, risk]));
  assert.equal(byId.get("edge.rateware-api.send_outreach_messages").control, "existing_durable_idempotency");
  assert.equal(byId.get("edge.rateware-api.send_whatsapp_outreach_messages").status, "controlled");
  assert.equal(byId.get("edge.rateware-api.award_rfx_lane_vendor").control, "atomic_transaction_with_operation_receipt");
  assert.equal(byId.get("edge.rateware-api.create_rfx_award_package").control, "operation_ledger_required");
  assert.equal(byId.get("edge.rateware-api.mark_rfx_award_package_implementation_ready").control, "version_guard_required");
});

test("P3 register renderer makes the remediation sequence reviewable", () => {
  const report = renderMutationRiskRegister();
  assert.match(report, /# P3 mutation risk register/);
  assert.match(report, /Open remediation order/);
  assert.match(report, /award_rfx_lane_vendor/);
  assert.match(report, /does not execute business actions/);
});
