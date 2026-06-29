import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/kinde.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function cleanRateText(value: unknown) {
  const text = cleanText(value);
  if (!text || /^x$/i.test(text) || /^n\/?a$/i.test(text) || /^please estimate$/i.test(text) || /^tier\s*[123]$/i.test(text)) return null;
  const cleaned = text
    .replace(/\b(USD|US\$|DLLS?|DOLLARS?|MXN|MX\$|PESOS?|CAD|CAN\$)\b/gi, "")
    .replace(/[$,]/g, "")
    .trim();
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  return match ? match[0] : null;
}

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const rateText = cleanRateText(value);
  if (rateText) return Number(rateText);
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function liveBoardFromRows(currentInvitation: Record<string, unknown>, peerRows: Record<string, unknown>[]) {
  const rows = [currentInvitation, ...peerRows]
    .filter((row) => cleanNumber(row.bid_rate) !== null)
    .map((row) => ({
      id: row.id,
      amount: cleanNumber(row.bid_rate) as number,
      currency: cleanText(row.currency) || cleanText(currentInvitation.currency) || "USD",
      weekly_capacity: cleanNumber(row.weekly_capacity),
      transit_days: cleanNumber(row.transit_days),
      responded_at: cleanText(row.responded_at || row.updated_at),
      is_current: row.id === currentInvitation.id
    }))
    .sort((a, b) => a.amount - b.amount);
  const currentIndex = rows.findIndex((row) => row.is_current);
  return {
    updated_at: new Date().toISOString(),
    bid_count: rows.length,
    current_rank: currentIndex >= 0 ? currentIndex + 1 : null,
    best_rate: rows[0]?.amount || null,
    currency: rows[0]?.currency || cleanText(currentInvitation.currency) || "USD",
    rows: rows.map((row, index) => ({
      rank: index + 1,
      bidder: row.is_current ? "Your offer" : `Competitor ${index + 1}`,
      amount: row.amount,
      currency: row.currency,
      weekly_capacity: row.weekly_capacity,
      transit_days: row.transit_days,
      responded_at: row.responded_at,
      is_current: row.is_current
    }))
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const supabase = getClient();
    const body = await request.json().catch(() => ({}));
    const token = cleanText(body.token);
    if (!token) return jsonResponse({ error: "Invitation token is required." }, 400);

    if (body.action === "get_invitation") {
      const result = await supabase
        .from("rfx_lane_vendors")
        .select(`
          id,
          rfx_lane_id,
          invitation_status,
          invitation_token,
          invited_at,
          viewed_at,
          responded_at,
          bid_rate,
          currency,
          weekly_capacity,
          transit_days,
          notes,
          vendors(vendor_name,domain,primary_email),
          rfx_events(rfx_id,name,customer,event_type,status,due_date,notes),
          rfx_lanes(*)
        `)
        .eq("invitation_token", token)
        .single();
      if (result.error) throw result.error;

      if (!result.data.viewed_at) {
        await supabase
          .from("rfx_lane_vendors")
          .update({
            invitation_status: result.data.invitation_status === "invited" ? "viewed" : result.data.invitation_status,
            viewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", result.data.id);
      }

      const peersResult = await supabase
        .from("rfx_lane_vendors")
        .select("id,bid_rate,currency,weekly_capacity,transit_days,responded_at,updated_at")
        .eq("rfx_lane_id", result.data.rfx_lane_id)
        .neq("id", result.data.id)
        .not("bid_rate", "is", null)
        .in("invitation_status", ["quoted", "bid_submitted", "awarded"]);
      if (peersResult.error) throw peersResult.error;

      return jsonResponse({
        invitation: result.data,
        live_board: liveBoardFromRows(result.data, peersResult.data || [])
      });
    }

    if (body.action === "submit_bid") {
      const bidRate = cleanNumber(body.bid_rate);
      if (bidRate === null) return jsonResponse({ error: "Bid rate must be a valid number." }, 400);
      const invitationResult = await supabase
        .from("rfx_lane_vendors")
        .select(`
          id,
          rfx_event_id,
          rfx_lane_id,
          vendor_id,
          vendors(vendor_name,domain,primary_email),
          rfx_events(id,owner_user_id,owner_email,rfx_id,name,customer),
          rfx_lanes(origin,destination,equipment,trailer,operation,service)
        `)
        .eq("invitation_token", token)
        .single();
      if (invitationResult.error) throw invitationResult.error;

      const patch = {
        invitation_status: "quoted",
        bid_rate: bidRate,
        currency: cleanText(body.currency)?.toUpperCase() || "USD",
        weekly_capacity: cleanNumber(body.weekly_capacity),
        transit_days: cleanNumber(body.transit_days),
        notes: cleanText(body.notes),
        response_source: "carrier_portal",
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const result = await supabase
        .from("rfx_lane_vendors")
        .update(patch)
        .eq("id", invitationResult.data.id)
        .select("id,invitation_status,bid_rate,currency,weekly_capacity,transit_days,notes,responded_at")
        .single();
      if (result.error) throw result.error;

      const rfxEvent = Array.isArray(invitationResult.data.rfx_events)
        ? invitationResult.data.rfx_events[0]
        : invitationResult.data.rfx_events;
      const vendor = Array.isArray(invitationResult.data.vendors)
        ? invitationResult.data.vendors[0]
        : invitationResult.data.vendors;
      const lane = Array.isArray(invitationResult.data.rfx_lanes)
        ? invitationResult.data.rfx_lanes[0]
        : invitationResult.data.rfx_lanes;
      if (rfxEvent?.owner_email) {
        await supabase.from("contact_history").insert({
          owner_user_id: rfxEvent.owner_user_id || null,
          owner_email: rfxEvent.owner_email || null,
          vendor_id: invitationResult.data.vendor_id,
          rfx_event_id: invitationResult.data.rfx_event_id,
          channel: "portal",
          direction: "inbound",
          status: "quoted",
          subject: `${rfxEvent.rfx_id || "RFx"} carrier quote submitted`,
          body_preview: [
            vendor?.vendor_name || vendor?.domain || "Carrier",
            `${bidRate} ${patch.currency}`,
            lane?.origin && lane?.destination ? `${lane.origin} -> ${lane.destination}` : null
          ].filter(Boolean).join(" | "),
          metadata: {
            source: "rfx_bid_portal",
            rfx_lane_vendor_id: invitationResult.data.id,
            rfx_lane_id: invitationResult.data.rfx_lane_id
          }
        });
      }
      return jsonResponse({ row: result.data });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    return jsonResponse({ error: error.message }, 400);
  }
});
