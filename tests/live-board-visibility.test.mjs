import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The carrier's live board must reveal only what the event's
// bid_visibility_mode promises. Every rank, score, badge and signal on it is
// computed against competitors, so each mode strips what it does not allow.
const source = readFileSync(new URL("../supabase/functions/rfx-bid-api/index.ts", import.meta.url), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const open = source.indexOf("{", source.indexOf(")", source.indexOf("visibility:", start)));
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unable to extract ${name}`);
}

const stripTypes = (code) =>
  code
    .replace(/board: Record<string, unknown>,/, "board,")
    .replace(/visibility: \{[^}]*\}/, "visibility")
    .replace(/const out: Record<string, unknown> =/, "const out =")
    .replace(/ as Record<string, unknown>\[\]/g, "");

const applyLiveBoardVisibility = Function(`${stripTypes(extractFunction("applyLiveBoardVisibility"))}; return applyLiveBoardVisibility;`)();

// A board as liveBoardFromRows builds it before filtering: the carrier is #2,
// $150 above the lowest offer.
const board = () => ({
  current_rank: 2,
  bid_count: 3,
  best_rate: null,
  best_rate_visible: false,
  position_signal: "Price competitive",
  marketplace_signal: "Price competitive",
  current_score: 71,
  current_score_bucket: "competitive",
  current_badges: ["Within 5%", "Top capacity"],
  leader_score: 84,
  score_gap_to_leader: 13,
  delta_to_leader: 150,
  delta_bucket: "within_250",
  latest_competitor_activity_at: "2026-09-24T10:00:00Z",
  rows: [
    {
      rank: 1, bidder: "Your offer", amount: 3050, is_current: true,
      marketplace_score: 71, score_bucket: "competitive", marketplace_badges: ["Within 5%"],
      risk_flags: ["Price gap"], price_signal: "Competitive rate", capacity_signal: "High capacity", eta_signal: "ETA pending"
    }
  ]
});

const modes = {
  open_leaderboard: { mode: "open_leaderboard", competitor_rates_visible: true, competitor_activity_visible: true },
  anonymous_rank: { mode: "anonymous_rank", competitor_rates_visible: false, competitor_activity_visible: true },
  private: { mode: "private", competitor_rates_visible: false, competitor_activity_visible: false }
};

// open_leaderboard: rates are public, nothing is removed.
assert.deepEqual(applyLiveBoardVisibility(board(), modes.open_leaderboard), board());

// anonymous_rank: rank, score and the RANGE stay; the exact distance goes
// (own 3050 - 150 would reveal the best price, 2900).
{
  const out = applyLiveBoardVisibility(board(), modes.anonymous_rank);
  assert.equal(out.delta_to_leader, null);
  assert.equal(out.delta_bucket, "within_250");
  assert.equal(out.current_rank, 2);
  assert.equal(out.current_score, 71);
  assert.equal(out.leader_score, 84);
  assert.equal(out.latest_competitor_activity_at, "2026-09-24T10:00:00Z");
}

// private: only the carrier's own offer survives.
{
  const out = applyLiveBoardVisibility(board(), modes.private);
  for (const key of ["delta_to_leader", "delta_bucket", "current_score", "current_score_bucket", "leader_score", "score_gap_to_leader", "latest_competitor_activity_at", "best_rate"]) {
    assert.equal(out[key], null, `${key} must be hidden in private mode`);
  }
  assert.equal(out.best_rate_visible, false);
  assert.deepEqual(out.current_badges, []);
  assert.equal(out.position_signal, "Private event");
  assert.equal(out.marketplace_signal, "Private event");
  const own = out.rows[0];
  assert.equal(own.amount, 3050, "the carrier still sees its own offer");
  for (const key of ["marketplace_score", "score_bucket", "price_signal", "capacity_signal", "eta_signal"]) {
    assert.equal(own[key], null, `row.${key} must be hidden in private mode`);
  }
  assert.deepEqual(own.marketplace_badges, []);
  assert.deepEqual(own.risk_flags, []);
}

// The filter must wrap every board the carrier receives.
const builder = source.slice(source.indexOf("function liveBoardFromRows("), source.indexOf("function carrierBusinessBook("));
assert.match(builder, /return applyLiveBoardVisibility\(\{/);
assert.match(builder, /\}, visibility\);\n\}/);

console.log("Live board visibility tests passed (open, anonymous and private modes).");
