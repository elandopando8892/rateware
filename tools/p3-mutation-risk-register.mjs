import { ACTION_CONTRACT } from "./effective-action-contract.mjs";
import { pathToFileURL } from "node:url";

export const MUTATION_RISK_REGISTER = [
  {
    canonicalId: "edge.rateware-api.send_outreach_messages",
    effect: "External Gmail delivery",
    likelihood: 2,
    impact: 5,
    control: "existing_durable_idempotency",
    evidence: "Persistent send_attempt_id claim is acquired before provider delivery; uncertain outcomes become delivery_unknown and cannot auto-retry.",
    owner: "Procurement Platform",
    status: "controlled"
  },
  {
    canonicalId: "edge.rateware-api.send_whatsapp_outreach_messages",
    effect: "External Meta WhatsApp delivery",
    likelihood: 2,
    impact: 5,
    control: "existing_durable_idempotency",
    evidence: "Uses the same persistent provider-send claim and holds ambiguous responses for reconciliation.",
    owner: "Procurement Platform",
    status: "controlled"
  },
  {
    canonicalId: "edge.rateware-api.send_ratebook_distribution",
    effect: "External ratebook email delivery",
    likelihood: 2,
    impact: 5,
    control: "existing_durable_idempotency",
    evidence: "Delegates each draft to the claimed Gmail delivery path.",
    owner: "Procurement Platform",
    status: "controlled"
  },
  {
    canonicalId: "edge.rateware-api.send_fcm_customer_quote_email",
    effect: "External customer quote email",
    likelihood: 1,
    impact: 5,
    control: "existing_durable_idempotency",
    evidence: "SHA-256 idempotency key and durable delivery receipt ledger block duplicate or uncertain retries.",
    owner: "Commercial Platform",
    status: "controlled"
  },
  {
    canonicalId: "edge.rateware-api.send_bid_room_carrier_message",
    effect: "External carrier question email",
    likelihood: 2,
    impact: 5,
    control: "existing_durable_idempotency",
    evidence: "Requires a request key, reuses the matching draft, then delegates delivery to the claimed Gmail path.",
    owner: "Procurement Platform",
    status: "controlled"
  },
  {
    canonicalId: "edge.rateware-api.send_whatsapp_group_outreach_messages",
    effect: "WhatsApp group outreach",
    likelihood: 1,
    impact: 5,
    control: "blocked_manual_only",
    evidence: "Automated group delivery is rejected; an accountable user must record a manual send separately.",
    owner: "Procurement Platform",
    status: "controlled"
  },
  {
    canonicalId: "edge.rateware-api.generate_outreach_drafts",
    effect: "Create outreach queue drafts",
    likelihood: 2,
    impact: 3,
    control: "existing_durable_idempotency",
    evidence: "Draft idempotency keys are persisted under a unique database index.",
    owner: "Procurement Platform",
    status: "controlled"
  },
  {
    canonicalId: "edge.rateware-api.generate_rfx_award_notices",
    effect: "Create award-notice drafts",
    likelihood: 2,
    impact: 4,
    control: "guarded_replay",
    evidence: "Existing non-draft notices are preserved and editable drafts are refreshed by contact identity.",
    owner: "Procurement Platform",
    status: "controlled"
  },
  {
    canonicalId: "edge.rateware-api.closeout_awarded_rfx_to_rateware",
    effect: "Materialize awarded lanes into rate staging",
    likelihood: 2,
    impact: 5,
    control: "guarded_replay",
    evidence: "Only awards without a rate_staging_id are processed; historical staging links are reused when available.",
    owner: "Procurement Platform",
    status: "controlled"
  },
  {
    canonicalId: "edge.rateware-api.bulk_update_staging",
    effect: "Bulk staging mutation",
    likelihood: 2,
    impact: 4,
    control: "convergent_update",
    evidence: "Replay sets the same values on the same selected rows; authorization and correlation remain mandatory.",
    owner: "Rate Operations",
    status: "controlled"
  },
  {
    canonicalId: "edge.rateware-api.bulk_update_rate_rows_by_filter",
    effect: "Filtered bulk production-rate mutation",
    likelihood: 2,
    impact: 5,
    control: "convergent_update",
    evidence: "Replay converges on the same values, but selection preview and explicit approval are required.",
    owner: "Rate Operations",
    status: "controlled"
  },
  {
    canonicalId: "edge.rateware-api.bulk_update_rateware",
    effect: "Bulk production-rate mutation",
    likelihood: 2,
    impact: 5,
    control: "convergent_update",
    evidence: "Replay converges on the same values; explicit approval and audit correlation bound the operation.",
    owner: "Rate Operations",
    status: "controlled"
  },
  {
    canonicalId: "edge.rateware-api.update_staging",
    effect: "Single staging mutation",
    likelihood: 2,
    impact: 3,
    control: "convergent_update",
    evidence: "Replay sets the same row values; the action remains approval-gated and correlated.",
    owner: "Rate Operations",
    status: "controlled"
  },
  {
    canonicalId: "edge.rateware-api.award_rfx_lane_vendor",
    effect: "Change primary or backup carrier award",
    likelihood: 3,
    impact: 5,
    control: "atomic_transaction_with_operation_receipt",
    evidence: "A service-role RPC locks the lane, applies award and staging outcomes atomically, and persists a payload-bound operation receipt.",
    owner: "Procurement Platform",
    status: "controlled"
  },
  {
    canonicalId: "edge.rateware-api.create_rfx_award_package",
    effect: "Create award package and lane membership",
    likelihood: 3,
    impact: 5,
    control: "payload_bound_operation_ledger",
    evidence: "A workspace-unique operation id binds the normalized payload; stable lane ordinals resume partial creation without duplicate packages or lanes.",
    owner: "Procurement Platform",
    status: "controlled"
  },
  {
    canonicalId: "edge.rateware-api.mark_rfx_award_package_implementation_ready",
    effect: "Advance award package into implementation",
    likelihood: 2,
    impact: 5,
    control: "version_guard_required",
    evidence: "Package, opportunity, and audit updates are separate; a stale concurrent transition can overwrite newer state.",
    owner: "Procurement Platform",
    status: "open"
  }
];

