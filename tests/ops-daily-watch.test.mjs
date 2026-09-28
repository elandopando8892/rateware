import assert from "node:assert/strict";
import test from "node:test";
import { LIMITS, shortDate, watchFindings, watchMessage } from "../supabase/functions/ops-daily-watch/watch.mjs";

// Friday 2026-09-25 08:00 in Mexico City.
const NOW = new Date("2026-09-25T14:00:00Z");
const hoursAgo = (hours) => new Date(NOW.getTime() - hours * 3600000).toISOString();

function healthy(overrides = {}) {
  return {
    cron_failures: [],
    fcm: {
      last_ok: hoursAgo(0.7),
      failed_24h: 0,
      last_error: null,
      engine_check: { status: "ok", reasons: [], unknown_params: [], checked_at: hoursAgo(0.7) }
    },
    fx_last_date: "2026-09-24",
    diesel_last_week: "2026-09-21",
    mailbox: { status: "connected", last_error: null },
    outreach: { failed: 0, bounced: 0 },
    ...overrides
  };
}

test("a healthy day says nothing, except on Mondays", () => {
  assert.deepEqual(watchFindings(healthy(), NOW), []);
  assert.equal(watchMessage([], NOW), null);
  const monday = new Date("2026-09-28T14:00:00Z");
  assert.match(watchMessage([], monday), /^\*Vigilancia semanal · 28 sep/);
  assert.match(watchMessage([], monday), /Todo en orden/);
});

test("the FCM copy stopping, failing often, or its alarm in review are reported", () => {
  const stopped = watchFindings(healthy({ fcm: { ...healthy().fcm, last_ok: hoursAgo(LIMITS.fcmCopyHours + 1), last_error: "connect timeout" } }), NOW);
  assert.equal(stopped.length, 1);
  assert.match(stopped[0], /La copia del FCM no ha salido bien desde 25 sep 04:00\. Último error: connect timeout/);

  const flaky = watchFindings(healthy({ fcm: { ...healthy().fcm, failed_24h: 3 } }), NOW);
  assert.match(flaky[0], /falló 3 veces en 24 h, aunque la última salió bien/);

  const review = watchFindings(healthy({
    fcm: {
      ...healthy().fcm,
      engine_check: {
        status: "ok",
        reasons: [],
        unknown_params: [{ reason: "La base «X» trae valores que QuoteDesk no sabe usar: VEHICLE · Rabon." }]
      }
    }
  }), NOW);
  assert.match(review[0], /^La alarma del FCM está en revisión: La base «X»/);

  const unverified = watchFindings(healthy({ fcm: { ...healthy().fcm, engine_check: { status: "unverified", reasons: [], checked_at: hoursAgo(1) } } }), NOW);
  assert.match(unverified[0], /no pudo comparar la fórmula/);
});

test("stale FX and diesel respect holidays and the weekly cadence", () => {
  // Tuesday after a Monday holiday: Friday's FIX is still fine.
  const tuesday = new Date("2026-11-17T14:00:00Z");
  const copied = { ...healthy().fcm, last_ok: "2026-11-17T13:17:00Z" };
  assert.deepEqual(watchFindings(healthy({ fcm: copied, fx_last_date: "2026-11-13", diesel_last_week: "2026-11-09" }), tuesday), []);
  const stale = watchFindings(healthy({ fx_last_date: "2026-09-19", diesel_last_week: "2026-09-14" }), NOW);
  assert.equal(stale.length, 2);
  assert.match(stale[0], /el último FIX es del 19 sep/);
  assert.match(stale[1], /la última semana es la del 14 sep/);
  assert.equal(watchFindings(healthy({ fx_last_date: null }), NOW).length, 1);
});

test("mailbox, failed sends, bounces and failed cron runs are reported", () => {
  const findings = watchFindings(healthy({
    cron_failures: [{ jobname: "sync-banxico-fx-daily", failed: 1, last_failed: "2026-09-24T19:00:00Z" }],
    mailbox: { status: "error", last_error: "invalid_grant" },
    outreach: { failed: 2, bounced: 1 }
  }), NOW);
  assert.deepEqual(findings, [
    "La tarea automática «sync-banxico-fx-daily» falló 1 vez en 24 h (última: 24 sep 13:00).",
    "El buzón sales@heymarksman.com no está conectado (invalid_grant): no salen invitaciones ni cotizaciones por correo.",
    "2 envíos fallaron en 24 h (cola de envío).",
    "1 correo rebotó en 24 h."
  ]);
  const message = watchMessage(findings, NOW);
  assert.match(message, /^\*Vigilancia diaria · 25 sep\*\nHay 4 cosas que revisar:\n• La tarea automática/);
});

test("dates read in Mexico City time", () => {
  assert.equal(shortDate("2026-09-25T17:25:53Z"), "25 sep 11:25");
  assert.equal(shortDate("2026-09-24", false), "24 sep");
  assert.equal(shortDate(null), "nunca");
});
