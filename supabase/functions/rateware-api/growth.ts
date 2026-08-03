type DbClient = any;

type GrowthUser = {
  owner_user_id: string | null;
  owner_email: string | null;
  organization_id: string | null;
};

type GrowthRow = Record<string, any>;

const GROWTH_ACTIONS = new Set([
  "growth_dashboard",
  "import_growth_csv",
  "list_growth_segments",
  "preview_growth_segment",
  "save_growth_segment",
  "archive_growth_segment",
  "restore_growth_segment",
  "list_growth_campaigns",
  "get_growth_campaign",
  "save_growth_campaign",
  "save_growth_message",
  "refresh_growth_campaign_audience",
  "export_growth_campaign",
  "set_growth_campaign_status",
  "list_growth_results",
  "record_growth_result",
  "convert_growth_result",
  "growth_ai_action"
]);

const ACCOUNT_TYPES = new Set(["shipper", "carrier", "broker_forwarder", "vendor", "unknown"]);
const DATA_STATUSES = new Set(["ready", "needs_review", "duplicate", "excluded", "not_shipper"]);
const SEGMENT_STATUSES = new Set(["draft", "ready", "used", "archived"]);
const CAMPAIGN_STATUSES = new Set(["draft", "ready", "exported", "launched", "completed", "archived"]);
const RESULT_OUTCOMES = new Set([
  "no_response",
  "replied",
  "interested",
  "not_interested",
  "wrong_person",
  "referral",
  "send_info",
  "meeting_booked",
  "rfq_received",
  "opportunity_created",
  "unsubscribe",
  "bounce"
]);
const MESSAGE_STEPS = new Set(["email_1", "follow_up_1", "follow_up_2", "linkedin_note", "call_script", "whatsapp_message", "custom"]);
const MESSAGE_CHANNELS = new Set(["email", "linkedin", "call", "whatsapp"]);

const GENERIC_EMAIL_PREFIXES = new Set([
  "admin", "contact", "contacto", "customerservice", "hello", "hola", "info", "office",
  "operations", "operaciones", "sales", "support", "ventas"
]);

function cleanText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function cleanLower(value: unknown): string {
  return cleanText(value).toLowerCase();
}

function objectRecord(value: unknown): GrowthRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as GrowthRow : {};
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  return cleanText(value).split(/[,;|]/).map((entry) => entry.trim()).filter(Boolean);
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function normalizeDomain(value: unknown): string {
  const raw = cleanLower(value);
  if (!raw) return "";
  const candidate = raw.includes("@") ? raw.split("@").pop() || "" : raw;
  return candidate
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .replace(/\.+$/, "");
}

function normalizeEmail(value: unknown): string {
  return cleanLower(value).replace(/^mailto:/, "");
}