export function validateMutationRiskRegister(register = MUTATION_RISK_REGISTER) {
  const surfaces = new Map(ACTION_CONTRACT.surfaces.map((surface) => [surface.canonicalId, surface]));
  const errors = [];
  const seen = new Set();
  for (const risk of register) {
    if (seen.has(risk.canonicalId)) errors.push(`${risk.canonicalId}: duplicate register entry`);
    seen.add(risk.canonicalId);
    const surface = surfaces.get(risk.canonicalId);
    if (!surface) errors.push(`${risk.canonicalId}: missing from effective action contract`);
    else {
      if (surface.access !== "write") errors.push(`${risk.canonicalId}: expected write access, found ${surface.access}`);
      if (!["high", "medium-high"].includes(surface.sensitivity)) errors.push(`${risk.canonicalId}: unexpected sensitivity ${surface.sensitivity}`);
      if (surface.decisionStatus !== "pending_human_approval") errors.push(`${risk.canonicalId}: must remain human approval gated`);
    }
    if (!Number.isInteger(risk.likelihood) || risk.likelihood < 1 || risk.likelihood > 5) errors.push(`${risk.canonicalId}: likelihood must be 1-5`);
    if (!Number.isInteger(risk.impact) || risk.impact < 1 || risk.impact > 5) errors.push(`${risk.canonicalId}: impact must be 1-5`);
    if (!risk.evidence || !risk.owner || !["controlled", "open"].includes(risk.status)) errors.push(`${risk.canonicalId}: incomplete risk record`);
  }
  return { valid: errors.length === 0, errors };
}

export function renderMutationRiskRegister(register = MUTATION_RISK_REGISTER) {
  const rows = register.map((risk) => {
    const score = risk.likelihood * risk.impact;
    const level = score >= 15 ? "critical" : score >= 10 ? "high" : score >= 5 ? "medium" : "low";
    return `| ${risk.canonicalId.replace("edge.rateware-api.", "")} | ${risk.effect} | ${risk.likelihood} | ${risk.impact} | ${score} (${level}) | ${risk.control} | ${risk.status} | ${risk.owner} |`;
  });
  const open = register.filter((risk) => risk.status === "open");
  return [
    "# P3 mutation risk register",
    "",
    "Generated from the governed Rateware action contract. Scores use likelihood x impact (1-5 each). This inventory does not execute business actions.",
    "",
    "| Action | Effect | L | I | Risk | Current/required control | Status | Owner |",
    "| --- | --- | ---: | ---: | --- | --- | --- | --- |",
    ...rows,
    "",
    "## Open remediation order",
    "",
    ...open.map((risk, index) => `${index + 1}. **${risk.canonicalId.replace("edge.rateware-api.", "")}** - ${risk.evidence}`),
    "",
    "External delivery, carrier award, and award-package creation controls are durable. The remaining implementation target is the implementation-ready version guard.",
    ""
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = validateMutationRiskRegister();
  if (!result.valid) {
    console.error(result.errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(renderMutationRiskRegister());
  }
}
