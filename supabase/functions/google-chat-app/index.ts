import { corsHeaders, jsonResponse } from "../_shared/kinde.ts";

function cleanText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (request.method !== "POST") {
    return jsonResponse({ text: "Rateware Bid Room Chat app is online." });
  }

  const event = await request.json().catch(() => ({}));
  const type = cleanText(event.type);
  const space = cleanText(event.space?.displayName || event.space?.name);
  const user = cleanText(event.user?.displayName || event.user?.email);

  if (type === "ADDED_TO_SPACE") {
    return jsonResponse({
      text: `Rateware Bid Room is connected${space ? ` to ${space}` : ""}. Messages from Rateware will mirror here.`
    });
  }

  if (type === "REMOVED_FROM_SPACE") {
    return jsonResponse({ text: "Rateware Bid Room was removed from this Space." });
  }

  if (type === "MESSAGE") {
    return jsonResponse({
      text: `Rateware Bid Room is listening${user ? `, ${user}` : ""}. Use Rateware to start or sync Bid Room threads.`
    });
  }

  return jsonResponse({
    text: "Rateware Bid Room Chat app is online."
  });
});