function isValidEmail(value: unknown): boolean {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function emailQuality(value: unknown): "valid" | "generic" | "invalid" | "missing" {
  const email = normalizeEmail(value);
  if (!email) return "missing";
  if (!isValidEmail(email)) return "invalid";
  const prefix = email.split("@")[0].replace(/[._-]/g, "");
  return GENERIC_EMAIL_PREFIXES.has(prefix) ? "generic" : "valid";
}

function normalizeKey(value: unknown): string {
  return cleanLower(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = cleanText(value).replace(/[^0-9.-]/g, "");
  if (!normalized) return null;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}

function titleCase(value: string): string {
  return value.replace(/[_+.-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()).trim();
}

function inferAccountType(row: GrowthRow): string {
  const explicit = cleanLower(row.account_type).replace(/[\s/-]+/g, "_");
  if (ACCOUNT_TYPES.has(explicit)) return explicit;
  const haystack = normalizeKey([
    row.company_name,
    row.account_name,
    row.domain,
    row.industry,
    row.description,
    row.labels
  ].join(" "));
  if (/\b(broker|forwarder|forwarding|freight forward|customs broker|3pl)\b/.test(haystack)) return "broker_forwarder";
  if (/\b(carrier|trucking|truck lines|transportes|transportation|haulage|motor freight)\b/.test(haystack)) return "carrier";
  if (/\b(software|insurance|consulting|supplier|vendor|technology|saas)\b/.test(haystack)) return "vendor";
  if (/\b(manufactur|industrial|automotive|food|beverage|retail|consumer|distribution|distributor|importer|exporter|pharma|chemical|aerospace|packaging)\b/.test(haystack)) return "shipper";
  if (/\b(logistics|logistica|logistico|warehouse|warehousing|freight)\b/.test(haystack)) return "unknown";
  return "unknown";
}

function inferLogisticsFit(row: GrowthRow): string[] {
  const explicit = stringList(row.logistics_fit).map((value) => value.toLowerCase());
  if (explicit.length) return uniqueStrings(explicit);
  const text = normalizeKey([row.industry, row.description, row.labels, row.notes, row.company_name].join(" "));
  const fit: string[] = [];
  if (/cross border|crossborder|mexico|mx us|import|export/.test(text)) fit.push("cross_border");
  if (/intra mexico|nacional|domestic mx/.test(text)) fit.push("intra_mexico");
  if (/drayage|port|puerto|container/.test(text)) fit.push("drayage_port");
  if (/expedit|time critical|urgent|just in time/.test(text)) fit.push("time_critical");
  if (/dedicat|fleet|milk run/.test(text)) fit.push("dedicated");
  if (/cold|reefer|refriger|temperature|frozen|produce/.test(text)) fit.push("refrigerated");
  if (/flatbed|open deck|steel|machinery/.test(text)) fit.push("flatbed_open_deck");
  return fit.length ? uniqueStrings(fit) : ["unknown"];
}

function accountDataStatus(accountType: string, companyName: string, quality: string): string {
  if (["carrier", "broker_forwarder", "vendor"].includes(accountType)) return "not_shipper";
  if (!companyName || accountType === "unknown" || !["valid", "generic"].includes(quality)) return "needs_review";
  return "ready";
}

function requireOwner(user: GrowthUser): string {
  const owner = cleanLower(user.owner_email);
  if (!owner) throw new Error("Growth Hacking requires an authenticated workspace owner.");
  return owner;
}

function ownedRow(user: GrowthUser, row: GrowthRow): GrowthRow {
  return {
    ...row,
    owner_user_id: user.owner_user_id,
    owner_email: requireOwner(user),
    organization_id: user.organization_id || null
  };
}

async function fetchAllOwned(
  supabase: DbClient,
  table: string,
  ownerEmail: string,
  select = "*",
  orderColumn = "created_at",
  maxRows = 20000
): Promise<GrowthRow[]> {
  const rows: GrowthRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const result = await supabase
      .from(table)
      .select(select)
      .eq("owner_email", ownerEmail)
      .order(orderColumn, { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (result.error) throw result.error;
    const page = Array.isArray(result.data) ? result.data : [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function insertChunks(supabase: DbClient, table: string, rows: GrowthRow[], size = 250): Promise<GrowthRow[]> {
  const inserted: GrowthRow[] = [];
  for (let index = 0; index < rows.length; index += size) {
    const result = await supabase.from(table).insert(rows.slice(index, index + size)).select();
    if (result.error) throw result.error;
    inserted.push(...(result.data || []));
  }
  return inserted;
}

async function countOwned(supabase: DbClient, table: string, ownerEmail: string, filters: GrowthRow = {}): Promise<number> {
  let query = supabase.from(table).select("id", { count: "exact", head: true }).eq("owner_email", ownerEmail);
  for (const [column, value] of Object.entries(filters)) {
    if (Array.isArray(value)) query = query.in(column, value);
    else query = query.eq(column, value);
  }
  const result = await query;
  if (result.error) throw result.error;
  return result.count || 0;
}

async function growthDashboard(supabase: DbClient, user: GrowthUser): Promise<GrowthRow> {
  const owner = requireOwner(user);
  const [
    shippers,
    ready,
    segments,
    campaigns,
    responses,
    rfqs,
    opportunities
  ] = await Promise.all([
    countOwned(supabase, "shippers", owner, { account_type: "shipper" }),
    countOwned(supabase, "shippers", owner, { account_type: "shipper", data_status: "ready" }),
    countOwned(supabase, "growth_segments", owner, { status: ["ready", "used"] }),
    countOwned(supabase, "growth_campaigns", owner),
    countOwned(supabase, "growth_results", owner),
    countOwned(supabase, "growth_results", owner, { outcome: "rfq_received" }),
    countOwned(supabase, "growth_results", owner, { outcome: "opportunity_created" })
  ]);
  return {
    metrics: { shippers, ready, segments, campaigns, responses, rfqs, opportunities },
    flow: ["CSV externo", "Shipper CRM", "Segmento", "Campana", "Resultados"],
    sending_enabled: false
  };
}

async function importGrowthCsv(supabase: DbClient, user: GrowthUser, body: GrowthRow): Promise<GrowthRow> {
  const owner = requireOwner(user);
  const rows = Array.isArray(body.rows) ? body.rows.map(objectRecord) : [];
  if (!rows.length) throw new Error("Map at least one CSV row before importing.");
  if (rows.length > 5000) throw new Error("Import batches are limited to 5,000 rows. Split the CSV into smaller files.");

  const sourceFileName = cleanText(body.source_file_name) || "growth-import.csv";
  const sourceListName = cleanText(body.source_list_name) || cleanText(body.list_name) || sourceFileName.replace(/\.csv$/i, "");
  const importedAt = new Date().toISOString();
  const existingAccounts = await fetchAllOwned(
    supabase,
    "shippers",
    owner,
    "id,shipper_name,domain,external_source,external_source_id,data_status,account_type,status",
    "created_at",
    50000
  );
  const existingContacts = await fetchAllOwned(
    supabase,
    "shipper_contacts",
    owner,
    "id,shipper_id,contact_name,email,external_source,external_source_id,status",
    "created_at",
    100000
  );

  const accountByDomain = new Map(existingAccounts.filter((row) => row.domain).map((row) => [normalizeDomain(row.domain), row]));
  const accountByName = new Map(existingAccounts.map((row) => [normalizeKey(row.shipper_name), row]));
  const accountByExternal = new Map(existingAccounts
    .filter((row) => cleanText(row.external_source_id))
    .map((row) => [`${cleanLower(row.external_source)}:${cleanLower(row.external_source_id)}`, row]));
  const contactByEmail = new Map(existingContacts.filter((row) => isValidEmail(row.email)).map((row) => [normalizeEmail(row.email), row]));
  const contactByExternal = new Map(existingContacts
    .filter((row) => cleanText(row.external_source_id))
    .map((row) => [`${cleanLower(row.external_source)}:${cleanLower(row.external_source_id)}`, row]));

  const groups = new Map<string, { account: GrowthRow; contacts: GrowthRow[]; sourceRows: GrowthRow[]; quality: string }>();
  let skipped = 0;
  for (const sourceRow of rows) {
    const companyName = cleanText(sourceRow.company_name || sourceRow.account_name || sourceRow.organization_name);
    const email = normalizeEmail(sourceRow.email);
    const domain = normalizeDomain(sourceRow.domain || sourceRow.company_domain || sourceRow.website || email);
    const externalAccountId = cleanText(sourceRow.external_account_id);
    if (!companyName && !domain) {
      skipped += 1;
      continue;
    }
    const key = externalAccountId ? `external:${cleanLower(externalAccountId)}` : domain ? `domain:${domain}` : `name:${normalizeKey(companyName)}`;
    const quality = emailQuality(email);
    if (!groups.has(key)) {
      const accountType = inferAccountType(sourceRow);
      groups.set(key, {
        account: {
          import_key: key,
          shipper_name: companyName || domain,
          legal_name: cleanText(sourceRow.legal_name || sourceRow.organization_name) || null,
          domain: domain || null,
          website: cleanText(sourceRow.website) || (domain ? `https://${domain}` : null),
          linkedin_url: cleanText(sourceRow.linkedin_url || sourceRow.company_linkedin) || null,
          industry: cleanText(sourceRow.industry) || null,
          employee_count: parseNumber(sourceRow.employees || sourceRow.employee_count),
          annual_revenue: parseNumber(sourceRow.revenue || sourceRow.annual_revenue),
          headquarters_city: cleanText(sourceRow.city) || null,
          headquarters_state: cleanText(sourceRow.state) || null,
          headquarters_country: cleanText(sourceRow.country) || null,
          account_type: accountType,
          data_status: accountDataStatus(accountType, companyName, quality),
          logistics_fit: inferLogisticsFit(sourceRow),
          tags: uniqueStrings(stringList(sourceRow.labels || sourceRow.tags)),
          source: "csv_import",
          external_source: "csv_import",
          external_source_id: externalAccountId || null,
          source_file_name: sourceFileName,
          source_list_name: sourceListName,
          imported_at: importedAt,
          original_row_json: sourceRow,
          metadata: { growth_import: true, source_list_name: sourceListName }
        },
        contacts: [],
        sourceRows: [],
        quality
      });
    }
    const group = groups.get(key)!;
    group.sourceRows.push(sourceRow);
    if (email || cleanText(sourceRow.full_name || sourceRow.first_name || sourceRow.last_name)) {
      const firstName = cleanText(sourceRow.first_name);
      const lastName = cleanText(sourceRow.last_name);
      const fallbackName = email ? titleCase(email.split("@")[0]) : "Contact";
      const contactName = cleanText(sourceRow.full_name) || [firstName, lastName].filter(Boolean).join(" ") || fallbackName;
      group.contacts.push({
        contact_name: contactName,
        first_name: firstName || null,
        last_name: lastName || null,
        title: cleanText(sourceRow.title) || null,
        department: cleanText(sourceRow.department) || null,
        email: email || null,
        phone: cleanText(sourceRow.phone) || null,
        linkedin_url: cleanText(sourceRow.contact_linkedin || sourceRow.contact_linkedin_url) || null,
        persona: cleanText(sourceRow.persona) || null,
        buying_role: cleanText(sourceRow.buying_role) || null,
        email_quality: quality,
        data_status: ["valid", "generic"].includes(quality) ? "ready" : "needs_review",
        source_file_name: sourceFileName,
        source_list_name: sourceListName,
        imported_at: importedAt,
        original_row_json: sourceRow,
        external_source: "csv_import",
        external_source_id: cleanText(sourceRow.external_contact_id) || null,
        metadata: { growth_import: true, source_list_name: sourceListName }
      });
    }
  }

  const newAccounts: GrowthRow[] = [];
  const accountForKey = new Map<string, GrowthRow>();
  let duplicateAccounts = 0;
  for (const [key, group] of groups) {
    const account = group.account;
    const externalKey = account.external_source_id ? `csv_import:${cleanLower(account.external_source_id)}` : "";
    const existing = (externalKey && accountByExternal.get(externalKey))
      || (account.domain && accountByDomain.get(normalizeDomain(account.domain)))
      || accountByName.get(normalizeKey(account.shipper_name));
    if (existing) {
      accountForKey.set(key, existing);
      duplicateAccounts += 1;
      continue;
    }
    const { import_key: _importKey, ...accountPayload } = account;
    newAccounts.push(ownedRow(user, accountPayload));
  }

  const insertedAccounts = await insertChunks(supabase, "shippers", newAccounts);
  for (const account of insertedAccounts) {
    const externalKey = cleanText(account.external_source_id) ? `external:${cleanLower(account.external_source_id)}` : "";
    const key = externalKey || (account.domain ? `domain:${normalizeDomain(account.domain)}` : `name:${normalizeKey(account.shipper_name)}`);
    accountForKey.set(key, account);
  }

  const contactsToInsert: GrowthRow[] = [];
  const seenContactKeys = new Set<string>();
  let duplicateContacts = 0;
  let genericEmails = 0;
  let needsReview = 0;
  let notShipper = 0;
  for (const [key, group] of groups) {
    const account = accountForKey.get(key);
    if (!account) continue;
    if (group.account.data_status === "needs_review") needsReview += 1;
    if (group.account.data_status === "not_shipper") notShipper += 1;
    for (const contact of group.contacts) {
      const externalKey = contact.external_source_id ? `csv_import:${cleanLower(contact.external_source_id)}` : "";
      const emailKey = normalizeEmail(contact.email);
      const localKey = emailKey || `${account.id}:${normalizeKey(contact.contact_name)}`;
      if ((externalKey && contactByExternal.has(externalKey)) || (emailKey && contactByEmail.has(emailKey)) || seenContactKeys.has(localKey)) {
        duplicateContacts += 1;
        continue;
      }
      seenContactKeys.add(localKey);
      if (contact.email_quality === "generic") genericEmails += 1;
      contactsToInsert.push(ownedRow(user, { ...contact, shipper_id: account.id }));
    }
  }
  const insertedContacts = await insertChunks(supabase, "shipper_contacts", contactsToInsert);

  return {
    summary: {
      source_file_name: sourceFileName,
      source_list_name: sourceListName,
      rows_received: rows.length,
      accounts_imported: insertedAccounts.length,
      contacts_imported: insertedContacts.length,
      duplicate_accounts: duplicateAccounts,
      duplicate_contacts: duplicateContacts,
      needs_review: needsReview,
      not_shipper: notShipper,
      generic_emails: genericEmails,
      skipped
    },
    imported_account_ids: insertedAccounts.map((row) => row.id),
    sending_enabled: false
  };
}

function includesAny(value: unknown, expected: string[]): boolean {
  if (!expected.length) return true;
  const normalized = normalizeKey(value);
  return expected.some((item) => normalized.includes(normalizeKey(item)));
}

function segmentCriteria(value: unknown): GrowthRow {
  const input = objectRecord(value);
  return {
    account_types: stringList(input.account_types || input.account_type).map(cleanLower),
    data_statuses: stringList(input.data_statuses || input.data_status).map(cleanLower),
    logistics_fit: stringList(input.logistics_fit).map(cleanLower),
    countries: stringList(input.countries || input.country),
    states: stringList(input.states || input.state),
    industries: stringList(input.industries || input.industry),
    personas: stringList(input.personas || input.persona),
    titles: stringList(input.titles || input.title),
    source_lists: stringList(input.source_lists || input.source_list_name),
    has_valid_email: input.has_valid_email === true || cleanLower(input.has_valid_email) === "true"
  };
}

async function matchedSegmentRows(supabase: DbClient, user: GrowthUser, rawCriteria: unknown): Promise<GrowthRow> {
  const owner = requireOwner(user);
  const criteria = segmentCriteria(rawCriteria);
  const accounts = (await fetchAllOwned(supabase, "shippers", owner, "*", "created_at", 50000))
    .filter((row) => row.status !== "archived" && cleanLower(row.data_status) !== "excluded");
  const contacts = (await fetchAllOwned(supabase, "shipper_contacts", owner, "*", "created_at", 100000))
    .filter((row) => row.status !== "inactive" && cleanLower(row.data_status) !== "excluded");
  const contactsByAccount = new Map<string, GrowthRow[]>();
  for (const contact of contacts) {
    const list = contactsByAccount.get(contact.shipper_id) || [];
    list.push(contact);
    contactsByAccount.set(contact.shipper_id, list);
  }

  const matches: GrowthRow[] = [];
  for (const account of accounts) {
    const accountContacts = contactsByAccount.get(account.id) || [];
    if (criteria.account_types.length && !criteria.account_types.includes(cleanLower(account.account_type))) continue;
    if (criteria.data_statuses.length && !criteria.data_statuses.includes(cleanLower(account.data_status))) continue;
    if (criteria.logistics_fit.length && !criteria.logistics_fit.some((fit: string) => (account.logistics_fit || []).map(cleanLower).includes(fit))) continue;
    if (!includesAny(account.headquarters_country, criteria.countries)) continue;
    if (!includesAny(account.headquarters_state, criteria.states)) continue;
    if (!includesAny(account.industry, criteria.industries)) continue;
    if (criteria.source_lists.length && !criteria.source_lists.some((source: string) => cleanLower(account.source_list_name) === cleanLower(source)
      || accountContacts.some((contact) => cleanLower(contact.source_list_name) === cleanLower(source)))) continue;

    let qualifyingContacts = accountContacts;
    if (criteria.personas.length) qualifyingContacts = qualifyingContacts.filter((contact) => includesAny(contact.persona, criteria.personas));
    if (criteria.titles.length) qualifyingContacts = qualifyingContacts.filter((contact) => includesAny(contact.title, criteria.titles));
    if (criteria.has_valid_email) qualifyingContacts = qualifyingContacts.filter((contact) => contact.email_quality === "valid" && isValidEmail(contact.email));
    if ((criteria.personas.length || criteria.titles.length || criteria.has_valid_email) && !qualifyingContacts.length) continue;

    matches.push({ account, contacts: qualifyingContacts });
  }
  return {
    criteria,
    matches,
    account_count: matches.length,
    contact_count: matches.reduce((sum, match) => sum + match.contacts.length, 0)
  };
}

async function listGrowthSegments(supabase: DbClient, user: GrowthUser): Promise<GrowthRow> {
  const owner = requireOwner(user);
  const result = await supabase.from("growth_segments").select("*").eq("owner_email", owner).order("updated_at", { ascending: false });
  if (result.error) throw result.error;
  return { rows: result.data || [] };
}

async function previewGrowthSegment(supabase: DbClient, user: GrowthUser, body: GrowthRow): Promise<GrowthRow> {
  const matched = await matchedSegmentRows(supabase, user, body.criteria || body);
  return {
    criteria: matched.criteria,
    account_count: matched.account_count,
    contact_count: matched.contact_count,
    sample: matched.matches.slice(0, 100).map((match: GrowthRow) => ({
      account: match.account,
      contacts: match.contacts.slice(0, 5)
    }))
  };
}

async function saveGrowthSegment(supabase: DbClient, user: GrowthUser, body: GrowthRow): Promise<GrowthRow> {
  const input = objectRecord(body.segment || body);
  const name = cleanText(input.name);
  if (!name) throw new Error("Segment name is required.");
  const status = SEGMENT_STATUSES.has(cleanLower(input.status)) ? cleanLower(input.status) : "draft";
  const matched = await matchedSegmentRows(supabase, user, input.criteria || {});
  const now = new Date().toISOString();
  const patch = {
    name,
    description: cleanText(input.description) || null,
    criteria: matched.criteria,
    account_count: matched.account_count,
    contact_count: matched.contact_count,
    status,
    last_previewed_at: now,
    updated_at: now,
    metadata: objectRecord(input.metadata)
  };
  const id = cleanText(input.id || body.id);
  let result;
  if (id) {
    result = await supabase.from("growth_segments").update(patch).eq("owner_email", requireOwner(user)).eq("id", id).select().single();
  } else {
    result = await supabase.from("growth_segments").insert(ownedRow(user, patch)).select().single();
  }
  if (result.error) throw result.error;
  return { row: result.data, sample: matched.matches.slice(0, 20) };
}

async function archiveGrowthSegment(supabase: DbClient, user: GrowthUser, body: GrowthRow): Promise<GrowthRow> {
  const id = cleanText(body.id || body.segment_id);
  if (!id) throw new Error("Segment id is required.");
  const result = await supabase.from("growth_segments")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("owner_email", requireOwner(user)).eq("id", id).select().single();
  if (result.error) throw result.error;
  return { row: result.data };
}

async function restoreGrowthSegment(supabase: DbClient, user: GrowthUser, body: GrowthRow): Promise<GrowthRow> {
  const id = cleanText(body.id || body.segment_id);
  if (!id) throw new Error("Segment id is required.");
  const result = await supabase.from("growth_segments")
    .update({ status: "ready", updated_at: new Date().toISOString() })
    .eq("owner_email", requireOwner(user)).eq("id", id).select().single();
  if (result.error) throw result.error;
  return { row: result.data };
}

function defaultCampaignMessages(campaign: GrowthRow): GrowthRow[] {
  const objective = cleanText(campaign.objective).replace(/_/g, " ") || "validar su operacion";
  const hook = cleanText(campaign.offer_hook).replace(/_/g, " ") || "una conversacion logistica concreta";
  return [
    {
      step_type: "email_1",
      channel: "email",
      subject: "{{account_name}} | {{campaign_name}}",
      body: `Hola {{first_name}},\n\nEstamos revisando ${objective} con empresas de su perfil. Nos gustaria validar si ${hook} hace sentido para {{account_name}}.\n\nEres la persona correcta para una conversacion breve?`
    },
    {
      step_type: "follow_up_1",
      channel: "email",
      subject: "Seguimiento | {{account_name}}",
      body: "Hola {{first_name}}, retomo mi mensaje anterior. Tiene sentido revisar esta oportunidad logistica o debo contactar a otra persona?"
    },
    {
      step_type: "follow_up_2",
      channel: "email",
      subject: "Cierro el seguimiento | {{account_name}}",
      body: "Hola {{first_name}}, cierro este seguimiento por ahora. Si este tema cambia de prioridad, con gusto retomamos la conversacion."
    },
    {
      step_type: "linkedin_note",
      channel: "linkedin",
      subject: null,
      body: "Hola {{first_name}}, me gustaria conectar para conversar sobre oportunidades logisticas de {{account_name}}."
    },
    {
      step_type: "call_script",
      channel: "call",
      subject: null,
      body: "Validar responsable logistico, corredores prioritarios y siguiente paso concreto."
    },
    {
      step_type: "whatsapp_message",
      channel: "whatsapp",
      subject: null,
      body: "Hola {{first_name}}, soy de MARKSMAN. Eres la persona correcta para revisar una oportunidad logistica para {{account_name}}?"
    }
  ];
}

async function populateCampaignMembers(supabase: DbClient, user: GrowthUser, campaign: GrowthRow): Promise<number> {
  if (!campaign.segment_id) return 0;
  const segmentResult = await supabase.from("growth_segments").select("*")
    .eq("owner_email", requireOwner(user)).eq("id", campaign.segment_id).single();
  if (segmentResult.error) throw segmentResult.error;
  const matched = await matchedSegmentRows(supabase, user, segmentResult.data.criteria || {});
  const existing = await fetchAllOwned(supabase, "growth_campaign_members", requireOwner(user), "id,campaign_id,shipper_id,contact_id", "created_at", 100000);
  const keys = new Set(existing.filter((row) => row.campaign_id === campaign.id)
    .map((row) => `${row.shipper_id}:${row.contact_id || "account"}`));
  const rows: GrowthRow[] = [];
  for (const match of matched.matches) {
    const contacts = match.contacts.length ? match.contacts : [null];
    for (const contact of contacts) {
      const key = `${match.account.id}:${contact?.id || "account"}`;
      if (keys.has(key)) continue;
      keys.add(key);
      rows.push(ownedRow(user, {
        campaign_id: campaign.id,
        shipper_id: match.account.id,
        contact_id: contact?.id || null,
        status: hasGrowthDeliveryPath(campaign, contact) ? "ready" : "pending",
        metadata: { segment_id: campaign.segment_id }
      }));
    }
  }
  if (rows.length) await insertChunks(supabase, "growth_campaign_members", rows);
  return rows.length;
}

function growthDeliveryPaths(campaign: GrowthRow, contact: GrowthRow | null): Array<{ channel: string; destination: string }> {
  if (!contact) return [];
  const channels = stringList(campaign.channels).map(cleanLower).filter(Boolean);
  const configuredChannels = channels.length ? channels : ["email"];
  const paths: Array<{ channel: string; destination: string }> = [];
  for (const channel of configuredChannels) {
    if (channel === "email" && cleanLower(contact.email_quality) === "valid" && isValidEmail(contact.email)) {
      paths.push({ channel: "Email", destination: normalizeEmail(contact.email) });
    }
    if (channel === "linkedin" && /^https?:\/\//i.test(cleanText(contact.linkedin_url))) {
      paths.push({ channel: "LinkedIn", destination: cleanText(contact.linkedin_url) });
    }
    if (channel === "call" && cleanText(contact.phone)) {
      paths.push({ channel: "Call", destination: cleanText(contact.phone) });
    }
    if (channel === "whatsapp" && cleanText(contact.phone)) {
      paths.push({ channel: "WhatsApp", destination: cleanText(contact.phone) });
    }
  }
  return paths;
}

function hasGrowthDeliveryPath(campaign: GrowthRow, contact: GrowthRow | null): boolean {
  return growthDeliveryPaths(campaign, contact).length > 0;
}

async function listGrowthCampaigns(supabase: DbClient, user: GrowthUser): Promise<GrowthRow> {
  const owner = requireOwner(user);
  const campaignsResult = await supabase.from("growth_campaigns").select("*, segment:growth_segments(id,name,account_count,contact_count)")
    .eq("owner_email", owner).order("updated_at", { ascending: false });
  if (campaignsResult.error) throw campaignsResult.error;
  const members = await fetchAllOwned(supabase, "growth_campaign_members", owner, "campaign_id,status", "created_at", 100000);
  const counts = new Map<string, GrowthRow>();
  for (const member of members) {
    const item = counts.get(member.campaign_id) || { total: 0, ready: 0, review: 0, suppressed: 0, exported: 0, responses: 0 };
    item.total += 1;
    if (member.status === "ready") item.ready += 1;
    if (member.status === "pending") item.review += 1;
    if (["unsubscribed", "bounced", "do_not_contact", "excluded"].includes(member.status)) item.suppressed += 1;
    if (member.status === "exported") item.exported += 1;
    if (["replied", "interested", "not_interested", "wrong_person", "referral", "meeting_booked", "rfq", "opportunity"].includes(member.status)) item.responses += 1;
    counts.set(member.campaign_id, item);
  }
  return { rows: (campaignsResult.data || []).map((campaign: GrowthRow) => ({ ...campaign, member_counts: counts.get(campaign.id) || { total: 0, ready: 0, review: 0, suppressed: 0, exported: 0, responses: 0 } })) };
}

async function saveGrowthCampaign(supabase: DbClient, user: GrowthUser, body: GrowthRow): Promise<GrowthRow> {
  const input = objectRecord(body.campaign || body);
  const name = cleanText(input.name);
  if (!name) throw new Error("Campaign name is required.");
  const segmentId = cleanText(input.segment_id);
  if (!segmentId) {
    throw new Error("A campaign must use an active saved segment. Select one before creating the campaign.");
  }
  const segmentResult = await supabase.from("growth_segments").select("id,status")
    .eq("owner_email", requireOwner(user)).eq("id", segmentId).single();
  if (segmentResult.error) throw segmentResult.error;
  if (!["ready", "used"].includes(cleanLower(segmentResult.data.status))) {
    throw new Error("A campaign must use an active saved segment. Mark it Ready or restore it before creating the campaign.");
  }
  const status = CAMPAIGN_STATUSES.has(cleanLower(input.status)) ? cleanLower(input.status) : "draft";
  const patch = {
    name,
    objective: cleanLower(input.objective) || "get_rfqs",
    segment_id: segmentId,
    offer_hook: cleanLower(input.offer_hook) || null,
    channels: uniqueStrings(stringList(input.channels).length ? stringList(input.channels) : ["email"]),
    status,
    metadata: objectRecord(input.metadata),
    updated_at: new Date().toISOString()
  };
  const id = cleanText(input.id || body.id);
  let result;
  if (id) result = await supabase.from("growth_campaigns").update(patch).eq("owner_email", requireOwner(user)).eq("id", id).select().single();
  else result = await supabase.from("growth_campaigns").insert(ownedRow(user, patch)).select().single();
  if (result.error) throw result.error;
  const segmentUpdate = await supabase.from("growth_segments")
    .update({ status: "used", updated_at: new Date().toISOString() })
    .eq("owner_email", requireOwner(user)).eq("id", segmentId);
  if (segmentUpdate.error) throw segmentUpdate.error;
  const addedMembers = await populateCampaignMembers(supabase, user, result.data);

  const messagesResult = await supabase.from("growth_campaign_messages").select("id")
    .eq("owner_email", requireOwner(user)).eq("campaign_id", result.data.id).limit(1);
  if (messagesResult.error) throw messagesResult.error;
  if (!(messagesResult.data || []).length) {
    await insertChunks(supabase, "growth_campaign_messages", defaultCampaignMessages(result.data).map((message) => ownedRow(user, {
      ...message,
      campaign_id: result.data.id,
      variant: "A",
      metadata: { generated_by: "growth_mvp_rules" }
    })));
  }
  return { row: result.data, members_added: addedMembers };
}

async function getGrowthCampaign(supabase: DbClient, user: GrowthUser, body: GrowthRow): Promise<GrowthRow> {
  const id = cleanText(body.id || body.campaign_id);
  if (!id) throw new Error("Campaign id is required.");
  const owner = requireOwner(user);
  const campaignResult = await supabase.from("growth_campaigns").select("*, segment:growth_segments(*)")
    .eq("owner_email", owner).eq("id", id).single();
  if (campaignResult.error) throw campaignResult.error;
  const membersResult = await supabase.from("growth_campaign_members").select("*")
    .eq("owner_email", owner).eq("campaign_id", id).order("created_at", { ascending: true });
  if (membersResult.error) throw membersResult.error;
  const messagesResult = await supabase.from("growth_campaign_messages").select("*")
    .eq("owner_email", owner).eq("campaign_id", id).order("created_at", { ascending: true });
  if (messagesResult.error) throw messagesResult.error;
  const members = membersResult.data || [];
  const shipperIds = uniqueStrings(members.map((row: GrowthRow) => row.shipper_id));
  const contactIds = uniqueStrings(members.map((row: GrowthRow) => row.contact_id));
  const [accountsResult, contactsResult] = await Promise.all([
    shipperIds.length
      ? supabase.from("shippers").select("id,shipper_name,legal_name,domain,industry,account_type,data_status,logistics_fit,headquarters_country,headquarters_state,source_list_name").eq("owner_email", owner).in("id", shipperIds)
      : { data: [], error: null },
    contactIds.length
      ? supabase.from("shipper_contacts").select("id,shipper_id,contact_name,first_name,last_name,title,persona,buying_role,email,email_quality,phone,linkedin_url,status,data_status").eq("owner_email", owner).in("id", contactIds)
      : { data: [], error: null }
  ]);
  if (accountsResult.error) throw accountsResult.error;
  if (contactsResult.error) throw contactsResult.error;
  const accountMap = new Map((accountsResult.data || []).map((row: GrowthRow) => [row.id, row]));
  const contactMap = new Map((contactsResult.data || []).map((row: GrowthRow) => [row.id, row]));
  return {
    campaign: campaignResult.data,
    members: members.map((member: GrowthRow) => ({
      ...member,
      account: accountMap.get(member.shipper_id) || null,
      contact: contactMap.get(member.contact_id) || null
    })),
    messages: messagesResult.data || [],
    sending_enabled: false
  };
}

const GROWTH_AUDIENCE_PRESERVED_MEMBER_STATUSES = new Set([
  "exported", "contacted", "replied", "interested", "not_interested", "wrong_person",
  "referral", "send_info", "meeting_booked", "rfq", "opportunity",
  "unsubscribed", "bounced", "do_not_contact", "excluded"
]);

function revalidatedAudienceStatus(campaign: GrowthRow, member: GrowthRow): string {
  const currentStatus = cleanLower(member.status);
  if (GROWTH_AUDIENCE_PRESERVED_MEMBER_STATUSES.has(currentStatus)) return currentStatus;
  const account = objectRecord(member.account);
  const contact = member.contact ? objectRecord(member.contact) : null;
  if (cleanLower(account.data_status) === "excluded") return "pending";
  if (!contact || cleanLower(contact.status) === "inactive" || cleanLower(contact.data_status) === "excluded") return "pending";
  return hasGrowthDeliveryPath(campaign, contact) ? "ready" : "pending";
}

async function refreshGrowthCampaignAudience(supabase: DbClient, user: GrowthUser, body: GrowthRow): Promise<GrowthRow> {
  const detail = await getGrowthCampaign(supabase, user, body);
  const campaign = detail.campaign;
  const owner = requireOwner(user);
  const updates = new Map<string, string[]>();
  let ready = 0;
  let review = 0;
  let preserved = 0;
  let unchanged = 0;

  for (const member of detail.members || []) {
    const currentStatus = cleanLower(member.status);
    const nextStatus = revalidatedAudienceStatus(campaign, member);
    if (GROWTH_AUDIENCE_PRESERVED_MEMBER_STATUSES.has(currentStatus)) {
      preserved += 1;
      continue;
    }
    if (nextStatus === "ready") ready += 1;
    else review += 1;
    if (nextStatus === currentStatus) {
      unchanged += 1;
      continue;
    }
    const ids = updates.get(nextStatus) || [];
    ids.push(member.id);
    updates.set(nextStatus, ids);
  }

  const now = new Date().toISOString();
  let updated = 0;
  for (const [status, ids] of updates) {
    for (let index = 0; index < ids.length; index += 250) {
      const result = await supabase.from("growth_campaign_members")
        .update({ status, updated_at: now })
        .eq("owner_email", owner)
        .eq("campaign_id", campaign.id)
        .in("id", ids.slice(index, index + 250));
      if (result.error) throw result.error;
      updated += Math.min(250, ids.length - index);
    }
  }

  return {
    campaign_id: campaign.id,
    ready,
    review,
    preserved,
    unchanged,
    updated,
    message: "Audience revalidated from Shipper CRM. Exported contacts, responses, bounces, opt-outs, and exclusions were preserved."
  };
}

async function saveGrowthMessage(supabase: DbClient, user: GrowthUser, body: GrowthRow): Promise<GrowthRow> {
  const input = objectRecord(body.message || body);
  const campaignId = cleanText(input.campaign_id || body.campaign_id);
  if (!campaignId) throw new Error("Campaign id is required.");
  const stepType = MESSAGE_STEPS.has(cleanLower(input.step_type)) ? cleanLower(input.step_type) : "custom";
  const channel = MESSAGE_CHANNELS.has(cleanLower(input.channel)) ? cleanLower(input.channel) : "email";
  const payload = ownedRow(user, {
    campaign_id: campaignId,
    step_type: stepType,
    channel,
    variant: cleanText(input.variant) || "A",
    subject: cleanText(input.subject) || null,
    body: cleanText(input.body),
    metadata: objectRecord(input.metadata),
    updated_at: new Date().toISOString()
  });
  const result = await supabase.from("growth_campaign_messages")
    .upsert(payload, { onConflict: "campaign_id,step_type,channel,variant" }).select().single();
  if (result.error) throw result.error;
  return { row: result.data };
}

function personalize(value: unknown, context: GrowthRow): string {
  return cleanText(value).replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_match, key) => cleanText(context[key]) || "");
}

const GROWTH_NON_EXPORTABLE_MEMBER_STATUSES = new Set([
  "pending", "needs_review", "invalid", "exported", "contacted", "replied", "interested", "not_interested",
  "wrong_person", "referral", "send_info", "meeting_booked", "rfq", "opportunity", "unsubscribed", "bounced",
  "do_not_contact", "excluded"
]);
const GROWTH_SUPPRESSED_MEMBER_STATUSES = new Set(["unsubscribed", "bounced", "do_not_contact", "excluded"]);

function isGrowthExportEligible(campaign: GrowthRow, member: GrowthRow, account: GrowthRow, contact: GrowthRow): boolean {
  return cleanLower(member.status) === "ready"
    && !GROWTH_NON_EXPORTABLE_MEMBER_STATUSES.has(cleanLower(member.status))
    && cleanLower(account.data_status) !== "excluded"
    && cleanLower(contact.status) !== "inactive"
    && cleanLower(contact.data_status) !== "excluded"
    && hasGrowthDeliveryPath(campaign, contact);
}

async function exportGrowthCampaign(supabase: DbClient, user: GrowthUser, body: GrowthRow): Promise<GrowthRow> {
  const detail = await getGrowthCampaign(supabase, user, body);
  const campaign = detail.campaign;
  const owner = requireOwner(user);
  const members = detail.members;
  const shipperIds = uniqueStrings(members.map((row: GrowthRow) => row.shipper_id));
  const contactIds = uniqueStrings(members.map((row: GrowthRow) => row.contact_id));
  let accounts: GrowthRow[] = [];
  let contacts: GrowthRow[] = [];
  if (shipperIds.length) {
    const result = await supabase.from("shippers").select("*").eq("owner_email", owner).in("id", shipperIds);
    if (result.error) throw result.error;
    accounts = result.data || [];
  }
  if (contactIds.length) {
    const result = await supabase.from("shipper_contacts").select("*").eq("owner_email", owner).in("id", contactIds);
    if (result.error) throw result.error;
    contacts = result.data || [];
  }
  const accountMap = new Map(accounts.map((row) => [row.id, row]));
  const contactMap = new Map(contacts.map((row) => [row.id, row]));
  const messageMap = new Map(detail.messages.map((row: GrowthRow) => [row.step_type, row]));
  const exportableMembers = members.filter((member: GrowthRow) => isGrowthExportEligible(
    campaign,
    member,
    accountMap.get(member.shipper_id) || {},
    contactMap.get(member.contact_id) || {}
  ));
  const reviewCount = members.filter((member: GrowthRow) => ["pending", "needs_review", "invalid"].includes(cleanLower(member.status))).length;
  const suppressedCount = members.filter((member: GrowthRow) => GROWTH_SUPPRESSED_MEMBER_STATUSES.has(cleanLower(member.status))).length;
  const historyCount = members.filter((member: GrowthRow) => GROWTH_AUDIENCE_PRESERVED_MEMBER_STATUSES.has(cleanLower(member.status)) && !GROWTH_SUPPRESSED_MEMBER_STATUSES.has(cleanLower(member.status))).length;
  if (!exportableMembers.length) throw new Error("No campaign members are ready to export. Review pending or excluded contacts first.");
  const rows = exportableMembers.map((member: GrowthRow) => {
    const account = accountMap.get(member.shipper_id) || {};
    const contact = contactMap.get(member.contact_id) || {};
    const deliveryPaths = growthDeliveryPaths(campaign, contact);
    const primaryDelivery = deliveryPaths[0] || { channel: "", destination: "" };
    const context = {
      campaign_name: campaign.name,
      account_name: account.shipper_name,
      domain: account.domain,
      contact_name: contact.contact_name,
      first_name: contact.first_name || cleanText(contact.contact_name).split(" ")[0],
      last_name: contact.last_name,
      title: contact.title
    };
    const message = (step: string, field: string) => personalize(objectRecord(messageMap.get(step))[field], context);
    return {
      campaign_name: campaign.name,
      account_name: account.shipper_name || "",
      domain: account.domain || "",
      contact_name: contact.contact_name || "",
      first_name: context.first_name || "",
      last_name: contact.last_name || "",
      title: contact.title || "",
      email: contact.email || "",
      phone: contact.phone || "",
      linkedin_url: contact.linkedin_url || "",
      persona: contact.persona || "",
      logistics_fit: (account.logistics_fit || []).join(" | "),
      execution_channel: primaryDelivery.channel,
      execution_destination: primaryDelivery.destination,
      available_delivery_channels: deliveryPaths.map((path) => `${path.channel}: ${path.destination}`).join(" | "),
      email_1_subject: message("email_1", "subject"),
      email_1_body: message("email_1", "body"),
      follow_up_1_subject: message("follow_up_1", "subject"),
      follow_up_1_body: message("follow_up_1", "body"),
      follow_up_2_subject: message("follow_up_2", "subject"),
      follow_up_2_body: message("follow_up_2", "body"),
      linkedin_note: message("linkedin_note", "body"),
      call_script: message("call_script", "body"),
      whatsapp_message: message("whatsapp_message", "body")
    };
  });
  const now = new Date().toISOString();
  const memberIds = exportableMembers.map((row: GrowthRow) => row.id);
  for (let index = 0; index < memberIds.length; index += 500) {
    const result = await supabase.from("growth_campaign_members")
      .update({ status: "exported", last_activity_at: now, updated_at: now })
      .eq("owner_email", owner).in("id", memberIds.slice(index, index + 500));
    if (result.error) throw result.error;
  }
  const campaignUpdate = await supabase.from("growth_campaigns")
    .update({ status: "exported", exported_at: now, updated_at: now })
    .eq("owner_email", owner).eq("id", campaign.id);
  if (campaignUpdate.error) throw campaignUpdate.error;
  return {
    rows,
    filename: `${cleanText(campaign.name).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "growth-campaign"}.csv`,
    exported_count: rows.length,
    review_count: reviewCount,
    suppressed_count: suppressedCount,
    history_count: historyCount,
    sending_enabled: false
  };
}

async function setGrowthCampaignStatus(supabase: DbClient, user: GrowthUser, body: GrowthRow): Promise<GrowthRow> {
  const id = cleanText(body.id || body.campaign_id);
  const status = cleanLower(body.status);
  if (!id || !CAMPAIGN_STATUSES.has(status)) throw new Error("A valid campaign id and status are required.");
  const result = await supabase.from("growth_campaigns")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("owner_email", requireOwner(user)).eq("id", id).select().single();
  if (result.error) throw result.error;
  return { row: result.data };
}

async function listGrowthResults(supabase: DbClient, user: GrowthUser, body: GrowthRow): Promise<GrowthRow> {
  const owner = requireOwner(user);
  let query = supabase.from("growth_results").select("*").eq("owner_email", owner).order("updated_at", { ascending: false }).limit(2000);
  if (cleanText(body.campaign_id)) query = query.eq("campaign_id", cleanText(body.campaign_id));
  const result = await query;
  if (result.error) throw result.error;
  const rows = result.data || [];
  const shipperIds = uniqueStrings(rows.map((row: GrowthRow) => row.shipper_id));
  const contactIds = uniqueStrings(rows.map((row: GrowthRow) => row.contact_id));
  const campaignIds = uniqueStrings(rows.map((row: GrowthRow) => row.campaign_id));
  const [accountsResult, contactsResult, campaignsResult] = await Promise.all([
    shipperIds.length ? supabase.from("shippers").select("id,shipper_name,domain").eq("owner_email", owner).in("id", shipperIds) : { data: [], error: null },
    contactIds.length ? supabase.from("shipper_contacts").select("id,contact_name,email,title").eq("owner_email", owner).in("id", contactIds) : { data: [], error: null },
    campaignIds.length ? supabase.from("growth_campaigns").select("id,name").eq("owner_email", owner).in("id", campaignIds) : { data: [], error: null }
  ]);
  if (accountsResult.error) throw accountsResult.error;
  if (contactsResult.error) throw contactsResult.error;
  if (campaignsResult.error) throw campaignsResult.error;
  const accountMap = new Map((accountsResult.data || []).map((row: GrowthRow) => [row.id, row]));
  const contactMap = new Map((contactsResult.data || []).map((row: GrowthRow) => [row.id, row]));
  const campaignMap = new Map((campaignsResult.data || []).map((row: GrowthRow) => [row.id, row]));
  const latestResultByMember = new Map<string, GrowthRow>();
  for (const row of rows) {
    const memberId = cleanText(row.campaign_member_id);
    const contactId = cleanText(row.contact_id);
    const key = memberId || (contactId ? `${cleanText(row.campaign_id)}:${contactId}` : row.id);
    if (!latestResultByMember.has(key)) latestResultByMember.set(key, row);
  }
  const latestResults = [...latestResultByMember.values()];
  const metrics: GrowthRow = { contacts_exported: 0, responses: 0, interested: 0, referrals: 0, meetings: 0, rfqs: 0, opportunities: 0, suppressed: 0 };
  const exported = await countOwned(supabase, "growth_campaign_members", owner, {
    status: [
      "exported",
      "contacted",
      "replied",
      "interested",
      "not_interested",
      "wrong_person",
      "referral",
      "send_info",
      "meeting_booked",
      "rfq",
      "opportunity",
      "unsubscribed",
      "bounced",
      "do_not_contact"
    ]
  });
  metrics.contacts_exported = exported;
  for (const row of latestResults) {
    if (["replied", "interested", "referral", "send_info", "meeting_booked", "rfq_received"].includes(row.outcome)) metrics.responses += 1;
    if (row.outcome === "interested") metrics.interested += 1;
    if (row.outcome === "referral") metrics.referrals += 1;
    if (row.outcome === "meeting_booked") metrics.meetings += 1;
    if (row.outcome === "rfq_received") metrics.rfqs += 1;
    if (row.outcome === "opportunity_created") metrics.opportunities += 1;
    if (["unsubscribe", "bounce"].includes(row.outcome)) metrics.suppressed += 1;
  }
  return {
    metrics,
    rows: rows.map((row: GrowthRow) => ({
      ...row,
      account: accountMap.get(row.shipper_id) || null,
      contact: contactMap.get(row.contact_id) || null,
      campaign: campaignMap.get(row.campaign_id) || null
    }))
  };
}

function memberStatusForOutcome(outcome: string): string {
  const map: GrowthRow = {
    no_response: "contacted",
    replied: "replied",
    interested: "interested",
    not_interested: "not_interested",
    wrong_person: "wrong_person",
    referral: "referral",
    send_info: "send_info",
    meeting_booked: "meeting_booked",
    rfq_received: "rfq",
    opportunity_created: "opportunity",
    unsubscribe: "unsubscribed",
    bounce: "bounced"
  };
  return map[outcome] || "contacted";
}

async function recordGrowthResult(supabase: DbClient, user: GrowthUser, body: GrowthRow): Promise<GrowthRow> {
  const input = objectRecord(body.result || body);
  const outcome = cleanLower(input.outcome);
  if (!RESULT_OUTCOMES.has(outcome)) throw new Error("Select a valid campaign result.");
  if (outcome === "opportunity_created") throw new Error("Create the opportunity from the result actions so the Shipper CRM record stays linked.");
  const shipperId = cleanText(input.shipper_id);
  if (!shipperId) throw new Error("A Shipper CRM account is required.");
  const now = new Date().toISOString();
  const payload = ownedRow(user, {
    campaign_id: cleanText(input.campaign_id) || null,
    campaign_member_id: cleanText(input.campaign_member_id) || null,
    shipper_id: shipperId,
    contact_id: cleanText(input.contact_id) || null,
    outcome,
    notes: cleanText(input.notes) || null,
    next_action: cleanText(input.next_action) || null,
    follow_up_at: cleanText(input.follow_up_at) || null,
    metadata: objectRecord(input.metadata),
    updated_at: now
  });
  const result = await supabase.from("growth_results").insert(payload).select().single();
  if (result.error) throw result.error;
  if (payload.campaign_member_id) {
    const memberUpdate = await supabase.from("growth_campaign_members")
      .update({ status: memberStatusForOutcome(outcome), result_notes: payload.notes, last_activity_at: now, updated_at: now })
      .eq("owner_email", requireOwner(user)).eq("id", payload.campaign_member_id);
    if (memberUpdate.error) throw memberUpdate.error;
  }
  if (["unsubscribe", "bounce"].includes(outcome) && payload.contact_id) {
    const relatedMemberUpdate = await supabase.from("growth_campaign_members")
      .update({ status: memberStatusForOutcome(outcome), last_activity_at: now, updated_at: now })
      .eq("owner_email", requireOwner(user)).eq("contact_id", payload.contact_id);
    if (relatedMemberUpdate.error) throw relatedMemberUpdate.error;
    const contactPatch: GrowthRow = { status: "inactive", data_status: "excluded", updated_at: now };
    if (outcome === "bounce") contactPatch.email_quality = "invalid";
    const contactUpdate = await supabase.from("shipper_contacts")
      .update(contactPatch)
      .eq("owner_email", requireOwner(user)).eq("id", payload.contact_id);
    if (contactUpdate.error) throw contactUpdate.error;
  }
  return { row: result.data };
}

async function convertGrowthResult(supabase: DbClient, user: GrowthUser, body: GrowthRow): Promise<GrowthRow> {
  const owner = requireOwner(user);
  const resultId = cleanText(body.result_id || body.id);
  const conversion = cleanLower(body.conversion || body.convert_to);
  if (!resultId || !["opportunity", "rfq"].includes(conversion)) throw new Error("Select a result and conversion type.");
  const resultQuery = await supabase.from("growth_results").select("*").eq("owner_email", owner).eq("id", resultId).single();
  if (resultQuery.error) throw resultQuery.error;
  const growthResult = resultQuery.data;
  if (growthResult.converted_opportunity_id || growthResult.converted_rfi_id) throw new Error("This result has already been converted. Review the linked Shipper CRM record.");
  const accountQuery = await supabase.from("shippers").select("shipper_name").eq("owner_email", owner).eq("id", growthResult.shipper_id).single();
  if (accountQuery.error) throw accountQuery.error;
  const now = new Date().toISOString();
  if (conversion === "opportunity") {
    const inserted = await supabase.from("shipper_opportunities").insert(ownedRow(user, {
      shipper_id: growthResult.shipper_id,
      opportunity_name: cleanText(body.name) || `${accountQuery.data.shipper_name} - Growth Hacking opportunity`,
      stage: "identified",
      probability: 10,
      next_action: cleanText(body.next_action) || "Schedule discovery call",
      notes: cleanText(body.notes) || growthResult.notes || null,
      metadata: { growth_result_id: resultId, growth_campaign_id: growthResult.campaign_id }
    })).select().single();
    if (inserted.error) throw inserted.error;
    const updated = await supabase.from("growth_results").update({
      outcome: "opportunity_created",
      converted_opportunity_id: inserted.data.id,
      updated_at: now
    }).eq("owner_email", owner).eq("id", resultId);
    if (updated.error) throw updated.error;
    return { row: inserted.data, type: "opportunity" };
  }
  const inserted = await supabase.from("shipper_rfis").insert(ownedRow(user, {
    shipper_id: growthResult.shipper_id,
    rfi_name: cleanText(body.name) || `${accountQuery.data.shipper_name} - Growth Hacking RFQ`,
    status: "draft",
    notes: cleanText(body.notes) || growthResult.notes || null,
    response: {},
    metadata: { record_type: "rfq", growth_result_id: resultId, growth_campaign_id: growthResult.campaign_id }
  })).select().single();
  if (inserted.error) throw inserted.error;
  const updated = await supabase.from("growth_results").update({
    outcome: "rfq_received",
    converted_rfi_id: inserted.data.id,
    updated_at: now
  }).eq("owner_email", owner).eq("id", resultId);
  if (updated.error) throw updated.error;
  return { row: inserted.data, type: "rfq" };
}

function classifyReply(text: string): GrowthRow {
  const normalized = normalizeKey(text);
  if (/unsubscribe|remove me|no contactar|baja/.test(normalized)) return { outcome: "unsubscribe", next_action: "Mark do not contact" };
  if (/bounce|undeliver|mailbox not found|no existe/.test(normalized)) return { outcome: "bounce", next_action: "Find a replacement contact" };
  if (/contacta|contacte|habla con|reach out to|correct person/.test(normalized)) return { outcome: "referral", next_action: "Create the referred contact" };
  if (/rfq|cotiza|cotizacion|quote|lane|ruta/.test(normalized)) return { outcome: "rfq_received", next_action: "Create RFQ and confirm scope" };
  if (/reunion|meeting|call|llamada|agenda/.test(normalized)) return { outcome: "meeting_booked", next_action: "Prepare discovery questions" };
  if (/interesa|interested|send info|informacion/.test(normalized)) return { outcome: "interested", next_action: "Send concise relevant information" };
  if (/no interesa|not interested|no gracias/.test(normalized)) return { outcome: "not_interested", next_action: "Move to recovery" };
  return { outcome: "replied", next_action: "Review manually" };
}

async function growthAiAction(supabase: DbClient, user: GrowthUser, body: GrowthRow): Promise<GrowthRow> {
  const action = cleanLower(body.ai_action || body.operation || body.type);
  const context = objectRecord(body.context);
  if (action === "classify_response") {
    const classification = classifyReply(cleanText(body.text || context.text));
    return { mode: "rules_mvp", title: "Respuesta clasificada", ...classification, confidence: "review" };
  }
  if (action === "improve_message") {
    const original = cleanText(body.text || context.text);
    const concise = original.split(/(?<=[.!?])\s+/).slice(0, 3).join(" ").slice(0, 700);
    return {
      mode: "rules_mvp",
      title: "Mensaje mas directo",
      output: concise || "Hola {{first_name}}, eres la persona correcta para revisar esta oportunidad logistica para {{account_name}}?",
      recommendations: ["Open with the business reason", "Use one binary question", "Keep one clear next step"]
    };
  }
  if (action === "pain_hypothesis") {
    const fit = stringList(context.logistics_fit || body.logistics_fit).map(cleanLower);
    const hypotheses = fit.includes("cross_border")
      ? ["Border dwell variability", "Broker and carrier handoff visibility", "Capacity consistency by corridor"]
      : fit.includes("refrigerated")
      ? ["Temperature-control compliance", "Seasonal capacity", "Claims prevention"]
      : ["Capacity consistency", "Rate visibility", "Service exception control"];
    return { mode: "rules_mvp", title: "Hipotesis logisticas", recommendations: hypotheses };
  }
  if (action === "next_action") {
    const classification = classifyReply(cleanText(context.last_response || body.text));
    return { mode: "rules_mvp", title: "Siguiente accion", ...classification };
  }
  const dashboard = await growthDashboard(supabase, user);
  if (action === "generate_campaign") {
    return {
      mode: "rules_mvp",
      title: "Campana sugerida",
      campaign: {
        name: "Cross-border industrial validation",
        objective: "get_rfqs",
        offer_hook: "cross_border_operation_review"
      },
      recommendations: ["Start with one ready segment", "Use email plus a short LinkedIn note", "Export and register results manually"]
    };
  }
  return {
    mode: "rules_mvp",
    title: "Segmento recomendado",
    output: dashboard.metrics.ready > 0
      ? "Start with ready shippers that have a valid logistics contact and a declared logistics fit."
      : "Clean Needs Review records first; the current CRM does not have enough campaign-ready accounts.",
    recommendations: ["Exclude non-shippers", "Require a valid email", "Choose one logistics fit per test"]
  };
}

export function isGrowthAction(action: string): boolean {
  return GROWTH_ACTIONS.has(action);
}

export async function handleGrowthAction(supabase: DbClient, user: GrowthUser, body: GrowthRow): Promise<GrowthRow> {
  switch (cleanText(body.action)) {
    case "growth_dashboard": return await growthDashboard(supabase, user);
    case "import_growth_csv": return await importGrowthCsv(supabase, user, body);
    case "list_growth_segments": return await listGrowthSegments(supabase, user);
    case "preview_growth_segment": return await previewGrowthSegment(supabase, user, body);
    case "save_growth_segment": return await saveGrowthSegment(supabase, user, body);
    case "archive_growth_segment": return await archiveGrowthSegment(supabase, user, body);
    case "restore_growth_segment": return await restoreGrowthSegment(supabase, user, body);
    case "list_growth_campaigns": return await listGrowthCampaigns(supabase, user);
    case "get_growth_campaign": return await getGrowthCampaign(supabase, user, body);
    case "save_growth_campaign": return await saveGrowthCampaign(supabase, user, body);
    case "save_growth_message": return await saveGrowthMessage(supabase, user, body);
    case "refresh_growth_campaign_audience": return await refreshGrowthCampaignAudience(supabase, user, body);
    case "export_growth_campaign": return await exportGrowthCampaign(supabase, user, body);
    case "set_growth_campaign_status": return await setGrowthCampaignStatus(supabase, user, body);
    case "list_growth_results": return await listGrowthResults(supabase, user, body);
    case "record_growth_result": return await recordGrowthResult(supabase, user, body);
    case "convert_growth_result": return await convertGrowthResult(supabase, user, body);
    case "growth_ai_action": return await growthAiAction(supabase, user, body);
    default: throw new Error(`Unsupported Growth Hacking action: ${cleanText(body.action) || "unknown"}`);
  }
}
