const OUTREACH_EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

export function outreachEmailCandidates(vendor = {}) {
  const secondary = Array.isArray(vendor.secondary_emails) ? vendor.secondary_emails : [];
  return [...new Set([vendor.primary_email, ...secondary]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter((value) => OUTREACH_EMAIL_PATTERN.test(value)))];
}

export function targetChannelReadiness(target, channel = "email") {
  const vendor = target?.invitation?.vendors || {};
  const normalized = String(channel || "email").toLowerCase();
  const email = outreachEmailCandidates(vendor)[0] || "";
  const whatsapp = String(vendor.whatsapp_phone || "").trim();
  const group = String(vendor.whatsapp_group_url || vendor.whatsapp_group_name || vendor.whatsapp_meta_group_id || "").trim();
  const direct = {
    email: { ready: Boolean(email), contact: email, reason: email ? "" : "No valid primary or secondary email" },
    whatsapp: { ready: Boolean(whatsapp), contact: whatsapp, reason: whatsapp ? "" : "No WhatsApp phone" },
    whatsapp_group: { ready: Boolean(group), contact: group, reason: group ? "" : "No WhatsApp group" }
  };
  if (normalized === "email" || normalized === "gmail" || normalized === "gmail_only") return direct.email;
  if (normalized === "whatsapp") return direct.whatsapp;
  if (normalized === "whatsapp_group") return direct.whatsapp_group;
  const required = normalized === "whatsapp_direct_group" || normalized === "whatsapp+group"
    ? [direct.whatsapp, direct.whatsapp_group]
    : normalized === "email_whatsapp_group" || normalized === "all"
      ? [direct.email, direct.whatsapp, direct.whatsapp_group]
      : [direct.email, direct.whatsapp];
  const blocked = required.find((item) => !item.ready);
  return {
    ready: !blocked,
    contact: required.map((item) => item.contact).filter(Boolean).join(" + "),
    reason: blocked?.reason || ""
  };
}
