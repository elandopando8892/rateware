import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml, formatMoney, isEmail, renderQuoteEmail } from "../supabase/functions/quotedesk-api/email.mjs";
import { metersToMiles, placeQuery, queryKey } from "../supabase/functions/quotedesk-api/routes.mjs";

const quote = { folio: "Q-1002", shipper_name: "Acme <Logistics>", currency: "USD", valid_until: "2026-10-15" };
const lanes = [
  {
    lane_number: 1,
    origin: "Monterrey, NL",
    origin_city: "Monterrey",
    origin_state: "NL",
    destination: "752-Dallas, TX",
    destination_city: "Dallas",
    destination_state: "TX",
    equipment: "Dry Van",
    service: "One Way",
    all_in_rate: "2810.20",
    accessorials: [{ label: "Detención en origen", unit: "hour", quantity: 2, rate: 45 }]
  },
  {
    lane_number: 2,
    origin: "Guadalajara, JA",
    origin_city: "Guadalajara",
    origin_state: "JA",
    destination: "Monterrey, NL",
    destination_city: "Monterrey",
    destination_state: "NL",
    all_in_rate: 1850,
    accessorials: []
  }
];

test("subject names folio, shipper and first route", () => {
  const email = renderQuoteEmail({ quote, lanes, contactName: "Ana" });
  assert.equal(email.subject, "Cotización Q-1002 · Acme <Logistics> · Monterrey, NL → Dallas, TX (+1)");
});

test("text body shows city and state, exact prices, readable units and validity", () => {
  const { text } = renderQuoteEmail({ quote, lanes, contactName: "Ana", note: "Gracias por considerarnos." });
  assert.match(text, /^Hola Ana,/);
  assert.match(text, /Gracias por considerarnos\./);
  assert.match(text, /1\. Monterrey, NL → Dallas, TX · Dry Van · One Way/);
  assert.match(text, /Tarifa all-in: \$2,810\.20 USD por carga/);
  assert.match(text, /Tarifa all-in: \$1,850 USD por carga/);
  assert.match(text, /Incluye Detención en origen: 2 horas × \$45/);
  assert.match(text, /Vigencia: hasta el 15 oct 2026\./);
});

test("a backhaul is our cost assumption: the shipper sees one-way", () => {
  const backhaul = lanes.map((lane) => ({ ...lane, service: "Backhaul" }));
  const { text, html } = renderQuoteEmail({ quote, lanes: backhaul, contactName: "Ana" });
  assert.doesNotMatch(text, /Backhaul/);
  assert.doesNotMatch(html, /Backhaul/);
  assert.match(text, /One Way/);
});

test("html escapes what came from users", () => {
  const { html } = renderQuoteEmail({ quote: { ...quote, folio: "Q-<1>" }, lanes, note: "<script>x</script>" });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.equal(escapeHtml(`a&b"'`), "a&amp;b&quot;&#39;");
});

test("money shows cents only when there are cents", () => {
  assert.equal(formatMoney(1850, "USD"), "$1,850");
  assert.equal(formatMoney("2810.2", "USD"), "$2,810.20");
  assert.equal(formatMoney(52000, "MXN"), "MX$52,000");
  assert.equal(formatMoney("x", "USD"), "—");
});

test("email check rejects the obvious wrong shapes", () => {
  assert.ok(isEmail("ana@acme.com"));
  assert.ok(!isEmail("ana@acme"));
  assert.ok(!isEmail("ana acme.com"));
  assert.ok(!isEmail("<ana@acme.com>"));
});

test("Google addresses: MX city + state name, US city + state, market as fallback", () => {
  assert.equal(placeQuery({ country: "MX", city: "Monterrey", state_code: "NL", state_name: "Nuevo Leon" }), "Monterrey, Nuevo Leon, México");
  assert.equal(placeQuery({ country: "US", city: "Dallas", state_code: "TX" }), "Dallas, TX, USA");
  assert.equal(placeQuery({ country: "US", market: "Laredo Mkt (TX)" }), "Laredo, TX, USA");
  assert.equal(placeQuery({ country: "MX", market: "Monterrey Market", state_name: "Nuevo Leon" }), "Monterrey, Nuevo Leon, México");
  assert.equal(placeQuery({ country: "CA", city: "Toronto", state_code: "ON" }), "Toronto, ON, Canada");
  assert.equal(placeQuery({ country: "US" }), null);
});

test("cache keys ignore case and accents; meters convert to miles", () => {
  assert.equal(queryKey("Nuevo León, México"), queryKey("NUEVO LEON MEXICO"));
  assert.equal(metersToMiles(1609.344), 1);
  assert.equal(metersToMiles(700000), 435);
  assert.equal(metersToMiles(-1), null);
});
