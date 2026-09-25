// Pure rules for ops-daily-watch: what counts as "needs a look" in the jobs
// QuoteDesk and the Bid Room depend on, and the Google Chat message about it.
// The snapshot is read by index.ts in one query; nothing here touches I/O.

export const TIME_ZONE = "America/Mexico_City";

// How stale each feed may get before the team hears about it. Banxico publishes
// the FIX on Mexican business days, so a Monday holiday leaves Tuesday morning
// with Friday's (4 days and a half); the EIA diesel index is weekly, read on
// Tuesday and again on Wednesday.
export const LIMITS = {
  fcmCopyHours: 3,
  fcmFailuresPerDay: 3,
  fxDays: 5,
  dieselDays: 10
};

const HOUR = 3600000;
const DAY = 24 * HOUR;

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "25 sep 10:17" (or "25 sep" for a plain date), in Mexico City time. */
export function shortDate(value, withTime = true) {
  const date = toDate(value);
  if (!date) return "nunca";
  const options = withTime
    ? { timeZone: TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }
    : { timeZone: "UTC", day: "numeric", month: "short" };
  return new Intl.DateTimeFormat("es-MX", options).format(date).replace(".", "").replace(",", "");
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/**
 * What needs a look, as short Spanish sentences. `snapshot` is index.ts's
 * query result: cron_failures, fcm, fx_last_date, diesel_last_week, outreach,
 * mailbox.
 */
export function watchFindings(snapshot, now = new Date()) {
  const findings = [];
  const at = now.getTime();

  for (const job of snapshot.cron_failures || []) {
    findings.push(`La tarea automática «${job.jobname}» falló ${plural(Number(job.failed), "vez", "veces")} en 24 h (última: ${shortDate(job.last_failed)}).`);
  }

  const fcm = snapshot.fcm || {};
  const lastCopy = toDate(fcm.last_ok);
  if (!lastCopy || at - lastCopy.getTime() > LIMITS.fcmCopyHours * HOUR) {
    const detail = fcm.last_error ? ` Último error: ${String(fcm.last_error).slice(0, 160)}` : "";
    findings.push(`La copia del FCM no ha salido bien desde ${shortDate(fcm.last_ok)}.${detail}`);
  } else if (Number(fcm.failed_24h) >= LIMITS.fcmFailuresPerDay) {
    findings.push(`La copia del FCM falló ${plural(Number(fcm.failed_24h), "vez", "veces")} en 24 h, aunque la última salió bien.`);
  }

  const check = fcm.engine_check || null;
  if (check) {
    const reasons = [
      ...(Array.isArray(check.reasons) ? check.reasons : []),
      ...(Array.isArray(check.unknown_params) ? check.unknown_params.map((entry) => entry.reason) : [])
    ].filter(Boolean);
    if (check.status === "review" || reasons.length) {
      findings.push(`La alarma del FCM está en revisión: ${reasons.join(" ") || "el FCM cambió."}`);
    } else if (check.status === "unverified") {
      findings.push(`La alarma del FCM no pudo comparar la fórmula con el FCM publicado (revisión del ${shortDate(check.checked_at)}).`);
    }
  }

  const fx = toDate(snapshot.fx_last_date);
  if (!fx || at - fx.getTime() > LIMITS.fxDays * DAY) {
    findings.push(`El tipo de cambio de Banxico no se actualiza: el último FIX es del ${shortDate(snapshot.fx_last_date, false)}.`);
  }

  const diesel = toDate(snapshot.diesel_last_week);
  if (!diesel || at - diesel.getTime() > LIMITS.dieselDays * DAY) {
    findings.push(`El diésel de EE. UU. no se actualiza: la última semana es la del ${shortDate(snapshot.diesel_last_week, false)}.`);
  }

  const mailbox = snapshot.mailbox || null;
  if (!mailbox || mailbox.status !== "connected") {
    const detail = mailbox?.last_error ? ` (${String(mailbox.last_error).slice(0, 120)})` : "";
    findings.push(`El buzón sales@heymarksman.com no está conectado${detail}: no salen invitaciones ni cotizaciones por correo.`);
  }

  const outreach = snapshot.outreach || {};
  if (Number(outreach.failed) > 0) {
    findings.push(`${plural(Number(outreach.failed), "envío falló", "envíos fallaron")} en 24 h (cola de envío).`);
  }
  if (Number(outreach.bounced) > 0) {
    findings.push(`${plural(Number(outreach.bounced), "correo rebotó", "correos rebotaron")} en 24 h.`);
  }

  return findings;
}

/**
 * The Google Chat text, or null when there's nothing to say. With nothing to
 * report it still speaks on Mondays, so a silent watch is noticed.
 */
export function watchMessage(findings, now = new Date()) {
  const day = shortDate(now.toISOString()).split(" ").slice(0, 2).join(" ");
  if (findings.length) {
    const intro = findings.length === 1 ? "Hay 1 cosa que revisar:" : `Hay ${findings.length} cosas que revisar:`;
    return [`*Vigilancia diaria · ${day}*`, intro, ...findings.map((finding) => `• ${finding}`)].join("\n");
  }
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" }).format(now);
  if (weekday !== "Mon") return null;
  return `*Vigilancia semanal · ${day}*\nTodo en orden: copia y fórmula del FCM, tipo de cambio, diésel, buzón y envíos.`;
}
