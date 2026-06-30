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

function relationRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return (value[0] || {}) as Record<string, unknown>;
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function publicLane(row: Record<string, unknown>) {
  return {
    id: row.id,
    lane_number: row.lane_number,
    origin: row.origin || row.origin_city,
    destination: row.destination || row.destination_city,
    origin_city: row.origin_city,
    origin_state: row.origin_state,
    origin_market: row.origin_market,
    origin_region: row.origin_region,
    destination_city: row.destination_city,
    destination_state: row.destination_state,
    destination_market: row.destination_market,
    destination_region: row.destination_region,
    equipment: row.equipment,
    trailer: row.trailer,
    config: row.config,
    operation: row.operation,
    service: row.service,
    weekly_volume: row.weekly_volume,
    target_rate: row.target_rate,
    currency: row.currency || "USD"
  };
}

function publicEvent(row: Record<string, unknown>) {
  return {
    id: row.id,
    rfx_id: row.rfx_id,
    name: row.name,
    customer: row.customer,
    event_type: row.event_type,
    status: row.status,
    due_date: row.due_date
  };
}

function bidRoomVisibility() {
  return {
    mode: "rank_only",
    competitor_names_visible: false,
    competitor_rates_visible: false,
    request_invite_enabled: true,
    open_book_enabled: true,
    refresh_seconds: 30
  };
}

function dueState(dueDate: unknown) {
  const due = cleanText(dueDate);
  if (!due) return { due_date: null, days_remaining: null, status: "no_deadline" };
  const dueAt = new Date(`${due}T23:59:59`);
  if (Number.isNaN(dueAt.getTime())) return { due_date: due, days_remaining: null, status: "unknown" };
  const now = new Date();
  const ms = dueAt.getTime() - now.getTime();
  const days = Math.ceil(ms / 86400000);
  return {
    due_date: due,
    days_remaining: days,
    status: days < 0 ? "closed" : days <= 1 ? "closing" : "open"
  };
}

function laneFitTags(lane: Record<string, unknown>, event: Record<string, unknown>) {
  return [
    cleanText(lane.equipment),
    cleanText(lane.trailer),
    cleanText(lane.config),
    cleanText(lane.operation),
    cleanText(lane.service),
    cleanText(lane.origin_market),
    cleanText(lane.destination_market),
    cleanText(event.event_type)
  ].filter(Boolean).slice(0, 6);
}

function businessBookStatus(row: Record<string, unknown>) {
  const status = String(cleanText(row.invitation_status) || "drafted").toLowerCase();
  const bidRate = cleanNumber(row.bid_rate);
  if (status === "awarded") return "awarded";
  if (bidRate !== null || ["quoted", "bid_submitted"].includes(status)) return "quoted";
  if (["invited", "viewed", "responded"].includes(status)) return "invited";
  return status || "drafted";
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
  const currentAmount = cleanNumber(currentInvitation.bid_rate);
  const bestAmount = rows[0]?.amount || null;
  const currency = rows[0]?.currency || cleanText(currentInvitation.currency) || "USD";
  const deltaToBest = currentAmount !== null && bestAmount !== null ? currentAmount - bestAmount : null;
  const deltaPct = currentAmount !== null && bestAmount ? deltaToBest / bestAmount : null;
  const positionSignal = currentAmount === null
    ? (rows.length ? "Market is active" : "Awaiting first offer")
    : currentIndex === 0
      ? "Leading offer"
      : Number(deltaPct) <= 0.05
        ? "Competitive range"
        : "Needs pricing review";
  const guidance = currentAmount === null
    ? "Submit your all-in offer to unlock your anonymous rank."
    : currentIndex === 0
      ? "Your offer is currently leading. Keep capacity and assumptions current."
      : Number(deltaPct) <= 0.05
        ? "You are close to the leading range. Review capacity, transit, and price before the deadline."
        : "Your offer is behind the leading range. Reprice only if this lane is strategic.";
  return {
    updated_at: new Date().toISOString(),
    visibility: bidRoomVisibility(),
    bid_count: rows.length,
    current_rank: currentIndex >= 0 ? currentIndex + 1 : null,
    best_rate: currentIndex === 0 ? currentAmount : null,
    best_rate_visible: currentIndex === 0,
    currency,
    position_signal: positionSignal,
    guidance,
    delta_to_leader: deltaToBest,
    delta_bucket: deltaToBest === null
      ? null
      : deltaToBest <= 0
        ? "leading"
        : deltaToBest <= 250
          ? "within_250"
          : deltaToBest <= 500
            ? "within_500"
            : "above_500",
    rows: rows.map((row, index) => ({
      rank: index + 1,
      bidder: row.is_current ? "Your offer" : `Anonymous carrier ${index + 1}`,
      amount: row.is_current ? row.amount : null,
      amount_display: row.is_current
        ? "Your submitted offer"
        : currentAmount === null
          ? "Hidden until you bid"
          : row.amount < currentAmount
            ? "Lower than your offer"
            : row.amount === currentAmount
              ? "Comparable to your offer"
              : "Above your offer",
      currency: row.currency,
      weekly_capacity: row.weekly_capacity,
      transit_days: row.transit_days,
      responded_at: row.responded_at,
      is_current: row.is_current
    }))
  };
}

