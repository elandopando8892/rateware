const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

export function isProviderServiceAction(value: unknown) {
  return cleanText(value) === "get_provider_360";
}

export async function handleProviderServiceAction(
  supabase: any,
  user: { organization_id?: string | null },
  body: Record<string, unknown>,
) {
  if (!isProviderServiceAction(body.action)) throw new Error("Unknown Provider Service action.");

  const workspaceId = cleanText(user.organization_id);
  const vendorId = cleanText(body.vendor_id);
  const legalEntityId = cleanText(body.legal_entity_id);
  if (!workspaceId) throw new Error("Organization workspace is required for Provider Service.");
  if (!vendorId || !UUID_PATTERN.test(vendorId)) throw new Error("A valid vendor_id is required.");
  if (legalEntityId && !UUID_PATTERN.test(legalEntityId)) throw new Error("legal_entity_id must be a valid UUID.");

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
