const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_SERVICE_ACTIONS = new Set([
  "get_provider_360",
  "list_provider_service_command_center",
  "list_provider_communications_inbox",
  "get_provider_communication_thread",
]);
const COMMAND_CENTER_QUEUES = new Set(["all", "critical", "attention", "watch", "healthy", "needs_reply", "approvals", "blocked"]);
const COMMUNICATION_INBOX_QUEUES = new Set([
  "all",
  "unmatched",
  "needs_review",
  "needs_reply",
  "waiting_xbf",
  "waiting_provider",
  "waiting_external",
  "active",
  "resolved",
]);
const REDACTED_MESSAGE_SENSITIVITIES = new Set(["restricted", "highly_restricted"]);

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function safeSearch(value: unknown) {
  return (cleanText(value) || "")
    .replace(/[%_,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function clampInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
}

function requireUuid(value: unknown, field: string) {
  const normalized = cleanText(value);
  if (!normalized || !UUID_PATTERN.test(normalized)) throw new Error(`${field} must be a valid UUID.`);
  return normalized;
}

function optionalUuid(value: unknown, field: string) {
  const normalized = cleanText(value);
  if (normalized && !UUID_PATTERN.test(normalized)) throw new Error(`${field} must be a valid UUID.`);
  return normalized;
}

function sanitizeCommunicationMessage(row: Record<string, unknown>) {
  const sensitivity = cleanText(row.sensitivity)?.toLowerCase() || "internal";
  const bodyRedacted = REDACTED_MESSAGE_SENSITIVITIES.has(sensitivity);
  const body = bodyRedacted ? null : cleanText(row.body_text)?.slice(0, 12000) || null;
  return {
    id: row.id,
    thread_id: row.thread_id,
    direction: row.direction,
    sender_name: row.sender_name,
    sender_email: row.sender_email,
    to_emails: Array.isArray(row.to_emails) ? row.to_emails.slice(0, 25) : [],
    cc_emails: Array.isArray(row.cc_emails) ? row.cc_emails.slice(0, 25) : [],
    subject: row.subject,
    body_text: body,
    body_redacted: bodyRedacted,
    sensitivity,
    message_at: row.message_at,
    processing_status: row.processing_status,
  };
}

export function isProviderServiceAction(value: unknown) {
  return PROVIDER_SERVICE_ACTIONS.has(cleanText(value) || "");
}

async function resolveProviderServiceScope(
  supabase: any,
  user: { organization_id?: string | null },
) {
  const workspaceId = cleanText(user.organization_id);
  if (!workspaceId) throw new Error("Organization workspace is required for Provider Service.");

  const registry = await supabase
    .from("workspace_registry")
    .select("organization_uuid")
    .eq("organization_id", workspaceId)
    .maybeSingle();
  if (registry.error) throw registry.error;
  const organizationUuid = cleanText(registry.data?.organization_uuid);
  if (!organizationUuid || !UUID_PATTERN.test(organizationUuid)) {
    throw new Error("Workspace tenant mapping is incomplete.");
  }
  return { workspaceId, organizationUuid };
}

async function listProviderServiceCommandCenter(
  supabase: any,
  organizationUuid: string,
  body: Record<string, unknown>,
) {
  const legalEntityId = optionalUuid(body.legal_entity_id, "legal_entity_id");

  const queue = cleanText(body.queue)?.toLowerCase() || "all";
  if (!COMMAND_CENTER_QUEUES.has(queue)) throw new Error("Unsupported Provider Service queue.");

  const limit = clampInteger(body.limit, 50, 10, 100);
  const offset = clampInteger(body.offset, 0, 0, 100000);
  const search = safeSearch(body.search);

  let query = supabase
    .from("provider_service_command_center")
    .select("*", { count: "exact" })
    .eq("organization_id", organizationUuid)
    .order("attention_rank", { ascending: true })
    .order("health_score", { ascending: true, nullsFirst: true })
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (legalEntityId) query = query.eq("legal_entity_id", legalEntityId);
  if (["critical", "attention", "watch", "healthy"].includes(queue)) query = query.eq("attention_state", queue);
  if (queue === "needs_reply") query = query.gt("needs_reply_count", 0);
  if (queue === "approvals") query = query.gt("pending_approval_count", 0);
  if (queue === "blocked") query = query.in("activation_status", ["blocked", "suspended"]);
  if (search) {
    query = query.or([
      `vendor_name.ilike.%${search}%`,
      `vendor_legal_name.ilike.%${search}%`,
      `vendor_code.ilike.%${search}%`,
      `legal_entity_code.ilike.%${search}%`,
    ].join(","));
  }

  const result = await query;
  if (result.error) throw result.error;
  const rows = (result.data || []) as Record<string, unknown>[];
  const first = rows[0] || {};

  return {
    data: {
      rows,
      total: result.count || 0,
      limit,
      offset,
      queue,
      metrics: {
        relationships: Number(first.total_relationships || 0),
        critical: Number(first.critical_relationships || 0),
        attention: Number(first.attention_relationships || 0),
        needs_reply: Number(first.needs_reply_relationships || 0),
        pending_approvals: Number(first.pending_approval_relationships || 0),
        blocked_activation: Number(first.blocked_activation_relationships || 0),
      },
    },
  };
}

async function listProviderCommunicationsInbox(
  supabase: any,
  organizationUuid: string,
  body: Record<string, unknown>,
) {
  const legalEntityId = optionalUuid(body.legal_entity_id, "legal_entity_id");
  const providerRelationshipId = optionalUuid(body.provider_relationship_id, "provider_relationship_id");
  const vendorId = optionalUuid(body.vendor_id, "vendor_id");
  const queue = cleanText(body.queue)?.toLowerCase() || "all";
  if (!COMMUNICATION_INBOX_QUEUES.has(queue)) throw new Error("Unsupported communications queue.");

  const limit = clampInteger(body.limit, 50, 10, 100);
  const offset = clampInteger(body.offset, 0, 0, 100000);
  const search = safeSearch(body.search);

  let query = supabase
    .from("provider_service_communications_inbox")
    .select("*", { count: "exact" })
    .eq("organization_id", organizationUuid)
    .order("priority_rank", { ascending: true })
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (legalEntityId) query = query.eq("legal_entity_id", legalEntityId);
  if (providerRelationshipId) query = query.eq("provider_relationship_id", providerRelationshipId);
  if (vendorId) query = query.eq("vendor_id", vendorId);
  if (queue !== "all") query = query.eq("queue_code", queue);
  if (search) {
    query = query.or([
      `subject.ilike.%${search}%`,
      `vendor_name.ilike.%${search}%`,
      `vendor_legal_name.ilike.%${search}%`,
      `vendor_code.ilike.%${search}%`,
      `legal_entity_code.ilike.%${search}%`,
    ].join(","));
  }

  const result = await query;
  if (result.error) throw result.error;
  const rows = (result.data || []) as Record<string, unknown>[];
  const first = rows[0] || {};

  return {
    data: {
      rows,
      total: result.count || 0,
      limit,
      offset,
      queue,
      metrics: {
        threads: Number(first.total_threads || 0),
        unmatched: Number(first.unmatched_threads || 0),
        needs_review: Number(first.review_threads || 0),
        needs_reply: Number(first.needs_reply_threads || 0),
        waiting_xbf: Number(first.waiting_xbf_threads || 0),
        waiting_external: Number(first.waiting_external_threads || 0),
        resolved: Number(first.resolved_threads || 0),
      },
    },
  };
}

async function getProviderCommunicationThread(
  supabase: any,
  organizationUuid: string,
  body: Record<string, unknown>,
) {
  const threadId = requireUuid(body.thread_id, "thread_id");

  const thread = await supabase
    .from("provider_service_communications_inbox")
    .select("*")
    .eq("organization_id", organizationUuid)
    .eq("thread_id", threadId)
    .maybeSingle();
  if (thread.error) throw thread.error;
  if (!thread.data) {
    const error = new Error("Communication thread not found in this workspace.");
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  const messages = await supabase
    .from("provider_communication_messages")
    .select("id,thread_id,direction,sender_name,sender_email,to_emails,cc_emails,subject,body_text,sensitivity,message_at,processing_status")
    .eq("organization_id", organizationUuid)
    .eq("thread_id", threadId)
    .order("message_at", { ascending: true })
    .limit(200);
  if (messages.error) throw messages.error;

  const messageRows = (messages.data || []) as Record<string, unknown>[];
  const messageIds = messageRows.map((row) => cleanText(row.id)).filter((value): value is string => Boolean(value));

  const attachmentsPromise = messageIds.length
    ? supabase
      .from("provider_communication_attachments")
      .select("id,message_id,original_filename,mime_type,file_size_bytes,processing_status,document_version_id,created_at")
      .eq("organization_id", organizationUuid)
      .in("message_id", messageIds)
      .order("created_at", { ascending: true })
      .limit(250)
    : Promise.resolve({ data: [], error: null });

  const candidatesPromise = supabase
    .from("provider_communication_match_candidates")
    .select("id,provider_relationship_id,match_basis,confidence,candidate_status,evaluated_by,evaluated_at")
    .eq("organization_id", organizationUuid)
    .eq("thread_id", threadId)
    .order("confidence", { ascending: false })
    .limit(25);

  const caseLinksPromise = supabase
    .from("provider_communication_case_links")
    .select("id,case_id,link_role,status,created_at")
    .eq("organization_id", organizationUuid)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(25);

  const [attachments, candidates, caseLinks] = await Promise.all([
    attachmentsPromise,
    candidatesPromise,
    caseLinksPromise,
  ]);
  if (attachments.error) throw attachments.error;
  if (candidates.error) throw candidates.error;
  if (caseLinks.error) throw caseLinks.error;

  return {
    data: {
      thread: thread.data,
      messages: messageRows.map(sanitizeCommunicationMessage),
      attachments: attachments.data || [],
      match_candidates: candidates.data || [],
      case_links: caseLinks.data || [],
    },
  };
}

async function getProvider360(
  supabase: any,
  workspaceId: string,
  organizationUuid: string,
  body: Record<string, unknown>,
) {
  const vendorId = requireUuid(body.vendor_id, "vendor_id");
  const legalEntityId = optionalUuid(body.legal_entity_id, "legal_entity_id");

  const vendor = await supabase
    .from("vendors")
    .select("id")
    .eq("id", vendorId)
    .eq("organization_id", workspaceId)
    .maybeSingle();
  if (vendor.error) throw vendor.error;
  if (!vendor.data) {
    const error = new Error("Vendor not found in this workspace.");
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  let summaryQuery = supabase
    .from("provider_service_360_relationship_summary")
    .select("*")
    .eq("organization_id", organizationUuid)
    .eq("vendor_id", vendorId)
    .order("legal_entity_code", { ascending: true });
  if (legalEntityId) summaryQuery = summaryQuery.eq("legal_entity_id", legalEntityId);
  const summary = await summaryQuery;
  if (summary.error) throw summary.error;

  const relationships = (summary.data || []) as Record<string, unknown>[];
  const relationshipIds = relationships
    .map((row) => cleanText(row.provider_relationship_id))
    .filter((value): value is string => Boolean(value));

  if (!relationshipIds.length) {
    return {
      data: {
        vendor_id: vendorId,
        relationship_count: 0,
        relationships: [],
        requirements: [],
        activity: [],
      },
    };
  }

  let requirementsQuery = supabase
    .from("provider_service_360_activation_requirements")
    .select("*")
    .eq("organization_id", organizationUuid)
    .eq("vendor_id", vendorId)
    .in("provider_relationship_id", relationshipIds)
    .order("sequence_number", { ascending: true })
    .limit(150);
  let activityQuery = supabase
    .from("provider_service_360_activity_feed")
    .select("*")
    .eq("organization_id", organizationUuid)
    .eq("vendor_id", vendorId)
    .in("provider_relationship_id", relationshipIds)
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .limit(60);
  if (legalEntityId) {
    requirementsQuery = requirementsQuery.eq("legal_entity_id", legalEntityId);
    activityQuery = activityQuery.eq("legal_entity_id", legalEntityId);
  }

  const [requirements, activity] = await Promise.all([requirementsQuery, activityQuery]);
  if (requirements.error) throw requirements.error;
  if (activity.error) throw activity.error;

  return {
    data: {
      vendor_id: vendorId,
      relationship_count: relationships.length,
      relationships,
      requirements: requirements.data || [],
      activity: activity.data || [],
    },
  };
}

export async function handleProviderServiceAction(
  supabase: any,
  user: { organization_id?: string | null },
  body: Record<string, unknown>,
) {
  const action = cleanText(body.action);
  if (!isProviderServiceAction(action)) throw new Error("Unknown Provider Service action.");

  const { workspaceId, organizationUuid } = await resolveProviderServiceScope(supabase, user);
  if (action === "list_provider_service_command_center") {
    return await listProviderServiceCommandCenter(supabase, organizationUuid, body);
  }
  if (action === "list_provider_communications_inbox") {
    return await listProviderCommunicationsInbox(supabase, organizationUuid, body);
  }
  if (action === "get_provider_communication_thread") {
    return await getProviderCommunicationThread(supabase, organizationUuid, body);
  }
  return await getProvider360(supabase, workspaceId, organizationUuid, body);
}