function carrierBusinessBook(currentInvitation: Record<string, unknown>, invitedRows: Record<string, unknown>[], openLaneRows: Record<string, unknown>[]) {
  const vendor = relationRecord(currentInvitation.vendors);
  const invitedLaneIds = new Set(invitedRows.map((row) => cleanText(row.rfx_lane_id)).filter(Boolean));
  const invited = invitedRows.map((row) => {
    const lane = relationRecord(row.rfx_lanes);
    const event = relationRecord(row.rfx_events);
    return {
      participation_status: cleanText(row.invitation_status) || "drafted",
      business_status: businessBookStatus(row),
      is_invited: true,
      invitation_token: row.invitation_token,
      invitation_id: row.id,
      bid_rate: cleanNumber(row.bid_rate),
      currency: cleanText(row.currency) || cleanText(lane.currency) || "USD",
      weekly_capacity: cleanNumber(row.weekly_capacity),
      transit_days: cleanNumber(row.transit_days),
      invited_at: row.invited_at,
      responded_at: row.responded_at,
      due_state: dueState(relationRecord(row.rfx_events).due_date),
      fit_tags: laneFitTags(lane, event),
      event: publicEvent(event),
      lane: publicLane(lane)
    };
  });
  const open_not_invited = openLaneRows
    .filter((lane) => !invitedLaneIds.has(cleanText(lane.id)))
    .map((lane) => ({
      participation_status: "not_invited",
      business_status: "open",
      is_invited: false,
      due_state: dueState(relationRecord(lane.rfx_events).due_date),
      fit_tags: laneFitTags(lane, relationRecord(lane.rfx_events)),
      event: publicEvent(relationRecord(lane.rfx_events)),
      lane: publicLane(lane)
    }));
  const quoted = invited.filter((row) => row.bid_rate !== null || ["quoted", "bid_submitted", "awarded"].includes(String(row.participation_status || "").toLowerCase()));
  return {
    visibility: bidRoomVisibility(),
    carrier: {
      vendor_name: vendor.vendor_name || vendor.domain || "Carrier",
      domain: vendor.domain || "",
      primary_email: vendor.primary_email || ""
    },
    summary: {
      invited: invited.length,
      not_invited_open: open_not_invited.length,
      quoted: quoted.length,
      awarded: invited.filter((row) => row.participation_status === "awarded").length
    },
    invited,
    open_not_invited,
    quoted
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
          rfx_event_id,
          rfx_lane_id,
          vendor_id,
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
          rfx_events(id,owner_user_id,owner_email,rfx_id,name,customer,event_type,status,due_date,notes),
          rfx_lanes(id,rfx_event_id,lane_number,origin,destination,origin_city,origin_state,origin_market,origin_region,destination_city,destination_state,destination_market,destination_region,equipment,trailer,config,operation,service,weekly_volume,target_rate,currency)
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

      const currentEvent = relationRecord(result.data.rfx_events);
      const ownerEmail = cleanText(currentEvent.owner_email);
      const invitedResult = ownerEmail
        ? await supabase
            .from("rfx_lane_vendors")
            .select(`
              id,
              rfx_event_id,
              rfx_lane_id,
              vendor_id,
              invitation_status,
              invitation_token,
              invited_at,
              responded_at,
              bid_rate,
              currency,
              weekly_capacity,
              transit_days,
              rfx_events!inner(id,owner_email,rfx_id,name,customer,event_type,status,due_date),
              rfx_lanes(id,rfx_event_id,lane_number,origin,destination,origin_city,origin_state,origin_market,origin_region,destination_city,destination_state,destination_market,destination_region,equipment,trailer,config,operation,service,weekly_volume,target_rate,currency)
            `)
            .eq("vendor_id", result.data.vendor_id)
            .eq("rfx_events.owner_email", ownerEmail)
            .neq("invitation_status", "archived")
            .order("responded_at", { ascending: false, nullsFirst: false })
            .limit(500)
        : { data: [], error: null };
      if (invitedResult.error) throw invitedResult.error;

      const openLanesResult = ownerEmail
        ? await supabase
            .from("rfx_lanes")
            .select(`
              id,
              rfx_event_id,
              lane_number,
              origin,
              destination,
              origin_city,
              origin_state,
              origin_market,
              origin_region,
              destination_city,
              destination_state,
              destination_market,
              destination_region,
              equipment,
              trailer,
              config,
              operation,
              service,
              weekly_volume,
              target_rate,
              currency,
              rfx_events!inner(id,owner_email,rfx_id,name,customer,event_type,status,due_date)
            `)
            .eq("rfx_events.owner_email", ownerEmail)
            .eq("rfx_events.status", "open")
            .order("lane_number", { ascending: true })
            .limit(500)
        : { data: [], error: null };
      if (openLanesResult.error) throw openLanesResult.error;

      return jsonResponse({
        invitation: result.data,
        live_board: liveBoardFromRows(result.data, peersResult.data || []),
        carrier_book: carrierBusinessBook(result.data, invitedResult.data || [], openLanesResult.data || [])
      });
    }

    if (body.action === "request_lane_access") {
      const laneId = cleanText(body.lane_id);
      if (!laneId) return jsonResponse({ error: "Lane id is required." }, 400);
      const contextResult = await supabase
        .from("rfx_lane_vendors")
        .select("id,vendor_id,rfx_events(id,owner_user_id,owner_email,rfx_id,name),vendors(vendor_name,domain,primary_email)")
        .eq("invitation_token", token)
        .single();
      if (contextResult.error) throw contextResult.error;
      const currentEvent = relationRecord(contextResult.data.rfx_events);
      const ownerEmail = cleanText(currentEvent.owner_email);
      const laneResult = await supabase
        .from("rfx_lanes")
        .select("id,rfx_event_id,origin,destination,rfx_events!inner(id,owner_email,rfx_id,name)")
        .eq("id", laneId)
        .eq("rfx_events.owner_email", ownerEmail)
        .single();
      if (laneResult.error) throw laneResult.error;
      const existing = await supabase
        .from("rfx_lane_vendors")
        .select("id,invitation_status")
        .eq("vendor_id", contextResult.data.vendor_id)
        .eq("rfx_lane_id", laneId)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) return jsonResponse({ requested: false, status: existing.data.invitation_status, message: "Carrier already has this lane in its book." });

      const lane = laneResult.data;
      const laneEvent = relationRecord(lane.rfx_events);
      const vendor = relationRecord(contextResult.data.vendors);
      const history = await supabase.from("contact_history").insert({
        owner_user_id: currentEvent.owner_user_id || null,
        owner_email: ownerEmail,
        vendor_id: contextResult.data.vendor_id,
        rfx_event_id: lane.rfx_event_id,
        channel: "portal",
        direction: "inbound",
        status: "requested_invite",
        subject: `${laneEvent.rfx_id || "RFx"} carrier requested lane access`,
        body_preview: [
          vendor.vendor_name || vendor.domain || "Carrier",
          lane.origin && lane.destination ? `${lane.origin} -> ${lane.destination}` : null
        ].filter(Boolean).join(" | "),
        metadata: { source: "carrier_business_book", requested_lane_id: laneId }
      });
      if (history.error) throw history.error;
      return jsonResponse({ requested: true, message: "Access request recorded." });
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
